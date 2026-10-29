# Exam Portal Slowdown Root-Cause AI (PS 1.4)

Correlates server + network + complaint data on one timeline, finds the root cause,
and writes an incident report with number-backed fixes (including how to split students into batches).

## Setup (VS Code terminal, inside this folder)
    python -m venv .venv
    .venv\Scripts\activate          # Windows   (Mac/Linux: source .venv/bin/activate)
    pip install -r requirements.txt

## Run order
    python generate_data.py         # makes data/train.csv + 6 sample incidents
    python train.py                 # trains models/rootcause.joblib
    python analyze.py data/samples/sample_submit_surge_1200_on_400.csv --capacity 400 --anchor 10:00

Open reports/<name>_report.md and reports/<name>_timeline.png.

## Use YOUR real incident
CSV with columns: timestamp, active_users, response_time_ms, cpu_usage_pct, memory_usage_pct,
db_query_time_ms, bandwidth_mbps, error_count, complaint_text (one row per minute).
    python analyze.py my_incident.csv --capacity 400 --anchor 10:00
--capacity = users your server comfortably handles. Leave it out and the tool estimates it.
--anchor   = the minute everybody hits at once (e.g. exam end), used to print the batch times.

## Use real public logs (NASA-HTTP, Loghub Apache)
    python real_log_to_csv.py NASA_access_log_Jul95 --capacity 400 --cause db_bottleneck --scale-peak 1.2
Real: timestamps + users per minute. Synthetic: the other fields (as the problem statement allows).

## Root causes it recognises
capacity_overload, submit_surge, db_bottleneck, cpu_saturation, bandwidth_cap, memory_exhaustion

## Files
common.py (features) | generate_data.py (synthetic data) | train.py (model) |
analyze.py (report) | planner.py (capacity maths + recommendations) | real_log_to_csv.py
