# Stop all Node.js processes (cluster nodes)
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Stopping Distributed System Cluster" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

Write-Host "Stopping all Node.js processes..." -ForegroundColor Yellow

# Get all node.exe processes
$nodeProcesses = Get-Process -Name node -ErrorAction SilentlyContinue

if ($nodeProcesses) {
    $count = $nodeProcesses.Count
    Write-Host "Found $count Node.js process(es)" -ForegroundColor Yellow
    
    # Stop all node processes
    $nodeProcesses | Stop-Process -Force
    
    Start-Sleep -Seconds 2
    
    # Verify they're stopped
    $remainingProcesses = Get-Process -Name node -ErrorAction SilentlyContinue
    
    if ($remainingProcesses) {
        Write-Host "⚠️  Some processes are still running" -ForegroundColor Yellow
        Write-Host "   Trying again..." -ForegroundColor Yellow
        $remainingProcesses | Stop-Process -Force
        Start-Sleep -Seconds 1
    }
    
    Write-Host ""
    Write-Host "✓ All Node.js processes stopped" -ForegroundColor Green
} else {
    Write-Host ""
    Write-Host "ℹ  No Node.js processes were running" -ForegroundColor Gray
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "  Cluster Stopped Successfully" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""
