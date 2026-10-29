"""
Builds synthetic exam-portal data with the 9 fields from the problem statement.
Each synthetic exam session has ONE known fault (the label) so the model can learn
what each root cause looks like.

Run:  python generate_data.py
Out:  data/train.csv                 (with session_id + label columns)
      data/samples/sample_*.csv      (9 fields only - pretend these are "real" incidents)
"""
import os
import numpy as np
import pandas as pd
from common import RAW_COLS, CAUSES

COMPLAINTS = {
    "capacity_overload": ["Cannot login, page keeps loading", "Stuck on loading screen after exam started",
                          "Portal not opening, too many students?", "Login page spinning forever"],
    "submit_surge": ["Submit button not working", "Answers not saving when I click submit",
                     "Submission timed out", "Clicked submit and nothing happened"],
    "db_bottleneck": ["Questions load very slowly", "Saving answer takes forever",
                      "Question paper stuck loading", "Page spinning when I go to next question"],
    "cpu_saturation": ["Whole portal is lagging", "Everything is slow, even the timer freezes",
                       "Portal hanging", "Portal is very laggy"],
    "bandwidth_cap": ["Video proctoring keeps buffering", "Images in the question are not loading",
                      "Camera feed freezing", "Question images take minutes to load"],
    "memory_exhaustion": ["Portal got slower and slower", "Page crashed and I was logged out",
                          "Got 502 error", "Had to restart the browser, portal crashed"],
}
GENERIC = ["Portal is slow", "Not working", "Timeout error", "Very slow please help", "Site is down?"]
NOISE = ["Forgot my password", "Where is the instruction sheet?", "Exam hall seat issue", "Need extra time form"]


def simulate_core(rng, users, C, cause, s, L, ts, session_id, surge_write_heavy=False):
    """Turn a user-count curve into all 9 fields, injecting `cause` in minutes [s, s+L)."""
    n = len(users)
    users = np.clip(users, 0, None)
    r = users / C
    cpu = 18 + 35 * r + rng.normal(0, 2.5, n)
    mem = 38 + 16 * r + rng.normal(0, 1.2, n)
    db = 40 + 70 * r + rng.normal(0, 8, n)
    bw_demand = users * 0.12 * rng.normal(1, 0.04, n)       # ~0.12 Mbps per active student
    cap_bw = np.full(n, 0.12 * C * 3.5)                      # link is normally not the limit
    label = np.array(["normal"] * n, dtype=object)
    sl = slice(s, s + L)
    if cause != "normal":
        label[sl] = cause
    if cause == "db_bottleneck":
        db[sl] *= rng.uniform(8, 16)
    elif cause == "cpu_saturation":
        cpu[sl] = rng.uniform(94, 100, len(cpu[sl]))
    elif cause == "bandwidth_cap":
        cap_bw[sl] = max(bw_demand[sl].max(), 1) * rng.uniform(0.4, 0.65)
    elif cause == "memory_exhaustion":
        mem[sl] = np.linspace(75, 98, len(mem[sl])) + rng.normal(0, 0.8, len(mem[sl]))
    elif cause == "submit_surge":
        db[sl] *= 1.8                                         # answer writes hammer the DB
    cpu, mem = np.clip(cpu, 1, 100), np.clip(mem, 1, 100)
    util = bw_demand / cap_bw
    bw = np.minimum(bw_demand, cap_bw)
    resp = (100 + 1.4 * db + 80 * np.maximum(0, cpu - 80) + 150 * np.maximum(0, mem - 85)
            + 3000 * np.maximum(0, util - 1) + 1800 * np.maximum(0, r - 1) ** 1.2
            + 2 * np.maximum(0, db - 600) + rng.normal(0, 25, n))
    for i in range(1, n):                                     # backlog: slowness lingers a bit
        resp[i] = 0.6 * resp[i] + 0.4 * resp[i - 1]
    errors = rng.poisson(0.3 + np.maximum(0, resp - 2000) / 250 + (mem > 96) * 3)
    text = []
    for i in range(n):
        p = float(np.clip((resp[i] - 1200) / 3000, 0, 0.85))
        if rng.random() < p:
            pool = COMPLAINTS.get(label[i]) if (label[i] != "normal" and rng.random() > 0.35) else GENERIC
            text.append(rng.choice(pool))
        elif rng.random() < 0.015:
            text.append(rng.choice(NOISE))
        else:
            text.append("")
    return pd.DataFrame({
        "timestamp": ts, "active_users": users.round().astype(int),
        "response_time_ms": resp.round(0), "cpu_usage_pct": cpu.round(1),
        "memory_usage_pct": mem.round(1), "db_query_time_ms": db.round(0),
        "bandwidth_mbps": bw.round(2), "error_count": errors,
        "complaint_text": text, "session_id": session_id, "label": label})


def simulate_session(rng, cause, C=None, surge_x=None, n=75, date="2026-03-02", sid=0):
    """Exam 09:00-10:00. Data starts 08:55. Normal students end-spike around 10:00."""
    C = C or int(rng.integers(250, 900))
    t = np.arange(n)
    users = rng.uniform(0.55, 0.8) * C * np.clip((t - 3) / 5, 0, 1) + rng.normal(0, 0.02 * C, n)
    users[:3] = rng.uniform(0, 5, 3)
    users[62:] = 0.1 * C
    if cause == "submit_surge":
        s, L = int(rng.integers(58, 62)), int(rng.integers(3, 7))
        users[s:s + L] = (surge_x or rng.uniform(1.5, 3.2)) * C
    else:
        users[60:62] = rng.uniform(0.8, 1.0) * C                # harmless normal end-spike
        if cause == "capacity_overload":
            s, L = int(rng.integers(3, 7)), int(rng.integers(8, 20))
            users[s:s + L] = (surge_x or rng.uniform(1.7, 3.2)) * C
        else:
            s, L = int(rng.integers(12, 40)), int(rng.integers(10, 22))
    ts = pd.date_range(f"{date} 08:55", periods=n, freq="min")
    return simulate_core(rng, users, C, cause, s, L, ts, sid)


def simulate_from_traffic(rng, users, ts, C, cause, sid=0):
    """Use a REAL traffic curve (e.g. NASA/Loghub per-minute users), synthesize the other fields."""
    n = len(users)
    s = max(0, int(np.argmax(users)) - 5)
    L = min(15, n - s)
    return simulate_core(rng, np.asarray(users, float), C, cause, s, L, ts, sid)


if __name__ == "__main__":
    rng = np.random.default_rng(42)
    os.makedirs("data/samples", exist_ok=True)
    frames, sid = [], 0
    per_cause = {c: (150 if c == "normal" else 130) for c in CAUSES}
    for cause, k in per_cause.items():
        for _ in range(k):
            frames.append(simulate_session(rng, cause, sid=sid)); sid += 1
    train = pd.concat(frames, ignore_index=True)
    train.to_csv("data/train.csv", index=False)
    print(f"data/train.csv  rows={len(train):,} sessions={sid}")
    print(train.groupby("label").size().to_string())

    # "Real-looking" incidents for testing (labels hidden, exactly the 9 fields)
    rng2 = np.random.default_rng(7)
    demos = {
        "sample_submit_surge_1200_on_400": ("submit_surge", 400, 3.0),
        "sample_login_overload_900_on_300": ("capacity_overload", 300, 3.0),
        "sample_db_bottleneck": ("db_bottleneck", 500, None),
        "sample_bandwidth_cap": ("bandwidth_cap", 600, None),
        "sample_cpu_saturation": ("cpu_saturation", 450, None),
        "sample_memory_exhaustion": ("memory_exhaustion", 500, None),
    }
    for name, (cause, C, x) in demos.items():
        d = simulate_session(rng2, cause, C=C, surge_x=x)
        d[RAW_COLS].to_csv(f"data/samples/{name}.csv", index=False)
    print("sample incidents written to data/samples/")
