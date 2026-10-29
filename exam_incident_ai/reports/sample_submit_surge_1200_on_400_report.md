# Incident report: sample_submit_surge_1200_on_400

Data: 75 minutes, 08:55 to 10:09. Safe capacity used: **400 users** (given by you). Slow = response above 1500 ms.

## Incident 1: 09:55 to 09:58 (4 min)

**Most likely root cause: `submit_surge`** (model confidence 99%)

### Evidence from the three sources (server, network, complaints)

| Signal | Normal | During incident | Verdict |
|---|---|---|---|
| Active users | up to 400 | 1200 (3.0x capacity) | OVERLOADED |
| Response time | 213 ms | 6221 ms | slow |
| CPU | 40% | 100% | SATURATED |
| Memory | 49% | 86% | ok |
| DB query time | 86 ms | 473 ms | BOTTLENECK |
| Bandwidth | 0.12 Mbps/user | peak 146.2 Mbps | see below |
| Errors | | 42 total | |

Ruled out (stayed normal): memory.

Correlation of response time with each metric inside the incident: db +0.87, users +0.83, cpu +0.83, mem +0.82, bandwidth +0.78

Complaints: 3 during the incident.
Examples: "Clicked submit and nothing happened"; "Very slow please help"; "Not working"
First slow reading 09:55, first complaint 09:55 (same minute).

### Timeline (server + network + complaints)

| Time | Users | Resp ms | CPU % | Mem % | DB ms | Mbps | Errors | Complaint |
|---|---|---|---|---|---|---|---|---|
| 09:54 | 284 | 215 | 40 | 50 | 87 | 31.8 | 0 |  |
| 09:55 | 1200 | 4028 | 100 | 86 | 424 | 146.2 | 11 | Clicked submit and nothing happened |
| 09:56 | 1200 | 5558 | 100 | 86 | 473 | 132.8 | 14 | Very slow please help |
| 09:57 | 1200 | 6221 | 100 | 86 | 464 | 135.9 | 16 | Not working |
| 09:58 | 40 | 2586 | 20 | 39 | 54 | 5.0 | 1 |  |
| 09:59 | 40 | 1161 | 20 | 38 | 52 | 4.9 | 0 |  |

### What to do (take it if it fits your situation, leave it if not)

**1. [DO FIRST] Split the submission crowd into 4 timed batches (not all at once)**

Peak was 1200 concurrent users against a proven-safe capacity of about 400 (3.0x overload). Response time stayed above 1500 ms for 4 min.
  - Minimum plan, 3 batches at 100% load: B1 10:00 (400 users), B2 10:02 (400 users), B3 10:04 (400 users)
  - Recommended, 4 batches at ~75% load: B1 10:00 (300 users), B2 10:02 (300 users), B3 10:04 (300 users), B4 10:06 (300 users)
  The 2-minute gap is estimated from how long this incident took to drain; confirm it with a load test.

- Take it if: your exam can have different start or end times per batch, and you can give batches different question sets or shuffled papers so early batches cannot leak questions to later ones.
- Leave it if: the exam must end for everyone at exactly the same minute (legal or fairness rules), or you cannot prevent paper sharing between batches. Use the autosave and queue options below instead.

**2. [RECOMMENDED] Autosave answers during the exam so the final 'Submit' is a tiny request**

Today every student sends all answers in the last minute, which is why the DB and CPU spike at once. If each answer is saved when it is chosen, submit only flips a flag. This usually cuts end-of-exam write load by a large factor without changing the schedule.

- Take it if: the portal is yours to change, or the LMS vendor supports autosave.
- Leave it if: the LMS is third-party and locked. Then rely on batching or a queue.

**3. [OPTIONAL] Or add capacity: about 4x the current server size at peak**

To hold 1200 users at <=80% load you need roughly 4x today's capacity. Cloud autoscaling or a temporary extra node for exam hours is cheaper than owning it permanently.

- Take it if: exams are frequent, or batching is not allowed.
- Leave it if: this is a rare spike. Batching costs nothing.

**4. [OPTIONAL] Put a waiting room / rate limit in front of login and submit**

Admit at most about 320 concurrent sessions into the heavy endpoint, queue the rest with a 'your answers are saved, submitting...' message and auto-retry with random 1-10 s delay.

- Take it if: you cannot move exam times.
- Leave it if: you already use batching, since the queue then rarely fills.

### Prevention

- Load-test to at least 1.5x the expected number of students before every exam week, with the real submit pattern (everyone clicks in the same minute).
- Add alerts before students feel it: response time > 800 ms, CPU > 80%, memory > 85%, DB query time > 258 ms, bandwidth > 85% of the link.
- Run a 10-minute pre-exam health check (login, load paper, save answer, submit) 30 minutes before start.
- Write a one-page runbook: who to call, how to enable the waiting room, how to extend the exam clock fairly.
- Keep this tool's report for every incident. Over time you get real labelled data to retrain the model on.

---
Model note: trained on synthetic data. Treat the root cause as a strong lead and confirm it against your real logs (slow-query log, top, ISP graph) before making a big change.