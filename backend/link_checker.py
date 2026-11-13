# -*- coding: utf-8 -*-
"""فاحص روابط إرشادي (heuristics) بدون اتصال بالإنترنت — ليس حكمًا نهائيًا."""
import re
from urllib.parse import urlparse

SUS_TLDS = {".tk", ".ml", ".ga", ".cf", ".gq", ".xyz", ".top", ".buzz", ".click", ".loan"}
KEYWORDS = ["login", "verify", "update", "secure", "account", "confirm", "password", "bank", "signin", "wallet"]


def check_link(url):
    url = (url or "").strip()
    if not url:
        return {"ok": False, "error": "أدخل رابطًا أولًا"}
    if not re.match(r"^https?://", url, re.I):
        url = "http://" + url
    try:
        u = urlparse(url)
        host = u.hostname or ""
        path = (u.path or "") + ("?" + u.query if u.query else "")
    except ValueError:
        return {"ok": False, "error": "الرابط غير صالح"}
    if not host:
        return {"ok": False, "error": "الرابط لا يحتوي نطاقًا صالحًا"}

    score = 0
    criteria = []

    def add(name, value, points, label):
        nonlocal score
        score += points
        criteria.append({"name": name, "value": value, "points": points, "label": label})

    https = u.scheme == "https"
    add("بروتوكول التشفير (SSL/TLS)", "HTTPS مشفّر" if https else "HTTP غير مشفّر", 0 if https else 25, "آمن" if https else "خطر")

    is_ip = bool(re.match(r"^\d+\.\d+\.\d+\.\d+$", host))
    sus_tld = any(host.endswith(t) for t in SUS_TLDS)
    add("نوع النطاق", "عنوان IP مباشر" if is_ip else host, 20 if is_ip else 0, "مشبوه" if is_ip else "طبيعي")
    add("امتداد النطاق (TLD)", host.split(".")[-1], 15 if sus_tld else 0, "مجاني/مشبوه" if sus_tld else "اعتيادي")

    found = [k for k in KEYWORDS if k in path.lower() or k in host.lower()]
    kw_points = 20 if len(found) >= 2 else (10 if found else 0)
    add("كلمات مفتاحية", " / ".join(found) if found else "لا توجد", kw_points, "تحذير" if len(found) >= 2 else ("ملاحظة" if found else "طبيعي"))

    add("تعقيد الرابط", str(len(url)) + " حرف", 10 if len(url) > 90 else (5 if len(url) > 60 else 0), "مرتفع" if len(url) > 90 else "طبيعي")

    sub_count = max(0, host.count(".") - 1)
    add("نطاقات فرعية", "كثيرة" if sub_count > 3 else "اعتيادية", 10 if sub_count > 3 else 0, "تحذير" if sub_count > 3 else "طبيعي")

    puny = "xn--" in host.lower()
    add("Punycode / تشابه بصري", "موجود" if puny else "غير موجود", 15 if puny else 0, "تحذير" if puny else "طبيعي")

    score = max(0, min(100, score))
    if score >= 60:
        verdict = "تحذير: رابط تصيد محتمل"
        level = "critical"
    elif score >= 30:
        verdict = "رابط مشبوه — تحقق يدويًا"
        level = "warning"
    else:
        verdict = "رابط يبدو طبيعيًا (ليس ضمانًا)"
        level = "info"

    return {"ok": True, "url": url, "host": host, "score": score, "verdict": verdict, "level": level, "criteria": criteria, "note": "تحليل إرشادي يعتمد على بنية الرابط فقط، ولا يفتح الرابط أو يتصل بالإنترنت."}