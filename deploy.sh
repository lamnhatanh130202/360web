#!/bin/bash

# Script deploy lên server

set -e

echo "🚀 Starting deployment..."

# Kiểm tra Docker
if ! command -v docker &> /dev/null; then
    echo "❌ Docker is not installed. Please install Docker first."
    exit 1
fi

if ! command -v docker-compose &> /dev/null; then
    echo "❌ Docker Compose is not installed. Please install Docker Compose first."
    exit 1
fi

# Build frontend và CMS trước
echo "📦 Building frontend and CMS..."
./build.sh

# Build Docker images
echo "🐳 Building Docker images..."
docker-compose -f docker-compose.prod.yml build

# Stop old containers
echo "🛑 Stopping old containers..."
docker-compose -f docker-compose.prod.yml down

# Start new containers
echo "▶️ Starting containers..."
docker-compose -f docker-compose.prod.yml up -d

# Show status
echo "📊 Container status:"
docker-compose -f docker-compose.prod.yml ps

echo ""
echo "✅ Deployment completed!"
echo "🌐 Frontend: http://localhost:${FRONTEND_PORT:-8080}"
echo "🔧 Backend API: http://localhost:${BACKEND_PORT:-5000}"
echo "📝 CMS Admin: http://localhost:${FRONTEND_PORT:-8080}/cms"
echo ""
echo "📋 View logs: docker-compose -f docker-compose.prod.yml logs -f"

