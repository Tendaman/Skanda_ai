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
    with wave.open(path, "wb") as w:
        w.setnchannels(nchannels)
        w.setsampwidth(sampwidth)
        w.setframerate(sample_rate)
        w.writeframes(raw_bytes)

def transcribe_loop(sid, clients, LOCK, socketio):
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
                paused_flag = state.get("paused", False)
                raw_buffer = bytes(state.get("raw_buffer", b""))

            if paused_flag:
                time.sleep(0.1)
                continue

            if not raw_buffer and not stop_flag:
                time.sleep(0.1)
                continue

            with tempfile.NamedTemporaryFile(delete=False, suffix=".wav") as tmp:
                tmp_wav = tmp.name
            try:
                write_wav_from_raw(tmp_wav, raw_buffer, sample_rate=SAMPLE_RATE, nchannels=CHANNELS, sampwidth=SAMPLE_WIDTH_BYTES)
                segments, _ = whisper_model.transcribe(tmp_wav, language="en", beam_size=5)
                full_text = " ".join([seg.text for seg in segments]).strip()

                if full_text.startswith(prev_text):
                    delta = full_text[len(prev_text):].strip()
                    if delta:
                        socketio.emit("transcript", {"partial": full_text}, room=sid)
                        prev_text = full_text
                else:
                    socketio.emit("transcript", {"partial": full_text}, room=sid)
                    prev_text = full_text

            except Exception as e:
                logging.exception("Error during transcription loop")
            finally:
                try:
                    os.remove(tmp_wav)
                except Exception:
                    pass

            if stop_flag:
                with LOCK:
                    if sid in clients:
                        clients[sid]["raw_buffer"] = bytearray()
                break

            time.sleep(1.0) 
    except Exception:
        logging.exception("transcription loop error")