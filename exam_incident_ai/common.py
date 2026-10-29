"""Shared constants + feature engineering (used by training AND analysis)."""
import numpy as np
import pandas as pd

CAUSES = ["normal", "capacity_overload", "submit_surge", "db_bottleneck",
          "cpu_saturation", "bandwidth_cap", "memory_exhaustion"]

RAW_COLS = ["timestamp", "active_users", "response_time_ms", "cpu_usage_pct",
            "memory_usage_pct", "db_query_time_ms", "bandwidth_mbps",
            "error_count", "complaint_text"]

RT_BAD_MS = 1500          # response time above this = students feel it as "slow"

KEYWORDS = {
    "kw_submit": r"submit|saving|save|answer",
    "kw_login":  r"login|log in|loading|stuck|not opening",
    "kw_media":  r"video|image|buffer|camera|proctor",
    "kw_crash":  r"crash|502|503|logged out|slower and slower|restart",
}

FEATURES = ["users_ratio", "users_delta", "cpu", "mem", "db", "resp", "errors",
            "bw_per_user", "bw_flat", "bw_ratio_max", "db_share", "cpu_roll",
            "db_roll", "resp_roll", "mem_slope", "has_complaint"] + list(KEYWORDS)


def estimate_capacity(df: pd.DataFrame) -> float:
    """'Proven safe' capacity = busiest user level that still had healthy response time."""
    ok = df[df["response_time_ms"] < RT_BAD_MS]
    if len(ok) < 10:
        return float(max(df["active_users"].median(), 1))
    return float(max(ok["active_users"].quantile(0.95), 1))


def make_features(df: pd.DataFrame, capacity: float) -> pd.DataFrame:
    df = df.reset_index(drop=True)
    f = pd.DataFrame(index=df.index)
    users = df["active_users"].astype(float)
    f["users_ratio"] = users / capacity
    f["users_delta"] = users.diff().fillna(0) / capacity
    f["cpu"] = df["cpu_usage_pct"]
    f["mem"] = df["memory_usage_pct"]
    f["db"] = df["db_query_time_ms"]
    f["resp"] = df["response_time_ms"]
    f["errors"] = df["error_count"]
    bw = df["bandwidth_mbps"].astype(float)
    f["bw_per_user"] = bw / users.clip(lower=1)
    roll = bw.rolling(5, min_periods=2)
    f["bw_flat"] = (roll.std() / (roll.mean() + 1e-6)).fillna(0)
    f["bw_ratio_max"] = bw / (bw.max() + 1e-6)
    f["db_share"] = df["db_query_time_ms"] / (df["response_time_ms"] + 1)
    f["cpu_roll"] = f["cpu"].rolling(3, min_periods=1).mean()
    f["db_roll"] = f["db"].rolling(3, min_periods=1).mean()
    f["resp_roll"] = f["resp"].rolling(3, min_periods=1).mean()
    f["mem_slope"] = f["mem"].diff(5).fillna(0)
    txt = df["complaint_text"].fillna("").astype(str).str.lower()
    f["has_complaint"] = (txt.str.len() > 0).astype(int)
    for k, pat in KEYWORDS.items():
        f[k] = txt.str.contains(pat, regex=True).astype(int).rolling(3, min_periods=1).max()
    return f[FEATURES]
