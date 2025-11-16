# Start Nginx Load Balancer
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Starting Nginx Load Balancer" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Check if nginx is installed
$nginxPath = "C:\nginx\nginx.exe"

if (-not (Test-Path $nginxPath)) {
    Write-Host "ERROR: Nginx not found at $nginxPath" -ForegroundColor Red
    Write-Host ""
    Write-Host "Please install nginx:" -ForegroundColor Yellow
    Write-Host "1. Download from: http://nginx.org/en/download.html" -ForegroundColor Yellow
    Write-Host "2. Extract to C:\nginx" -ForegroundColor Yellow
    Write-Host ""
    exit 1
}

# Copy config file
Write-Host "Step 1: Copying nginx configuration..." -ForegroundColor Yellow
$configSource = Join-Path $PSScriptRoot "..\nginx-simple.conf"
$configDest = "C:\nginx\conf\nginx.conf"

if (Test-Path $configSource) {
    Copy-Item $configSource $configDest -Force
    Write-Host "   OK: Configuration copied" -ForegroundColor Green
} else {
    Write-Host "   ERROR: Config file not found: $configSource" -ForegroundColor Red
    exit 1
}

# Stop any existing nginx
Write-Host ""
Write-Host "Step 2: Stopping any existing nginx processes..." -ForegroundColor Yellow
$existingNginx = Get-Process nginx -ErrorAction SilentlyContinue
if ($existingNginx) {
    $existingNginx | Stop-Process -Force
    Start-Sleep -Seconds 2
    Write-Host "   OK: Stopped existing nginx processes" -ForegroundColor Green
} else {
    Write-Host "   INFO: No existing nginx processes" -ForegroundColor Gray
}

# Test configuration
Write-Host ""
Write-Host "Step 3: Testing nginx configuration..." -ForegroundColor Yellow
Push-Location C:\nginx
$testResult = & .\nginx.exe -t 2>&1
Pop-Location

if ($LASTEXITCODE -eq 0) {
    Write-Host "   OK: Configuration is valid" -ForegroundColor Green
} else {
    Write-Host "   ERROR: Configuration has errors:" -ForegroundColor Red
    Write-Host $testResult -ForegroundColor Red
    exit 1
}

# Start nginx
Write-Host ""
Write-Host "Step 4: Starting nginx..." -ForegroundColor Yellow
Push-Location C:\nginx
Start-Process nginx.exe -WindowStyle Hidden
Pop-Location

Start-Sleep -Seconds 3

# Check if nginx is running
$nginxProcess = Get-Process nginx -ErrorAction SilentlyContinue

if ($nginxProcess) {
    $processCount = $nginxProcess.Count
    Write-Host "   OK: Nginx started successfully ($processCount processes)" -ForegroundColor Green
    
    # Test the load balancer
    Write-Host ""
    Write-Host "Step 5: Testing load balancer..." -ForegroundColor Yellow
    try {
        $response = Invoke-WebRequest -Uri "http://localhost/nginx-health" -TimeoutSec 5 -UseBasicParsing
        if ($response.StatusCode -eq 200) {
            Write-Host "   OK: Load balancer is responding" -ForegroundColor Green
        }
    } catch {
        Write-Host "   WARNING: Load balancer started but not responding yet" -ForegroundColor Yellow
        Write-Host "   Wait a few seconds and try: curl http://localhost/health" -ForegroundColor Gray
    }
    
    Write-Host ""
    Write-Host "========================================" -ForegroundColor Green
    Write-Host "  Nginx Load Balancer Running" -ForegroundColor Green
    Write-Host "========================================" -ForegroundColor Green
    Write-Host ""
    Write-Host "Load Balancer:" -ForegroundColor Cyan
    Write-Host "   URL: http://localhost" -ForegroundColor White
    Write-Host "   Health: http://localhost/nginx-health" -ForegroundColor White
    Write-Host ""
    Write-Host "Backend Nodes:" -ForegroundColor Cyan
    Write-Host "   Node-1: http://localhost:5000" -ForegroundColor Gray
    Write-Host "   Node-2: http://localhost:5001" -ForegroundColor Gray
    Write-Host "   Node-3: http://localhost:5002" -ForegroundColor Gray
    Write-Host "   Node-4: http://localhost:5003" -ForegroundColor Gray
    Write-Host ""
    Write-Host "Test Commands:" -ForegroundColor Yellow
    Write-Host "   curl http://localhost/health" -ForegroundColor Gray
    Write-Host "   curl http://localhost/api/auth/verify" -ForegroundColor Gray
    Write-Host ""
    Write-Host "Logs:" -ForegroundColor Yellow
    Write-Host "   type C:\nginx\logs\access.log" -ForegroundColor Gray
    Write-Host "   type C:\nginx\logs\error.log" -ForegroundColor Gray
    Write-Host ""
    Write-Host "To stop nginx:" -ForegroundColor Yellow
    Write-Host "   .\stop-nginx.ps1" -ForegroundColor Gray
    Write-Host ""
} else {
    Write-Host "   ERROR: Failed to start nginx" -ForegroundColor Red
    Write-Host ""
    Write-Host "Check error log:" -ForegroundColor Yellow
    Write-Host "   type C:\nginx\logs\error.log" -ForegroundColor Gray
    Write-Host ""
    
    # Show last few lines of error log if it exists
    if (Test-Path "C:\nginx\logs\error.log") {
        Write-Host "Recent errors:" -ForegroundColor Red
        Get-Content "C:\nginx\logs\error.log" -Tail 10
    }
    
    exit 1
}
