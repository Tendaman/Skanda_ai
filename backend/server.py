# backend\server.py
import os
import logging
import threading
import time

from flask import Flask, request, jsonify, Response, stream_with_context
from flask_cors import CORS
from flask_socketio import SocketIO, emit

from dotenv import load_dotenv
from typing import Dict

from transcribe import transcribe_loop
from ai_model import generate_chat_response
from screen_analyser import analyze_screenshot

load_dotenv()
logging.basicConfig(level=logging.INFO)
app = Flask(__name__)
CORS(app)

socketio = SocketIO(app, cors_allowed_origins="*", async_mode="threading")

clients: Dict[str, Dict] = {}
LOCK = threading.Lock()


@app.route("/chat", methods=["POST"])
def chat():
    payload = request.get_json(force=True) or {}

    # Return the generator as a streaming response with the correct MIME type
    return Response(
        stream_with_context(generate_chat_response(payload)),
        mimetype='text/event-stream'
    )


@socketio.on("connect")
def on_connect():
    sid = request.sid
    logging.info(f"Client connected: {sid}")
    # initialize client state
    with LOCK:
        clients[sid] = {
            "raw_buffer": b"",
            "stopped": False,
            "paused": False,
            "thread": None
        }


@socketio.on("start_stream")
def on_start_stream(data):
    sid = request.sid
    logging.info(f"start_stream from {sid} payload: {data}")
    with LOCK:
        clients[sid]["raw_buffer"] = b""
        clients[sid]["stopped"] = False
        clients[sid]["paused"] = False

    if clients[sid].get("thread") is None or not clients[sid]["thread"].is_alive():
        t = threading.Thread(target=transcribe_loop, args=(
            sid, clients, LOCK, socketio), daemon=True)
        with LOCK:
            clients[sid]["thread"] = t
        t.start()


@socketio.on("pause_stream")
def on_pause_stream():
    """Pause audio streaming for a client."""
    sid = request.sid
    logging.info(f"pause_stream from {sid}")
    with LOCK:
        if sid in clients:
            clients[sid]["paused"] = True


@socketio.on("resume_stream")
def on_resume_stream():
    """Resume audio streaming for a client."""
    sid = request.sid
    logging.info(f"resume_stream from {sid}")
    with LOCK:
        if sid in clients:
            clients[sid]["paused"] = False


@socketio.on("clear_stream")
def on_clear_stream():
    """Clear audio buffer for a client."""
    sid = request.sid
    logging.info(f"clear_stream from {sid}")
    with LOCK:
        if sid in clients:
            clients[sid]["raw_buffer"] = bytearray()
            clients[sid]["paused"] = False


@socketio.on("audio_chunk")
def on_audio_chunk(data):
    sid = request.sids
    if not isinstance(data, (bytes, bytearray)):
        # ignore non-binary
        return
    with LOCK:
        if sid not in clients:
            return
        clients[sid]["raw_buffer"] += bytes(data)


@socketio.on("stop_stream")
def on_stop_stream():
    sid = request.sid
    logging.info(f"stop_stream from {sid}")
    with LOCK:
        if sid in clients:
            clients[sid]["stopped"] = True


@socketio.on("disconnect")
def on_disconnect():
    sid = request.sid
    logging.info(f"Client disconnected: {sid}")
    with LOCK:
        if sid in clients:
            clients[sid]["stopped"] = True

            def cleanup():
                time.sleep(1.5)
                with LOCK:
                    if sid in clients:
                        try:
                            del clients[sid]
                        except Exception:
                            pass
            threading.Thread(target=cleanup, daemon=True).start()


@app.route("/screen/analyze", methods=["POST"])
def analyze_screen():
    """
    Receives screenshot bytes from Electron and returns structured JSON.
    """
    if "image" not in request.files:
        return jsonify({"error": "Missing 'image' file"}), 400

    file = request.files["image"]
    img_bytes = file.read()

    try:
        result = analyze_screenshot(img_bytes)
        return jsonify(result), 200
    except Exception as e:
        logging.exception("Screen analysis failed:")
        return jsonify({"error": str(e)}), 500


@app.route("/health", methods=["GET"])
def health():
    """Health check endpoint."""
    return jsonify({"status": "ok"}), 200


if __name__ == "__main__":
    port = int(os.environ.get("BACKEND_PORT", 8000))
    app.run(host="0.0.0.0", port=port)
