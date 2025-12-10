# Script deploy cho Windows PowerShell

Write-Host "🚀 Starting deployment..." -ForegroundColor Cyan

# Kiểm tra Docker
if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    Write-Host "❌ Docker is not installed. Please install Docker first." -ForegroundColor Red
    exit 1
}

if (-not (Get-Command docker-compose -ErrorAction SilentlyContinue)) {
    Write-Host "❌ Docker Compose is not installed. Please install Docker Compose first." -ForegroundColor Red
    exit 1
}

# Build frontend và CMS trước
Write-Host "📦 Building frontend and CMS..." -ForegroundColor Yellow
.\build.ps1

# Build Docker images
Write-Host "🐳 Building Docker images..." -ForegroundColor Yellow
docker-compose -f docker-compose.prod.yml build

# Stop old containers
Write-Host "🛑 Stopping old containers..." -ForegroundColor Yellow
docker-compose -f docker-compose.prod.yml down

# Start new containers
Write-Host "▶️ Starting containers..." -ForegroundColor Yellow
docker-compose -f docker-compose.prod.yml up -d

# Show status
Write-Host "📊 Container status:" -ForegroundColor Cyan
docker-compose -f docker-compose.prod.yml ps

Write-Host ""
Write-Host "✅ Deployment completed!" -ForegroundColor Green
$frontendPort = if ($env:FRONTEND_PORT) { $env:FRONTEND_PORT } else { "8080" }
$backendPort = if ($env:BACKEND_PORT) { $env:BACKEND_PORT } else { "5000" }
Write-Host "🌐 Frontend: http://localhost:$frontendPort" -ForegroundColor Gray
Write-Host "🔧 Backend API: http://localhost:$backendPort" -ForegroundColor Gray
Write-Host "📝 CMS Admin: http://localhost:$frontendPort/cms" -ForegroundColor Gray
Write-Host ""
Write-Host "📋 View logs: docker-compose -f docker-compose.prod.yml logs -f" -ForegroundColor Gray

