# Incident report: sample_bandwidth_cap

Data: 75 minutes, 08:55 to 10:09. Safe capacity used: **396 users** (estimated from this file (busiest healthy level)). Slow = response above 1500 ms.

## Incident 1: 09:31 to 09:49 (19 min)

**Most likely root cause: `bandwidth_cap`** (model confidence 100%)

### Evidence from the three sources (server, network, complaints)

| Signal | Normal | During incident | Verdict |
|---|---|---|---|
| Active users | up to 396 | 396 (1.0x capacity) | ok |
| Response time | 203 ms | 2928 ms | slow |
| CPU | 38% | 45% | ok |
| Memory | 47% | 49% | ok |
| DB query time | 76 ms | 94 ms | ok |
| Bandwidth | 0.12 Mbps/user | peak 24.6 Mbps | see below |
| Errors | | 64 total | |

Ruled out (stayed normal): CPU, memory, database, user overload.

Correlation of response time with each metric inside the incident: db +0.77, mem +0.17, users -0.13, cpu -0.02, bandwidth +0.00

Complaints: 10 during the incident.
Examples: "Question images take minutes to load"; "Camera feed freezing"; "Images in the question are not loading"; "Video proctoring keeps buffering"
First slow reading 09:31, first complaint 09:33 (complaints came 2 min after the metrics).

### Timeline (server + network + complaints)

| Time | Users | Resp ms | CPU % | Mem % | DB ms | Mbps | Errors | Complaint |
|---|---|---|---|---|---|---|---|---|
| 09:30 | 386 | 200 | 38 | 47 | 88 | 43.8 | 1 |  |
| 09:32 | 375 | 2291 | 40 | 47 | 78 | 24.6 | 2 |  |
| 09:34 | 366 | 2561 | 39 | 49 | 83 | 24.6 | 5 |  |
| 09:36 | 360 | 2639 | 39 | 48 | 89 | 24.6 | 3 |  |
| 09:38 | 388 | 2835 | 43 | 49 | 85 | 24.6 | 3 | Question images take minutes to load |
| 09:40 | 379 | 2806 | 38 | 48 | 90 | 24.6 | 3 | Images in the question are not loading |
| 09:42 | 390 | 2893 | 45 | 48 | 94 | 24.6 | 2 | Video proctoring keeps buffering |
| 09:44 | 385 | 2654 | 40 | 47 | 86 | 24.6 | 5 |  |
| 09:46 | 362 | 2771 | 42 | 48 | 86 | 24.6 | 1 | Portal is slow |
| 09:48 | 369 | 2725 | 38 | 47 | 91 | 24.6 | 5 | Not working |
| 09:50 | 352 | 1263 | 40 | 50 | 88 | 42.2 | 1 |  |

### What to do (take it if it fits your situation, leave it if not)

**1. [DO FIRST] Raise or bypass the bandwidth ceiling**

Bandwidth flat-lined near 24.6 Mbps while users kept rising, and CPU (45%) and DB (94 ms) stayed healthy. At the normal ~0.12 Mbps per user, 396 users need about 47 Mbps (with 30% headroom: 62 Mbps).

- Take it if: the ISP or firewall can burst for exam hours.
- Leave it if: the link cannot grow. Reduce per-user bandwidth below.

**2. [RECOMMENDED] Cut per-student bandwidth: CDN for images/JS/CSS, compression, lower proctoring video bitrate**

Static assets served from a CDN and compressed images typically remove most of the traffic.

- Take it if: the exam uses images or video proctoring.
- Leave it if: traffic is already mostly small text.

### Prevention

- Load-test to at least 1.5x the expected number of students before every exam week, with the real submit pattern (everyone clicks in the same minute).
- Add alerts before students feel it: response time > 800 ms, CPU > 80%, memory > 85%, DB query time > 250 ms, bandwidth > 85% of the link.
- Run a 10-minute pre-exam health check (login, load paper, save answer, submit) 30 minutes before start.
- Write a one-page runbook: who to call, how to enable the waiting room, how to extend the exam clock fairly.
- Keep this tool's report for every incident. Over time you get real labelled data to retrain the model on.

---
Model note: trained on synthetic data. Treat the root cause as a strong lead and confirm it against your real logs (slow-query log, top, ISP graph) before making a big change.