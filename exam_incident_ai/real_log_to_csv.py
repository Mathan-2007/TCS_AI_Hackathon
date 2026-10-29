"""
Turn a REAL web log (NASA-HTTP / any Apache access log, or Loghub Apache error log)
into the 9-field CSV. Real part: timestamps + active_users per minute.
Synthetic part: the other fields, with the fault you choose injected at the busiest minute.

Usage:
  python real_log_to_csv.py NASA_access_log_Jul95 --capacity 400 --cause db_bottleneck --out data/nasa_db.csv
  python real_log_to_csv.py Apache.log --capacity 400 --cause submit_surge --scale-peak 3
Options: --scale-peak X  rescales traffic so its busiest minute = X * capacity (default 1.0)
"""
import argparse, re
import numpy as np, pandas as pd
from common import RAW_COLS, CAUSES
from generate_data import simulate_from_traffic

CLF = re.compile(r'^(\S+) \S+ \S+ \[(\d{2}/\w{3}/\d{4}:\d{2}:\d{2}:\d{2})')
ERR = re.compile(r'^\[\w{3} (\w{3} +\d+ \d{2}:\d{2}:\d{2} \d{4})\]')


def read_minutes(path):
    hosts = {}
    with open(path, errors="ignore") as f:
        for line in f:
            m = CLF.match(line)
            if m:
                t = pd.to_datetime(m.group(2), format="%d/%b/%Y:%H:%M:%S").floor("min")
                hosts.setdefault(t, set()).add(m.group(1)); continue
            m = ERR.match(line)                      # Loghub Apache error log: count lines as load
            if m:
                t = pd.to_datetime(m.group(1), format="%b %d %H:%M:%S %Y").floor("min")
                hosts.setdefault(t, set()).add(len(hosts.get(t, ())) + 1)
    if not hosts:
        raise SystemExit("No parsable lines. Expected Apache access (CLF) or error log format.")
    s = pd.Series({t: len(v) for t, v in hosts.items()}).sort_index()
    return s.reindex(pd.date_range(s.index.min(), s.index.max(), freq="min"), fill_value=0)


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("log"); ap.add_argument("--capacity", type=float, required=True)
    ap.add_argument("--cause", default="db_bottleneck", choices=CAUSES)
    ap.add_argument("--scale-peak", type=float, default=1.0)
    ap.add_argument("--window", type=int, default=90, help="minutes to keep around the busiest point")
    ap.add_argument("--out", default="data/real_based.csv")
    a = ap.parse_args()
    s = read_minutes(a.log)
    mid = int(np.argmax(s.values))
    lo = max(0, mid - a.window // 2); s = s.iloc[lo:lo + a.window]
    users = s.values / max(s.values.max(), 1) * a.scale_peak * a.capacity
    df = simulate_from_traffic(np.random.default_rng(1), users, s.index, a.capacity, a.cause)
    df[RAW_COLS].to_csv(a.out, index=False)
    print(f"wrote {a.out}  ({len(df)} minutes, injected cause = {a.cause})")
