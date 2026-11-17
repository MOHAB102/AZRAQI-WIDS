# AZRAQI WIDS — الاتصال بـ Kismet واستكشاف الأخطاء

## المتطلبات
- Kismet يعمل ويستقبل بيانات من محول Wi-Fi (Monitor Mode).
- Python 3 مع الحزم في `requirements.txt` (`pip install -r requirements.txt`).
- صلاحية قراءة REST API: دور `readonly` يكفي.

## التشغيل بصلاحيات root (للفحص والالتقاط)
فحص الأجهزة (arp-scan/nmap) والتحليل بـ tshark يحتاجان root:
```bash
./start-root.sh        # أو: npm run start:root
```
إذا شغّلته كمستخدم عادي، يحاول البرنامج رفع الصلاحيات للأداة المطلوبة فقط عبر `sudo -n` (NOPASSWD) أو نافذة `pkexec`.

## الاتصال
1. شغّل Kismet وتأكد أن واجهته تفتح على `http://127.0.0.1:2501`.
2. أنشئ API token من واجهة Kismet (Settings ← API tokens).
3. في إعدادات AZRAQI: أدخل **Kismet URL** و**Kismet API Key**. العنوان يقبل `localhost:2501` بدون `http://`.
4. الحالة وسبب أي فشل (مفتاح مرفوض 401، Kismet مغلق، عنوان خطأ...) يظهران في سجل الأحداث وعند مؤشر Kismet في الأعلى.

### اسم المستخدم وكلمة المرور (اختياري)
بدل المفتاح، اكتب في خانة المفتاح `user:password`، أو استخدم متغيرات البيئة
`AZRAQI_KISMET_USERNAME` و`AZRAQI_KISMET_PASSWORD`، أو الملف `~/.config/azraqi-wids/kismet.json`:

```json
{ "username": "اسم_المستخدم", "password": "كلمة_المرور" }
```
```bash
chmod 700 ~/.config/azraqi-wids && chmod 600 ~/.config/azraqi-wids/kismet.json
```
البرنامج لا يقرأ ملفات Kismet الخاصة (`session.db`، `kismet_httpd.conf`) ولا يخمّن بيانات دخول.

## كيف يقرأ الشبكات؟
1. يرسل المفتاح كـ Cookie باسم `KISMET` (ثم `?KISMET=` ثم ترويسة، تلقائيًا إن رُفض).
2. يجرب `localhost` و`127.0.0.1` معًا.
3. يقرأ العرض الجاهز `phydot11_accesspoints`، وإن لم ينفع يكتشف العروض عبر `/devices/views/all_views.json`، وأخيرًا `/devices/all_devices.json` ويصنف السجلات.
4. يربط العملاء المتصلين بكل نقطة وصول (`clients` و`clients_count`).
5. التنبيهات من `/alerts/last-time/...` وتبقى فعّالة 5 دقائق.

تفاصيل المحاولات تظهر في `source.diagnostics` داخل Snapshot.

## استكشاف الأخطاء
```bash
curl --noproxy '*' -i -H 'Cookie: KISMET=<المفتاح>' http://127.0.0.1:2501/system/status.json
curl --noproxy '*' -i -H 'Cookie: KISMET=<المفتاح>' http://127.0.0.1:2501/devices/views/all_views.json
```
- `401`: المفتاح خطأ أو منتهٍ.  `403`: دور المفتاح لا يكفي.
- «متصل لكن لا توجد نقاط وصول»: تحقق من مصدر الالتقاط في Kismet ومن Device Rules.
- المحرك لا يعمل: تأكد من `pip install -r requirements.txt`.

## الاختبارات
```bash
python3 -m unittest discover -s backend
```
