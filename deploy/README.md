# Running MedListen on your phone

Two options, in order of how far you want to reach:

- **Same WiFi/LAN only** — nginx alone, phone opens your PC's local IP.
- **Anywhere on the internet, HTTPS** — nginx + an ngrok tunnel on top.

Either way, nginx is the piece that matters first: it serves the built
frontend as static files and reverse-proxies `/api/` to the backend, both
behind **one port (8080)**. That's what makes a single ngrok tunnel enough —
ngrok only forwards one local port to one public URL, so if frontend and
backend were still on two different ports, you'd need two tunnels and would
have to rewire the frontend to call a different domain for its API. nginx
merging them into one origin first avoids all of that.

## One-time setup

- nginx: installed via `winget install nginxinc.nginx` (binary under
  `%LOCALAPPDATA%\Microsoft\WinGet\Packages\nginxinc.nginx_...\nginx-1.31.5`).
- ngrok: installed via `winget install Ngrok.Ngrok`, then self-updated with
  `ngrok update` (the winget package was a stale 3.3.1; this account's
  tunnels need 3.20.0+). Authtoken already saved to this machine's
  `%LOCALAPPDATA%\ngrok\ngrok.yml` — nothing to log in again for.

## Every time you want to run it

1. **MongoDB** — `npm run db:dev` in `backend/` (skip if using a real MongoDB already running)
2. **Voice service** (optional — mic button just hides itself without it) — `uvicorn app.main:app --port 8010` in `voice-service/` (with its venv active)
3. **Backend** — `npm run dev` in `backend/` (port 5000)
4. **Build the frontend** — `npm run build:watch` in `frontend/` (writes
   `frontend/dist/` and keeps running, rebuilding automatically whenever a
   frontend source file changes — nginx reads the files fresh each request,
   no nginx restart needed either). A plain one-off `npm run build` also
   works if you don't want a process left running, but then nginx keeps
   serving that exact snapshot until you rebuild again — this is easy to
   forget and looks like "the new UI isn't showing up" on the phone even
   though the code change is real and `localhost:5173` (Vite's own dev
   server) shows it fine.
5. **Start nginx**:
   ```powershell
   cd deploy
   .\start-nginx.ps1
   ```
   Stop it later with `.\stop-nginx.ps1`.

### Option A — same-network phone access (no internet needed)

1. Find this PC's LAN IP: `ipconfig` → the `IPv4 Address` under whichever
   adapter is actually connected (Wi-Fi or Ethernet).
2. Connect your phone to **the same network** as this PC.
3. On the phone, open `http://<that-IP>:8080` — e.g. `http://10.10.14.58:8080`.

**If the phone can't reach it:**
- **Windows Firewall** — the first external connection attempt may trigger an
  "Allow nginx through the firewall?" prompt; allow it for **Private**
  networks. If you don't see a prompt and it still fails, open *Windows
  Security → Firewall & network protection → Allow an app through firewall*,
  find nginx, and check the Private column.
- **Client/AP isolation** — many institutional or public Wi-Fi networks
  block devices from reaching each other even on the same network, for
  security. If the PC is on Ethernet and the phone on Wi-Fi (or vice versa)
  through a campus/office network, this is a common reason it won't connect
  even with everything configured correctly. A home router or a personal
  phone hotspot (put the PC on the hotspot too) almost always works, since
  those don't isolate clients by default.

### Option B — public HTTPS link via ngrok (works anywhere, bypasses network-isolation issues)

With nginx already running (step 5 above):

```powershell
cd deploy
.\start-ngrok.ps1
```

This occupies the terminal window (by design — it shows live request logs).
Watch for a line like:

```
started tunnel ... url=https://xxxx-xx-xxx-xxx-xxx.ngrok-free.app
```

Open that `https://...ngrok-free.app` URL on your phone — works over any
network, no WiFi/LAN matching or firewall rules needed, since ngrok makes
the outbound connection rather than requiring an inbound one.

- Press **Ctrl+C** in that terminal to stop the tunnel (nginx keeps running separately).
- The URL is **random and changes every time you restart the tunnel** (free
  tier). If you want a stable link across restarts, claim a free static
  domain from the ngrok dashboard and pass `--domain=your-name.ngrok-free.app`
  to the command in `start-ngrok.ps1`.
- You can also watch/replay requests at `http://localhost:4040` while the
  tunnel is running.

## Notes

- `deploy/nginx.conf` hardcodes the path to `frontend/dist` — if you move the
  project, update the `root` directive.
- Both setups serve your local dev build over what's ultimately still your
  own machine's data. Fine for testing/demos; don't put a real patient's
  ABHA ID/password through it, and don't leave an ngrok tunnel open longer
  than you're actively using it — same synthetic-data-only guidance as the
  rest of this project.
