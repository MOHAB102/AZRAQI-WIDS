# -*- coding: utf-8 -*-
"""عميل Kismet REST API — يقرأ الشبكات والتنبيهات من واجهة موثقة، بدون تحليل نصوص عشوائي."""
import json
import os
import re
import time
from pathlib import Path
from urllib.parse import urlparse, urlunparse

import requests


def dig(obj, *paths, default=None):
    """يقرأ قيمة متداخلة من JSON الخاص بـ Kismet.

    مفاتيح Kismet نفسها تحتوي نقاطًا (مثل ``kismet.device.base.macaddr``) لذلك
    يُستخدم الفاصل ``/`` بين المستويات المتداخلة، والمسار بدون ``/`` يُعامل كمفتاح واحد.
    مثال: ``kismet.device.base.signal/kismet.common.signal.last_signal``
    """
    for path in paths:
        cur = obj
        ok = True
        for part in path.split("/"):
            if isinstance(cur, dict) and part in cur:
                cur = cur[part]
            else:
                ok = False
                break
        if ok and cur is not None:
            return cur
    return default


class KismetError(Exception):
    """خطأ اتصال/مصادقة برسالة عربية واضحة تُعرض للمستخدم."""


def normalize_url(url):
    """يقبل localhost:2501 أو http://host:2501/ ويعيد عنوانًا صالحًا بدون شرطة أخيرة."""
    url = (url or "").strip()
    if not url:
        url = "http://localhost:2501"
    if not re.match(r"^[a-zA-Z][a-zA-Z0-9+.-]*://", url):
        url = "http://" + url
    parsed = urlparse(url)
    if parsed.scheme not in ("http", "https") or not parsed.hostname:
        raise KismetError("عنوان Kismet غير صالح — مثال صحيح: http://localhost:2501")
    return "%s://%s%s" % (parsed.scheme, parsed.netloc, parsed.path.rstrip("/"))


def _channel_from_freq(mhz):
    if not mhz:
        return None
    if mhz == 2484:
        return 14
    if 2412 <= mhz <= 2472:
        return (mhz - 2407) // 5
    if 5000 <= mhz <= 5895:
        return (mhz - 5000) // 5
    if 5955 <= mhz <= 7115:
        return (mhz - 5950) // 5
    return None


def _as_records(value):
    """يحوّل أي شكل استجابة من Kismet (قائمة / قاموس مغلف / قاموس أجهزة) إلى قائمة سجلات."""
    if isinstance(value, list):
        return [item for item in value if isinstance(item, dict)]
    if not isinstance(value, dict):
        return []
    for key in ("data", "devices", "results", "kismet.devices", "rows", "kismet.alert.list"):
        nested = value.get(key)
        if isinstance(nested, list):
            return [item for item in nested if isinstance(item, dict)]
        if isinstance(nested, dict):
            records = _as_records(nested)
            if records:
                return records
    if any(key in value for key in ("kismet.device.base.macaddr", "kismet.device.base.key", "kismet.device.base.type")):
        return [value]
    return [item for item in value.values()
            if isinstance(item, dict) and any(str(k).startswith(("kismet.device.", "dot11.device")) for k in item)]


def _load_local_credentials():
    """اسم مستخدم/كلمة مرور Kismet اختياريان من متغيرات البيئة أو ~/.config/azraqi-wids/kismet.json
    (لا يُقرأ أي ملف يخص برنامجًا آخر، ولا تُخزَّن كلمة المرور في الإعدادات)."""
    username = os.getenv("AZRAQI_KISMET_USERNAME") or os.getenv("KISMET_USERNAME")
    password = os.getenv("AZRAQI_KISMET_PASSWORD") or os.getenv("KISMET_PASSWORD")
    path = Path(os.getenv("AZRAQI_KISMET_CONFIG") or (Path.home() / ".config" / "azraqi-wids" / "kismet.json"))
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        username = username or data.get("username")
        password = password or data.get("password")
    except (OSError, ValueError, AttributeError):
        pass
    return username or "", password or ""


class KismetClient:
    TOKEN_MODES = ("cookie", "query", "header")

    def __init__(self, base_url, api_key="", username="", password=""):
        self.original_url = normalize_url(base_url)
        self.api_key = (api_key or os.getenv("AZRAQI_KISMET_API_KEY") or "").strip()
        local_user, local_pass = _load_local_credentials()
        self.username = username or local_user
        self.password = password or local_pass
        if self.api_key and ":" in self.api_key and not self.username:
            # الصيغة user:password في خانة المفتاح → مصادقة HTTP Basic
            self.username, _, self.password = self.api_key.partition(":")
            self.api_key = ""
        self.session = requests.Session()
        # Kismet محلي/شبكة داخلية: لا نمرر الطلبات عبر بروكسي النظام (كان يكسر الاتصال بـ localhost)
        self.session.trust_env = False
        self.session.headers.update({"Accept": "application/json", "User-Agent": "AZRAQI-WIDS/1.2"})
        if self.username:
            self.session.auth = (self.username, self.password)
        self.timeout = (4, 25)
        self.base_urls = self._make_base_urls(self.original_url)
        self.active_base = None
        self.mode_index = 0
        self.auth_info = ""

    @staticmethod
    def _make_base_urls(url):
        """localhost و127.0.0.1 يُجرَّبان معًا (قد يحلّ localhost إلى ::1 بينما Kismet على IPv4)."""
        parsed = urlparse(url)
        urls = [url]
        host = (parsed.hostname or "").lower()
        alt = {"localhost": "127.0.0.1", "127.0.0.1": "localhost"}.get(host)
        if alt:
            netloc = alt + ((":%d" % parsed.port) if parsed.port else "")
            urls.append(urlunparse((parsed.scheme, netloc, parsed.path, "", "", "")))
        return urls

    def _one_request(self, base, method, path, params, **kwargs):
        params = dict(params or {})
        headers = {}
        if self.api_key:
            mode = self.TOKEN_MODES[min(self.mode_index, len(self.TOKEN_MODES) - 1)]
            if mode == "cookie":
                # Kismet يقبل رمز الجلسة كـ Cookie باسم KISMET (وليس كترويسة HTTP)
                headers["Cookie"] = "KISMET=%s" % self.api_key
            elif mode == "query":
                params["KISMET"] = self.api_key
            else:
                headers["KISMET"] = self.api_key
        return self.session.request(method, base + path, params=params or None, headers=headers,
                                    timeout=self.timeout, allow_redirects=False, **kwargs)

    def _request(self, method, path, params=None, **kwargs):
        bases = [self.active_base] if self.active_base else self.base_urls
        r = None
        net_errors = []
        for base in bases:
            try:
                r = self._one_request(base, method, path, params, **kwargs)
            except requests.exceptions.SSLError:
                raise KismetError("فشل التحقق من شهادة HTTPS — استخدم http:// للاتصال المحلي")
            except requests.exceptions.ConnectTimeout:
                net_errors.append("انتهت مهلة الاتصال بـ %s" % base)
                continue
            except requests.exceptions.ReadTimeout:
                raise KismetError("Kismet لم يستجب في الوقت المحدد (الخادم مشغول أو عدد الأجهزة كبير)")
            except requests.exceptions.ConnectionError:
                net_errors.append("تعذر الاتصال بـ %s" % base)
                continue
            except requests.exceptions.RequestException as exc:
                raise KismetError("خطأ في الاتصال بـ Kismet: %s" % str(exc).replace("\n", " ")[:200])
            self.active_base = base
            break
        if r is None:
            raise KismetError("%s — تأكد أن Kismet يعمل وأن العنوان والمنفذ صحيحان" % " | ".join(net_errors))

        if r.status_code in (401, 403):
            # جرّب طرق إرسال الرمز الأخرى (cookie ← ?KISMET= ← header) قبل الحكم بأنه مرفوض
            if self.api_key and self.mode_index < len(self.TOKEN_MODES) - 1:
                self.mode_index += 1
                return self._request(method, path, params=params, **kwargs)
            if not self.api_key and not self.username:
                raise KismetError("Kismet يطلب مصادقة (%d) — أدخل مفتاح API في الإعدادات" % r.status_code)
            if r.status_code == 403:
                raise KismetError("الصلاحية مرفوضة (403) — دور المفتاح لا يسمح بهذا الطلب (استخدم readonly أو admin)")
            raise KismetError("Kismet رفض بيانات الدخول (401) — تحقق من مفتاح API أو أنشئ مفتاحًا جديدًا")
        if r.status_code == 404:
            raise KismetError("المسار غير موجود (404) %s — تحقق من العنوان وإصدار Kismet" % path)
        if r.status_code >= 400:
            raise KismetError("خطأ من Kismet (%d) عند طلب %s" % (r.status_code, path))
        if r.status_code in (301, 302, 303, 307, 308):
            raise KismetError("Kismet حوّل الطلب (%d) — غالبًا يحتاج تسجيل دخول أو العنوان خطأ" % r.status_code)
        if self.username:
            self.auth_info = "بحساب Kismet (%s)" % self.username
        elif self.api_key:
            self.auth_info = "بمفتاح API"
        return r

    def _get(self, path, params=None):
        r = self._request("GET", path, params=params)
        try:
            return r.json()
        except ValueError:
            raise KismetError("استجابة Kismet ليست JSON — غالبًا العنوان لا يشير إلى Kismet أو يحتاج تسجيل دخول")

    def _call(self, *paths):
        """يجرب المسارات بالترتيب (لاختلاف إصدارات Kismet) ويعيد {'ok','data','error'}."""
        last = None
        for path in paths:
            try:
                return {"ok": True, "data": self._get(path)}
            except KismetError as exc:
                last = exc
                if "(404)" not in str(exc):
                    break
            except Exception as exc:  # noqa: BLE001
                last = exc
                break
        return {"ok": False, "data": [], "error": str(last)}

    def status(self):
        res = self._call("/system/status.json")
        res["auth"] = self.auth_info
        res["base_url"] = self.active_base
        return res

    def datasources(self):
        res = self._call("/datasource/all_sources.json", "/datasource/list.json")
        if res["ok"]:
            res["data"] = _as_records(res["data"]) or (res["data"] if isinstance(res["data"], list) else [])
        return res

    # ---------- نقاط الوصول ----------
    @staticmethod
    def _is_ap(dev):
        device_type = str(dig(dev, "kismet.device.base.type", "kismet.device.base.type_string", default="")).lower()
        if any(t in device_type for t in ("wi-fi ap", "wifi ap", "access point", "access_point", "802.11 ap")):
            return True
        return device_type in ("ap", "wireless access point")

    @staticmethod
    def _is_client(dev):
        device_type = str(dig(dev, "kismet.device.base.type", "kismet.device.base.type_string", default="")).lower()
        return "client" in device_type

    def _view_ids(self):
        try:
            records = _as_records(self._get("/devices/views/all_views.json"))
        except KismetError:
            return []
        found = []
        for item in records:
            cand = str(dig(item, "kismet.devices.view.id", "kismet.device.view.id", "view_id", "id", default="") or "")
            if cand and re.fullmatch(r"[A-Za-z0-9_.:/-]{1,160}", cand):
                found.append(cand)
        return found

    def _fetch_view(self, view_id):
        path = "/devices/views/%s/devices.json" % view_id
        errors = []
        for method, data in (("GET", None), ("POST", {"json": json.dumps({"fields": []})})):
            try:
                r = self._request(method, path, data=data)
                rows = _as_records(r.json())
                if rows:
                    return rows, None
            except (KismetError, ValueError) as exc:
                errors.append(str(exc))
                if "(401)" in str(exc) or "(403)" in str(exc) or "تعذر الاتصال" in str(exc):
                    break
        return [], ("؛ ".join(errors) if errors else None)

    def access_points(self):
        diag = {"views": [], "all_devices_count": 0, "ap_count": 0, "client_count": 0, "warnings": [], "errors": []}
        try:
            records = []
            seen = set()
            candidates = ["phydot11_accesspoints"]
            discovered = self._view_ids()
            pref = [v for v in discovered if any(t in v.lower() for t in ("access", "dot11", "802.11", "wifi", "wi-fi"))]
            candidates += pref + [v for v in discovered if v.lower() in ("default", "all")]
            any_ap = False
            for view_id in list(dict.fromkeys(candidates)):
                rows, error = self._fetch_view(view_id)
                diag["views"].append({"id": view_id, "count": len(rows), "error": error})
                if error:
                    diag["warnings"].append("تعذر قراءة view %s: %s" % (view_id, error))
                # عرض phydot11_accesspoints كل سجلاته نقاط وصول بالتعريف
                view_is_ap = view_id == "phydot11_accesspoints"
                for row in rows:
                    key = str(dig(row, "kismet.device.base.key", "kismet.device.base.macaddr", default="")) or str(id(row))
                    if key not in seen:
                        seen.add(key)
                        if view_is_ap:
                            row.setdefault("kismet.device.base.type", "Wi-Fi AP")
                        records.append(row)
                if (view_is_ap and rows) or any(self._is_ap(r) for r in rows):
                    any_ap = True
                    break
            if not any_ap:
                path = "/devices/all_devices.json"
                alt = self._call(path)
                if alt["ok"]:
                    rows = _as_records(alt["data"])
                    diag["all_devices_count"] = len(rows)
                    records.extend(r for r in rows if str(dig(r, "kismet.device.base.key", default="")) not in seen)
                else:
                    diag["errors"].append(alt["error"])
            if not records:
                diag["warnings"].append("لم تُرجع أي واجهة أجهزة سجلات — راجع صلاحية readonly وقواعد الاستبعاد في Kismet")
            aps = [r for r in records if self._is_ap(r)]
            clients = [r for r in records if self._is_client(r)]
            if records and not aps:
                diag["warnings"].append("وصلت سجلات أجهزة لكن لم يُصنَّف أي منها كنقطة وصول Wi-Fi")
            client_map = {}
            for c in clients:
                b = str(dig(c, "dot11.device/dot11.device.last_bssid", "dot11.device.associated_bssid", default="") or "").upper()
                mac = str(dig(c, "kismet.device.base.macaddr", default="") or "").upper()
                if b and mac:
                    client_map.setdefault(b, []).append(mac)
            networks = []
            for ap in aps:
                net = self.map_ap(ap)
                if not net["bssid"]:
                    continue
                assoc = dig(ap, "dot11.device/dot11.device.associated_client_map", "dot11.device.associated_client_map", default={})
                macs = [str(k).upper() for k in assoc] if isinstance(assoc, (dict, list)) else []
                net["clients"] = sorted(set(macs + client_map.get(net["bssid"], [])))
                net["clients_count"] = len(net["clients"])
                networks.append(net)
            diag["ap_count"] = len(networks)
            diag["client_count"] = len(clients)
            return {"ok": True, "data": networks, "diagnostics": diag}
        except KismetError as exc:
            diag["errors"].append(str(exc))
            return {"ok": False, "data": [], "diagnostics": diag, "error": str(exc)}

    def alerts(self, since=0):
        """since سالب = قبل كذا ثانية من الآن (يدعمه Kismet). عند الفشل نجرب all_alerts.json."""
        res = self._call("/alerts/last-time/%.6f/alerts.json" % float(since))
        if not res["ok"]:
            alt = self._call("/alerts/all_alerts.json")
            if alt["ok"]:
                res = alt
        if res["ok"]:
            # الاستجابة الفعلية: {"kismet.alert.list": [...], "kismet.alert.timestamp": ...}
            data = res["data"]
            res["data"] = _as_records(data) if isinstance(data, dict) else [a for a in (data or []) if isinstance(a, dict)]
        return res

    def map_ap(self, dev):
        bssid = str(dig(dev, "kismet.device.base.macaddr", default="")).upper()
        rec = "dot11.device/dot11.device.last_beaconed_ssid_record/"
        ssid = dig(dev, rec + "dot11.advertisedssid.ssid", "dot11.device/dot11.device.last_beaconed_ssid", default="")
        crypt = str(dig(dev, rec + "dot11.advertisedssid.crypt_string", default="") or "")
        if not ssid or not crypt:
            ssid_map = dig(dev, "dot11.device/dot11.device.advertised_ssid_map", default={})
            items = ssid_map.values() if isinstance(ssid_map, dict) else (ssid_map if isinstance(ssid_map, list) else [])
            for item in items:
                s = dig(item, "dot11.advertisedssid.ssid", default="")
                c = dig(item, "dot11.advertisedssid.crypt_string", default="")
                if s and not ssid:
                    ssid = s
                if c and not crypt:
                    crypt = str(c)
                if ssid and crypt:
                    break
        if not ssid:
            # kismet.device.base.name يساوي أحيانًا العنوان MAC نفسه — لا نعتبره اسم شبكة
            name = str(dig(dev, "kismet.device.base.name", default="") or "")
            if name and name.upper() != bssid:
                ssid = name
        ssid = str(ssid or "")
        if not crypt:
            crypt = str(dig(dev, "kismet.device.base.crypt", default="") or "")

        freq_khz = dig(dev, "kismet.device.base.frequency", default=None)
        try:
            frequency = int(float(freq_khz) / 1000) if freq_khz else None
        except (TypeError, ValueError):
            frequency = None
        channel = dig(dev, "kismet.device.base.channel", default=None)
        if channel in (None, "", "0"):
            channel = _channel_from_freq(frequency)
        signal = None
        # الإصدارات الأحدث: last_signal — الأقدم: last_signal_dbm — وكاحتياط أعلى قيمة مسجلة
        sig_base = "kismet.device.base.signal/"
        for sig_key in ("last_signal", "last_signal_dbm", "max_signal", "max_signal_dbm", "last_signal_rssi", "max_signal_rssi"):
            val = dig(dev, sig_base + "kismet.common.signal." + sig_key, default=None)
            try:
                val = float(val)
            except (TypeError, ValueError):
                continue
            if val == 0:
                continue
            if val > 0:
                # بعض المحولات تعطي RSSI نسبيًا (0–100) بدل dBm: نحوّله بالصيغة المعتادة dBm ≈ q/2 − 100
                val = (min(val, 100) / 2.0) - 100
            if -127 <= val < 0:
                signal = int(round(val))
                break
        manuf = str(dig(dev, "kismet.device.base.manuf", default="") or "")
        first_time = dig(dev, "kismet.device.base.first_time", default=None)
        last_time = dig(dev, "kismet.device.base.last_time", default=None)
        packets = dig(dev, "kismet.device.base.packets.total", "kismet.device.base.packets.rx_total",
                      "kismet.device.base.num_packets", default=0)
        try:
            packets = int(packets)
        except (TypeError, ValueError):
            packets = 0

        disc = dig(dev, "dot11.device/dot11.device.client_disconnects", "dot11.device/dot11.device.num_client_disconnects", default=None)
        try:
            disconnects = int(disc) if disc is not None else None
        except (TypeError, ValueError):
            disconnects = None

        up = crypt.upper()
        security = crypt or "غير معروف"
        if "CCMP" in up:
            encryption = "CCMP"
        elif "GCMP" in up:
            encryption = "GCMP"
        elif "TKIP" in up:
            encryption = "TKIP"
        elif "WEP" in up:
            encryption = "WEP"
        elif up in ("NONE", "OPEN"):
            encryption = "None"
        else:
            encryption = "غير متوفر"
        return {
            "bssid": bssid,
            "ssid": ssid or "(شبكة مخفية)",
            "hidden": not ssid,
            "channel": channel,
            "frequency": frequency,
            "rssi": signal,
            "security": security,
            "encryption": encryption,
            "vendor": manuf or "غير متوفر",
            "first_seen": first_time,
            "last_seen": last_time,
            "packets": packets,
            "disconnects": disconnects,
        }
