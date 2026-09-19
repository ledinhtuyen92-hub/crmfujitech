import os
import tarfile
import traceback
from datetime import datetime
from io import StringIO
import json
import codecs

from celery import shared_task
from django.core.management import call_command
from django.utils import timezone
from dashboard.models import SystemBackupConfig, BackupHistoryLog
from django.conf import settings

@shared_task
def schedule_check_backup():
    """
    Chạy mỗi giờ bằng Celery Beat (cấu hình trong admin hoặc setting).
    Kiểm tra cấu hình SystemBackupConfig xem có đến giờ chạy chưa.
    """
    config = SystemBackupConfig.objects.first()
    if not config or not config.is_active:
        return "Backup is disabled."
    
    now = timezone.localtime(timezone.now())
    
    # Logic kiểm tra lịch trình cơ bản
    should_run = False
    if config.schedule_type == 'hourly':
        if now.minute == config.schedule_time.minute:
            should_run = True
    elif config.schedule_type == 'daily':
        if now.hour == config.schedule_time.hour and now.minute == config.schedule_time.minute:
            should_run = True
    elif config.schedule_type == 'weekly':
        if now.weekday() == (config.schedule_day_of_week or 6) and now.hour == config.schedule_time.hour and now.minute == config.schedule_time.minute:
            should_run = True

    if should_run:
        run_automated_backup.delay()
        return "Triggered automated backup."
    
    return "Not scheduled to run now."


@shared_task
def run_automated_backup():
    config = SystemBackupConfig.objects.first()
    if not config:
        return "No configuration found."

    log = BackupHistoryLog.objects.create(status='running')
    logs = []
    
    try:
        # 1. Đóng gói dữ liệu ra file JSON
        logs.append("1. Đang trích xuất Database (dumpdata)...")
        out = StringIO()
        call_command(
            'dumpdata', 
            natural_foreign=True, 
            natural_primary=True,
            exclude=['contenttypes', 'auth.Permission', 'sessions.session', 'ai_agents.companyaikey', 'ai_agents.systemaikey'],
            stdout=out
        )
        json_data = out.getvalue()
        parsed_json = json.loads(json_data)
        
        import tempfile
        temp_dir = tempfile.gettempdir()
        
        sync_file = os.path.join(temp_dir, 'sync_data.json')
        with codecs.open(sync_file, 'w', encoding='utf-8') as f:
            json.dump(parsed_json, f, ensure_ascii=False, indent=2)
        logs.append(f"   Thành công: Trích xuất {len(parsed_json)} bản ghi.")

        # 2. Đóng gói Dữ liệu & Media
        logs.append("2. Đang nén file dữ liệu (DB) và thư mục Media...")
        date_str = datetime.now().strftime("%Y%m%d_%H%M%S")
        backup_tar = os.path.join(temp_dir, f'crm_full_backup_{date_str}.tar.gz')
        media_dir = os.path.join(settings.BASE_DIR, 'media')
        
        with tarfile.open(backup_tar, "w:gz") as tar:
            # Add database
            if os.path.exists(sync_file):
                tar.add(sync_file, arcname=os.path.basename(sync_file))
            # Add media
            if os.path.exists(media_dir):
                tar.add(media_dir, arcname=os.path.basename(media_dir))
        logs.append(f"   Thành công: Đã tạo file nén {os.path.basename(backup_tar)}")

        # 3. Upload lên Cloudflare R2 / S3
        if config.r2_access_key and config.r2_secret_key and config.r2_bucket_name:
            logs.append("3. Đang tải file lên Cloudflare R2...")
            import boto3
            session = boto3.session.Session()
            s3_client = session.client(
                service_name='s3',
                endpoint_url=config.r2_endpoint_url,
                aws_access_key_id=config.r2_access_key,
                aws_secret_access_key=config.r2_secret_key,
                region_name='auto'
            )
            
            # Tải file lên
            s3_client.upload_file(backup_tar, config.r2_bucket_name, os.path.basename(backup_tar))
            logs.append(f"   Thành công: Tải lên hoàn tất.")
            
            # Cấu hình Retention Policy
            logs.append(f"   Đang kiểm tra và dọn dẹp các bản sao lưu cũ (giữ lại {config.keep_latest_count})...")
            response = s3_client.list_objects_v2(Bucket=config.r2_bucket_name)
            if 'Contents' in response:
                objects = sorted(response['Contents'], key=lambda x: x['LastModified'], reverse=True)
                objects_to_delete = objects[config.keep_latest_count:]
                if objects_to_delete:
                    delete_keys = [{'Key': obj['Key']} for obj in objects_to_delete]
                    s3_client.delete_objects(Bucket=config.r2_bucket_name, Delete={'Objects': delete_keys})
                    logs.append(f"   Đã xoá {len(delete_keys)} file cũ.")
        else:
            logs.append("3. [Bỏ qua] Không có cấu hình R2/S3.")




        # Dọn dẹp file tạm
        if os.path.exists(backup_tar):
            os.remove(backup_tar)
            logs.append("4. Đã dọn dẹp file tạm.")

        log.status = 'success'
        log.end_time = timezone.now()
        log.logs = "\n".join(logs)
        log.save()
        return "Backup completed successfully."

    except Exception as e:
        log.status = 'error'
        log.end_time = timezone.now()
        error_trace = traceback.format_exc()
        logs.append(f"LỖI: {str(e)}\n{error_trace}")
        log.logs = "\n".join(logs)
        log.save()
        return f"Backup failed: {str(e)}"
    
    finally:
        # Tự động dọn dẹp lịch sử, chỉ giữ lại 200 bản ghi mới nhất
        excess_logs = BackupHistoryLog.objects.order_by('-start_time')[200:]
        if excess_logs.exists():
            excess_ids = list(excess_logs.values_list('id', flat=True))
            BackupHistoryLog.objects.filter(id__in=excess_ids).delete()

@shared_task
def run_restore_task(filename):
    from dashboard.models import SystemBackupConfig, BackupHistoryLog
    import boto3
    from botocore.client import Config
    import os
    import tarfile
    from django.conf import settings
    from django.core.management import call_command
    import shutil
    
    config = SystemBackupConfig.objects.first()
    if not config:
        return "No config found."
    
    # Tạo log
    log = BackupHistoryLog.objects.create(status='processing', action_type='restore', logs=f"Bắt đầu khôi phục từ file {filename}...")
    logs = [log.logs]
    
    import tempfile
    import uuid
    # Tạo một thư mục tạm duy nhất cho mỗi tiến trình khôi phục
    temp_dir = os.path.join(tempfile.gettempdir(), f'tmp_restore_{uuid.uuid4().hex[:8]}')
    os.makedirs(temp_dir, exist_ok=True)
    tar_path = os.path.join(temp_dir, filename)
    
    try:
        logs.append("1. Đang tải file từ Cloudflare R2...")
        log.save()
        s3_client = boto3.client(
            's3',
            endpoint_url=config.r2_endpoint_url,
            aws_access_key_id=config.r2_access_key,
            aws_secret_access_key=config.r2_secret_key,
            config=Config(signature_version='s3v4'),
            region_name='auto'
        )
        s3_client.download_file(config.r2_bucket_name, filename, tar_path)
        
        logs.append("2. Đang giải nén dữ liệu...")
        log.save()
        with tarfile.open(tar_path, "r:gz") as tar:
            tar.extractall(path=temp_dir)
            
        json_path = os.path.join(temp_dir, 'sync_data.json')
        media_extracted = os.path.join(temp_dir, 'media')
        
        logs.append("3. Đang ghi đè thư mục Hình ảnh (Media)...")
        log.save()
        if os.path.exists(media_extracted):
            if os.path.exists(settings.MEDIA_ROOT):
                # Xoá nội dung bên trong thay vì xoá thư mục gốc (tránh lỗi Device busy do Docker mount)
                for item in os.listdir(settings.MEDIA_ROOT):
                    item_path = os.path.join(settings.MEDIA_ROOT, item)
                    if os.path.isfile(item_path) or os.path.islink(item_path):
                        os.unlink(item_path)
                    elif os.path.isdir(item_path):
                        shutil.rmtree(item_path)
            else:
                os.makedirs(settings.MEDIA_ROOT, exist_ok=True)
                
            # Copy từng file/thư mục con để tránh lỗi phân quyền (Operation not permitted) trên thư mục gốc
            for item in os.listdir(media_extracted):
                s = os.path.join(media_extracted, item)
                d = os.path.join(settings.MEDIA_ROOT, item)
                if os.path.isdir(s):
                    shutil.copytree(s, d, dirs_exist_ok=True)
                else:
                    shutil.copy2(s, d)
            
        logs.append("4. Đang xoá dữ liệu hiện tại (Flush DB)...")
        log.save()
        call_command('flush', '--no-input')
        
        logs.append("5. Đang nạp lại dữ liệu cũ (Load DB)...")
        log.save()
        if os.path.exists(json_path):
            call_command('loaddata', json_path)
            
        logs.append("Thành công: Đã phục hồi dữ liệu hoàn tất!")
        log.status = 'success'
        
    except Exception as e:
        import traceback
        logs.append(f"LỖI PHỤC HỒI: {str(e)}\n{traceback.format_exc()}")
        log.status = 'error'
    finally:
        # Dọn dẹp
        if os.path.exists(temp_dir):
            shutil.rmtree(temp_dir)
        log.end_time = timezone.now()
        log.logs = "\n".join(logs)
        log.save()
