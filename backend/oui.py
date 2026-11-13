# -*- coding: utf-8 -*-
"""قاعدة OUI مصغّرة لاستخراج الشركة المصنّعة عند غياب البيانات من الأدوات الأخرى."""
OUI = {
    "00:1A:2B": "Cisco", "00:1B:21": "Intel", "00:1C:B3": "Apple", "00:1E:58": "D-Link",
    "00:21:6A": "Cisco", "00:23:AB": "Apple", "00:24:D7": "Intel", "00:26:BB": "Apple",
    "00:50:56": "VMware", "08:00:27": "VirtualBox", "0C:8B:FD": "Intel", "10:AE:60": "Apple",
    "14:CC:20": "TP-Link", "18:A6:F7": "TP-Link", "1C:61:B4": "Apple", "20:CF:30": "ASUSTek",
    "24:0A:C4": "Espressif", "28:6C:07": "Xiaomi", "30:B5:C2": "TP-Link", "34:97:F6": "ASUSTek",
    "3C:5A:B4": "Google", "40:4E:36": "HTC", "44:65:0D": "Apple", "48:2C:A0": "Xiaomi",
    "50:C7:BF": "TP-Link", "54:E6:FC": "TP-Link", "5C:F9:38": "Apple", "60:38:E0": "Belkin",
    "64:09:80": "Xiaomi", "68:05:CA": "Intel", "70:5A:0F": "Hewlett Packard", "74:DA:38": "Edimax",
    "78:24:AF": "Apple", "80:2A:A8": "Ubiquiti", "84:16:F9": "TP-Link", "88:25:93": "TP-Link",
    "90:94:E4": "Apple", "98:DE:D0": "TP-Link", "A4:5E:60": "Apple", "AC:84:C6": "TP-Link",
    "B0:4E:26": "TP-Link", "B8:27:EB": "Raspberry Pi", "C0:25:E9": "TP-Link", "C4:6E:1F": "TP-Link",
    "D8:07:B6": "TP-Link", "DC:A6:32": "Raspberry Pi", "E4:5F:01": "Raspberry Pi", "F0:9F:C2": "Ubiquiti",
    "F4:F5:D8": "Google", "F8:1A:67": "TP-Link", "FC:EC:DA": "Ubiquiti",
}


def vendor_of(mac):
    if not mac or mac == "غير متوفر":
        return "غير متوفر"
    prefix = str(mac).upper().replace("-", ":")[:8]
    return OUI.get(prefix, "غير متوفر")