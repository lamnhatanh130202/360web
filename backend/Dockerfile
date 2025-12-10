# backend/Dockerfile (thay thế)
FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
ARG DEBIAN_FRONTEND=noninteractive

WORKDIR /app

# Cài tối thiểu, tránh cài các package docs để nhanh hơn
RUN apt-get update \
  && apt-get install -y --no-install-recommends curl gcc g++ make libc6-dev ca-certificates \
  && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
# Sử dụng pip cache (yêu cầu BuildKit khi build để có hiệu quả)
RUN pip install --upgrade pip && pip install -r requirements.txt

COPY . .

RUN mkdir -p /app/uploads /app/static/tts

VOLUME ["/app/uploads", "/app/static/tts"]

EXPOSE 5000

ENV TZ=Asia/Ho_Chi_Minh
ENV FLASK_ENV=production
ENV GOOGLE_APPLICATION_CREDENTIALS=/app/backend/keys/google-tts-key.json

# Make entrypoint script executable
RUN chmod +x /app/entrypoint.py

# Use entrypoint script for hot reload support
ENTRYPOINT ["python", "entrypoint.py"]
