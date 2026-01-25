# backend\transcribe.py
import os
import logging
import wave
import threading
import time
import tempfile
from typing import Dict, Any
from faster_whisper import WhisperModel

SAMPLE_RATE = 16000
SAMPLE_WIDTH_BYTES = 2 
CHANNELS = 1

whisper_model = WhisperModel("base", device="cpu", compute_type="int8")

def write_wav_from_raw(path, raw_bytes, sample_rate=SAMPLE_RATE, nchannels=CHANNELS, sampwidth=SAMPLE_WIDTH_BYTES):
    """Write raw PCM bytes to a WAV file."""
    with wave.open(path, "wb") as w:
        w.setnchannels(nchannels)
        w.setsampwidth(sampwidth)
        w.setframerate(sample_rate)
        w.writeframes(raw_bytes)

def transcribe_loop(sid, clients, LOCK, socketio):
    """
    Background thread per connected client.
    Periodically writes current raw buffer to a temp wav, transcribes,
    computes delta vs previous text, and emits 'transcript' events with partial text.
    """
    logging.info(f"Transcription thread started for {sid}")
    prev_text = ""
    try:
        while True:
            with LOCK:
                if sid not in clients:
                    logging.info(f"No client state for {sid}, terminating thread")
                    return
                state = clients[sid]
                stop_flag = state.get("stopped", False)
                paused_flag = state.get("paused", False)  # Get pause state
                raw_buffer = bytes(state.get("raw_buffer", b""))

            # If paused, sleep and continue without processing
            if paused_flag:
                time.sleep(0.1)
                continue

            # if buffer empty and not stopped, sleep and continue
            if not raw_buffer and not stop_flag:
                time.sleep(0.1)
                continue

            # create temp wav from raw PCM buffer
            with tempfile.NamedTemporaryFile(delete=False, suffix=".wav") as tmp:
                tmp_wav = tmp.name
            try:
                write_wav_from_raw(tmp_wav, raw_buffer, sample_rate=SAMPLE_RATE, nchannels=CHANNELS, sampwidth=SAMPLE_WIDTH_BYTES)
                # run transcription
                segments, _ = whisper_model.transcribe(tmp_wav, language="en", beam_size=5)
                full_text = " ".join([seg.text for seg in segments]).strip()

                # Simple automatic word-change detection (no repeated words).
                # If new text begins with prev_text => send only suffix; else send full_text
                if full_text.startswith(prev_text):
                    delta = full_text[len(prev_text):].strip()
                    if delta:
                        # emit only the new suffix appended to prev_text (backend will send full partial for simplicity)
                        socketio.emit("transcript", {"partial": full_text}, room=sid)
                        prev_text = full_text
                else:
                    # if transcription changed significantly (e.g. corrections), send full_text
                    socketio.emit("transcript", {"partial": full_text}, room=sid)
                    prev_text = full_text

            except Exception as e:
                logging.exception("Error during transcription loop")
            finally:
                try:
                    os.remove(tmp_wav)
                except Exception:
                    pass

            # If client requested stop and we've emitted current text, finalize & exit
            if stop_flag:
                with LOCK:
                    if sid in clients:
                        clients[sid]["raw_buffer"] = bytearray()
                break

            # throttle transcription frequency
            time.sleep(1.0)  # transcribe roughly every 1s
    except Exception:
        logging.exception("transcription loop error")