# Starts the whole MedListen stack on this machine: MongoDB, the Node
# backend, all three Python microservices, and the frontend dev server.
# Each runs in its own PowerShell window so logs stay visible and one
# service crashing doesn't take the others down with it — close a window
# (or Ctrl+C in it) to stop just that piece.
#
# Ollama itself is NOT started here — on Windows it already runs as a
# background app/tray service. This script only checks it's reachable.
#
# Run from the repo root: .\start-all.ps1

$root = $PSScriptRoot

function Start-InNewWindow($title, $workDir, $command) {
    Start-Process powershell -WindowStyle Minimized -ArgumentList @(
        '-NoExit',
        '-Command',
        "`$host.UI.RawUI.WindowTitle = '$title'; Set-Location '$workDir'; $command"
    )
}

Write-Host "Checking Ollama is reachable on localhost:11434..."
try {
    Invoke-WebRequest -Uri "http://localhost:11434" -UseBasicParsing -TimeoutSec 3 | Out-Null
    Write-Host "  OK — Ollama is running." -ForegroundColor Green
} catch {
    Write-Host "  WARNING: Ollama doesn't seem to be running. Start the Ollama app before using the chat." -ForegroundColor Yellow
}

Write-Host "Starting MongoDB (dev-mongo, persists to backend/.mongo-data)..."
Start-InNewWindow "MedListen - MongoDB" "$root\backend" "node scripts/dev-mongo.js"
Start-Sleep -Seconds 3

Write-Host "Starting backend (port 5000)..."
Start-InNewWindow "MedListen - Backend" "$root\backend" "npm run dev"

Write-Host "Starting translate-service (port 8020)..."
Start-InNewWindow "MedListen - translate-service" "$root\translate-service" ".\.venv\Scripts\Activate.ps1; uvicorn app.main:app --port 8020"

Write-Host "Starting transliterate-service (port 8030)..."
Start-InNewWindow "MedListen - transliterate-service" "$root\transliterate-service" ".\.venv\Scripts\Activate.ps1; python app/main.py"

Write-Host "Starting voice-service (port 8010)..."
Start-InNewWindow "MedListen - voice-service" "$root\voice-service" ".\.venv\Scripts\Activate.ps1; uvicorn app.main:app --port 8010"

Write-Host "Starting frontend (Vite dev server)..."
Start-InNewWindow "MedListen - Frontend" "$root\frontend" "npm run dev"

Write-Host ""
Write-Host "All services launching in separate windows. Give the Python services" -ForegroundColor Cyan
Write-Host "a minute to warm up their models before using voice/translation features." -ForegroundColor Cyan
