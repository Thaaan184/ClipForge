import os
import time
import json
import subprocess
from pathlib import Path

def get_process_tree_rss_kb(root_pid: int) -> int:
    proc_path = Path("/proc")
    pids = {root_pid}
    # scan for child processes recursively
    changed = True
    while changed:
        changed = False
        try:
            for entry in proc_path.iterdir():
                if entry.is_dir() and entry.name.isdigit():
                    pid = int(entry.name)
                    if pid in pids:
                        continue
                    try:
                        stat = (entry / "stat").read_text().split()
                        ppid = int(stat[3])
                        if ppid in pids:
                            pids.add(pid)
                            changed = True
                    except Exception:
                        pass
        except Exception:
            pass

    total_rss_kb = 0
    for p in pids:
        try:
            status = (proc_path / str(p) / "status").read_text()
            for line in status.splitlines():
                if line.startswith("VmRSS:"):
                    total_rss_kb += int(line.split()[1])
                    break
        except Exception:
            pass
    return total_rss_kb

def run_render_bench(comp_id: str, concurrency: int, out_name: str) -> dict:
    cmd = [
        "npx", "remotion", "render",
        "src/index.ts", comp_id, out_name,
        f"--concurrency={concurrency}",
        "--gl=angle",
        "--log=warn"
    ]
    print(f"\n[BENCH] Starting {comp_id} concurrency={concurrency}...")
    start_t = time.time()
    proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)

    peak_rss_kb = 0
    while proc.poll() is None:
        try:
            current_rss = get_process_tree_rss_kb(proc.pid)
            if current_rss > peak_rss_kb:
                peak_rss_kb = current_rss
        except Exception:
            pass
        time.sleep(0.1)

    stdout, stderr = proc.communicate()
    dur_s = round(time.time() - start_t, 2)
    peak_rss_mb = round(peak_rss_kb / 1024.0, 1)

    if proc.returncode != 0:
        print(f"[ERROR] Failed: {stderr}")
        return {"comp": comp_id, "concurrency": concurrency, "error": stderr}

    print(f"[DONE] {comp_id} (c={concurrency}): Time={dur_s}s, Peak RSS={peak_rss_mb}MB")
    return {
        "comp": comp_id,
        "concurrency": concurrency,
        "duration_s": dur_s,
        "peak_rss_mb": peak_rss_mb,
        "returncode": proc.returncode
    }

if __name__ == "__main__":
    results = []
    # 1. 10s benchmark: concurrency 1, 2, 3
    for c in [1, 2, 3]:
        res = run_render_bench("Bench10s", c, f"out_10s_c{c}.mp4")
        results.append(res)

    # 2. 60s benchmark: concurrency 1, 2, 3
    for c in [1, 2, 3]:
        res = run_render_bench("Bench60s", c, f"out_60s_c{c}.mp4")
        results.append(res)

    out_file = Path("bench_results.json")
    out_file.write_text(json.dumps(results, indent=2))
    print("\n=== FINAL RESULTS ===")
    print(json.dumps(results, indent=2))
