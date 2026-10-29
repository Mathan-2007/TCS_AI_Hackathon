# TCS AI Hackathon Unified Project

This folder combines three complementary systems into one incident-analysis and exam-monitoring workspace:

- examtrace: upload exam logs, detect anomalies, classify root causes, and show AI-style suggestions.
- exam-observer-lab: live exam monitoring with request logs, system metrics, and a protected admin panel.
- exam_incident_ai: Python incident-analysis pipeline for synthetic incident data and root-cause recommendations.

## Start everything

From this folder:

```bash
npm install
npm run dev
```

This starts:

- ExamTrace API + frontend at http://localhost:5000 and http://localhost:5173
- Exam Observer Lab at http://localhost:3000

## Useful commands

```bash
npm run test-examtrace
npm run monitor
cd exam_incident_ai && python3 -m venv .venv && . .venv/bin/activate && pip install -r requirements.txt && python generate_data.py && python train.py
```

## Workflow

1. Run the live exam monitor to observe a test session.
2. Upload a log file into the ExamTrace dashboard or use the backend sample logs.
3. Review detected incidents, probable root causes, and suggested fixes.
4. Use the Python AI model to generate report-style recommendations from CSV incident data.

## Demo accounts

ExamTrace seed users:

- Admin: admin@exam.local / Admin@123
- Student: s105@student.local / Student@123

Exam Observer Lab demo users:

- student1 / DemoPass123!
- friend1 / FriendPass123!

## Notes

- The examtrace app is the main portal for post-incident root-cause analysis.
- The observer lab is the live monitoring layer.
- The Python model acts as the recommendation engine for incident CSVs and report generation.
