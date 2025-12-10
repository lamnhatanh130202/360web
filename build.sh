#!/bin/bash

# Script build frontend và CMS trước khi deploy

set -e

echo "🚀 Building Frontend and CMS..."

# Build Frontend
echo "📦 Building Frontend..."
cd frontend
if [ ! -d "node_modules" ]; then
    echo "Installing frontend dependencies..."
    pnpm install || npm install
fi
pnpm build || npm run build
cd ..

# Build CMS Frontend
echo "📦 Building CMS Frontend..."
cd cms-frontend
if [ ! -d "node_modules" ]; then
    echo "Installing CMS dependencies..."
    pnpm install || npm install
fi
pnpm build || npm run build
cd ..

echo "✅ Build completed successfully!"
echo "📁 Frontend build: frontend/dist/"
echo "📁 CMS build: cms-frontend/dist/"

