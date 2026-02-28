# backend\transcribe.py
import io
import logging
import wave
import threading
import time
from typing import Dict, Any, List
from faster_whisper import WhisperModel

SAMPLE_RATE = 16000
SAMPLE_WIDTH_BYTES = 2 
CHANNELS = 1

# Optimized model config for Ryzen 5 3500U
whisper_model = WhisperModel(
    "base", 
    device="cpu", 
    compute_type="int8",
    cpu_threads=4,  # Match your physical core count
    num_workers=1   # Keep workers low for CPU
)

# Cache WAV header to avoid recreating it every time
WAV_HEADER_CACHE = None
WAV_HEADER_LENGTH = 44  # Standard WAV header size

def create_wav_header(data_length):
    """
    Create WAV header once and reuse it with updated data length.
    This is MUCH faster than recreating the wave object each time.
    """
    global WAV_HEADER_CACHE
    
    if WAV_HEADER_CACHE is None:
        with io.BytesIO() as header_io:
            with wave.open(header_io, "wb") as w:
                w.setnchannels(CHANNELS)
                w.setsampwidth(SAMPLE_WIDTH_BYTES)
                w.setframerate(SAMPLE_RATE)
                # Write dummy data to generate header
                w.writeframes(b'\x00' * WAV_HEADER_LENGTH)
            header_io.seek(0)
            WAV_HEADER_CACHE = header_io.read()[:WAV_HEADER_LENGTH]
    
    # Update the data chunk size in the header (positions 40-43 for data size)
    data_size_bytes = data_length.to_bytes(4, 'little')
    header = bytearray(WAV_HEADER_CACHE)
    header[40:44] = data_size_bytes  # Update data chunk size
    # Also update RIFF chunk size (positions 4-7)
    riff_size = (data_length + WAV_HEADER_LENGTH - 8).to_bytes(4, 'little')
    header[4:8] = riff_size
    
    return bytes(header)

def analyze_audio_buffer(raw_bytes):
    """
    Optimized transcription with header caching.
    Transcribe raw audio bytes using in-memory processing.
    Returns the full text.
    """
    if not raw_bytes or len(raw_bytes) < SAMPLE_RATE * SAMPLE_WIDTH_BYTES * CHANNELS * 0.3:  # Less than 0.3 seconds
        return ""
    
    try:
        # Create complete WAV file with cached header
        wav_data = create_wav_header(len(raw_bytes)) + raw_bytes
        wav_io = io.BytesIO(wav_data)
        
        # Optimized transcription parameters for speed
        segments, _ = whisper_model.transcribe(
            wav_io, 
            language="en", 
            beam_size=3,  # Reduced from 5 for speed
            best_of=3,    # Limit candidates
            patience=0.5, # Lower patience = faster
            temperature=0.0,  # Greedy decoding = faster
            compression_ratio_threshold=2.4,  # Slightly higher to keep more text
            log_prob_threshold=-1.0,  # Skip low confidence
            no_speech_threshold=0.6,  # Skip silence faster
            condition_on_previous_text=True,  # Keep context for better accuracy
            vad_filter=True,
            vad_parameters=dict(
                min_silence_duration_ms=500,
                threshold=0.5,
                speech_pad_ms=400,  # Less padding = faster
                min_speech_duration_ms=250  # Ignore very short speech
            )
        )
        
        text = " ".join([seg.text for seg in segments]).strip()
        return text
        
    except Exception as e:
        logging.exception(f"Error in analyze_audio_buffer: {e}")
        return ""

# backend\transcribe.py (updated section with reset flag handling)

def transcribe_loop(sid, clients, LOCK, socketio):
    logging.info(f"Transcription thread started for {sid}")
    
    # Store full accumulated text
    accumulated_text = ""
    last_emitted_text = ""
    
    # Track the last position we transcribed up to
    last_transcription_pos = 0
    last_transcription_time = time.time()
    
    # Pre-calculate minimum audio for transcription (0.5 seconds)
    MIN_AUDIO_FOR_TRANSCRIPTION = SAMPLE_RATE * SAMPLE_WIDTH_BYTES * CHANNELS // 2
    FORCE_TRANSCRIPTION_INTERVAL = 2.0  # seconds
    
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
                reset_flag = state.get("reset_flag", False)
                
                # Get the full buffer
                raw_buffer = state.get("raw_buffer", bytearray())
                current_len = len(raw_buffer)
                
                # Check if reset flag is set (delete button was pressed)
                if reset_flag:
                    logging.info(f"Reset flag detected for {sid}, resetting transcription state")
                    # Reset all local state
                    accumulated_text = ""
                    last_emitted_text = ""
                    last_transcription_pos = 0
                    # Clear the reset flag
                    state["reset_flag"] = False
                    
                    # Also emit empty transcript to clear UI
                    socketio.emit("transcript", {"partial": ""}, room=sid)
                    
                # Check if buffer was cleared without reset flag (fallback detection)
                elif current_len < last_transcription_pos:
                    logging.info(f"Buffer size decreased for {sid} without reset flag, resetting state")
                    accumulated_text = ""
                    last_emitted_text = ""
                    last_transcription_pos = 0
                    socketio.emit("transcript", {"partial": ""}, room=sid)

            # 2. HANDLE CONTROL FLAGS
            if paused_flag:
                time.sleep(0.2)
                continue

            # 3. STOP CONDITION
            if stop_flag and current_len == 0:
                break
                
            if current_len == 0:
                time.sleep(0.5)
                continue

            # 4. DECIDE WHETHER TO TRANSCRIBE
            has_new_audio = (current_len - last_transcription_pos) > MIN_AUDIO_FOR_TRANSCRIPTION
            time_since_last = time.time() - last_transcription_time
            force_transcribe = time_since_last > FORCE_TRANSCRIPTION_INTERVAL
            
            if not (has_new_audio or force_transcribe):
                time.sleep(0.2)
                continue

            # 5. TRANSCRIBE NEW AUDIO ONLY
            try:
                # Get ONLY the new audio since last transcription
                new_audio = raw_buffer[last_transcription_pos:]
                
                if len(new_audio) >= MIN_AUDIO_FOR_TRANSCRIPTION or force_transcribe:
                    # Transcribe just the new part
                    new_text = analyze_audio_buffer(bytes(new_audio))
                    
                    if new_text:
                        # Append to accumulated text
                        if accumulated_text and not accumulated_text.endswith(' '):
                            accumulated_text += " "
                        accumulated_text += new_text
                    
                    # Update tracking
                    last_transcription_pos = current_len
                    last_transcription_time = time.time()
                    
                    # Emit if text changed
                    if accumulated_text and accumulated_text != last_emitted_text:
                        socketio.emit("transcript", {"partial": accumulated_text}, room=sid)
                        last_emitted_text = accumulated_text
                
            except Exception as e:
                logging.exception("Error during transcription step")

            # 6. FINAL STOP CHECK
            if stop_flag:
                # One final transcription of any remaining audio
                remaining_audio = raw_buffer[last_transcription_pos:]
                if remaining_audio:
                    try:
                        final_text = analyze_audio_buffer(bytes(remaining_audio))
                        if final_text:
                            if accumulated_text and not accumulated_text.endswith(' '):
                                accumulated_text += " "
                            accumulated_text += final_text
                            if accumulated_text != last_emitted_text:
                                socketio.emit("transcript", {"partial": accumulated_text}, room=sid)
                    except:
                        pass
                
                with LOCK:
                    if sid in clients:
                        clients[sid]["raw_buffer"] = bytearray()
                break

            # Dynamic sleep based on activity
            if current_len > 0:
                time.sleep(0.15)
            else:
                time.sleep(0.5)
            
    except Exception as e:
        logging.exception(f"transcription loop error for {sid}: {e}")
    finally:
        logging.info(f"Transcription thread ended for {sid}")