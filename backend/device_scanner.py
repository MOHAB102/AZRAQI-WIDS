# -*- coding: utf-8 -*-
"""فحص أجهزة الشبكة المحلية: arp-scan ثم nmap ثم ip neigh، مع دمج النتائج ورسائل عربية واضحة."""
import ipaddress
import os
import re
import shutil
import socket
import subprocess
import time

import psutil
from privilege import elevate, NEED_ROOT_HINT, is_root
from oui import vendor_of

IS_WIN = os.name == "nt"
_IFACE_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_.:-]{0,31}$")
_NO_WINDOW = subprocess.CREATE_NO_WINDOW if IS_WIN else 0


def _run(cmd, timeout=20):
    try:
        r = subprocess.run(cmd, capture_output=True, timeout=timeout, creationflags=_NO_WINDOW,
                           encoding="utf-8", errors="replace")
        return r.returncode, r.stdout or "", r.stderr or ""
    except subprocess.TimeoutExpired:
        return -1, "", "انتهت مهلة الفحص"
    except OSError as exc:
        return -1, "", str(exc)


def _local_subnets():
    subnets = []
    for iface, addrs in psutil.net_if_addrs().items():
        if iface.lower().startswith("lo"):
            continue
        for a in addrs:
            if a.family.name == "AF_INET" and a.address and not a.address.startswith("127."):
                parts = a.address.split(".")
                if len(parts) == 4:
                    subnets.append((iface, ".".join(parts[:3]) + ".0/24", a.address))
    return subnets


def _hostname(ip):
    try:
        return socket.gethostbyaddr(ip)[0]
    except (OSError, socket.herror):
        return "غير متوفر"


def _merge(devices, item):
    key = item.get("mac") or item.get("ip")
    for d in devices:
        if (d.get("mac") and d["mac"] == item.get("mac")) or (d.get("ip") and d["ip"] == item.get("ip")):
            for k, v in item.items():
                if v and v != "غير متوفر":
                    d[k] = v
            return
    devices.append(item)


def _validate_inputs(interface, subnet):
    """يمنع حقن وسائط في arp-scan/nmap (مثل واجهة تبدأ بـ - أو نطاق ضخم)."""
    if interface:
        interface = str(interface).strip()
        if not _IFACE_RE.match(interface):
            raise ValueError("اسم الواجهة غير صالح")
    if subnet:
        try:
            net = ipaddress.ip_network(str(subnet).strip(), strict=False)
        except ValueError:
            raise ValueError("صيغة النطاق غير صالحة — مثال: 192.168.1.0/24")
        if net.version != 4 or net.prefixlen < 20:
            raise ValueError("النطاق كبير جدًا — استخدم IPv4 بقناع /20 أو أصغر")
        subnet = str(net)
    return interface or None, subnet or None


def scan_devices(interface=None, subnet=None):
    try:
        interface, subnet = _validate_inputs(interface, subnet)
    except ValueError as exc:
        return {"ok": False, "error": str(exc), "devices": []}
    if IS_WIN:
        return _scan_windows()
    subnets = _local_subnets()
    if not subnets:
        return {"ok": False, "error": "لا توجد واجهة شبكة محلية متصلة", "devices": []}
    chosen = None
    if interface:
        chosen = next((s for s in subnets if s[0] == interface), None)
    if subnet:
        chosen = (interface or "auto", subnet, "")
    if not chosen:
        chosen = subnets[0]
    iface, net, local_ip = chosen
    devices = []
    methods = []
    note = ""

    if shutil.which("arp-scan"):
        cmd = ["arp-scan", "--interface", iface, net] if interface else ["arp-scan", "--localnet"]
        cmd, how = elevate(cmd)
        code, out, err = _run(cmd, timeout=90 if how == "pkexec" else 25)
        if code == 0:
            methods.append("arp-scan")
            for line in out.splitlines():
                m = re.match(r"^(\d+\.\d+\.\d+\.\d+)\s+([0-9a-fA-F:]{17})\s*(.*)$", line.strip())
                if m:
                    ip, mac, vendor = m.group(1), m.group(2).upper(), m.group(3).strip()
                    _merge(devices, {"ip": ip, "mac": mac, "vendor": vendor or vendor_of(mac), "name": _hostname(ip), "method": "arp-scan"})
        else:
            note = (NEED_ROOT_HINT + " — تم استخدام بدائل") if not is_root() else ("فشل arp-scan: %s" % (err or "").strip()[:120])
    else:
        note = "أداة arp-scan غير مثبتة"

    if shutil.which("nmap"):
        ncmd, how = elevate(["nmap", "-sn", net])
        code, out, err = _run(ncmd, timeout=90 if how == "pkexec" else 30)
        if code == 0:
            methods.append("nmap")
            current = {}
            for line in out.splitlines():
                rep = re.match(r"Nmap scan report for (.+)", line.strip())
                if rep:
                    if current:
                        _merge(devices, current)
                    current = {}
                    target = rep.group(1)
                    ipm = re.search(r"\((\d+\.\d+\.\d+\.\d+)\)", target)
                    if ipm:
                        current["ip"] = ipm.group(1)
                        current["name"] = target.split(" ")[0]
                    else:
                        current["ip"] = target
                        current["name"] = "غير متوفر"
                macm = re.match(r"MAC Address:\s*([0-9A-Fa-f:]{17})\s*\((.*)\)", line.strip())
                if macm:
                    current["mac"] = macm.group(1).upper()
                    current["vendor"] = macm.group(2).strip() or vendor_of(current.get("mac"))
                    current["method"] = "nmap"
            if current:
                _merge(devices, current)

    code, out, err = _run(["ip", "neigh"], timeout=8)
    if code == 0:
        methods.append("ip neigh")
        for line in out.splitlines():
            m = re.match(r"^(\d+\.\d+\.\d+\.\d+)\s+dev\s+(\S+)\s+lladdr\s+([0-9a-fA-F:]{17})", line.strip())
            if m:
                ip, dev, mac = m.group(1), m.group(2), m.group(3).upper()
                if interface and dev != interface:
                    continue
                _merge(devices, {"ip": ip, "mac": mac, "vendor": vendor_of(mac), "name": _hostname(ip), "method": "ip neigh"})

    now = time.time()
    for d in devices:
        d.setdefault("name", "غير متوفر")
        d.setdefault("mac", "غير متوفر")
        d.setdefault("vendor", vendor_of(d.get("mac")))
        d["last_seen"] = now
        d["trusted"] = False
        d["status"] = "known"

    return {
        "ok": True,
        "interface": iface,
        "subnet": net,
        "local_ip": local_ip,
        "methods": methods,
        "note": note or "الفحص يكمل البيانات المتاحة فقط",
        "devices": devices,
        "time": now,
    }


def _scan_windows():
    code, out, err = _run(["arp", "-a"], timeout=10)
    devices = []
    if code == 0:
        for line in out.splitlines():
            m = re.search(r"(\d+\.\d+\.\d+\.\d+)\s+([0-9a-fA-F-]{17})", line)
            if m:
                ip, mac = m.group(1), m.group(2).replace("-", ":").upper()
                devices.append({"ip": ip, "mac": mac, "vendor": vendor_of(mac), "name": _hostname(ip), "method": "arp -a", "last_seen": time.time(), "trusted": False, "status": "known"})
    return {"ok": True, "interface": "Windows", "subnet": "local", "methods": ["arp -a"], "note": "على Windows تُعرض ذاكرة ARP المحلية فقط", "devices": devices, "time": time.time()}