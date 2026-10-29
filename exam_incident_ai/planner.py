"""Capacity maths + concrete, number-backed recommendations for each root cause."""
import math
import pandas as pd
from dataclasses import dataclass


@dataclass
class Rec:
    title: str
    detail: str
    take_if: str
    leave_if: str
    priority: str          # "DO FIRST" | "RECOMMENDED" | "OPTIONAL"


def fmt_t(ts):
    return ts.strftime("%H:%M")


def batch_plan(peak_users, capacity, anchor, recovery_min, headroom=0.8):
    """Split a simultaneous crowd into batches the server can really absorb."""
    overload = peak_users / capacity
    min_batches = max(2, math.ceil(peak_users / capacity))            # batches run at 100% load
    safe_batches = max(2, math.ceil(peak_users / (capacity * headroom)))  # batches run at <=80%
    # Heuristic: if the full crowd needed `recovery_min` minutes to clear, one batch of
    # 1/overload of the crowd needs about recovery_min/overload minutes. Never below 1 min.
    gap = max(1, math.ceil(max(recovery_min, 1) / overload))
    def sched(nb):
        size = math.ceil(peak_users / nb)
        return [(i + 1, fmt_t(anchor + pd.Timedelta(minutes=i * gap)), size) for i in range(nb)]
    return dict(overload=overload, min_batches=min_batches, safe_batches=safe_batches, gap=gap,
                min_sched=sched(min_batches), safe_sched=sched(safe_batches),
                safe_load_pct=round(100 * math.ceil(peak_users / safe_batches) / capacity))


def recommend(cause, ev, ctx):
    """ev = measured evidence dict, ctx = capacity/anchor info. Returns list[Rec]."""
    out = []
    cap, peak = ctx["capacity"], ev["peak_users"]
    if cause in ("capacity_overload", "submit_surge"):
        bp = batch_plan(peak, cap, ctx["anchor"], ev["bad_minutes"])
        when = "submission" if cause == "submit_surge" else "login / exam start"
        ev["batch_plan"] = bp
        s1 = ", ".join(f"B{n} {t} ({sz} users)" for n, t, sz in bp["min_sched"])
        s2 = ", ".join(f"B{n} {t} ({sz} users)" for n, t, sz in bp["safe_sched"])
        out.append(Rec(
            f"Split the {when} crowd into {bp['safe_batches']} timed batches (not all at once)",
            f"Peak was {peak} concurrent users against a proven-safe capacity of about {cap:.0f} "
            f"({bp['overload']:.1f}x overload). Response time stayed above {ctx['rt_bad']} ms for "
            f"{ev['bad_minutes']} min.\n"
            f"  - Minimum plan, {bp['min_batches']} batches at 100% load: {s1}\n"
            f"  - Recommended, {bp['safe_batches']} batches at ~{bp['safe_load_pct']}% load: {s2}\n"
            f"  The {bp['gap']}-minute gap is estimated from how long this incident took to drain; "
            f"confirm it with a load test.",
            take_if="your exam can have different start or end times per batch, and you can give batches "
                    "different question sets or shuffled papers so early batches cannot leak questions to later ones.",
            leave_if="the exam must end for everyone at exactly the same minute (legal or fairness rules), or "
                     "you cannot prevent paper sharing between batches. Use the autosave and queue options below instead.",
            priority="DO FIRST"))
        out.append(Rec(
            "Autosave answers during the exam so the final 'Submit' is a tiny request",
            "Today every student sends all answers in the last minute, which is why the DB and CPU spike at once. "
            "If each answer is saved when it is chosen, submit only flips a flag. This usually cuts end-of-exam write load "
            "by a large factor without changing the schedule.",
            take_if="the portal is yours to change, or the LMS vendor supports autosave.",
            leave_if="the LMS is third-party and locked. Then rely on batching or a queue.",
            priority="RECOMMENDED"))
        need = math.ceil(peak / (cap * 0.8))
        out.append(Rec(
            f"Or add capacity: about {need}x the current server size at peak",
            f"To hold {peak} users at <=80% load you need roughly {need}x today's capacity. Cloud autoscaling or a "
            "temporary extra node for exam hours is cheaper than owning it permanently.",
            take_if="exams are frequent, or batching is not allowed.",
            leave_if="this is a rare spike. Batching costs nothing.",
            priority="OPTIONAL"))
        out.append(Rec(
            "Put a waiting room / rate limit in front of login and submit",
            f"Admit at most about {int(cap * 0.8)} concurrent sessions into the heavy endpoint, queue the rest with a "
            "'your answers are saved, submitting...' message and auto-retry with random 1-10 s delay.",
            take_if="you cannot move exam times.",
            leave_if="you already use batching, since the queue then rarely fills.",
            priority="OPTIONAL"))
    elif cause == "db_bottleneck":
        out.append(Rec(
            "Find and fix the slow queries first",
            f"DB query time rose to {ev['peak']['db']:.0f} ms (baseline {ev['base']['db']:.0f} ms, "
            f"{ev['peak']['db'] / max(ev['base']['db'], 1):.1f}x) while CPU peaked at only {ev['peak']['cpu']:.0f}%. "
            "The servers were waiting on the database, not computing. Turn on the slow-query log, run EXPLAIN on the "
            "top queries, add missing indexes (session/user/answer tables) and check connection-pool limits.",
            take_if="the slow-query log shows a few queries causing most of the time (the usual case).",
            leave_if="the DB is already fully indexed. Then look at locks and pool size.",
            priority="DO FIRST"))
        out.append(Rec(
            "Cache the question paper and static exam data in memory (Redis / app cache)",
            "Every student reads the same paper, so thousands of identical DB reads are wasted.",
            take_if="most DB load is reads.", leave_if="most DB load is answer writes. Then batch the writes.",
            priority="RECOMMENDED"))
        out.append(Rec(
            "Add a read replica or raise the pool size",
            "Spreads reads and removes 'waiting for a free connection' delays.",
            take_if="you have DB admin access and budget.", leave_if="queries are slow because of bad SQL. Fix that first.",
            priority="OPTIONAL"))
    elif cause == "cpu_saturation":
        ratio = peak / cap
        why = ("Users were within capacity, so something is burning CPU that should not be: a runaway process, "
               "a backup or report job, or inefficient code. Check top/htop and the job scheduler for that time."
               if ratio <= 1.0 else
               f"Users were {ratio:.1f}x the proven-safe capacity, so CPU ran out because of load.")
        out.append(Rec(
            "Identify what consumed the CPU",
            f"CPU hit {ev['peak']['cpu']:.0f}% (baseline {ev['base']['cpu']:.0f}%). {why}",
            take_if="CPU high with normal user numbers.", leave_if="CPU high only because users exceeded capacity. Go to scale-out.",
            priority="DO FIRST"))
        out.append(Rec(
            "Scale out: second app server behind a load balancer",
            f"At {peak} users you need about {max(2, math.ceil(peak / (cap * 0.7)))} app servers of today's size to stay under ~70% CPU.",
            take_if="CPU is high because of genuine user load.", leave_if="a single bad process is the cause.",
            priority="RECOMMENDED"))
        out.append(Rec(
            "Freeze heavy background jobs during exam windows",
            "Backups, report generation and log rotation should not run while exams are live.",
            take_if="any scheduled job overlaps exam hours.", leave_if="none do.", priority="RECOMMENDED"))
    elif cause == "bandwidth_cap":
        need = peak * ev["base"]["bw_per_user"]
        out.append(Rec(
            "Raise or bypass the bandwidth ceiling",
            f"Bandwidth flat-lined near {ev['peak']['bw']:.1f} Mbps while users kept rising, and CPU ({ev['peak']['cpu']:.0f}%) "
            f"and DB ({ev['peak']['db']:.0f} ms) stayed healthy. At the normal ~{ev['base']['bw_per_user']:.2f} Mbps per user, "
            f"{peak} users need about {need:.0f} Mbps (with 30% headroom: {need * 1.3:.0f} Mbps).",
            take_if="the ISP or firewall can burst for exam hours.", leave_if="the link cannot grow. Reduce per-user bandwidth below.",
            priority="DO FIRST"))
        out.append(Rec(
            "Cut per-student bandwidth: CDN for images/JS/CSS, compression, lower proctoring video bitrate",
            "Static assets served from a CDN and compressed images typically remove most of the traffic.",
            take_if="the exam uses images or video proctoring.", leave_if="traffic is already mostly small text.",
            priority="RECOMMENDED"))
    elif cause == "memory_exhaustion":
        out.append(Rec(
            "Fix the memory growth, then add a safety net",
            f"Memory climbed from {ev['base']['mem']:.0f}% to {ev['peak']['mem']:.0f}% during the incident while users "
            "did not explain it, which points to a leak or unbounded session/cache storage. Profile the app (heap dump), "
            "move sessions to Redis, set cache size limits.",
            take_if="memory keeps climbing across the exam.", leave_if="memory is stable and only briefly high.",
            priority="DO FIRST"))
        out.append(Rec(
            "Restart or recycle workers before exam start and set memory alerts",
            "A rolling restart just before the exam gives a clean start; alert at 80% memory so you can act before 95%.",
            take_if="you cannot fix the leak this week.", leave_if="you have fixed it and verified under load.",
            priority="RECOMMENDED"))
    return out


PREVENTION = [
    "Load-test to at least 1.5x the expected number of students before every exam week, with the real submit pattern (everyone clicks in the same minute).",
    "Add alerts before students feel it: response time > {warn_rt} ms, CPU > 80%, memory > 85%, DB query time > {warn_db} ms, bandwidth > 85% of the link.",
    "Run a 10-minute pre-exam health check (login, load paper, save answer, submit) 30 minutes before start.",
    "Write a one-page runbook: who to call, how to enable the waiting room, how to extend the exam clock fairly.",
    "Keep this tool's report for every incident. Over time you get real labelled data to retrain the model on.",
]
