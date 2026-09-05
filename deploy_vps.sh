#!/bin/bash
# CRM SaaS - Auto Deploy Script for Ubuntu VPS (22.04/24.04)
# Make sure to run this script as root! (sudo bash deploy_vps.sh)
#
# ⚠⚠⚠  CANH BAO QUAN TRONG  ⚠⚠⚠
# Script nay CHI dung cho lan CAI DAT DAU TIEN tren VPS TRONG.
# Script nay se XOA SACH TOAN BO DU LIEU database hien tai (lenh flush).
# DE CAP NHAT code moi len VPS dang chay, hay dung: sudo bash update_vps.sh
# ⚠⚠⚠⚠⚠⚠⚠⚠⚠⚠⚠⚠⚠⚠⚠⚠⚠⚠⚠⚠⚠⚠⚠⚠⚠⚠⚠⚠⚠⚠⚠⚠

echo "=========================================================="
echo "      🚀 KHOI TAO HE THONG CRM SAAS (ONE-CLICK) 🚀"
echo "=========================================================="

# 1. Kiem tra quyen root
if [ "$EUID" -ne 0 ]; then
  echo "Vui long chay script voi quyen root (sudo bash deploy_vps.sh)"
  exit
fi

# 2. Tao SWAP 4GB tranh loi sap server (Danh cho VPS yeu)
if [ ! -f /swapfile ]; then
    echo "=> Dang tao 4GB RAM ao (SWAP) de dam bao he thong muot ma..."
    fallocate -l 4G /swapfile
    chmod 600 /swapfile
    mkswap /swapfile
    swapon /swapfile
    echo '/swapfile none swap sw 0 0' | tee -a /etc/fstab
else
    echo "=> SWAP da ton tai, bo qua buoc tao RAM ao."
fi

# 3. Cap nhat va Cai dat cac goi can thiet
echo "=> Cap nhat he thong va cai dat cong cu co ban..."
apt-get update -y
apt-get install -y curl wget git nginx certbot python3-certbot-nginx

# Cai Docker neu chua co (phien ban moi da bao gom docker compose plugin)
if ! command -v docker &> /dev/null; then
    echo "=> Dang cai dat Docker..."
    curl -fsSL https://get.docker.com -o get-docker.sh
    sh get-docker.sh
fi

# Cai Node.js 20.x de build Frontend
if ! command -v node &> /dev/null; then
    echo "=> Dang cai dat Node.js 20..."
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
    apt-get install -y nodejs
fi

# 4. Lay Ten mien va cau hinh API URL
echo "=========================================================="
read -p "Nhap Ten mien cua ban (Vd: crm.congty.com). Neu chua tro IP thi nhap IP cua VPS: " DOMAIN

if [[ "$DOMAIN" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
    PROTOCOL="http"
else
    PROTOCOL="https"
fi

echo "VITE_API_URL=$PROTOCOL://$DOMAIN/api/" > frontend/.env.production

# Tu dong cau hinh .env cho VPS
if [ ! -f .env ]; then
    echo "=> Khong tim thay file .env, dang khoi tao tu .env.example..."
    cp .env.example .env
fi

# Tu dong tao random SECRET_KEY va DB_PASSWORD an toan neu chua duoc set (hoac dang la mac dinh)
RANDOM_SECRET=$(cat /dev/urandom | tr -dc 'a-zA-Z0-9' | fold -w 50 | head -n 1)
RANDOM_DB_PASS=$(cat /dev/urandom | tr -dc 'a-zA-Z0-9' | fold -w 16 | head -n 1)
sed -i "s|^SECRET_KEY=your_secret_key_here_change_in_production|SECRET_KEY=$RANDOM_SECRET|g" .env
sed -i "s|^DB_PASSWORD=secure_password_change_me|DB_PASSWORD=$RANDOM_DB_PASS|g" .env

sed -i "s|^SITE_URL=.*|SITE_URL=$PROTOCOL://$DOMAIN|g" .env
sed -i "s|^VITE_API_URL=.*|VITE_API_URL=$PROTOCOL://$DOMAIN|g" .env
sed -i "s|^ALLOWED_HOSTS=.*|ALLOWED_HOSTS=$DOMAIN,localhost,127.0.0.1|g" .env
sed -i "s|^DEBUG=.*|DEBUG=False|g" .env

# Cap quyen cho Nginx doc thu muc root
chmod 711 /root
chmod -R 755 $(pwd)/frontend/dist

# Tu dong nhan dien lenh docker compose phu hop voi moi doi Ubuntu
if command -v docker-compose &> /dev/null; then
    DOCKER_CMD="docker-compose"
else
    DOCKER_CMD="docker compose"
fi

# 5. Khoi dong Backend bang Docker
echo "=> Dang khoi chay Backend (Django, Redis, Postgres, Celery)..."
mkdir -p backend/postgres_data
$DOCKER_CMD up -d --build

# Cho Database san sang va nap du lieu
echo "=> Dang doi Database khoi dong (10s)..."
sleep 10
echo "=> Cap nhat Database & Nap du lieu mac dinh..."
docker exec -i crm_web python manage.py migrate
docker exec -i crm_web python load_sync_data.py

# 6. Build Frontend
echo "=> Dang bien dich giao dien Frontend (ReactJS)..."
cd frontend
npm install
npm run build
cd ..

# 7. Cau hinh Nginx
echo "=> Dang cau hinh Nginx Web Server..."
cat > /etc/nginx/sites-available/crm <<EOF
server {
    listen 80;
    server_name $DOMAIN;

    # Cho phep tai len file toi da 50MB
    client_max_body_size 50M;

    # Phuc vu file tinh cua React
    location / {
        root $(pwd)/frontend/dist;
        index index.html;
        try_files \$uri \$uri/ /index.html;
    }

    # Chuyen huong cac request API ve Django Backend (Docker port 8000)
    location ~ ^/(api|admin|media|static)/ {
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
systemctl restart nginx

# 8. Cai dat SSL (HTTPS)
if [[ "$DOMAIN" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
    echo "=> Ban dang dung IP ($DOMAIN), bo qua cai dat SSL."
else
    echo "=> Dang cai dat chung chi bao mat SSL (HTTPS) cho ten mien $DOMAIN..."
    certbot --nginx -d $DOMAIN --non-interactive --agree-tos -m admin@$DOMAIN
fi

echo "=========================================================="
echo "🎉 XIN CHUC MUNG! HE THONG DA CAI DAT THANH CONG!"
echo "Truy cap he thong tai: $PROTOCOL://$DOMAIN"
echo "Tai khoan quan tri mac dinh da duoc khoi phuc tu sync_data.json"
echo "=========================================================="
