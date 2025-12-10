# Script chạy Locust để test server Web 360
# Sử dụng: .\run_locust.ps1

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Locust Load Testing - Web 360 Server" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Kiểm tra server có đang chạy không
Write-Host "[1/3] Kiểm tra server..." -ForegroundColor Yellow
try {
    $response = Invoke-WebRequest -Uri "http://localhost:5000/health" -UseBasicParsing -TimeoutSec 5
    if ($response.StatusCode -eq 200) {
        Write-Host "✓ Server đang chạy!" -ForegroundColor Green
    }
} catch {
    Write-Host "✗ Server không phản hồi! Hãy chạy: docker-compose up -d" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "[2/3] Khởi động Locust Web UI..." -ForegroundColor Yellow
Write-Host ""
Write-Host "Giao diện web sẽ mở tại: http://localhost:8089" -ForegroundColor Cyan
Write-Host ""
Write-Host "Cấu hình test:" -ForegroundColor Yellow
Write-Host "  - Số users: 1500-2000 (để test khả năng chịu tải)" -ForegroundColor White
Write-Host "  - Spawn rate: 50-100 users/giây" -ForegroundColor White
Write-Host "  - Host: http://localhost:5000" -ForegroundColor White
Write-Host ""
Write-Host "Nhấn Ctrl+C để dừng test" -ForegroundColor Gray
Write-Host ""

# Chạy Locust với web UI
python -m locust -f locustfile.py --web-host=0.0.0.0 --web-port=8089

