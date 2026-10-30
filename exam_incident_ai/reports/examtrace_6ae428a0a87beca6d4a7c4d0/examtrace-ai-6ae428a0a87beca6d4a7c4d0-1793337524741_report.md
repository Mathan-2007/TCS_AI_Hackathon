# Incident report: examtrace-ai-6ae428a0a87beca6d4a7c4d0-1793337524741

Data: 70 minutes, 03:30 to 04:39. Safe capacity used: **400 users** (given by you). Slow = response above 1500 ms.

## Incident 1: 03:31 to 03:48 (18 min)

**Most likely root cause: `memory_exhaustion`** (model confidence 47%)

Other possibilities: bandwidth_cap 37%, cpu_saturation 8%

### Evidence from the three sources (server, network, complaints)

| Signal | Normal | During incident | Verdict |
|---|---|---|---|
| Active users | up to 400 | 37 (0.1x capacity) | ok |
| Response time | 1291 ms | 2461 ms | slow |
| CPU | 39% | 43% | ok |
| Memory | 56% | 61% | ok |
| DB query time | 61 ms | 71 ms | ok |
| Bandwidth | 2.25 Mbps/user | peak 111.0 Mbps | see below |
| Errors | | 364 total | |

Ruled out (stayed normal): CPU, memory, database, user overload.

Correlation of response time with each metric inside the incident: bandwidth +1.00, cpu +0.38, db +0.21, mem +0.05, users -0.02

Complaints: 0 during the incident.

### Timeline (server + network + complaints)

| Time | Users | Resp ms | CPU % | Mem % | DB ms | Mbps | Errors | Complaint |
|---|---|---|---|---|---|---|---|---|
| 03:30 | 21 | 888 | 41 | 56 | 53 | 44.0 | 15 |  |
| 03:32 | 29 | 1615 | 37 | 57 | 64 | 76.0 | 20 |  |
| 03:34 | 29 | 1409 | 35 | 57 | 65 | 68.0 | 23 |  |
| 03:36 | 26 | 1421 | 43 | 61 | 61 | 67.0 | 21 |  |
| 03:38 | 32 | 1605 | 37 | 54 | 67 | 77.0 | 21 |  |
| 03:40 | 26 | 2449 | 42 | 56 | 66 | 108.0 | 18 |  |
| 03:42 | 32 | 2461 | 40 | 57 | 63 | 111.0 | 25 |  |
| 03:44 | 27 | 1502 | 41 | 58 | 61 | 71.0 | 22 |  |
| 03:46 | 30 | 1241 | 43 | 56 | 66 | 62.0 | 20 |  |
| 03:48 | 37 | 1860 | 35 | 53 | 60 | 89.0 | 23 |  |

### What to do (take it if it fits your situation, leave it if not)

**1. [DO FIRST] Fix the memory growth, then add a safety net**

Memory climbed from 56% to 61% during the incident while users did not explain it, which points to a leak or unbounded session/cache storage. Profile the app (heap dump), move sessions to Redis, set cache size limits.

- Take it if: memory keeps climbing across the exam.
- Leave it if: memory is stable and only briefly high.

**2. [RECOMMENDED] Restart or recycle workers before exam start and set memory alerts**

A rolling restart just before the exam gives a clean start; alert at 80% memory so you can act before 95%.

- Take it if: you cannot fix the leak this week.
- Leave it if: you have fixed it and verified under load.

### Prevention

- Load-test to at least 1.5x the expected number of students before every exam week, with the real submit pattern (everyone clicks in the same minute).
- Add alerts before students feel it: response time > 2582 ms, CPU > 80%, memory > 85%, DB query time > 250 ms, bandwidth > 85% of the link.
- Run a 10-minute pre-exam health check (login, load paper, save answer, submit) 30 minutes before start.
- Write a one-page runbook: who to call, how to enable the waiting room, how to extend the exam clock fairly.
- Keep this tool's report for every incident. Over time you get real labelled data to retrain the model on.

## Incident 2: 03:52 to 03:56 (5 min)

**Most likely root cause: `bandwidth_cap`** (model confidence 46%)

Other possibilities: memory_exhaustion 34%, cpu_saturation 13%

### Evidence from the three sources (server, network, complaints)

| Signal | Normal | During incident | Verdict |
|---|---|---|---|
| Active users | up to 400 | 33 (0.1x capacity) | ok |
| Response time | 1291 ms | 2320 ms | slow |
| CPU | 39% | 54% | ok |
| Memory | 56% | 57% | ok |
| DB query time | 61 ms | 67 ms | ok |
| Bandwidth | 2.25 Mbps/user | peak 103.0 Mbps | see below |
| Errors | | 112 total | |

Ruled out (stayed normal): CPU, memory, database, user overload.

Correlation of response time with each metric inside the incident: bandwidth +1.00, cpu -0.71, db -0.52, users -0.46, mem -0.41

Complaints: 0 during the incident.

### Timeline (server + network + complaints)

| Time | Users | Resp ms | CPU % | Mem % | DB ms | Mbps | Errors | Complaint |
|---|---|---|---|---|---|---|---|---|
| 03:51 | 27 | 944 | 44 | 56 | 59 | 49.0 | 13 |  |
| 03:52 | 33 | 2123 | 35 | 57 | 62 | 98.0 | 23 |  |
| 03:53 | 28 | 2279 | 38 | 55 | 62 | 102.0 | 25 |  |
| 03:54 | 26 | 2320 | 44 | 52 | 52 | 103.0 | 20 |  |
| 03:55 | 33 | 1515 | 54 | 57 | 60 | 74.0 | 23 |  |
| 03:56 | 28 | 1627 | 44 | 54 | 67 | 76.0 | 21 |  |
| 03:57 | 28 | 937 | 37 | 55 | 64 | 49.0 | 20 |  |

### What to do (take it if it fits your situation, leave it if not)

**1. [DO FIRST] Raise or bypass the bandwidth ceiling**

Bandwidth flat-lined near 103.0 Mbps while users kept rising, and CPU (54%) and DB (67 ms) stayed healthy. At the normal ~2.25 Mbps per user, 33 users need about 74 Mbps (with 30% headroom: 97 Mbps).

- Take it if: the ISP or firewall can burst for exam hours.
- Leave it if: the link cannot grow. Reduce per-user bandwidth below.

**2. [RECOMMENDED] Cut per-student bandwidth: CDN for images/JS/CSS, compression, lower proctoring video bitrate**

Static assets served from a CDN and compressed images typically remove most of the traffic.

- Take it if: the exam uses images or video proctoring.
- Leave it if: traffic is already mostly small text.

### Prevention

- Load-test to at least 1.5x the expected number of students before every exam week, with the real submit pattern (everyone clicks in the same minute).
- Add alerts before students feel it: response time > 2582 ms, CPU > 80%, memory > 85%, DB query time > 250 ms, bandwidth > 85% of the link.
- Run a 10-minute pre-exam health check (login, load paper, save answer, submit) 30 minutes before start.
- Write a one-page runbook: who to call, how to enable the waiting room, how to extend the exam clock fairly.
- Keep this tool's report for every incident. Over time you get real labelled data to retrain the model on.

## Incident 3: 04:00 to 04:19 (20 min)

**Most likely root cause: `bandwidth_cap`** (model confidence 44%)

Other possibilities: memory_exhaustion 41%, cpu_saturation 10%

### Evidence from the three sources (server, network, complaints)

| Signal | Normal | During incident | Verdict |
|---|---|---|---|
| Active users | up to 400 | 36 (0.1x capacity) | ok |
| Response time | 1291 ms | 2559 ms | slow |
| CPU | 39% | 48% | ok |
| Memory | 56% | 59% | ok |
| DB query time | 61 ms | 74 ms | ok |
| Bandwidth | 2.25 Mbps/user | peak 113.0 Mbps | see below |
| Errors | | 393 total | |

Ruled out (stayed normal): CPU, memory, database, user overload.

Correlation of response time with each metric inside the incident: bandwidth +1.00, mem -0.26, users +0.25, cpu +0.22, db -0.01

Complaints: 0 during the incident.

### Timeline (server + network + complaints)

| Time | Users | Resp ms | CPU % | Mem % | DB ms | Mbps | Errors | Complaint |
|---|---|---|---|---|---|---|---|---|
| 03:59 | 28 | 1190 | 39 | 61 | 61 | 59.0 | 20 |  |
| 04:01 | 33 | 1839 | 37 | 55 | 67 | 87.0 | 21 |  |
| 04:03 | 26 | 1664 | 42 | 54 | 65 | 77.0 | 19 |  |
| 04:05 | 36 | 1080 | 38 | 55 | 64 | 58.0 | 23 |  |
| 04:07 | 25 | 1449 | 34 | 56 | 65 | 68.0 | 18 |  |
| 04:09 | 33 | 2208 | 40 | 53 | 60 | 102.0 | 23 |  |
| 04:11 | 22 | 1459 | 36 | 58 | 69 | 67.0 | 17 |  |
| 04:13 | 32 | 1869 | 43 | 52 | 64 | 88.0 | 22 |  |
| 04:15 | 27 | 2037 | 43 | 58 | 74 | 92.0 | 20 |  |
| 04:17 | 28 | 1292 | 40 | 56 | 51 | 63.0 | 15 |  |
| 04:19 | 29 | 1502 | 32 | 59 | 57 | 72.0 | 18 |  |

### What to do (take it if it fits your situation, leave it if not)

**1. [DO FIRST] Raise or bypass the bandwidth ceiling**

Bandwidth flat-lined near 113.0 Mbps while users kept rising, and CPU (48%) and DB (74 ms) stayed healthy. At the normal ~2.25 Mbps per user, 36 users need about 81 Mbps (with 30% headroom: 105 Mbps).

- Take it if: the ISP or firewall can burst for exam hours.
- Leave it if: the link cannot grow. Reduce per-user bandwidth below.

**2. [RECOMMENDED] Cut per-student bandwidth: CDN for images/JS/CSS, compression, lower proctoring video bitrate**

Static assets served from a CDN and compressed images typically remove most of the traffic.

- Take it if: the exam uses images or video proctoring.
- Leave it if: traffic is already mostly small text.

### Prevention

- Load-test to at least 1.5x the expected number of students before every exam week, with the real submit pattern (everyone clicks in the same minute).
- Add alerts before students feel it: response time > 2582 ms, CPU > 80%, memory > 85%, DB query time > 250 ms, bandwidth > 85% of the link.
- Run a 10-minute pre-exam health check (login, load paper, save answer, submit) 30 minutes before start.
- Write a one-page runbook: who to call, how to enable the waiting room, how to extend the exam clock fairly.
- Keep this tool's report for every incident. Over time you get real labelled data to retrain the model on.

## Incident 4: 04:23 to 04:39 (17 min)

**Most likely root cause: `memory_exhaustion`** (model confidence 46%)

Other possibilities: bandwidth_cap 38%, cpu_saturation 8%

### Evidence from the three sources (server, network, complaints)

| Signal | Normal | During incident | Verdict |
|---|---|---|---|
| Active users | up to 400 | 35 (0.1x capacity) | ok |
| Response time | 1291 ms | 2627 ms | slow |
| CPU | 39% | 44% | ok |
| Memory | 56% | 59% | ok |
| DB query time | 61 ms | 77 ms | ok |
| Bandwidth | 2.25 Mbps/user | peak 117.0 Mbps | see below |
| Errors | | 325 total | |

Ruled out (stayed normal): CPU, memory, database, user overload.

Correlation of response time with each metric inside the incident: bandwidth +0.99, users +0.32, db +0.22, mem -0.16, cpu +0.15

Complaints: 0 during the incident.

### Timeline (server + network + complaints)

| Time | Users | Resp ms | CPU % | Mem % | DB ms | Mbps | Errors | Complaint |
|---|---|---|---|---|---|---|---|---|
| 04:22 | 28 | 1445 | 39 | 56 | 65 | 69.0 | 21 |  |
| 04:24 | 35 | 2473 | 42 | 56 | 65 | 113.0 | 24 |  |
| 04:26 | 26 | 1500 | 42 | 55 | 61 | 70.0 | 15 |  |
| 04:28 | 29 | 1748 | 37 | 55 | 55 | 82.0 | 18 |  |
| 04:30 | 27 | 1278 | 44 | 57 | 64 | 62.0 | 22 |  |
| 04:32 | 29 | 1236 | 41 | 58 | 58 | 61.0 | 18 |  |
| 04:34 | 27 | 1978 | 38 | 52 | 59 | 90.0 | 19 |  |
| 04:36 | 22 | 2356 | 37 | 59 | 56 | 103.0 | 18 |  |
| 04:38 | 30 | 1538 | 35 | 57 | 64 | 74.0 | 22 |  |

### What to do (take it if it fits your situation, leave it if not)

**1. [DO FIRST] Fix the memory growth, then add a safety net**

Memory climbed from 56% to 59% during the incident while users did not explain it, which points to a leak or unbounded session/cache storage. Profile the app (heap dump), move sessions to Redis, set cache size limits.

- Take it if: memory keeps climbing across the exam.
- Leave it if: memory is stable and only briefly high.

**2. [RECOMMENDED] Restart or recycle workers before exam start and set memory alerts**

A rolling restart just before the exam gives a clean start; alert at 80% memory so you can act before 95%.

- Take it if: you cannot fix the leak this week.
- Leave it if: you have fixed it and verified under load.

### Prevention

- Load-test to at least 1.5x the expected number of students before every exam week, with the real submit pattern (everyone clicks in the same minute).
- Add alerts before students feel it: response time > 2582 ms, CPU > 80%, memory > 85%, DB query time > 250 ms, bandwidth > 85% of the link.
- Run a 10-minute pre-exam health check (login, load paper, save answer, submit) 30 minutes before start.
- Write a one-page runbook: who to call, how to enable the waiting room, how to extend the exam clock fairly.
- Keep this tool's report for every incident. Over time you get real labelled data to retrain the model on.

---
Model note: trained on synthetic data. Treat the root cause as a strong lead and confirm it against your real logs (slow-query log, top, ISP graph) before making a big change.