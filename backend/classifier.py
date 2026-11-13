# -*- coding: utf-8 -*-
"""تصنيف الشبكات بالأدلة: GREEN / YELLOW / RED / UNKNOWN مع الثقة والأسباب."""


def classify(evidence, sensitivity=5):
    sens = max(1, min(int(sensitivity), 10)) / 5.0
    if not evidence.get("monitor_ok", True) or evidence.get("packets", 0) < 20:
        return {
            "status": "unknown",
            "confidence": 0,
            "reasons": ["بيانات غير كافية", "مصدر المراقبة غير نشط أو القناة غير مراقبة"],
        }

    score = 0
    reasons = []
    deauth_rate = evidence.get("deauth_rate", 0)
    disassoc_rate = evidence.get("disassoc_rate", 0)
    beacon_rate = evidence.get("beacon_rate", 0)

    if evidence.get("deauth_flood") or deauth_rate > 10 / sens:
        score += 3
        reasons.append("ارتفاع مؤكد في إطارات Deauthentication")
    if evidence.get("disassoc_flood") or disassoc_rate > 8 / sens:
        score += 3
        reasons.append("ارتفاع غير طبيعي في إطارات Disassociation")
    if evidence.get("beacon_flood") or beacon_rate > 50 / sens:
        score += 2
        reasons.append("مؤشرات متوافقة مع Beacon Flood")
    if evidence.get("ssid_twin") and evidence.get("sec_change"):
        score += 3
        reasons.append("مؤشر قوي على Evil Twin / Rogue AP (نفس SSID بإعدادات مختلفة)")
    elif evidence.get("ssid_twin"):
        score += 1
        reasons.append("SSID متشابه مع BSSID مختلف يستحق التحقيق")
    if evidence.get("probe_burst"):
        score += 1
        reasons.append("Probe Requests غير اعتيادية")
    if evidence.get("sec_change") and not evidence.get("ssid_twin"):
        score += 1
        reasons.append("تغيّر في إعدادات الأمان أو معلومات نقطة الوصول")

    if score >= 3:
        status = "red"
        confidence = min(95, 55 + score * 8)
    elif score >= 1:
        status = "yellow"
        confidence = min(85, 40 + score * 12)
    else:
        status = "green"
        confidence = 62
        reasons = ["لا توجد مؤشرات مشبوهة ضمن البيانات الملتقطة (ليس ضمان أمان)"]

    return {"status": status, "confidence": confidence, "reasons": reasons}