#!/bin/bash
# CRM SaaS - Auto Backup to GitHub & Google Drive
# 
# Cach cai dat tu dong chay hang ngay:
# 1. Go lenh: crontab -e
# 2. Them dong sau vao cuoi file (de chay luc 2h sang):
#    0 2 * * * /bin/bash /root/crmfujitech/auto_backup.sh >> /root/crm_backup.log 2>&1

# ================= CAU HINH =================
BACKUP_BRANCH="fujitech"          # Ten nhanh GitHub chua du lieu backup
DRIVE_REMOTE_NAME="Fujitech"      # Ten remote Rclone (mac dinh: gdrive)
DRIVE_BACKUP_FOLDER="CRM_Backups" # Ten thu muc tren Google Drive
PROJECT_DIR="/root/crmfujitech"
TEMP_MEDIA_DIR="/tmp/crm_media_backup"
DATE=$(date +"%Y%m%d_%H%M%S")
# ============================================

echo "==================================================="
echo "🚀 BAT DAU SAO LUU TU DONG - $DATE"
echo "==================================================="

cd $PROJECT_DIR || exit 1

# 1. Dong bo Du lieu (Database -> JSON) va day len GitHub
echo "=> Dang trich xuat Database ra file sync_data.json bang script xu ly UTF-8..."
# Chay dump_sync_data.py trong container de chong loi font va cap quyen root de ghi file
docker exec -u root crm_web python dump_sync_data.py

# Cau hinh an toan cho Git (truong hop chay qua cron hoac vps moi)
git config --global --add safe.directory $PROJECT_DIR
git config --global user.name "VPS Auto Backup"
git config --global user.email "backup@vps.local"
git config --global credential.helper store

echo "=> Dang day Code va Database len nhanh Github: $BACKUP_BRANCH ..."
# Tam thoi chuyen sang nhanh backup, commit, push, roi quay lai main
CURRENT_BRANCH=$(git branch --show-current)

# Chuyen sang nhanh backup (tao neu chua co)
git checkout -B $BACKUP_BRANCH

# Commit su thay doi cua sync_data.json va code (neu co)
git add .
git commit -m "Auto Backup: Du lieu ngay $DATE"

# Push len Github
git push origin $BACKUP_BRANCH

# Tro lai nhanh cu de he thong tiep tuc chay binh thuong
git checkout $CURRENT_BRANCH

echo "✅ Da sao luu Code & Database len GitHub ($BACKUP_BRANCH) thanh cong!"


# 2. Dong goi Hinh anh & Tai lieu (Media)
echo "=> Dang nen thu muc Media..."
mkdir -p $TEMP_MEDIA_DIR
MEDIA_TAR_FILE="$TEMP_MEDIA_DIR/media_$DATE.tar.gz"
tar -czf "$MEDIA_TAR_FILE" backend/media/

# 3. Day file Media len Google Drive bang Rclone
echo "=> Dang tai file len Google Drive ($DRIVE_REMOTE_NAME)..."
if command -v rclone &> /dev/null; then
    rclone copy "$MEDIA_TAR_FILE" "$DRIVE_REMOTE_NAME:$DRIVE_BACKUP_FOLDER/"
    if [ $? -eq 0 ]; then
        echo "✅ Tai len Google Drive thanh cong!"
        
        # Tuy chon: Xoa cac file backup cu tren Google Drive (qua 30 ngay)
        # rclone delete "$DRIVE_REMOTE_NAME:$DRIVE_BACKUP_FOLDER/" --min-age 30d
        
        # Xoa file nen tam o VPS cho nhe may
        rm "$MEDIA_TAR_FILE"
    else
        echo "❌ Loi: Khong the tai len Google Drive. Hay kiem tra lai cau hinh rclone."
    fi
else
    echo "⚠ Rclone chua duoc cai dat, bo qua buoc tai len Google Drive."
    echo "File nen van duoc giu lai tai: $MEDIA_TAR_FILE"
fi

echo "==================================================="
echo "🎉 HOAN TAT SAO LUU TU DONG - $(date +"%Y%m%d_%H%M%S")"
echo "==================================================="
