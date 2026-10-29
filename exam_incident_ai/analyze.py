"""
Analyse a real incident file and write a report.

Usage:
  python analyze.py data/samples/sample_submit_surge_1200_on_400.csv
  python analyze.py my_incident.csv --capacity 400
Input CSV needs the 9 columns (complaint_text may be empty).
"""
import argparse, os
import joblib
import numpy as np
import pandas as pd
from common import RAW_COLS, RT_BAD_MS, make_features, estimate_capacity
from planner import recommend, PREVENTION, fmt_t


def load(path):
    df = pd.read_csv(path)
    missing = [c for c in RAW_COLS if c not in df.columns and c != "complaint_text"]
    if missing:
        raise SystemExit(f"Missing columns: {missing}")
    if "complaint_text" not in df.columns:
        df["complaint_text"] = ""
    df["complaint_text"] = df["complaint_text"].fillna("")
    df["timestamp"] = pd.to_datetime(df["timestamp"])
    df = df.sort_values("timestamp").reset_index(drop=True)
    num = [c for c in RAW_COLS if c not in ("timestamp", "complaint_text")]
    df[num] = df[num].apply(pd.to_numeric, errors="coerce").interpolate().bfill().ffill()
    return df


def find_windows(bad, gap=2, min_len=2):
    idx = np.flatnonzero(bad)
    wins = []
    for i in idx:
        if wins and i - wins[-1][1] <= gap + 1:
            wins[-1][1] = i
        else:
            wins.append([i, i])
    return [(a, b) for a, b in wins if b - a + 1 >= min_len]


def evidence(df, a, b, healthy, cap):
    w = df.iloc[a:b + 1]
    base = df[healthy] if healthy.sum() >= 5 else df.iloc[:5]
    bpu = (base["bandwidth_mbps"] / base["active_users"].clip(lower=1)).median()
    comp = w[w["complaint_text"] != ""]
    breach = w[w["response_time_ms"] > RT_BAD_MS]
    first_breach = breach["timestamp"].iloc[0] if len(breach) else w["timestamp"].iloc[0]
    corr = {}
    for col, nm in [("active_users", "users"), ("cpu_usage_pct", "cpu"), ("memory_usage_pct", "mem"),
                    ("db_query_time_ms", "db"), ("bandwidth_mbps", "bandwidth")]:
        c = w["response_time_ms"].corr(w[col]) if w[col].std() > 0 and len(w) > 2 else np.nan
        corr[nm] = 0.0 if pd.isna(c) else float(c)
    return dict(
        start=w["timestamp"].iloc[0], end=w["timestamp"].iloc[-1], minutes=len(w),
        peak_users=int(w["active_users"].max()),
        bad_minutes=int((w["response_time_ms"] > RT_BAD_MS).sum()),
        peak=dict(cpu=w["cpu_usage_pct"].max(), mem=w["memory_usage_pct"].max(), db=w["db_query_time_ms"].max(),
                  bw=w["bandwidth_mbps"].max(), resp=w["response_time_ms"].max(), errors=int(w["error_count"].sum())),
        base=dict(cpu=base["cpu_usage_pct"].median(), mem=base["memory_usage_pct"].median(),
                  db=base["db_query_time_ms"].median(), resp=base["response_time_ms"].median(), bw_per_user=bpu),
        n_complaints=len(comp), sample_complaints=list(dict.fromkeys(comp["complaint_text"]))[:4],
        first_breach=first_breach,
        first_complaint=comp["timestamp"].iloc[0] if len(comp) else None, corr=corr)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("csv")
    ap.add_argument("--capacity", type=float, help="users your server comfortably handles (e.g. 400)")
    ap.add_argument("--anchor", help="time everyone hits at once, HH:MM (e.g. exam end 10:00). Default: first minute users exceed capacity")
    ap.add_argument("--model", default="models/rootcause.joblib")
    ap.add_argument("--out", default="reports")
    a = ap.parse_args()

    bundle = joblib.load(a.model)
    model, feats = bundle["model"], bundle["features"]
    df = load(a.csv)
    cap = a.capacity or estimate_capacity(df)
    cap_src = "given by you" if a.capacity else "estimated from this file (busiest healthy level)"
    X = make_features(df, cap)[feats]
    proba = pd.DataFrame(model.predict_proba(X), columns=model.classes_).rolling(3, center=True, min_periods=1).mean()
    pred = proba.idxmax(axis=1)
    bad = ((pred != "normal") | (df["response_time_ms"] > RT_BAD_MS)).to_numpy()
    wins = find_windows(bad)
    healthy = ((~bad) & (df["response_time_ms"] < RT_BAD_MS)).to_numpy()

    name = os.path.splitext(os.path.basename(a.csv))[0]
    os.makedirs(a.out, exist_ok=True)
    L = [f"# Incident report: {name}", "",
         f"Data: {len(df)} minutes, {fmt_t(df.timestamp.iloc[0])} to {fmt_t(df.timestamp.iloc[-1])}. "
         f"Safe capacity used: **{cap:.0f} users** ({cap_src}). Slow = response above {RT_BAD_MS} ms.", ""]
    if not wins:
        L.append("No slowdown detected in this file.")
    summary = []
    for k, (i0, i1) in enumerate(wins, 1):
        sub = proba.iloc[i0:i1 + 1].drop(columns=["normal"], errors="ignore")
        share = sub.sum() / max(sub.sum().sum(), 1e-9)
        cause, conf = share.idxmax(), float(share.max())
        # anchor for batch times = first minute users jump above capacity (else incident start)
        w = df.iloc[i0:i1 + 1]
        over = w[w["active_users"] > cap]
        anchor = (over["timestamp"].iloc[0] if len(over) else w["timestamp"].iloc[0])
        if a.anchor:
            hh, mm = map(int, a.anchor.split(":"))
            anchor = anchor.replace(hour=hh, minute=mm, second=0)
        ev = evidence(df, i0, i1, healthy, cap)
        ctx = dict(capacity=cap, anchor=anchor, rt_bad=RT_BAD_MS)
        recs = recommend(cause, ev, ctx)
        summary.append((k, cause, conf, ev))
        L += [f"## Incident {k}: {fmt_t(ev['start'])} to {fmt_t(ev['end'])} ({ev['minutes']} min)", "",
              f"**Most likely root cause: `{cause}`** (model confidence {conf:.0%})", ""]
        alt = share.sort_values(ascending=False).iloc[1:3]
        alt = [f"{c} {v:.0%}" for c, v in alt.items() if v > 0.05]
        if alt:
            L += [f"Other possibilities: {', '.join(alt)}", ""]
        p, b = ev["peak"], ev["base"]
        L += ["### Evidence from the three sources (server, network, complaints)", "",
              "| Signal | Normal | During incident | Verdict |", "|---|---|---|---|",
              f"| Active users | up to {cap:.0f} | {ev['peak_users']} ({ev['peak_users'] / cap:.1f}x capacity) | {'OVERLOADED' if ev['peak_users'] > cap * 1.1 else 'ok'} |",
              f"| Response time | {b['resp']:.0f} ms | {p['resp']:.0f} ms | slow |",
              f"| CPU | {b['cpu']:.0f}% | {p['cpu']:.0f}% | {'SATURATED' if p['cpu'] > 90 else 'ok'} |",
              f"| Memory | {b['mem']:.0f}% | {p['mem']:.0f}% | {'EXHAUSTED' if p['mem'] > 92 else 'ok'} |",
              f"| DB query time | {b['db']:.0f} ms | {p['db']:.0f} ms | {'BOTTLENECK' if p['db'] > max(4 * b['db'], 400) else 'ok'} |",
              f"| Bandwidth | {b['bw_per_user']:.2f} Mbps/user | peak {p['bw']:.1f} Mbps | see below |",
              f"| Errors | | {p['errors']} total | |", ""]
        ruled = []
        if p["cpu"] < 85: ruled.append("CPU")
        if p["mem"] < 88: ruled.append("memory")
        if p["db"] < max(4 * b["db"], 400): ruled.append("database")
        if ev["peak_users"] <= cap * 1.1: ruled.append("user overload")
        if ruled:
            L += [f"Ruled out (stayed normal): {', '.join(ruled)}.", ""]
        c = ev["corr"]
        L += ["Correlation of response time with each metric inside the incident: "
              + ", ".join(f"{k2} {v:+.2f}" for k2, v in sorted(c.items(), key=lambda x: -abs(x[1]))), ""]
        L += [f"Complaints: {ev['n_complaints']} during the incident."]
        if ev["sample_complaints"]:
            L += ["Examples: " + "; ".join(f'"{t}"' for t in ev["sample_complaints"])]
        if ev["first_complaint"] is not None:
            lag = (ev["first_complaint"] - ev["first_breach"]).total_seconds() / 60
            L += [f"First slow reading {fmt_t(ev['first_breach'])}, first complaint {fmt_t(ev['first_complaint'])} "
                  f"({'complaints came ' + format(lag, '.0f') + ' min after the metrics' if lag > 0 else 'same minute' if lag == 0 else 'complaints came BEFORE the metrics looked bad, so add earlier alerts'})."]
        L += ["", "### Timeline (server + network + complaints)", "",
              "| Time | Users | Resp ms | CPU % | Mem % | DB ms | Mbps | Errors | Complaint |", "|---|---|---|---|---|---|---|---|---|"]
        for _, r in df.iloc[max(0, i0 - 1):i1 + 2].iloc[::max(1, (i1 - i0) // 12 + 1)].iterrows():
            L.append(f"| {fmt_t(r.timestamp)} | {int(r.active_users)} | {r.response_time_ms:.0f} | {r.cpu_usage_pct:.0f} | "
                     f"{r.memory_usage_pct:.0f} | {r.db_query_time_ms:.0f} | {r.bandwidth_mbps:.1f} | {int(r.error_count)} | {r.complaint_text} |")
        L += ["", "### What to do (take it if it fits your situation, leave it if not)", ""]
        for n, rc in enumerate(recs, 1):
            L += [f"**{n}. [{rc.priority}] {rc.title}**", "", rc.detail, "",
                  f"- Take it if: {rc.take_if}", f"- Leave it if: {rc.leave_if}", ""]
        L += ["### Prevention", ""] + [
            "- " + t.format(warn_rt=int(max(2 * ev["base"]["resp"], 800)), warn_db=int(max(3 * ev["base"]["db"], 250)))
            for t in PREVENTION] + [""]
    L += ["---", "Model note: trained on synthetic data. Treat the root cause as a strong lead and confirm it against your "
          "real logs (slow-query log, top, ISP graph) before making a big change."]
    rp = os.path.join(a.out, f"{name}_report.md")
    open(rp, "w", encoding="utf-8").write("\n".join(L))

    try:
        import matplotlib; matplotlib.use("Agg")
        import matplotlib.pyplot as plt
        fig, ax = plt.subplots(4, 1, figsize=(11, 8), sharex=True)
        t = df["timestamp"]
        ax[0].plot(t, df.active_users, label="users"); ax[0].axhline(cap, ls="--", c="r", label="safe capacity"); ax[0].legend(loc="upper left")
        ax[1].plot(t, df.response_time_ms, c="C1"); ax[1].axhline(RT_BAD_MS, ls="--", c="r"); ax[1].set_ylabel("resp ms")
        ax[2].plot(t, df.cpu_usage_pct, label="cpu %"); ax[2].plot(t, df.memory_usage_pct, label="mem %"); ax[2].legend(loc="upper left")
        ax[3].plot(t, df.db_query_time_ms, label="db ms", c="C3"); ax3 = ax[3].twinx(); ax3.plot(t, df.bandwidth_mbps, c="C4", label="Mbps"); ax[3].legend(loc="upper left")
        for i0, i1 in wins:
            for x in ax: x.axvspan(t.iloc[i0], t.iloc[i1], color="red", alpha=0.12)
        fig.tight_layout(); fig.savefig(os.path.join(a.out, f"{name}_timeline.png"), dpi=110)
    except Exception as e:
        print("chart skipped:", e)

    print(f"\n=== {name} ===")
    for k, cause, conf, ev in summary:
        print(f"Incident {k}: {fmt_t(ev['start'])}-{fmt_t(ev['end'])}  cause={cause} ({conf:.0%})  peak users={ev['peak_users']}  capacity={cap:.0f}")
    print("Report:", rp)


if __name__ == "__main__":
    main()
