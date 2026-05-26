# ── Backend image ────────────────────────────────────────────
FROM python:3.11-slim AS backend

WORKDIR /app

# Install system dependencies for Pillow / ONNX Runtime
RUN apt-get update && apt-get install -y --no-install-recommends \
    libglib2.0-0 libsm6 libxext6 libxrender-dev libgl1-mesa-glx \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application source
COPY backend/ ./backend/
COPY backend/models/ ./backend/models/

# Create required runtime directories
RUN mkdir -p uploads reports backend/datasets/retraining

# Expose FastAPI port
EXPOSE 8000

CMD ["uvicorn", "backend.app.main:app", "--host", "0.0.0.0", "--port", "8000"]
