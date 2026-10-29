# Incident report: sample_db_bottleneck

Data: 75 minutes, 08:55 to 10:09. Safe capacity used: **312 users** (estimated from this file (busiest healthy level)). Slow = response above 1500 ms.

## Incident 1: 09:24 to 09:43 (20 min)

**Most likely root cause: `db_bottleneck`** (model confidence 100%)

### Evidence from the three sources (server, network, complaints)

| Signal | Normal | During incident | Verdict |
|---|---|---|---|
| Active users | up to 312 | 314 (1.0x capacity) | ok |
| Response time | 215 ms | 3073 ms | slow |
| CPU | 36% | 43% | ok |
| Memory | 46% | 51% | ok |
| DB query time | 73 ms | 1320 ms | BOTTLENECK |
| Bandwidth | 0.12 Mbps/user | peak 37.1 Mbps | see below |
| Errors | | 56 total | |

Ruled out (stayed normal): CPU, memory, user overload.

Correlation of response time with each metric inside the incident: db +0.60, cpu +0.38, users +0.22, bandwidth +0.03, mem +0.02

Complaints: 7 during the incident.
Examples: "Site is down?"; "Question paper stuck loading"; "Portal is slow"; "Page spinning when I go to next question"
First slow reading 09:24, first complaint 09:29 (complaints came 5 min after the metrics).

### Timeline (server + network + complaints)

| Time | Users | Resp ms | CPU % | Mem % | DB ms | Mbps | Errors | Complaint |
|---|---|---|---|---|---|---|---|---|
| 09:23 | 294 | 234 | 39 | 49 | 91 | 32.3 | 0 |  |
| 09:25 | 279 | 2747 | 37 | 47 | 1320 | 32.5 | 2 |  |
| 09:27 | 287 | 2925 | 40 | 46 | 1179 | 32.5 | 2 |  |
| 09:29 | 314 | 2838 | 40 | 51 | 1191 | 36.0 | 3 | Site is down? |
| 09:31 | 287 | 2639 | 37 | 47 | 1017 | 35.0 | 6 |  |
| 09:33 | 279 | 2964 | 38 | 47 | 1194 | 34.5 | 3 | Question paper stuck loading |
| 09:35 | 278 | 2329 | 36 | 47 | 893 | 31.9 | 2 |  |
| 09:37 | 284 | 2924 | 40 | 47 | 1238 | 33.9 | 2 | Question paper stuck loading |
| 09:39 | 284 | 2832 | 36 | 47 | 1173 | 36.6 | 2 |  |
| 09:41 | 276 | 2760 | 33 | 45 | 1224 | 33.4 | 2 | Saving answer takes forever |
| 09:43 | 293 | 3047 | 41 | 47 | 1283 | 37.1 | 2 |  |

### What to do (take it if it fits your situation, leave it if not)

**1. [DO FIRST] Find and fix the slow queries first**

DB query time rose to 1320 ms (baseline 73 ms, 18.1x) while CPU peaked at only 43%. The servers were waiting on the database, not computing. Turn on the slow-query log, run EXPLAIN on the top queries, add missing indexes (session/user/answer tables) and check connection-pool limits.

- Take it if: the slow-query log shows a few queries causing most of the time (the usual case).
- Leave it if: the DB is already fully indexed. Then look at locks and pool size.

**2. [RECOMMENDED] Cache the question paper and static exam data in memory (Redis / app cache)**

Every student reads the same paper, so thousands of identical DB reads are wasted.

- Take it if: most DB load is reads.
- Leave it if: most DB load is answer writes. Then batch the writes.

**3. [OPTIONAL] Add a read replica or raise the pool size**

Spreads reads and removes 'waiting for a free connection' delays.

- Take it if: you have DB admin access and budget.
- Leave it if: queries are slow because of bad SQL. Fix that first.

### Prevention

- Load-test to at least 1.5x the expected number of students before every exam week, with the real submit pattern (everyone clicks in the same minute).
- Add alerts before students feel it: response time > 800 ms, CPU > 80%, memory > 85%, DB query time > 250 ms, bandwidth > 85% of the link.
- Run a 10-minute pre-exam health check (login, load paper, save answer, submit) 30 minutes before start.
- Write a one-page runbook: who to call, how to enable the waiting room, how to extend the exam clock fairly.
- Keep this tool's report for every incident. Over time you get real labelled data to retrain the model on.

---
Model note: trained on synthetic data. Treat the root cause as a strong lead and confirm it against your real logs (slow-query log, top, ISP graph) before making a big change.