import argparse
import json
import os
import sys
import threading
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import psutil
from kismet_client import KismetClient
from classifier import classify
from device_scanner import scan_devices
from wifi_source import get_source_info
from link_checker import check_link
from frame_analyzer import analyze_frames

for stream in (sys.stdin, sys.stdout, sys.stderr):
    try:
        stream.reconfigure(encoding="utf-8")
    except (AttributeError, ValueError):
        pass

_lock = threading.Lock()
_stop = threading.Event()
_config = {
    "kismet_url": "http://localhost:2501",
    "api_key": "",
    "interval": 5.0,
    "sensitivity": 5,
}
_prev_networks = {}
_last_alert_ts = 0
_kismet = None


def emit(obj):
    with _lock:
        sys.stdout.write(json.dumps(obj, ensure_ascii=False, separators=(",", ":")) + "\n")
        sys.stdout.flush()


def get_client():
    global _kismet
    if _kismet is None:
        _kismet = KismetClient(_config["kismet_url"], _config["api_key"])
    return _kismet


def reset_client():
    global _kismet
    _kismet = None


def build_networks():
    global _last_alert_ts
    client = get_client()
    status = client.status()
    sources = client.datasources()
    aps = client.access_points()
    alerts = client.alerts(_last_alert_ts)

    source_ok = bool(status.get("ok") and aps.get("ok"))
    source_msg = "مصدر Kismet نشط" if source_ok else "Kismet غير متاح — شغّل الخدمة وأدخل مفتاح API"
    monitor_ok = False
    if sources.get("ok"):
        for src in sources.get("data", []):
            if src.get("kismet.datasource.running", 0) and "monitor" in str(src.get("kismet.datasource.interface", "")).lower():
                monitor_ok = True

    alert_map = {}
    if alerts.get("ok"):
        for al in alerts.get("data", []):
            ts = al.get("kismet.alert.timestamp", 0)
            try:
                ts = float(ts)
            except (TypeError, ValueError):
                ts = 0
            if ts > _last_alert_ts:
                _last_alert_ts = ts
            header = str(al.get("kismet.alert.header", "")).upper()
            mac = (al.get("kismet.alert.source_mac") or al.get("kismet.alert.dest_mac") or "").upper()
            if not mac:
                continue
            flags = alert_map.setdefault(mac, {})
            if "DEAUTH" in header:
                flags["deauth_flood"] = True
            if "DISASSOC" in header:
                flags["disassoc_flood"] = True
            if "BEACON" in header:
                flags["beacon_flood"] = True
            if "CRYPT" in header or "CHANGE" in header:
                flags["sec_change"] = True

    networks = []
    if aps.get("ok"):
        for dev in aps.get("data", []):
            net = client.map_ap(dev)
            if not net["bssid"]:
                continue
            bssid = net["bssid"]
            prev = _prev_networks.get(bssid, {})
            evidence = {
                "monitor_ok": monitor_ok or source_ok,
                "packets": net.get("packets", 0),
                "deauth_flood": alert_map.get(bssid, {}).get("deauth_flood", False),
                "disassoc_flood": alert_map.get(bssid, {}).get("disassoc_flood", False),
                "beacon_flood": alert_map.get(bssid, {}).get("beacon_flood", False),
                "sec_change": alert_map.get(bssid, {}).get("sec_change", False),
                "probe_burst": False,
                "ssid_twin": False,
                "deauth_rate": 0,
                "disassoc_rate": 0,
                "beacon_rate": 0,
            }
            if prev.get("security") and net["security"] and prev["security"] != net["security"]:
                evidence["sec_change"] = True
            net["evidence"] = evidence
            networks.append(net)

    by_ssid = {}
    for n in networks:
        if n["ssid"]:
            by_ssid.setdefault(n["ssid"], []).append(n)
    for ssid, group in by_ssid.items():
        if len(group) > 1:
            securities = set(n["security"] for n in group)
            channels = set(n["channel"] for n in group)
            for n in group:
                n["evidence"]["ssid_twin"] = True
                if len(securities) > 1 or len(channels) > 1:
                    n["evidence"]["sec_change"] = True

    for n in networks:
        result = classify(n["evidence"], _config["sensitivity"])
        n["status"] = result["status"]
        n["confidence"] = result["confidence"]
        n["reasons"] = result["reasons"]
        _prev_networks[n["bssid"]] = {"security": n["security"]}

    summary = {
        "total": len(networks),
        "green": sum(1 for n in networks if n["status"] == "green"),
        "yellow": sum(1 for n in networks if n["status"] == "yellow"),
        "red": sum(1 for n in networks if n["status"] == "red"),
        "unknown": sum(1 for n in networks if n["status"] == "unknown"),
    }
    return {
        "time": time.time(),
        "source": {"ok": source_ok, "monitor_ok": monitor_ok, "message": source_msg, "sources": sources.get("data", [])},
        "networks": networks,
        "summary": summary,
        "resources": {"cpu": psutil.cpu_percent(None), "ram": psutil.virtual_memory().percent},
    }


def monitor_loop():
    psutil.cpu_percent(None)
    while not _stop.is_set():
        try:
            snap = build_networks()
            emit({"event": "snapshot", "data": snap})
            for n in snap["networks"]:
                if n["status"] == "red":
                    emit({"event": "alert", "data": {"level": "critical", "message": "تهديد محتمل على " + n["ssid"] + ": " + "، ".join(n["reasons"]), "time": time.time(), "bssid": n["bssid"]}})
            if not snap["source"]["ok"]:
                emit({"event": "source_status", "data": {"ok": False, "message": snap["source"]["message"]}})
        except Exception as exc:
            emit({"event": "backend_error", "data": {"message": "خطأ في محرك الرصد: %s" % exc, "time": time.time()}})
        _stop.wait(_config["interval"])


def handle(cmd, payload):
    global _config
    if cmd == "snapshot":
        return build_networks()
    if cmd == "scan_devices":
        return scan_devices(payload.get("interface"), payload.get("subnet"))
    if cmd == "wifi_source":
        return get_source_info()
    if cmd == "check_link":
        return check_link(payload.get("url", ""))
    if cmd == "analyze_frames":
        return analyze_frames(payload.get("interface"), payload.get("duration", 5))
    if cmd == "set_config":
        if "kismetUrl" in payload:
            _config["kismet_url"] = payload["kismetUrl"]
        if "kismetApiKey" in payload:
            _config["api_key"] = payload["kismetApiKey"]
        if "scanInterval" in payload:
            _config["interval"] = max(2, min(float(payload["scanInterval"]), 60))
        if "sensitivity" in payload:
            _config["sensitivity"] = max(1, min(int(payload["sensitivity"]), 10))
        reset_client()
        return {"config": _config}
    raise ValueError("أمر غير معروف: %s" % cmd)


def main():
    global _config
    parser = argparse.ArgumentParser()
    parser.add_argument("--kismet-url", default="http://localhost:2501")
    parser.add_argument("--api-key", default="")
    parser.add_argument("--interval", type=float, default=5)
    parser.add_argument("--sensitivity", type=int, default=5)
    args = parser.parse_args()
    _config.update({
        "kismet_url": args.kismet_url,
        "api_key": args.api_key,
        "interval": max(2, min(args.interval, 60)),
        "sensitivity": max(1, min(args.sensitivity, 10)),
    })
    threading.Thread(target=monitor_loop, daemon=True).start()
    emit({"event": "ready", "data": {"python": sys.version.split()[0], "psutil": psutil.__version__}})
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            req = json.loads(line)
        except json.JSONDecodeError:
            continue
        rid = req.get("id")
        try:
            emit({"id": rid, "ok": True, "data": handle(req.get("cmd"), req.get("payload") or {})})
        except Exception as exc:
            emit({"id": rid, "ok": False, "error": str(exc)})
    _stop.set()


if __name__ == "__main__":
    main()