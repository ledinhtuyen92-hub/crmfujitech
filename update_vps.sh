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

# Kiem tra xem requirements.txt hoac Dockerfile co thay doi khong truoc khi reset
if git diff --name-only HEAD origin/main | grep -qE 'backend/requirements.txt|backend/Dockerfile|docker-compose.yml'; then
    REQUIREMENTS_CHANGED=1
else
    REQUIREMENTS_CHANGED=0
fi

git reset --hard origin/main
echo "✅ Code da duoc cap nhat thanh cong!"

# Xoa volume media_data cu (neu con ton tai tu lan chay truoc bi loi)
# Gio da chuyen sang bind mount ./backend/media nen volume nay khong can nua
docker volume rm crmfujitech_media_data 2>/dev/null && echo "🗑  Da xoa volume media_data cu." || true

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
# Tao truoc thu muc media tren host voi quyen dung (appuser uid=1000)
mkdir -p backend/media/products backend/media/products/templates backend/media/uploads backend/media/company_signatures
chown -R 1000:1000 backend/media
chmod -R 775 backend/media

if [ "$REQUIREMENTS_CHANGED" -eq 1 ]; then
    echo "📦 Phat hien thu vien moi (requirements.txt/Dockerfile)! Dang rebuild Docker..."
    docker compose up -d --build
else
    echo "🐳 Khong co thu vien moi. Dang khoi dong / cap nhat Docker (nhanh)..."
    docker compose up -d
fi

# Doi crm_web khoi dong hoan toan truoc khi chay docker exec
echo "⏳ Dang cho container crm_web san sang..."
RETRIES=30
until docker exec crm_web echo "ready" > /dev/null 2>&1; do
    RETRIES=$((RETRIES - 1))
    if [ "$RETRIES" -le 0 ]; then
        echo "❌ Loi: container crm_web khong khoi dong duoc sau 60 giay!"
        docker logs crm_web --tail 30
        exit 1
    fi
    sleep 2
done
echo "✅ Container crm_web da san sang!"

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

# 6. Restart Backend & Celery
echo ""
echo "🐍 [5/6] Dang khoi dong lai Backend & Celery de nhan code Python moi..."
docker restart crm_web crm_celery crm_celery_beat
echo "✅ Backend va Celery da duoc khoi dong lai!"

# 7. Reload Nginx de phuc vu file moi nhat
echo ""
echo "🔥 [6/6] Dang reload Nginx de ap dung giao dien moi..."
systemctl reload nginx
echo "✅ Nginx da duoc reload!"

# 7.5 Cap nhat quyen thu muc media va dam bao named volume co du lieu cu (neu co)
echo ""
echo "🔥 [7/7] Kiem tra va cap nhat quyen thu muc media..."
# Tao thu muc tren host (backup / fallback)
mkdir -p backend/media/products backend/media/products/templates backend/media/uploads

# Di chuyen du lieu media cu vao named volume neu volume chua co du lieu
MEDIA_IN_VOLUME=$(docker exec crm_web sh -c "ls /app/media/ 2>/dev/null | wc -l" 2>/dev/null || echo "0")
if [ "$MEDIA_IN_VOLUME" = "0" ] && [ -d "backend/media" ] && [ "$(ls -A backend/media 2>/dev/null)" ]; then
    echo "=> Dang sao chep media cu vao Docker volume..."
    docker cp backend/media/. crm_web:/app/media/ 2>/dev/null || true
fi

# Cap quyen cho appuser (uid 1000) trong container
docker exec crm_web sh -c "chown -R 1000:1000 /app/media 2>/dev/null || chmod -R 775 /app/media" 2>/dev/null || true
echo "✅ Thu muc media da duoc cap quyen!"

echo ""
echo "=========================================================="
echo "🎉 CAP NHAT HOAN TAT! He thong da chay phien ban moi."
echo ""
echo "   📝 Luu y: Backend Django da duoc khoi dong lai"
echo "      de nhan code Python moi nhat."
echo "=========================================================="
