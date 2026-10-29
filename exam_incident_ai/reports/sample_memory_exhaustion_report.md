# Incident report: sample_memory_exhaustion

Data: 75 minutes, 08:55 to 10:09. Safe capacity used: **350 users** (estimated from this file (busiest healthy level)). Slow = response above 1500 ms.

## Incident 1: 09:24 to 09:36 (13 min)

**Most likely root cause: `memory_exhaustion`** (model confidence 100%)

### Evidence from the three sources (server, network, complaints)

| Signal | Normal | During incident | Verdict |
|---|---|---|---|
| Active users | up to 350 | 353 (1.0x capacity) | ok |
| Response time | 222 ms | 1935 ms | slow |
| CPU | 39% | 45% | ok |
| Memory | 48% | 98% | EXHAUSTED |
| DB query time | 82 ms | 96 ms | ok |
| Bandwidth | 0.12 Mbps/user | peak 41.5 Mbps | see below |
| Errors | | 4 total | |

Ruled out (stayed normal): CPU, database, user overload.

Correlation of response time with each metric inside the incident: mem +0.93, db -0.42, bandwidth -0.40, users -0.29, cpu -0.15

Complaints: 1 during the incident.
Examples: "Not working"
First slow reading 09:34, first complaint 09:34 (complaints came first, so add monitoring alerts).

### Timeline (server + network + complaints)

| Time | Users | Resp ms | CPU % | Mem % | DB ms | Mbps | Errors | Complaint |
|---|---|---|---|---|---|---|---|---|
| 09:23 | 345 | 228 | 43 | 49 | 88 | 41.2 | 1 |  |
| 09:25 | 353 | 237 | 45 | 79 | 83 | 39.5 | 0 |  |
| 09:27 | 332 | 229 | 41 | 80 | 94 | 39.3 | 0 |  |
| 09:29 | 330 | 233 | 45 | 85 | 89 | 40.1 | 0 |  |
| 09:31 | 319 | 635 | 44 | 89 | 87 | 40.3 | 0 |  |
| 09:33 | 319 | 1192 | 35 | 93 | 96 | 38.2 | 0 |  |
| 09:35 | 315 | 1599 | 40 | 94 | 82 | 36.4 | 1 |  |
| 09:37 | 319 | 924 | 40 | 49 | 90 | 38.7 | 0 |  |

### What to do (take it if it fits your situation, leave it if not)

**1. [DO FIRST] Fix the memory growth, then add a safety net**

Memory climbed from 48% to 98% during the incident while users did not explain it, which points to a leak or unbounded session/cache storage. Profile the app (heap dump), move sessions to Redis, set cache size limits.

- Take it if: memory keeps climbing across the exam.
- Leave it if: memory is stable and only briefly high.

**2. [RECOMMENDED] Restart or recycle workers before exam start and set memory alerts**

A rolling restart just before the exam gives a clean start; alert at 80% memory so you can act before 95%.

- Take it if: you cannot fix the leak this week.
- Leave it if: you have fixed it and verified under load.

### Prevention

- Load-test to at least 1.5x the expected number of students before every exam week, with the real submit pattern (everyone clicks in the same minute).
- Add alerts before students feel it: response time > 800 ms, CPU > 80%, memory > 85%, DB query time > 250 ms, bandwidth > 85% of the link.
- Run a 10-minute pre-exam health check (login, load paper, save answer, submit) 30 minutes before start.
- Write a one-page runbook: who to call, how to enable the waiting room, how to extend the exam clock fairly.
- Keep this tool's report for every incident. Over time you get real labelled data to retrain the model on.

---
Model note: trained on synthetic data. Treat the root cause as a strong lead and confirm it against your real logs (slow-query log, top, ISP graph) before making a big change.