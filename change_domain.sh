#!/bin/bash
# ==============================================================================
# SCRIPT DOI TEN MIEN CHO HE THONG CRM FUJITECH TREN VPS
# Cach dung: sudo bash change_domain.sh
# ==============================================================================

set -e

echo "=========================================================="
echo "      🌐 CONG CU DOI TEN MIEN CRM FUJITECH SAAS 🌐"
echo "=========================================================="

# 1. Kiem tra quyen root
if [ "$EUID" -ne 0 ]; then
    echo "❌ Vui long chay script voi quyen root (sudo bash change_domain.sh)"
    exit 1
fi

# 2. Xac dinh thu muc du an
APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$APP_DIR"

if [ ! -f "docker-compose.yml" ] || [ ! -d "frontend" ] || [ ! -d "backend" ]; then
    echo "❌ Khong tim thay ma nguon CRM trong thu muc nay: $APP_DIR"
    echo "Vui long cd vao dung thu muc chua du an truoc khi chay script."
    exit 1
fi

# 3. Nhap ten mien moi va cu
echo ""
read -p "👉 Nhap ten mien MOI cua ban (Vd: crm.fujitechgroup.com): " RAW_DOMAIN

# Lam sach ten mien (xoa https://, http://, dau gach cheo cuoi, khoang trang)
DOMAIN=$(echo "$RAW_DOMAIN" | sed -e 's|^https\?://||' -e 's|/.*$||' -e 's|^[ \t]*||' -e 's|[ \t]*$||')

if [ -z "$DOMAIN" ]; then
    echo "❌ Ten mien khong duoc de trong!"
    exit 1
fi

# Hoi domain cu de thay the URL trong RAG (co the bo qua)
echo ""
read -p "👉 Nhap ten mien CU (de thay the URL trong RAG). Nhan Enter de bo qua: " RAW_OLD_DOMAIN
OLD_DOMAIN=$(echo "$RAW_OLD_DOMAIN" | sed -e 's|^https\?://||' -e 's|/.*$||' -e 's|^[ \t]*||' -e 's|[ \t]*$||')

# Xac dinh giao thuc (IP -> http, Domain -> https)
if [[ "$DOMAIN" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
    PROTOCOL="http"
    IS_IP=1
    echo "ℹ️  Phat hien dia chi IP ($DOMAIN). Se su dung giao thuc HTTP (khong dung SSL)."
else
    PROTOCOL="https"
    IS_IP=0
    echo "ℹ️  Phat hien ten mien: $DOMAIN. Se su dung giao thuc HTTPS voi SSL Let's Encrypt."
fi

echo ""
echo "🚀 Dang tien hanh chuyen doi sang: $PROTOCOL://$DOMAIN ..."
echo "----------------------------------------------------------"

# 4. Cap nhat file .env
echo "📝 [1/5] Cap nhat cau hinh .env va frontend..."
if [ ! -f .env ]; then
    if [ -f .env.example ]; then
        cp .env.example .env
    else
        touch .env
    fi
fi

# Backup .env
cp .env .env.bak.$(date +%Y%m%d_%H%M%S)

# Cap nhat bien trong .env
grep -q "^SITE_URL=" .env && sed -i "s|^SITE_URL=.*|SITE_URL=$PROTOCOL://$DOMAIN|g" .env || echo "SITE_URL=$PROTOCOL://$DOMAIN" >> .env
grep -q "^VITE_API_URL=" .env && sed -i "s|^VITE_API_URL=.*|VITE_API_URL=$PROTOCOL://$DOMAIN|g" .env || echo "VITE_API_URL=$PROTOCOL://$DOMAIN" >> .env
grep -q "^ALLOWED_HOSTS=" .env && sed -i "s|^ALLOWED_HOSTS=.*|ALLOWED_HOSTS=$DOMAIN,localhost,127.0.0.1|g" .env || echo "ALLOWED_HOSTS=$DOMAIN,localhost,127.0.0.1" >> .env
grep -q "^DEBUG=" .env && sed -i "s|^DEBUG=.*|DEBUG=False|g" .env || echo "DEBUG=False" >> .env

# Cap nhat bien moi truong cho Frontend
echo "VITE_API_URL=$PROTOCOL://$DOMAIN/api/" > frontend/.env.production
echo "✅ Da cap nhat .env & frontend/.env.production!"

# 5. Build lai Frontend voi domain moi
echo ""
echo "⚛️  [2/5] Bien dich lai Frontend ReactJS (Vite)..."
cd frontend
if [ ! -d "node_modules" ]; then
    npm install
fi
npm run build
cd "$APP_DIR"
chmod 711 /root 2>/dev/null || true
chmod -R 755 "$APP_DIR/frontend/dist"
echo "✅ Frontend da duoc build thanh cong!"

# 6. Cau hinh Nginx
echo ""
echo "🌐 [3/5] Cau hinh lai Nginx Web Server..."
cat > /etc/nginx/sites-available/crm <<EOF
server {
    listen 80;
    server_name $DOMAIN;

    client_max_body_size 50M;

    gzip on;
    gzip_disable "msie6";
    gzip_vary on;
    gzip_proxied any;
    gzip_comp_level 6;
    gzip_buffers 16 8k;
    gzip_http_version 1.1;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml application/xml+rss text/javascript application/vnd.ms-fontobject application/x-font-ttf font/opentype image/svg+xml image/x-icon;

    location / {
        root $APP_DIR/frontend/dist;
        index index.html;
        try_files \$uri \$uri/ /index.html;
    }

    location ~ ^/(api|sys-admin|media|static)/ {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
}
EOF

ln -sf /etc/nginx/sites-available/crm /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default
nginx -t
systemctl restart nginx
echo "✅ Nginx da cap nhat server_name: $DOMAIN!"

# 7. Cai dat SSL Let's Encrypt (Neu la ten mien)
if [ "$IS_IP" -eq 0 ]; then
    echo ""
    echo "🔒 [4/5] Cai dat chung chi bao mat SSL (HTTPS)..."
    if command -v certbot &> /dev/null; then
        if certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos -m "admin@$DOMAIN" --redirect; then
            echo "✅ SSL Let's Encrypt da duoc cap thanh cong cho $DOMAIN!"
        else
            echo "⚠️  CANH BAO: Certbot gap su co khi cap SSL."
            echo "    Nguyen nhan thuong gap la ten mien chua tro IP ve VPS hoac DNS chua cap nhat."
            echo "    Sau khi DNS hoan tat, ban co the chay lai: sudo certbot --nginx -d $DOMAIN"
        fi
    else
        echo "⚠️  Chua cai certbot. Vui long cai bang lenh: apt-get install -y certbot python3-certbot-nginx"
    fi
else
    echo "ℹ️  [4/5] Bo qua SSL vi dang su dung dia chi IP."
fi

# 8. Khoi dong lai Backend de ap dung ALLOWED_HOSTS & SITE_URL moi
echo ""
echo "🐳 [5/6] Khoi dong lai Docker Backend..."
docker restart crm_web crm_celery crm_celery_beat 2>/dev/null || {
    echo "Container chua bat, dang khoi dong bang docker compose..."
    if command -v docker-compose &> /dev/null; then
        docker-compose up -d
    else
        docker compose up -d
    fi
}

# 9. Thay the URL domain cu trong noi dung RAG (neu nguoi dung cung cap domain cu)
if [ -n "$OLD_DOMAIN" ] && [ "$OLD_DOMAIN" != "$DOMAIN" ]; then
    echo ""
    echo "🔄 [6/6] Thay the URL domain cu ($OLD_DOMAIN) bang domain moi ($DOMAIN) trong RAG..."
    # Doi container crm_web san sang
    RETRIES=15
    until docker exec crm_web echo "ready" > /dev/null 2>&1; do
        RETRIES=$((RETRIES - 1))
        [ "$RETRIES" -le 0 ] && break
        sleep 2
    done
    if docker exec crm_web echo "ready" > /dev/null 2>&1; then
        docker exec crm_web python manage.py replace_rag_domain --old "$OLD_DOMAIN" --new "$DOMAIN"
        echo "✅ Da cap nhat URL anh trong RAG tu domain cu sang domain moi!"
    else
        echo "⚠️  Container crm_web chua san sang. Hay chay thu cong sau:"
        echo "    docker exec crm_web python manage.py replace_rag_domain --old \"$OLD_DOMAIN\" --new \"$DOMAIN\""
    fi
else
    echo "ℹ️  [6/6] Bo qua buoc thay the URL RAG (khong co domain cu)."
fi

systemctl reload nginx

echo ""
echo "=========================================================="
echo "🎉 CHUYEN DOI TEN MIEN THANH CONG!"
echo "👉 Truy cap he thong tai: $PROTOCOL://$DOMAIN"
echo "=========================================================="
