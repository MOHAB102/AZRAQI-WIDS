# AZRAQI WIDS — Wireless Defense SOC

مركز عمليات أمن لاسلكي دفاعي بواجهة عربية.

يعرض الشبكات المحيطة على رادار حي، ويصنّف كل شبكة بلون حالتها، ويكشف هجمات الفصل (Deauth) وحجب الخدمة والشبكات المزيفة (Evil Twin) اعتمادًا على بيانات Kismet.

| اللون | المعنى |
|---|---|
| 🟢 أخضر | شبكة سليمة، لا توجد مؤشرات مشبوهة |
| 🟡 أصفر | شبكة قيد الفحص والمتابعة |
| 🔴 أحمر | شبكة عليها هجوم محتمل |

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

أو يدويًا:

```bash
sudo apt update
sudo apt install -y nodejs npm python3 python3-pip python3-psutil python3-requests \
  kismet tshark iw network-manager arp-scan nmap build-essential python3-dev git
npm install
```

### 3) تشغيل Kismet (في طرفية منفصلة)

```bash
kismet -c wlan0
```

غيّر `wlan0` إلى اسم محولك (تعرفه من `iw dev`).

افتح المتصفح على `http://127.0.0.1:2501` وأنشئ مستخدمًا ومفتاح API (من إعدادات Kismet ← API Tokens).

> ⚠️ لا تشغّل Kismet بـ `sudo`. سيقرأ إعدادات مستخدم root ويطلب منك إنشاء حساب جديد في كل مرة، ومفتاح API القديم لن يعمل.

### 4) تشغيل التطبيق (في طرفية ثانية)

```bash
npm start
```

أو بصلاحيات root لتفعيل فحص الأجهزة والتقاط الإطارات كاملين:

```bash
bash start-root.sh
```

من داخل التطبيق: **الإعدادات** ← أدخل:
- **Kismet URL**: `http://127.0.0.1:2501`
- **Kismet API Key**: المفتاح اللي أنشأته

ثم اضغط **إعادة تشغيل المحرك**.

بعد الاتصال يتحول مؤشر Kismet في أعلى الشاشة إلى "متصل" وتبدأ الشبكات بالظهور في الرادار والجدول.

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

## 📋 المتطلبات

| المتطلب | الاستخدام |
|---|---|
| Kali Linux (أو Debian / Ubuntu) | الرصد الكامل عبر Kismet |
| محول واي فاي يدعم Monitor Mode | التقاط الشبكات (مثل Alfa AWUS036ACM) |
| Node.js 18+ و npm | تشغيل الواجهة |
| Python 3.8+ مع `psutil` و`requests` | محرك التحليل |
| Kismet | مصدر بيانات الشبكات والتنبيهات |
| tshark | التقاط وتحليل الإطارات |
| arp-scan و nmap | فحص الأجهزة داخل الشبكة |
| build-essential و python3-dev | بناء مكتبة الطرفية `node-pty` |

سكريبت `install.sh` يثبّت كل ما سبق على Kali تلقائيًا.

---

## 🛡️ كيف يكشف الهجمات

- تنبيهات Kismet (مثل `DEAUTHFLOOD` و`BCASTDISCON` و`APSPOOF`) تظهر في سجل الأحداث، وتتحول الشبكة المستهدفة إلى 🔴 لمدة 5 دقائق.
- يراقب البرنامج أيضًا ارتفاع عدد عمليات فصل الأجهزة عن كل شبكة، ويرفع تنبيهًا حتى لو لم يصدر Kismet تنبيهًا.
- حساسية الكشف تتحكم فيها من شريط الحساسية في لوحة التحكم.

---

## 📝 ملاحظات مهمة

### Kali Linux
- سجّل خروج ودخول مرة واحدة بعد التثبيت لتفعيل مجموعة `kismet`.
- الرصد الحقيقي يحتاج محول واي فاي يدعم Monitor Mode.
- تحقق من الدعم: `iw list | grep -A 8 "Supported interface modes"` — لازم يظهر سطر `* monitor`.
- فحص الأجهزة والتقاط الإطارات يحتاجان root، فشغّل التطبيق بـ `bash start-root.sh`. وإذا شغّلته كمستخدم عادي، يحاول رفع الصلاحيات للأداة المطلوبة فقط عبر `sudo -n` أو نافذة `pkexec`.

### الدخول بالمستخدم وكلمة المرور (اختياري)
بدل مفتاح API تقدر تكتب في خانة المفتاح `اسم_المستخدم:كلمة_المرور`، أو تضع بياناتك في `~/.config/azraqi-wids/kismet.json`:

```json
{ "username": "اسم_المستخدم", "password": "كلمة_المرور" }
```

```bash
chmod 700 ~/.config/azraqi-wids && chmod 600 ~/.config/azraqi-wids/kismet.json
```

### Windows
- إذا فشل `npm install` بعد التأكد من Build Tools، نفّذ: `npm run rebuild`

---

## 🐛 حل المشاكل الشائعة

| المشكلة | الحل |
|---|---|
| `node-pty غير جاهز` | `npm run rebuild` |
| `Kismet غير متصل` | شغّل `kismet` وتأكد من الرابط والمفتاح، وسبب الفشل مكتوب في سجل الأحداث |
| `خطأ 401` | المفتاح خطأ أو منتهي، أنشئ مفتاحًا جديدًا من Kismet |
| `خطأ 403` | صلاحية المفتاح لا تكفي، استخدم دور `readonly` أو `admin` |
| `Kismet يطلب إنشاء مستخدم كل مرة` | لا تشغّله بـ `sudo`، أو استخدم `sudo env HOME=$HOME kismet -c wlan0` |
| `لا تظهر شبكات` | فعّل Monitor Mode وتأكد أن Data Source يعمل في واجهة Kismet |
| `فحص الأجهزة ناقص` | شغّل التطبيق بـ `bash start-root.sh`، أو أعد تنفيذ أوامر `setcap` الموجودة في install.sh |
| `Permission denied عند start-root.sh` | `chmod +x start-root.sh` أو شغّله بـ `bash start-root.sh` |
| `شاشة سوداء` | `npm start -- --disable-gpu` أو `bash start-root.sh --disable-gpu` |
| `المحرك لا يعمل / حزم ناقصة` | `pip install -r requirements.txt --break-system-packages` |

لاختبار الاتصال بـ Kismet من الطرفية:

```bash
curl --noproxy '*' -i -H 'Cookie: KISMET=<المفتاح>' http://127.0.0.1:2501/system/status.json
```

---

## 🧪 الاختبارات

```bash
python3 -m unittest discover -s backend
```

---

## 🔒 الخصوصية

التقارير قد تحتوي على IP / MAC / اسم الجهاز / SSID / BSSID.
شاركها فقط مع المصرّح لهم.

> الأداة مخصصة لحماية الشبكات التي تملكها أو لديك إذن بفحصها.
