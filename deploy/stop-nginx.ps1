$NginxDir = "$env:LOCALAPPDATA\Microsoft\WinGet\Packages\nginxinc.nginx_Microsoft.Winget.Source_8wekyb3d8bbwe\nginx-1.31.5"
& "$NginxDir\nginx.exe" -p "$NginxDir\" -s stop
Write-Host "nginx stopped"
