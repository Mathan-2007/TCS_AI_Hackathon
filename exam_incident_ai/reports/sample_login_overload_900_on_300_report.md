# Incident report: sample_login_overload_900_on_300

Data: 75 minutes, 08:55 to 10:09. Safe capacity used: **220 users** (estimated from this file (busiest healthy level)). Slow = response above 1500 ms.

## Incident 1: 09:00 to 09:19 (20 min)

**Most likely root cause: `capacity_overload`** (model confidence 100%)

### Evidence from the three sources (server, network, complaints)

| Signal | Normal | During incident | Verdict |
|---|---|---|---|
| Active users | up to 220 | 900 (4.1x capacity) | OVERLOADED |
| Response time | 214 ms | 6624 ms | slow |
| CPU | 40% | 100% | SATURATED |
| Memory | 48% | 88% | ok |
| DB query time | 85 ms | 268 ms | ok |
| Bandwidth | 0.12 Mbps/user | peak 115.6 Mbps | see below |
| Errors | | 326 total | |

Ruled out (stayed normal): database.

Correlation of response time with each metric inside the incident: mem +0.80, cpu +0.80, users +0.80, db +0.79, bandwidth +0.76

Complaints: 19 during the incident.
Examples: "Cannot login, page keeps loading"; "Portal not opening, too many students?"; "Very slow please help"; "Login page spinning forever"
First slow reading 09:00, first complaint 09:00 (complaints came first, so add monitoring alerts).

### Timeline (server + network + complaints)

| Time | Users | Resp ms | CPU % | Mem % | DB ms | Mbps | Errors | Complaint |
|---|---|---|---|---|---|---|---|---|
| 08:59 | 29 | 162 | 22 | 40 | 50 | 3.2 | 0 |  |
| 09:01 | 900 | 5332 | 100 | 85 | 245 | 104.9 | 16 | Portal not opening, too many students? |
| 09:03 | 900 | 6117 | 100 | 86 | 250 | 107.0 | 19 | Portal not opening, too many students? |
| 09:05 | 900 | 6300 | 100 | 86 | 246 | 101.8 | 11 | Not working |
| 09:07 | 900 | 6468 | 100 | 86 | 250 | 103.4 | 25 | Stuck on loading screen after exam started |
| 09:09 | 900 | 6293 | 100 | 85 | 247 | 103.8 | 24 | Cannot login, page keeps loading |
| 09:11 | 900 | 6624 | 100 | 88 | 252 | 103.4 | 22 | Stuck on loading screen after exam started |
| 09:13 | 900 | 6451 | 100 | 86 | 260 | 102.1 | 9 | Cannot login, page keeps loading |
| 09:15 | 900 | 6564 | 100 | 88 | 268 | 106.6 | 20 | Very slow please help |
| 09:17 | 900 | 6335 | 100 | 86 | 256 | 110.5 | 13 |  |
| 09:19 | 200 | 2689 | 38 | 50 | 101 | 24.1 | 3 | Very slow please help |

### What to do (take it if it fits your situation, leave it if not)

**1. [DO FIRST] Split the login / exam start crowd into 6 timed batches (not all at once)**

Peak was 900 concurrent users against a proven-safe capacity of about 220 (4.1x overload). Response time stayed above 1500 ms for 20 min.
  - Minimum plan, 5 batches at 100% load: B1 09:00 (180 users), B2 09:05 (180 users), B3 09:10 (180 users), B4 09:15 (180 users), B5 09:20 (180 users)
  - Recommended, 6 batches at ~68% load: B1 09:00 (150 users), B2 09:05 (150 users), B3 09:10 (150 users), B4 09:15 (150 users), B5 09:20 (150 users), B6 09:25 (150 users)
  The 5-minute gap is estimated from how long this incident took to drain; confirm it with a load test.

- Take it if: your exam can have different start or end times per batch, and you can give batches different question sets or shuffled papers so early batches cannot leak questions to later ones.
- Leave it if: the exam must end for everyone at exactly the same minute (legal or fairness rules), or you cannot prevent paper sharing between batches. Use the autosave and queue options below instead.

**2. [RECOMMENDED] Autosave answers during the exam so the final 'Submit' is a tiny request**

Today every student sends all answers in the last minute, which is why the DB and CPU spike at once. If each answer is saved when it is chosen, submit only flips a flag. This usually cuts end-of-exam write load by a large factor without changing the schedule.

- Take it if: the portal is yours to change, or the LMS vendor supports autosave.
- Leave it if: the LMS is third-party and locked. Then rely on batching or a queue.

**3. [OPTIONAL] Or add capacity: about 6x the current server size at peak**

To hold 900 users at <=80% load you need roughly 6x today's capacity. Cloud autoscaling or a temporary extra node for exam hours is cheaper than owning it permanently.

- Take it if: exams are frequent, or batching is not allowed.
- Leave it if: this is a rare spike. Batching costs nothing.

**4. [OPTIONAL] Put a waiting room / rate limit in front of login and submit**

Admit at most about 175 concurrent sessions into the heavy endpoint, queue the rest with a 'your answers are saved, submitting...' message and auto-retry with random 1-10 s delay.

- Take it if: you cannot move exam times.
- Leave it if: you already use batching, since the queue then rarely fills.

### Prevention

- Load-test to at least 1.5x the expected number of students before every exam week, with the real submit pattern (everyone clicks in the same minute).
- Add alerts before students feel it: response time > 800 ms, CPU > 80%, memory > 85%, DB query time > 255 ms, bandwidth > 85% of the link.
- Run a 10-minute pre-exam health check (login, load paper, save answer, submit) 30 minutes before start.
- Write a one-page runbook: who to call, how to enable the waiting room, how to extend the exam clock fairly.
- Keep this tool's report for every incident. Over time you get real labelled data to retrain the model on.

---
Model note: trained on synthetic data. Treat the root cause as a strong lead and confirm it against your real logs (slow-query log, top, ISP graph) before making a big change.