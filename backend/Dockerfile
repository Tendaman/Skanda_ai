# Use an official Python runtime as a parent image
FROM python:3.11-slim

# Set environment variables
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

# Install system dependencies
# ffmpeg is needed for audio processing if implicit dependencies require it
# git is needed if pip needs to install from git
RUN apt-get update && apt-get install -y \
    ffmpeg \
    git \
    && rm -rf /var/lib/apt/lists/*

# Set work directory
WORKDIR /app

# Install dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
# Add python-socketio which was manually added later and might not be in requirements.txt yet
RUN pip install --no-cache-dir python-socketio simple-websocket

# Copy project content
COPY . .

# Expose port
EXPOSE 8000

# Run the application
# Use python server.py directly or gunicorn if production
# "python server.py" is what the user uses.
CMD ["python", "server.py"]
