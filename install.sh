#!/bin/bash
set -e

echo "🔧 AZRAQI WIDS — تثبيت تلقائي"
echo "=============================="

echo "📦 تثبيت المتطلبات..."
sudo apt update
sudo apt install -y nodejs npm python3 python3-psutil python3-requests \
  kismet tshark iw network-manager arp-scan nmap build-essential python3-dev

echo "🔨 تثبيت حزم Node.js..."
npm install

echo "👤 إعداد Kismet..."
sudo usermod -aG kismet $USER

echo "🔐 منح صلاحيات الأدوات..."
sudo setcap cap_net_raw,cap_net_admin+eip $(which arp-scan) 2>/dev/null || echo "⚠️ تعذر منح صلاحيات arp-scan"
sudo setcap cap_net_raw,cap_net_admin+eip $(which dumpcap) 2>/dev/null || echo "⚠️ تعذر منح صلاحيات dumpcap"

echo ""
echo "✅ تم التثبيت بنجاح!"
echo ""
echo "📝 خطوات التشغيل:"
echo "1. شغّل Kismet في طرفية منفصلة: kismet"
echo "2. افتح المتصفح: http://localhost:2501"
echo "3. أنشئ مستخدمًا ومفتاح API"
echo "4. شغّل التطبيق: npm start"
echo "5. من الإعدادات أدخل API Key"
echo ""
echo "⚠️ ملاحظة: قد تحتاج تسجيل الخروج والدخول مرة أخرى لتفعيل مجموعة kismet"