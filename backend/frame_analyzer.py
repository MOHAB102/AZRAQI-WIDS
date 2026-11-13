# -*- coding: utf-8 -*-
"""تحليل إطارات الإدارة عبر TShark عند الطلب (مدة محدودة) — دفاعي فقط."""
import os
import re
import shutil
import subprocess
from collections import defaultdict

IS_WIN = os.name == "nt"
_NO_WINDOW = subprocess.CREATE_NO_WINDOW if IS_WIN else 0


def analyze_frames(interface, duration=5):
    if not interface:
        return {"ok": False, "error": "حدّد واجهة المراقبة أولًا (مثل wlan0mon)"}
    if not shutil.which("tshark"):
        return {"ok": False, "error": "أداة TShark غير مثبتة — ثبّت حزمة tshark"}
    try:
        duration = max(2, min(int(duration), 20))
    except (TypeError, ValueError):
        duration = 5
    cmd = [
        "tshark", "-i", interface, "-a", "duration:%d" % duration,
        "-Y", "wlan.fc.type == 0",
        "-T", "fields", "-e", "wlan.bssid", "-e", "wlan.fc.type_subtype",
        "-E", "separator=|",
    ]
    try:
        r = subprocess.run(cmd, capture_output=True, timeout=duration + 8,
                           creationflags=_NO_WINDOW, encoding="utf-8", errors="replace")
    except subprocess.TimeoutExpired:
        return {"ok": False, "error": "انتهت مهلة التقاط الإطارات"}
    except OSError as exc:
        return {"ok": False, "error": "تعذر تشغيل TShark: %s" % exc}
    if r.returncode != 0:
        return {"ok": False, "error": "فشل الالتقاط: %s" % (r.stderr or "").strip()[:300]}

    counts = defaultdict(lambda: {"deauth": 0, "disassoc": 0, "beacon": 0, "probe_req": 0, "probe_resp": 0, "total": 0})
    for line in (r.stdout or "").splitlines():
        parts = line.split("|")
        if len(parts) < 2:
            continue
        bssid = parts[0].strip().upper()
        try:
            subtype = int(parts[1].strip(), 0)
        except ValueError:
            continue
        if not bssid:
            continue
        c = counts[bssid]
        c["total"] += 1
        if subtype == 12:
            c["deauth"] += 1
        elif subtype == 10:
            c["disassoc"] += 1
        elif subtype == 8:
            c["beacon"] += 1
        elif subtype == 4:
            c["probe_req"] += 1
        elif subtype == 5:
            c["probe_resp"] += 1

    result = []
    for bssid, c in counts.items():
        result.append({
            "bssid": bssid,
            "deauth_rate": round(c["deauth"] / duration, 2),
            "disassoc_rate": round(c["disassoc"] / duration, 2),
            "beacon_rate": round(c["beacon"] / duration, 2),
            "probe_req_rate": round(c["probe_req"] / duration, 2),
            "total_frames": c["total"],
            "duration": duration,
        })
    return {"ok": True, "interface": interface, "duration": duration, "results": result}