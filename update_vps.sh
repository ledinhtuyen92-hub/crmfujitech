#!/bin/bash
# CRM SaaS - Script CAP NHAT code moi len VPS (chay khi da co he thong roi)
#
# ✅ Cach dung (moi lan can update):
#    cd /duong-dan-du-an   (vao thu muc du an)
#    sudo bash update_vps.sh
#
# ℹ  Script nay da tu dong git pull ben trong, KHONG can chay git pull thu cong truoc.
# ℹ  Lan dau tien: can git pull 1 lan de tai file nay ve VPS, sau do KHONG can nua.
# Chay tren VPS, KHONG phai may tinh local.

set -e  # Dung ngay neu co loi

echo "=========================================================="
echo "      🔄 CAP NHAT CRM SAAS LEN PHIEN BAN MOI NHAT 🔄"
echo "=========================================================="

# 1. Kiem tra quyen root
if [ "$EUID" -ne 0 ]; then
  echo "⚠  Vui long chay script voi quyen root: sudo bash update_vps.sh"
  exit 1
fi

# 2. Lay code moi nhat tu GitHub
echo ""
echo "📥 [1/5] Dang keo code moi nhat tu GitHub (nhanh main)..."
# Khôi phục mọi thay đổi cục bộ (nếu có) để tránh lỗi kẹt git
git fetch origin main
git reset --hard origin/main
echo "✅ Code da duoc cap nhat thanh cong!"

# 2.1 Tu dong cau hinh file .env theo VPS
echo ""
echo "⚙  [2/5] Tu dong cap nhat file .env theo cau hinh VPS..."
if [ -f /etc/nginx/sites-available/crm ]; then
    DOMAIN=$(grep server_name /etc/nginx/sites-available/crm | head -n 1 | awk '{print $2}' | tr -d ';')
else
    # Fallback lay IP public neu khong co nginx config
    DOMAIN=$(curl -s ifconfig.me)
fi

if [[ "$DOMAIN" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
    PROTOCOL="http"
else
    PROTOCOL="https"
fi

sed -i "s|^SITE_URL=.*|SITE_URL=$PROTOCOL://$DOMAIN|g" .env
sed -i "s|^VITE_API_URL=.*|VITE_API_URL=$PROTOCOL://$DOMAIN|g" .env
sed -i "s|^ALLOWED_HOSTS=.*|ALLOWED_HOSTS=$DOMAIN,localhost,127.0.0.1|g" .env
sed -i "s|^DEBUG=.*|DEBUG=False|g" .env
echo "✅ File .env da duoc cau hinh tu dong cho: $DOMAIN"


# 2.5 Khoi dong cac dich vu moi (neu co)
echo ""
echo "🐳 Dang khoi dong / cap nhat Docker containers..."
docker compose up -d

# 3. Chay migrate neu co thay doi DB schema
echo ""
echo "🗄  [2/5] Kiem tra va cap nhat cau truc Database..."
docker exec -i crm_web python manage.py migrate --no-input
echo "✅ Database da duoc migrate!"

# 4. Nap lai quyen he thong (seed_permissions)
echo ""
echo "🔐 [3/5] Dang nap lai danh sach quyen he thong..."
docker exec -i crm_web python manage.py seed_permissions
echo "✅ Permissions da duoc cap nhat!"

# 5. Build lai Frontend
echo ""
echo "⚛  [4/5] Dang bien dich lai giao dien React (Frontend)..."
cd frontend
npm install --prefer-offline
npm run build
cd ..
echo "✅ Frontend da duoc build xong!"

# 6. Reload Nginx de phuc vu file moi nhat
echo ""
echo "🌐 [5/5] Dang reload Nginx de ap dung giao dien moi..."
systemctl reload nginx
echo "✅ Nginx da duoc reload!"

echo ""
echo "=========================================================="
echo "🎉 CAP NHAT HOAN TAT! He thong da chay phien ban moi."
echo ""
echo "   📝 Luu y: Backend Django tu dong nhan code moi"
echo "      do volume mount ./backend:/app trong docker-compose."
echo "=========================================================="
