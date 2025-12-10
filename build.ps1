# Script build frontend và CMS cho Windows PowerShell

Write-Host "🚀 Building Frontend and CMS..." -ForegroundColor Cyan

# Build Frontend
Write-Host "📦 Building Frontend..." -ForegroundColor Yellow
Set-Location frontend
if (-not (Test-Path "node_modules")) {
    Write-Host "Installing frontend dependencies..." -ForegroundColor Gray
    if (Get-Command pnpm -ErrorAction SilentlyContinue) {
        pnpm install
    } else {
        npm install
    }
}
if (Get-Command pnpm -ErrorAction SilentlyContinue) {
    pnpm build
} else {
    npm run build
}
Set-Location ..

# Build CMS Frontend
Write-Host "📦 Building CMS Frontend..." -ForegroundColor Yellow
Set-Location cms-frontend
if (-not (Test-Path "node_modules")) {
    Write-Host "Installing CMS dependencies..." -ForegroundColor Gray
    if (Get-Command pnpm -ErrorAction SilentlyContinue) {
        pnpm install
    } else {
        npm install
    }
}
if (Get-Command pnpm -ErrorAction SilentlyContinue) {
    pnpm build
} else {
    npm run build
}
Set-Location ..

Write-Host "✅ Build completed successfully!" -ForegroundColor Green
Write-Host "📁 Frontend build: frontend/dist/" -ForegroundColor Gray
Write-Host "📁 CMS build: cms-frontend/dist/" -ForegroundColor Gray

