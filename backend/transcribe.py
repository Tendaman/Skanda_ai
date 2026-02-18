# backend\transcribe.py
import io
import logging
import wave
import threading
import time
from typing import Dict, Any
from faster_whisper import WhisperModel

SAMPLE_RATE = 16000
SAMPLE_WIDTH_BYTES = 2 
CHANNELS = 1
# Limit buffer to ~30 seconds to prevent infinite re-processing slowdown
MAX_BUFFER_SECONDS = 30
MAX_BUFFER_BYTES = SAMPLE_RATE * SAMPLE_WIDTH_BYTES * CHANNELS * MAX_BUFFER_SECONDS

# Load model once. "int8" is faster on CPU.
whisper_model = WhisperModel("base", device="cpu", compute_type="int8")

def analyze_audio_buffer(raw_bytes):
    """
    Transcribe raw audio bytes using in-memory processing.
    Returns the full text.
    """
    if not raw_bytes:
        return ""
        
    with io.BytesIO() as wav_io:
        with wave.open(wav_io, "wb") as w:
            w.setnchannels(CHANNELS)
            w.setsampwidth(SAMPLE_WIDTH_BYTES)
            w.setframerate(SAMPLE_RATE)
            w.writeframes(raw_bytes)
        
        wav_io.seek(0)
        
        # vad_filter=True skips silent parts, speeding up processing
        segments, _ = whisper_model.transcribe(
            wav_io, 
            language="en", 
            beam_size=5,
            vad_filter=True,
            vad_parameters=dict(min_silence_duration_ms=500)
        )
        return " ".join([seg.text for seg in segments]).strip()

def transcribe_loop(sid, clients, LOCK, socketio):
    logging.info(f"Transcription thread started for {sid}")
    
    # Store committed text (text that has shifted out of the buffer)
    committed_text = ""
    last_buffer_text = ""
    
    try:
        while True:
            # 1. READ STATE
            with LOCK:
                if sid not in clients:
                    logging.info(f"No client state for {sid}, terminating thread")
                    return
                state = clients[sid]
                stop_flag = state.get("stopped", False)
                paused_flag = state.get("paused", False)
                
                # Copy buffer to avoid holding lock during transcription
                raw_buffer = state.get("raw_buffer", bytearray())
                
                # If buffer is too large, trim it and commit the text logic would be complex.
                # simpler approach: Just clamp the buffer for performance, 
                # but we might lose some old context if we don't manage `committed_text` carefully.
                # For this iteration, we accept a sliding window of ~30s for the "partial" text.
                if len(raw_buffer) > MAX_BUFFER_BYTES:
                    # Keep the last MAX_BUFFER_BYTES
                    # But we should probably try to keep "committed_text" up to date?
                    # Since the frontend appends, we need to be careful.
                    # Actually, the frontend just displays "mic-text". 
                    # If we change `prev_text` logic in frontend, it might be weird.
                    # Let's assume frontend replaces or appends? 
                    # Checking desktop/index.js: `win.webContents.send("mic-text", data.partial || "");`
                    # It just sends the text.
                    
                    # We will just trim the buffer. 
                    # To avoid "losing" text, we should ideally rely on the frontend to keep history,
                    # OR we maintain a `committed_text` on backend.
                    pass 

            # 2. HANDLE CONTROL FLAGS
            if paused_flag:
                time.sleep(0.2)
                continue

            # 3. STOP CONDITION
            if not raw_buffer and stop_flag:
                # Buffer empty and stopped
                with LOCK:
                    if sid in clients:
                        clients[sid]["raw_buffer"] = bytearray()
                break
                
            if not raw_buffer:
                time.sleep(0.2)
                continue

            # 4. TRANSCRIBE
            try:
                # Optimization: Only transcribe if we have new data compared to last loop?
                # But raw_buffer is mutable and we made a copy.
                # We can check len(raw_buffer). 
                
                # Perform transcription in-memory
                current_text = analyze_audio_buffer(bytes(raw_buffer))
                
                # If we have a significant text change, emit it
                if current_text:
                    # Combine committed text + current buffer window text
                    full_text = f"{committed_text} {current_text}".strip()
                    
                    # Logic to commit text:
                    # If buffer is full, we move some text to committed and trim buffer?
                    # That's hard to sync with audio bytes.
                    # Current safe optimization: Just limit the buffer to 45s (prevent crash) 
                    # and rely on the user pausing/clearing if they talk for hours.
                    # Or we simply don't trim, but rely on VAD and optimized whisper to be fast enough?
                    # No, infinite audio = infinite processing time. 
                    
                    # AUTO-TRIM LOGIC:
                    # If buffer > MAX_BYTES, we MUST trim.
                    if len(raw_buffer) > MAX_BUFFER_BYTES:
                        excess = len(raw_buffer) - MAX_BUFFER_BYTES
                        with LOCK:
                            if sid in clients:
                                # Trim from the start
                                del clients[sid]["raw_buffer"][:excess]
                                # We roughly assume the text for that audio is stable.
                                # But we can't easily extract "text corresponding to deleted 5 seconds".
                                # So for now, we just accept that the "partial" might jump if we stream for >30s.
                                # Better UX: Don't show infinite history in one "partial" event.
                        
                    if full_text != last_buffer_text:
                        socketio.emit("transcript", {"partial": full_text}, room=sid)
                        last_buffer_text = full_text

            except Exception as e:
                logging.exception("Error during transcription step")

            # 5. CLEANUP / SLEEP
            if stop_flag:
                with LOCK:
                    if sid in clients:
                        clients[sid]["raw_buffer"] = bytearray()
                break

            # Reduced sleep from 1.0 to 0.2 for faster updates
            time.sleep(0.2) 
            
    except Exception:
        logging.exception("transcription loop error")
