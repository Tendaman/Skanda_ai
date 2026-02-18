import socketio
import time
import wave
import sys

# Create a dummy wav file content (1 second of silence)
def generate_silence_wav():
    import io
    buffer = io.BytesIO()
    with wave.open(buffer, 'wb') as wav:
        wav.setnchannels(1)
        wav.setsampwidth(2)
        wav.setframerate(16000)
        # Write 1 second of silence
        wav.writeframes(b'\x00' * 32000)
    return buffer.getvalue()

sio = socketio.Client()

@sio.event
def connect():
    print("Connected to server")
    # Start stream
    sio.emit('start_stream', {'sample_rate': 16000, 'channels': 1, 'mode': 'voice'})

@sio.event
def transcript(data):
    print(f"Transcript received: {data}")

@sio.event
def disconnect():
    print("Disconnected from server")

def test_transcription():
    try:
        sio.connect('http://localhost:8000')
        
        # Send audio chunks
        # raw PCM data (silence)
        raw_chunk = b'\x00' * 3200  # 0.1s check
        
        print("Sending audio chunks...")
        for i in range(20): # Send for 2 seconds
            sio.emit('audio_chunk', raw_chunk)
            time.sleep(0.1)
            
        print("Waiting for transcription...")
        time.sleep(2)
        sio.disconnect()
        
    except Exception as e:
        print(f"Test failed: {e}")

if __name__ == '__main__':
    test_transcription()
