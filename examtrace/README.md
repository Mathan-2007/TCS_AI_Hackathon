# ExamTrace: AI root cause analysis for online exam portals

Students say "it was slow for me" after an exam. ExamTrace lets an admin upload the backend log file and
finds out **what went wrong, when, who was affected and why**, with evidence log lines, a confidence score
and recommended fixes.

**Stack:** React (Vite) · Node.js + Express · MongoDB (Mongoose) · JWT auth

## Quick start

Requirements: Node.js 18+ and MongoDB (local install, Atlas, or `docker compose up -d`).

```bash
# 1. install everything
npm run install:all
npm install                       # root, only for the combined dev command

# 2. configure
cp backend/.env.example backend/.env     # edit MONGO_URI / JWT_SECRET if needed

# 3. load demo data (admin + students, sample exam log, 9 complaints)
npm run seed

# 4. run API (http://localhost:5000) and web app (http://localhost:5173)
npm run dev
```

Logins created by the seed:

| Role    | Email                  | Password     |
|---------|------------------------|--------------|
| Admin   | admin@exam.local       | Admin@123    |
| Student | s105@student.local     | Student@123  |

Without root install you can run `npm --prefix backend run dev` and `npm --prefix frontend run dev` in two terminals.

## What you can do

**Admin**
- Upload a log file (`.log`, `.txt`, `.json`, `.csv`). It is parsed, stored and analyzed immediately.
- See response time and CPU/memory over the exam with incidents shaded, each with cause, confidence, evidence and fixes.
- Check any student ID against the log, or search raw log lines by student, level and text.
- Open a student complaint, pick a log file, and analyze it. The system looks at a window around the time the student reported (default ±5 minutes).
- Download a PDF report, add a note and mark the complaint resolved.
- Dashboard of causes across all uploads and complaints.

**Student**
- Create an account with their student ID, file a complaint, and see the short verdict once it is analyzed (never raw logs, since those contain other students' IDs).

## Log format

Plain text (one event per line, `key=value` pairs) or JSON lines / JSON array / CSV with the same field names:

```
2026-10-20T09:31:12Z INFO source=web student=S101 session=sess-1 event=question_load latency_ms=312 status=200
2026-10-20T10:05:41Z WARN source=db event=query_stats db_query_ms=3480 db_pool_used=49 db_pool_max=50
2026-10-20T10:05:52Z ERROR source=web student=S140 event=answer_save latency_ms=8210 status=504 error="request timeout"
2026-10-20T09:50:10Z WARN source=client student=S105 event=telemetry rtt_ms=780 packet_loss=7 browser=Chrome/118.0 device_ram_gb=4
```

Only the timestamp is required. Common aliases are understood (`timestamp/ts/time`, `student_id`, `response_time`, `cpu_percent`,
`message` and more; see `backend/src/services/parser.js`). Useful `source` values: `web`, `app`, `db`, `auth`, `system`, `lb`, `client`, `thirdparty`.
Generate a realistic file with injected failures using `npm --prefix backend run sample`.

## How the AI part works

`backend/src/services/analyzer.js`

1. **Features:** events are grouped into 1-minute windows (latency, p95, error rate, timeouts, CPU, memory, DB query time, pool use, lock waits, auth failures, third-party and load-balancer errors, HTTP 429s, active students).
2. **Anomaly detection:** robust z-score (median/MAD) on latency plus hard thresholds on error rate, timeouts, CPU and DB time. Neighbouring anomalous minutes are merged into incidents.
3. **Root cause classification:** 10 categories are scored from weighted signals. The signals that contributed are shown as "Why this cause was chosen", so every result is explainable. Confidence combines the top score and its share of all scores.
4. **Student-side vs server-side:** for a complaint, the student's own telemetry (RTT, packet loss, offline events, browser, RAM) is compared with server health in the minutes where that student had slow or failed requests. A weak network with healthy servers is student-side; the same symptoms during a server incident are not.
5. **Evidence, explanation and fixes** are attached to every incident and complaint.

Categories: server overload, database bottleneck, network (server side), network (student side), application bug, session/authentication,
device/browser, third-party service, misconfiguration, no issue found.

Verify the analyzer without MongoDB: `npm --prefix backend test` (runs 9 complaint cases and 6 incidents against the sample log).

### Upgrading to a trained ML model

The rule-based scorer is a transparent baseline that works with zero training data. To use machine learning:

1. Collect labelled windows: run load tests (JMeter, k6, Locust) while injecting one failure at a time and label each window with the cause, or label past incidents.
2. Export the per-window features from `windowFeatures()` and train XGBoost or Random Forest in Python. Use SHAP for explanations.
3. Serve it as a small FastAPI endpoint and call it from `scoreCauses()`, or port to ONNX and run it in Node.
4. For anomaly detection on unlabelled logs, replace the z-score with Isolation Forest or a DeepLog-style LSTM (public data: LogHub).
5. Optional: send the incident evidence to an LLM to write the plain-language explanation.

## Project structure

```
backend/
  server.js                    Express app
  src/models/                  User, LogUpload, LogEvent, Complaint
  src/routes/                  auth, logs, complaints (+PDF report), dashboard
  src/services/parser.js       log parsing and normalization
  src/services/analyzer.js     windows, anomalies, root cause scoring
  src/services/ingest.js       store events + run analysis
  src/utils/seed.js            demo data
  src/utils/generateSample.js  synthetic log with injected failures
  sample-data/exam_sample.log  ready-made sample (11.5k lines)
frontend/
  src/pages/                   Login, Dashboard, Uploads, UploadDetail, Complaints, ComplaintDetail
  src/components/              Layout, AnalysisResult, ui helpers
```

## API summary

| Method | Path | Who | Purpose |
|---|---|---|---|
| POST | /api/auth/register, /login | all | student sign-up, sign-in |
| POST | /api/logs | admin | upload and analyze a log (multipart `file`, `examName`) |
| GET | /api/logs, /api/logs/:id | admin | list, full analysis |
| GET | /api/logs/:id/student/:studentId | admin | analyze one student (`?from=&to=`) |
| GET | /api/logs/:id/events | admin | search raw events |
| POST | /api/complaints | all | file a complaint |
| GET | /api/complaints, /:id | all | own (student) or all (admin) |
| POST | /api/complaints/:id/analyze | admin | `{ uploadId, windowMinutes }` |
| GET | /api/complaints/:id/report | admin | PDF report |
| GET | /api/dashboard | admin | counts and cause distribution |

## Notes

- Uploads are held in memory while parsing; files up to 100 MB work, and analysis loads one upload's events at a time (comfortable up to a few hundred thousand lines).
- Student data is protected by role-based access; before real use add HTTPS, set a strong `JWT_SECRET`, and consider anonymizing student IDs in the logs.
- Log times are treated as UTC unless the timestamp carries an offset.
