# Production-style run: builds the frontend as static files, serves it (plus
# the backend API) behind nginx on one port, tunnels that port to the public
# internet with ngrok, then prints a QR code so a phone can scan straight in
# instead of anyone retyping a long ngrok-free.app URL.
#
# This is for demos/testing on your own machine, not a hardened production
# deployment — see deploy/README.md for the full picture (and its caveats
# about not putting real patient data through it).
#
# One-time setup this assumes (see deploy/README.md): nginx and ngrok
# installed via winget, ngrok authtoken already saved.
#
# Every service runs fully hidden with its output redirected to logs/*.log —
# earlier versions of this script ran each service in its own minimized,
# interactive `powershell -NoExit -Command "...; npm run dev"` window, which
# turned out to be an unreliable way to keep a long-lived, colored-log-output
# process alive on Windows: backend/uvicorn processes were observed dying
# silently sometime after a clean startup, with no error visible anywhere
# (the window itself, and whatever it would have printed on crash, is gone
# once that happens). Plain hidden background processes with output piped to
# a real file sidestep that failure mode entirely, and as a bonus mean a
# crash is actually diagnosable — check logs/<name>.err.log.
#
# Stays running once everything is up — press Ctrl+C to tear the whole
# stack down (every process this script started, plus nginx and ngrok).
# Closing this window works too, but Ctrl+C is the clean way: it runs the
# same shutdown path instead of leaving orphaned processes behind.
#
# Run from the repo root: .\start-production.ps1

$root = $PSScriptRoot
$logDir = "$root\logs"
New-Item -ItemType Directory -Force -Path $logDir | Out-Null

# PIDs of everything this script starts, so Ctrl+C can tear it all back
# down. `taskkill /T` below kills each of these AND whatever it spawned
# (npm's child node process, uvicorn's reload watcher, etc.), which a plain
# Stop-Process would leave orphaned since Windows doesn't kill children
# when a parent dies.
$script:trackedPids = @()

function Start-Background($name, $filePath, $argumentList, $workDir) {
    $outLog = "$logDir\$name.log"
    $errLog = "$logDir\$name.err.log"
    $p = Start-Process -FilePath $filePath -ArgumentList $argumentList -WorkingDirectory $workDir `
        -WindowStyle Hidden -RedirectStandardOutput $outLog -RedirectStandardError $errLog -PassThru
    $script:trackedPids += $p.Id
    Write-Host "  -> logs: logs\$name.log / logs\$name.err.log"
}

function Get-NgrokPublicUrl {
    for ($i = 0; $i -lt 40; $i++) {
        try {
            # 127.0.0.1, not "localhost" — ngrok's local API only binds IPv4, and
            # resolving "localhost" to ::1 first here can hang the whole poll on a
            # dead IPv6 socket instead of falling back to IPv4 quickly.
            $resp = Invoke-RestMethod -Uri "http://127.0.0.1:4040/api/tunnels" -TimeoutSec 2
            $httpsTunnel = $resp.tunnels | Where-Object { $_.proto -eq 'https' } | Select-Object -First 1
            if ($httpsTunnel) { return $httpsTunnel.public_url }
        } catch {}
        Start-Sleep -Seconds 1
    }
    return $null
}

function Stop-Everything {
    Write-Host ""
    Write-Host "Shutting down..." -ForegroundColor Yellow

    foreach ($trackedPid in $script:trackedPids) {
        taskkill /PID $trackedPid /T /F 2>$null | Out-Null
    }

    # nginx forks a worker process the tracked-PID kill above never sees —
    # its own -s stop handles master+worker together via IPC instead of a
    # raw kill.
    & "$root\deploy\stop-nginx.ps1" 2>$null | Out-Null

    $leftoverNgrok = Get-Process ngrok -ErrorAction SilentlyContinue
    if ($leftoverNgrok) { $leftoverNgrok | Stop-Process -Force }

    Write-Host "Everything stopped." -ForegroundColor Green
}

Write-Host "Checking Ollama is reachable on localhost:11434..."
try {
    Invoke-WebRequest -Uri "http://127.0.0.1:11434" -UseBasicParsing -TimeoutSec 3 | Out-Null
    Write-Host "  OK — Ollama is running." -ForegroundColor Green
} catch {
    Write-Host "  WARNING: Ollama doesn't seem to be running. Start the Ollama app before using the chat." -ForegroundColor Yellow
}

try {
    Write-Host "Starting MongoDB (dev-mongo, persists to backend/.mongo-data)..."
    Start-Background "mongo" "node" "scripts/dev-mongo.js" "$root\backend"
    Start-Sleep -Seconds 3

    Write-Host "Starting backend (port 5000)..."
    Start-Background "backend" "cmd.exe" "/c npm run dev" "$root\backend"

    Write-Host "Starting translate-service (port 8020)..."
    Start-Background "translate-service" "$root\translate-service\.venv\Scripts\uvicorn.exe" "app.main:app --port 8020" "$root\translate-service"

    Write-Host "Starting transliterate-service (port 8030)..."
    Start-Background "transliterate-service" "$root\transliterate-service\.venv\Scripts\python.exe" "app/main.py" "$root\transliterate-service"

    Write-Host "Starting voice-service (port 8010)..."
    Start-Background "voice-service" "$root\voice-service\.venv\Scripts\uvicorn.exe" "app.main:app --port 8010" "$root\voice-service"

    Write-Host ""
    Write-Host "Building frontend for production (frontend/dist)..." -ForegroundColor Cyan
    Push-Location "$root\frontend"
    npm run build
    Pop-Location

    Write-Host ""
    Write-Host "Starting nginx (serves frontend/dist + proxies /api to the backend, port 8080)..." -ForegroundColor Cyan
    & "$root\deploy\start-nginx.ps1"
    Start-Sleep -Seconds 1

    # A leftover ngrok.exe from a previous run holds both the local :4040 API
    # port and (on the free tier) the account's one-allowed concurrent tunnel
    # session — starting a second instance on top of it produces a confusing
    # mix of "which process is the poll below actually talking to" and
    # occasional ERR_NGROK_108 (too many simultaneous sessions) failures.
    $existingNgrok = Get-Process ngrok -ErrorAction SilentlyContinue
    if ($existingNgrok) {
        Write-Host "Stopping leftover ngrok process(es) from a previous run..." -ForegroundColor Yellow
        $existingNgrok | Stop-Process -Force
        Start-Sleep -Seconds 1
    }

    Write-Host "Starting ngrok tunnel to http://localhost:8080..." -ForegroundColor Cyan
    $Ngrok = "$env:LOCALAPPDATA\Microsoft\WinGet\Packages\Ngrok.Ngrok_Microsoft.Winget.Source_8wekyb3d8bbwe\ngrok.exe"
    Start-Background "ngrok" $Ngrok "http 8080" "$root"

    Write-Host "Waiting for ngrok to report its public URL..."
    $publicUrl = Get-NgrokPublicUrl

    if ($publicUrl) {
        Write-Host ""
        Write-Host "=========================================================" -ForegroundColor Green
        Write-Host " Public URL: $publicUrl" -ForegroundColor Green
        Write-Host "=========================================================" -ForegroundColor Green
        node "$root\backend\scripts\printQrCode.js" $publicUrl
    } else {
        Write-Host ""
        Write-Host "Couldn't detect the ngrok URL automatically." -ForegroundColor Yellow
        Write-Host "Check http://localhost:4040 in a browser, or logs\ngrok.log for the 'Forwarding' line." -ForegroundColor Yellow
    }

    Write-Host ""
    Write-Host "All services are running in the background (see logs\*.log)." -ForegroundColor Cyan
    Write-Host "Give the Python services a minute to warm up their models before" -ForegroundColor Cyan
    Write-Host "using voice/translation features." -ForegroundColor Cyan
    Write-Host ""
    Write-Host "Press Ctrl+C to stop everything." -ForegroundColor Cyan
    while ($true) {
        Start-Sleep -Seconds 1
        foreach ($trackedPid in $script:trackedPids) {
            if (-not (Get-Process -Id $trackedPid -ErrorAction SilentlyContinue)) {
                Write-Host ""
                Write-Host "WARNING: a tracked process (PID $trackedPid) has stopped unexpectedly — check logs\*.err.log" -ForegroundColor Red
                $script:trackedPids = $script:trackedPids | Where-Object { $_ -ne $trackedPid }
            }
        }
    }
} finally {
    Stop-Everything
}
