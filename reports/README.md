# AZRAQI WIDS — Wireless Defense SOC

مركز عمليات أمن لاسلكي دفاعي بواجهة عربية.

---

## 🔰 التنزيل والتثبيت على Kali Linux

### 1) تنزيل المشروع

```bash
git clone https://github.com/MOHAB102/AZRAQI-WIDS.git
cd AZRAQI-WIDS
```

### 2) تشغيل سكريبت التثبيت

```bash
chmod +x install.sh
./install.sh
```

السكريبت ينزّل كل المتطلبات ويضبط الصلاحيات تلقائيًا.

### 3) تشغيل Kismet (في طرفية منفصلة)

```bash
kismet
```

افتح المتصفح على `http://localhost:2501` وأنشئ مستخدمًا ومفتاح API.

### 4) تشغيل التطبيق (في طرفية ثانية)

```bash
npm start
```

من داخل التطبيق: **الإعدادات** ← أدخل:
- **Kismet URL**: `http://localhost:2501`
- **Kismet API Key**: المفتاح اللي أنشأته

ثم اضغط **إعادة تشغيل المحرك**.

---

## 🪟 التنزيل والتثبيت على Windows 11

### 1) ثبّت هذه الثلاثة أولًا (يدويًا)

- Node.js LTS من https://nodejs.org
- Python 3.9+ من https://python.org (فعّل ✅ Add python.exe to PATH)
- Visual Studio Build Tools 2022 مع حمل *Desktop development with C++*

### 2) تنزيل المشروع

```powershell
git clone https://github.com/MOHAB102/AZRAQI-WIDS.git
cd AZRAQI-WIDS
```

### 3) تشغيل سكريبت التثبيت

اضغط دبل كليك على `install.bat`، أو من الطرفية:

```powershell
.\install.bat
```

### 4) التشغيل

```powershell
npm start
```

> على Windows يشتغل: الطرفية، فحص الأجهزة المحلي، فاحص الروابط، التقارير، الإعدادات.
> الرصد السلبي الكامل عبر Kismet يحتاج Kali Linux ومحول واي فاي يدعم Monitor Mode.

---

## 📝 ملاحظات مهمة

### Kali Linux
- سجّل خروج ودخول مرة واحدة بعد التثبيت لتفعيل مجموعة `kismet`.
- الرصد الحقيقي يحتاج محول واي فاي يدعم Monitor Mode (مثل Alfa AWUS036ACM).
- تحقق من الدعم: `iw list | grep -A 8 "Supported interface modes"` — لازم يظهر سطر `* monitor`.

### Windows
- إذا فشل `npm install` بعد التأكد من Build Tools، نفّذ: `npm run rebuild`

---

## 🐛 حل المشاكل الشائعة

| المشكلة | الحل |
|---|---|
| `node-pty غير جاهز` | `npm run rebuild` |
| `Kismet غير متصل` | شغّل `kismet` وتأكد من الرابط والمفتاح |
| `لا تظهر شبكات` | فعّل Monitor Mode من واجهة Kismet |
| `فحص الأجهزة ناقص` | أعد تنفيذ أوامر `setcap` الموجودة في install.sh |
| `شاشة سوداء في جهاز افتراضي` | `npm start -- --disable-gpu` |

---

## 🔒 الخصوصية

التقارير قد تحتوي على IP / MAC / اسم الجهاز / SSID / BSSID.
شاركها فقط مع المصرّح لهم.