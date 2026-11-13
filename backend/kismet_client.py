# -*- coding: utf-8 -*-
"""عميل Kismet REST API — يقرأ الشبكات والتنبيهات من واجهة موثقة، بدون تحليل نصوص عشوائي."""
import time
import requests


def dig(obj, *paths, default=None):
    for path in paths:
        cur = obj
        ok = True
        for part in path.split("."):
            if isinstance(cur, dict) and part in cur:
                cur = cur[part]
            else:
                ok = False
                break
        if ok and cur is not None:
            return cur
    return default


class KismetClient:
    def __init__(self, base_url, api_key=""):
        self.base_url = base_url.rstrip("/")
        self.api_key = api_key
        self.session = requests.Session()
        if api_key:
            self.session.headers["KISMET"] = api_key
        self.timeout = 6

    def _get(self, path):
        r = self.session.get(self.base_url + path, timeout=self.timeout)
        r.raise_for_status()
        return r.json()

    def status(self):
        try:
            return {"ok": True, "data": self._get("/system/status.json")}
        except Exception as exc:
            return {"ok": False, "error": str(exc)}

    def datasources(self):
        try:
            return {"ok": True, "data": self._get("/datasource/list.json")}
        except Exception as exc:
            return {"ok": False, "error": str(exc)}

    def access_points(self):
        try:
            return {"ok": True, "data": self._get("/devices/views/phydot11_accesspoints/devices.json")}
        except Exception as exc:
            return {"ok": False, "error": str(exc)}

    def alerts(self, since=0):
        try:
            return {"ok": True, "data": self._get("/alerts/last-time/%s/alerts.json" % int(since))}
        except Exception as exc:
            return {"ok": False, "error": str(exc)}

    def map_ap(self, dev):
        bssid = str(dig(dev, "kismet.device.base.macaddr", default="")).upper()
        ssid = dig(dev, "dot11.device.dot11.device.last_ssid.dot11.ssid.ssid", "kismet.device.base.name", default="")
        if not ssid:
            ssid_map = dig(dev, "dot11.device.dot11.device.advertised_ssid_map", default={})
            if isinstance(ssid_map, dict):
                for item in ssid_map.values():
                    s = dig(item, "dot11.ssid.ssid", default="")
                    if s:
                        ssid = s
                        break
            elif isinstance(ssid_map, list):
                for item in ssid_map:
                    s = dig(item, "dot11.ssid.ssid", default="")
                    if s:
                        ssid = s
                        break
        channel = dig(dev, "kismet.device.base.channel", default=None)
        freq_khz = dig(dev, "kismet.device.base.frequency", default=None)
        try:
            frequency = int(freq_khz / 1000) if freq_khz else None
        except (TypeError, ValueError):
            frequency = None
        signal = dig(dev, "kismet.device.base.signal.kismet.common.signal.last_signal", default=None)
        crypt = str(dig(dev, "kismet.device.base.crypt", default=""))
        manuf = str(dig(dev, "kismet.device.base.manuf", default=""))
        first_time = dig(dev, "kismet.device.base.first_time", default=None)
        last_time = dig(dev, "kismet.device.base.last_time", default=None)
        packets = dig(dev, "kismet.device.base.packets.total", "kismet.device.base.num_packets", default=0)
        try:
            packets = int(packets)
        except (TypeError, ValueError):
            packets = 0
        security = crypt or "غير معروف"
        encryption = "غير متوفر"
        if "CCMP" in crypt:
            encryption = "CCMP"
        elif "GCMP" in crypt:
            encryption = "GCMP"
        elif "TKIP" in crypt:
            encryption = "TKIP"
        elif "WEP" in crypt:
            encryption = "WEP"
        elif crypt in ("", "None"):
            encryption = "None"
        return {
            "bssid": bssid,
            "ssid": ssid or "(شبكة مخفية)",
            "channel": channel,
            "frequency": frequency,
            "rssi": signal,
            "security": security,
            "encryption": encryption,
            "vendor": manuf or "غير متوفر",
            "first_seen": first_time,
            "last_seen": last_time,
            "packets": packets,
        }