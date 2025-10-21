# backend/Dockerfile
FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

WORKDIR /app

# system deps for some packages and pillow etc (adjust if needed)
RUN apt-get update && apt-get install -y build-essential && rm -rf /var/lib/apt/lists/*

# copy requirements first for caching
COPY requirements.txt .
RUN pip install --upgrade pip
RUN pip install -r requirements.txt

# copy app
COPY . .

# create uploads folder and ensure permissions
RUN mkdir -p /app/uploads
VOLUME ["/app/uploads"]  # optional, compose will mount host dir

# run with gunicorn
EXPOSE 5000
CMD ["gunicorn", "--bind", "0.0.0.0:5000", "app:app", "--workers", "4", "--timeout", "120"]
