import os
import shutil
import subprocess
import sys
from pathlib import Path

from flask import Flask, jsonify, render_template, request, send_from_directory
from werkzeug.utils import secure_filename

BASE_DIR = Path(__file__).resolve().parent
REPORTS_DIR = BASE_DIR / "reports"
UPLOAD_DIR = BASE_DIR / "uploads"
MODEL_PATH = BASE_DIR / "models" / "rootcause.joblib"

app = Flask(__name__, template_folder="templates", static_folder="static")


def ensure_dirs():
    REPORTS_DIR.mkdir(exist_ok=True)
    UPLOAD_DIR.mkdir(exist_ok=True)


def ensure_model():
    ensure_dirs()
    if not MODEL_PATH.exists():
        subprocess.run([sys.executable, "train.py"], cwd=str(BASE_DIR), check=True)


@app.route("/")
def index():
    return render_template("index.html")


@app.route("/api/samples")
def list_samples():
    samples_dir = BASE_DIR / "data" / "samples"
    if not samples_dir.exists():
        return jsonify([])
    files = sorted(p.name for p in samples_dir.glob("*.csv"))
    return jsonify(files)


@app.route("/api/analyze", methods=["POST"])
def analyze_upload():
    ensure_model()
    file_obj = request.files.get("file")
    sample_name = request.form.get("sample")

    if file_obj and file_obj.filename:
        name = secure_filename(file_obj.filename)
        file_path = UPLOAD_DIR / name
        file_obj.save(file_path)
    elif sample_name:
        file_path = BASE_DIR / "data" / "samples" / sample_name
        if not file_path.exists():
            return jsonify({"error": f"Sample file not found: {sample_name}"}), 400
    else:
        return jsonify({"error": "Choose a CSV file or a sample."}), 400

    capacity = request.form.get("capacity", "").strip()
    anchor = request.form.get("anchor", "").strip()
    report_dir = REPORTS_DIR / file_path.stem
    report_dir.mkdir(exist_ok=True)

    cmd = [sys.executable, str(BASE_DIR / "analyze.py"), str(file_path)]
    if capacity:
        cmd.extend(["--capacity", str(capacity)])
    if anchor:
        cmd.extend(["--anchor", anchor])
    cmd.extend(["--out", str(report_dir)])

    proc = subprocess.run(cmd, cwd=str(BASE_DIR), capture_output=True, text=True)
    if proc.returncode != 0:
        msg = (proc.stderr or proc.stdout or "Model run failed").strip()
        return jsonify({"error": msg}), 500

    report_name = f"{file_path.stem}_report.md"
    image_name = f"{file_path.stem}_timeline.png"
    report_path = report_dir / report_name
    image_path = report_dir / image_name

    report_text = report_path.read_text(encoding="utf-8") if report_path.exists() else proc.stdout or "No report was generated."
    image_url = f"/reports/{file_path.stem}/{image_name}" if image_path.exists() else None

    return jsonify({
        "status": "ok",
        "output": report_text,
        "report_path": str(report_path),
        "image": image_url,
        "stderr": proc.stderr.strip(),
        "stdout": proc.stdout.strip(),
    })


@app.route("/reports/<path:filename>")
def serve_report(filename):
    root = REPORTS_DIR
    return send_from_directory(root, filename)


@app.route("/health")
def health():
    return jsonify({"ok": True, "model_exists": MODEL_PATH.exists()})


if __name__ == "__main__":
    ensure_model()
    app.run(host="0.0.0.0", port=8000, debug=True)
