# Incident report: sample_cpu_saturation

Data: 75 minutes, 08:55 to 10:09. Safe capacity used: **200 users** (given by you). Slow = response above 1500 ms.

## Incident 1: 09:21 to 09:40 (20 min)

**Most likely root cause: `cpu_saturation`** (model confidence 89%)

Other possibilities: capacity_overload 11%

### Evidence from the three sources (server, network, complaints)

| Signal | Normal | During incident | Verdict |
|---|---|---|---|
| Active users | up to 200 | 345 (1.7x capacity) | OVERLOADED |
| Response time | 219 ms | 1735 ms | slow |
| CPU | 42% | 100% | SATURATED |
| Memory | 49% | 52% | ok |
| DB query time | 85 ms | 101 ms | ok |
| Bandwidth | 0.12 Mbps/user | peak 41.9 Mbps | see below |
| Errors | | 9 total | |

Ruled out (stayed normal): memory, database.

Correlation of response time with each metric inside the incident: cpu +0.41, mem +0.18, db -0.13, users +0.12, bandwidth +0.01

Complaints: 2 during the incident.
Examples: "Everything is slow, even the timer freezes"; "Not working"
First slow reading 09:23, first complaint 09:35 (complaints came 12 min after the metrics).

### Timeline (server + network + complaints)

| Time | Users | Resp ms | CPU % | Mem % | DB ms | Mbps | Errors | Complaint |
|---|---|---|---|---|---|---|---|---|
| 09:20 | 313 | 227 | 41 | 49 | 72 | 35.9 | 0 |  |
| 09:22 | 345 | 1444 | 98 | 50 | 99 | 41.5 | 0 |  |
| 09:24 | 311 | 1457 | 94 | 48 | 81 | 36.8 | 0 |  |
| 09:26 | 332 | 1698 | 99 | 50 | 86 | 38.3 | 0 |  |
| 09:28 | 316 | 1735 | 99 | 49 | 81 | 37.6 | 0 |  |
| 09:30 | 319 | 1525 | 96 | 51 | 98 | 37.7 | 1 |  |
| 09:32 | 321 | 1575 | 96 | 49 | 92 | 41.2 | 0 |  |
| 09:34 | 333 | 1642 | 98 | 50 | 87 | 39.9 | 0 |  |
| 09:36 | 326 | 1683 | 98 | 50 | 89 | 39.0 | 0 |  |
| 09:38 | 327 | 1614 | 97 | 49 | 92 | 38.7 | 0 |  |
| 09:40 | 314 | 1594 | 96 | 49 | 88 | 37.0 | 1 |  |

### What to do (take it if it fits your situation, leave it if not)

**1. [DO FIRST] Identify what consumed the CPU**

CPU hit 100% (baseline 42%). Users were 1.7x the proven-safe capacity, so CPU ran out because of load.

- Take it if: CPU high with normal user numbers.
- Leave it if: CPU high only because users exceeded capacity. Go to scale-out.

**2. [RECOMMENDED] Scale out: second app server behind a load balancer**

At 345 users you need about 3 app servers of today's size to stay under ~70% CPU.

- Take it if: CPU is high because of genuine user load.
- Leave it if: a single bad process is the cause.

**3. [RECOMMENDED] Freeze heavy background jobs during exam windows**

Backups, report generation and log rotation should not run while exams are live.

- Take it if: any scheduled job overlaps exam hours.
- Leave it if: none do.

### Prevention

- Load-test to at least 1.5x the expected number of students before every exam week, with the real submit pattern (everyone clicks in the same minute).
- Add alerts before students feel it: response time > 800 ms, CPU > 80%, memory > 85%, DB query time > 255 ms, bandwidth > 85% of the link.
- Run a 10-minute pre-exam health check (login, load paper, save answer, submit) 30 minutes before start.
- Write a one-page runbook: who to call, how to enable the waiting room, how to extend the exam clock fairly.
- Keep this tool's report for every incident. Over time you get real labelled data to retrain the model on.

---
Model note: trained on synthetic data. Treat the root cause as a strong lead and confirm it against your real logs (slow-query log, top, ISP graph) before making a big change.