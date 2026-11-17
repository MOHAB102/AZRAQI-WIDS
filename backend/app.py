import argparse
import json
import os
import re
import sys
import threading
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import psutil
from kismet_client import KismetClient, KismetError, normalize_url
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
_wake = threading.Event()          # لإيقاظ حلقة الرصد فورًا عند تغيير الإعدادات
_build_lock = threading.Lock()     # build_networks يُستدعى من خيطين (الحلقة + أمر snapshot)
ALERT_TTL = 300                    # مدة بقاء مؤشر التنبيه على الشبكة بالثواني
ALERT_BACKLOG = 900                # عند التشغيل: اعرض تنبيهات آخر 15 دقيقة
_config = {
    "kismet_url": "http://127.0.0.1:2501",
    "api_key": "",
    "username": "",
    "password": "",
    "interval": 5.0,
    "sensitivity": 5,
}
_prev_networks = {}
_last_alert_ts = 0
_alert_memory = {}   # mac -> {flag: وقت آخر ظهور}
_prev_disc = {}          # bssid -> آخر قيمة لعدّاد فصل العملاء في Kismet
_seen_alerts = set()     # لمنع تكرار نفس تنبيه Kismet
_pending_alerts = []     # تنبيهات Kismet الجديدة بانتظار إرسالها للواجهة
MAC_RE = re.compile(r"(?:[0-9A-Fa-f]{2}:){5}[0-9A-Fa-f]{2}")
CRITICAL_ALERTS = ("DEAUTH", "DISASSOC", "BCASTDISCON", "SPOOF", "FLOOD", "CRYPTODROP", "BEACON", "EVILTWIN")
_kismet = None
_last_source_error = None


def emit(obj):
    with _lock:
        sys.stdout.write(json.dumps(obj, ensure_ascii=False, separators=(",", ":")) + "\n")
        sys.stdout.flush()


def get_client():
    global _kismet
    if _kismet is None:
        _kismet = KismetClient(_config["kismet_url"], _config["api_key"], _config["username"], _config["password"])
    return _kismet


def reset_client():
    global _kismet, _last_alert_ts
    _kismet = None
    _last_alert_ts = 0
    _alert_memory.clear()
    _seen_alerts.clear()
    _prev_disc.clear()
    del _pending_alerts[:]


def build_networks():
    with _build_lock:
        return _build_networks()


def _build_networks():
    global _last_alert_ts
    try:
        client = get_client()
    except KismetError as exc:
        err = {"ok": False, "error": str(exc)}
        status = sources = aps = alerts = err
    else:
        status = client.status()
        if status.get("ok"):
            sources = client.datasources()
            aps = client.access_points()
            # أول مرة: نقرأ تنبيهات آخر ALERT_TTL ثانية فقط حتى لا تظهر تنبيهات قديمة جدًا
            alerts = client.alerts(_last_alert_ts or -ALERT_BACKLOG)
        else:
            # فشل الاتصال/المصادقة: لا فائدة من تكرار 3 طلبات تفشل بنفس السبب
            sources = aps = alerts = status

    source_ok = bool(status.get("ok") and aps.get("ok"))
    diagnostics = aps.get("diagnostics", {})
    if source_ok:
        if aps.get("data"):
            source_msg = "مصدر Kismet نشط"
        elif diagnostics.get("all_devices_count", 0):
            source_msg = "Kismet متصل ويعيد أجهزة لكن لم يُصنَّف أي منها كنقطة وصول — راجع التشخيص"
        else:
            source_msg = "Kismet متصل لكن لا توجد نقاط وصول بعد — تحقق من مصدر الالتقاط (محول Monitor) وصلاحية API"
    else:
        reason = status.get("error") if not status.get("ok") else aps.get("error")
        source_msg = "Kismet غير متاح — %s" % (reason or "تحقق من العنوان ومفتاح API")
    monitor_ok = False
    if sources.get("ok"):
        for src in sources.get("data", []):
            if str(src.get("kismet.datasource.running", 0)).lower() in ("1", "true", "yes") and (
                    src.get("kismet.datasource.interface") or src.get("kismet.datasource.type_driver") or src.get("kismet.datasource.type")):
                monitor_ok = True
                break

    now = time.time()
    if alerts.get("ok"):
        for al in alerts.get("data", []):
            try:
                ts = float(al.get("kismet.alert.timestamp", 0) or 0)
            except (TypeError, ValueError):
                ts = 0
            if ts > _last_alert_ts:
                _last_alert_ts = ts
            header = str(al.get("kismet.alert.header", "")).upper()
            text = str(al.get("kismet.alert.text", "") or "")
            dedupe = (round(ts, 3), header, text[:120], str(al.get("kismet.alert.hash", "")))
            if dedupe in _seen_alerts:
                continue
            _seen_alerts.add(dedupe)
            if len(_seen_alerts) > 2000:
                _seen_alerts.clear()
            # كل العناوين المذكورة في التنبيه (حقولًا ونصًّا) — أحدها عادةً BSSID الشبكة المستهدفة
            macs = []
            for key in ("kismet.alert.transmitter_mac", "kismet.alert.source_mac", "kismet.alert.dest_mac", "kismet.alert.other_mac"):
                macs.append(str(al.get(key) or ""))
            macs.extend(MAC_RE.findall(text))
            macs = [m.upper() for m in dict.fromkeys(macs)
                    if m and m.upper() not in ("00:00:00:00:00:00", "FF:FF:FF:FF:FF:FF")]
            if not ts or now - ts <= ALERT_TTL:
                stamp = ts or now
                for mac in macs:
                    mem = _alert_memory.setdefault(mac, {})
                    if "DEAUTH" in header or "BCASTDISCON" in header:
                        mem["deauth_flood"] = stamp
                    if "DISASSOC" in header:
                        mem["disassoc_flood"] = stamp
                    if "BEACON" in header:
                        mem["beacon_flood"] = stamp
                    if "SPOOF" in header or "EVILTWIN" in header:
                        mem["ap_spoof"] = stamp
                    if "CRYPT" in header or "CHANGE" in header:
                        mem["sec_change"] = stamp
            level = "critical" if any(k in header for k in CRITICAL_ALERTS) else "warning"
            _pending_alerts.append({
                "level": level, "time": ts or now, "bssid": macs[0] if macs else "", "header": header,
                "message": "تنبيه Kismet [%s]%s" % (header or "ALERT", (": " + text) if text else ""),
                "macs": macs,
            })
    del _pending_alerts[:-200]
    # كشف مستقل عن تنبيهات Kismet: قفزة في عدّاد فصل العملاء (Deauth/Disassoc) لنقطة الوصول
    thr = max(3, int(round(10 / (_config["sensitivity"] / 5.0))))
    for net in (aps.get("data", []) if aps.get("ok") else []):
        disc = net.get("disconnects")
        if disc is None:
            continue
        prev_val = _prev_disc.get(net["bssid"])
        _prev_disc[net["bssid"]] = disc
        if prev_val is not None and disc - prev_val >= thr:
            _alert_memory.setdefault(net["bssid"], {})["deauth_flood"] = now
            _pending_alerts.append({
                "level": "critical", "time": now, "bssid": net["bssid"], "header": "DEAUTH-RATE", "macs": [net["bssid"]],
                "message": "هجوم فصل (Deauth/حجب خدمة) محتمل على %s [%s]: %d إطار خلال %d ثانية" % (
                    net["ssid"], net["bssid"], disc - prev_val, int(_config["interval"])),
            })
    # مؤشر التنبيه يبقى ALERT_TTL ثانية (بدل دورة واحدة فقط) ثم يُنسى
    alert_map = {}
    for mac in list(_alert_memory):
        live = {k: True for k, t in _alert_memory[mac].items() if now - t <= ALERT_TTL}
        if live:
            alert_map[mac] = live
        else:
            del _alert_memory[mac]

    networks = []
    if aps.get("ok"):
        for net in aps.get("data", []):
            bssid = net["bssid"]
            prev = _prev_networks.get(bssid, {})
            evidence = {
                "monitor_ok": monitor_ok or source_ok,
                "packets": net.get("packets", 0),
                "deauth_flood": alert_map.get(bssid, {}).get("deauth_flood", False),
                "disassoc_flood": alert_map.get(bssid, {}).get("disassoc_flood", False),
                "beacon_flood": alert_map.get(bssid, {}).get("beacon_flood", False),
                "sec_change": alert_map.get(bssid, {}).get("sec_change", False) or alert_map.get(bssid, {}).get("ap_spoof", False),
                "probe_burst": False,
                "ssid_twin": alert_map.get(bssid, {}).get("ap_spoof", False),
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
        if not n.get("hidden"):   # الشبكات المخفية ليست "توأمًا" لبعضها
            by_ssid.setdefault(n["ssid"], []).append(n)
    for ssid, group in by_ssid.items():
        if len(group) > 1:
            securities = set(n["security"] for n in group)
            for n in group:
                n["evidence"]["ssid_twin"] = True
                # اختلاف القناة طبيعي (راوتر 2.4/5GHz أو Mesh) — الاختلاف الأمني فقط مؤشر Evil Twin
                if len(securities) > 1:
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
        "source": {
            "ok": source_ok, "monitor_ok": monitor_ok, "message": source_msg,
            "sources": sources.get("data", []) if sources.get("ok") else [],
            "diagnostics": diagnostics, "auth": status.get("auth", ""), "base_url": status.get("base_url"),
            "status_error": status.get("error"), "datasource_error": sources.get("error"),
            "device_error": aps.get("error"), "alerts_error": alerts.get("error"),
        },
        "networks": networks,
        "summary": summary,
        "resources": {"cpu": psutil.cpu_percent(None), "ram": psutil.virtual_memory().percent},
    }


def drain_alerts():
    with _build_lock:
        items = list(_pending_alerts)
        del _pending_alerts[:]
    return items


_last_source_state = [None]


def monitor_loop():
    psutil.cpu_percent(None)
    while not _stop.is_set():
        try:
            snap = build_networks()
            emit({"event": "snapshot", "data": snap})
            for al in drain_alerts():
                emit({"event": "alert", "data": {"level": al["level"], "message": al["message"], "time": al["time"], "bssid": al["bssid"]}})
            for n in snap["networks"]:
                if n["status"] == "red":
                    emit({"event": "alert", "data": {"level": "critical", "message": "تهديد محتمل على " + n["ssid"] + ": " + "، ".join(n["reasons"]), "time": time.time(), "bssid": n["bssid"]}})
            src = snap["source"]
            if (src["ok"], src["message"]) != _last_source_state[0]:
                _last_source_state[0] = (src["ok"], src["message"])
                emit({"event": "source_status", "data": {"ok": src["ok"], "message": src["message"]}})
        except Exception as exc:
            emit({"event": "backend_error", "data": {"message": "خطأ في محرك الرصد: %s" % exc, "time": time.time()}})
        _wake.wait(_config["interval"])
        _wake.clear()


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
            _config["kismet_url"] = normalize_url(str(payload["kismetUrl"]))
        if "kismetApiKey" in payload:
            _config["api_key"] = str(payload["kismetApiKey"]).strip()
        if "kismetUsername" in payload:
            _config["username"] = str(payload["kismetUsername"]).strip()
        if "kismetPassword" in payload:
            _config["password"] = str(payload["kismetPassword"])
        if "scanInterval" in payload:
            _config["interval"] = max(2, min(float(payload["scanInterval"]), 60))
        if "sensitivity" in payload:
            _config["sensitivity"] = max(1, min(int(payload["sensitivity"]), 10))
        reset_client()
        _last_source_state[0] = None
        _wake.set()   # حدّث الشبكات الآن بدل الانتظار لدورة الرصد القادمة
        return {"config": {k: v for k, v in _config.items() if k not in ("api_key", "password")}}
    raise ValueError("أمر غير معروف: %s" % cmd)


def main():
    global _config
    parser = argparse.ArgumentParser()
    parser.add_argument("--kismet-url", default="http://127.0.0.1:2501")
    parser.add_argument("--api-key", default="")
    parser.add_argument("--interval", type=float, default=5)
    parser.add_argument("--sensitivity", type=int, default=5)
    args = parser.parse_args()
    # المفتاح يُمرَّر عبر متغير بيئة حتى لا يظهر في قائمة العمليات (ps / Task Manager)
    api_key = os.environ.get("AZRAQI_KISMET_API_KEY") or os.environ.get("KISMET_API_KEY") or args.api_key
    try:
        kismet_url = normalize_url(args.kismet_url)
    except KismetError:
        kismet_url = "http://localhost:2501"
    _config.update({
        "kismet_url": kismet_url,
        "api_key": api_key.strip(),
        "username": os.environ.get("AZRAQI_KISMET_USERNAME", ""),
        "password": os.environ.get("AZRAQI_KISMET_PASSWORD", ""),
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
    _wake.set()


if __name__ == "__main__":
    main()