# Exam Observer Lab

A local demo assessment site with an Express backend, request logs, CPU/memory monitoring, and a protected admin view.

## Run it
Requires Node.js 18+ and npm. From this folder:

Linux / Kali:
```bash
npm install
export ADMIN_TOKEN='replace-with-a-long-random-token'
npm start
```
Windows PowerShell:
```powershell
npm install
$env:ADMIN_TOKEN = "replace-with-a-long-random-token"
npm start
```
Open http://localhost:3000. Enter the same admin token in the monitor panel.

## Demo accounts
- student1 / DemoPass123!
- friend1 / FriendPass123!

These credentials are fake and for this demo only. This is not production-grade authentication.

## Let a friend test on the same Wi-Fi
1. Start the server and keep it running.
2. On Kali run `hostname -I` or `ip -br addr`; on Windows run `ipconfig`. Find your laptop's private LAN IPv4.
3. Friend opens `http://YOUR-LAN-IP:3000` on the same trusted Wi-Fi.
4. If prompted, allow Node only on the private network; do not disable the firewall globally.
5. Keep your admin panel open, connect with your admin token, and ask your friend to log in and submit the demo assessment.
6. If they are not on your LAN, use a private VPN you both control; do not port-forward this demo or expose admin endpoints to the public internet.

## Logs
The server creates:
- `logs/requests.jsonl`: timestamp, request ID, method, path, status, latency, client IP, user agent.
- `logs/system-metrics.jsonl`: CPU/memory metrics every 5 seconds.
- `logs/assessment-events.jsonl`: demo login success/failure, logout, assessment score.

Logs deliberately exclude request bodies, passwords, cookies, and auth tokens. View logs in the admin panel or use `tail -f logs/requests.jsonl` on Linux.

## Test plan
1. Open localhost and connect the admin monitor.
2. Ask your consenting friend to log in, load questions, and submit.
3. Inspect Request logs and Assessment events; confirm paths like `/api/login`, `/api/questions`, and `/api/submit`.
4. Check System logs for CPU/memory samples around the request timestamps.
5. Compare request latency and error codes. A correlation does not prove causation.

## Safety and limitations
- Use only on your own demo site and with informed consent.
- It logs requests to this app only; it does not intercept or inspect traffic to other websites or apps.
- CPU/memory metrics describe the laptop running this server, not your friend's device.
- The demo stores fake users in source and sessions in memory; do not use it for real assessments.
- The admin token protects monitoring endpoints, but this is still a teaching lab. Do not expose it publicly.
