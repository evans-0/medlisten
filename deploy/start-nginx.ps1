# Starts nginx as a reverse proxy in front of the built frontend + backend API.
# Run backend (npm run dev in backend/) and build the frontend (npm run build
# in frontend/) before starting this, and after every frontend code change.
#
# Launched via Start-Process so this script returns immediately instead of
# staying attached to nginx's master process (nginx.exe doesn't fully detach
# from the launching console on Windows otherwise).

$NginxDir = "$env:LOCALAPPDATA\Microsoft\WinGet\Packages\nginxinc.nginx_Microsoft.Winget.Source_8wekyb3d8bbwe\nginx-1.31.5"
$ConfPath = Join-Path $PSScriptRoot "nginx.conf"

Start-Process -FilePath "$NginxDir\nginx.exe" `
    -ArgumentList "-p", "$NginxDir\", "-c", $ConfPath `
    -WorkingDirectory $NginxDir `
    -WindowStyle Hidden

Start-Sleep -Milliseconds 500
Write-Host "nginx started on http://localhost:8080 (and on your LAN IP for phone access)"
