# -*- coding: utf-8 -*-
"""كشف محولات Wi-Fi ودعم Monitor Mode عبر iw وnmcli."""
import os
import re
import shutil
import subprocess

IS_WIN = os.name == "nt"
_NO_WINDOW = subprocess.CREATE_NO_WINDOW if IS_WIN else 0


def _run(cmd, timeout=8):
    try:
        r = subprocess.run(cmd, capture_output=True, timeout=timeout, creationflags=_NO_WINDOW,
                           encoding="utf-8", errors="replace")
        return r.returncode, r.stdout or "", r.stderr or ""
    except (subprocess.TimeoutExpired, OSError) as exc:
        return -1, "", str(exc)


def get_source_info():
    if IS_WIN:
        return {"supported": False, "message": "الرصد السلبي الكامل غير مدعوم على Windows غالبًا (قيود التعريفات)", "adapters": []}
    if not shutil.which("iw"):
        return {"supported": False, "message": "أداة iw غير مثبتة — ثبّت حزمة iw", "adapters": []}
    code, out, err = _run(["iw", "dev"])
    adapters = []
    current = {}
    for line in out.splitlines():
        line = line.strip()
        if line.startswith("Interface "):
            if current:
                adapters.append(current)
            current = {"interface": line.split()[1], "type": "غير معروف", "channel": None, "monitor_supported": False}
        elif line.startswith("type "):
            current["type"] = line.split()[1]
        elif line.startswith("channel "):
            m = re.search(r"channel (\d+)", line)
            if m:
                current["channel"] = int(m.group(1))
    if current:
        adapters.append(current)

    code2, list_out, err2 = _run(["iw", "list"], timeout=10)
    monitor_supported = "monitor" in list_out.lower()
    for a in adapters:
        a["monitor_supported"] = monitor_supported

    nmcli_info = None
    if shutil.which("nmcli"):
        c, o, e = _run(["nmcli", "-t", "-f", "DEVICE,TYPE,STATE,CONNECTION", "device"])
        if c == 0:
            nmcli_info = o.strip()

    return {
        "supported": True,
        "monitor_supported": monitor_supported,
        "message": "تم كشف المحولات" if adapters else "لم يتم العثور على محول Wi-Fi",
        "adapters": adapters,
        "nmcli": nmcli_info,
    }