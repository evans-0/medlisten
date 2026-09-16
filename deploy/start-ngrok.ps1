# Opens a public HTTPS tunnel to the local nginx reverse proxy (port 8080),
# which itself serves the built frontend and proxies /api to the backend.
# Requires nginx already running (see start-nginx.ps1) and an ngrok account
# authtoken configured (already saved in this machine's ngrok.yml).

$Ngrok = "$env:LOCALAPPDATA\Microsoft\WinGet\Packages\Ngrok.Ngrok_Microsoft.Winget.Source_8wekyb3d8bbwe\ngrok.exe"

Write-Host "Starting ngrok tunnel to http://localhost:8080 ..."
Write-Host "Watch this window for the 'Forwarding' line, or check http://localhost:4040 for the public URL + request inspector."
& $Ngrok http 8080
