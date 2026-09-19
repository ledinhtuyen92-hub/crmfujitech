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

def sync_media_to_r2(config, s3_client, logs):
    import mimetypes
    from django.conf import settings
    logs.append("4. Đang đồng bộ Media lên Cloudflare R2 (Incremental Sync)...")
    media_dir = settings.MEDIA_ROOT
    if not os.path.exists(media_dir):
        logs.append("   [Bỏ qua] Thư mục media trống.")
        return
        
    bucket = config.r2_bucket_name
    prefix = 'media_sync/'
    
    remote_files = {}
    try:
        paginator = s3_client.get_paginator('list_objects_v2')
        for page in paginator.paginate(Bucket=bucket, Prefix=prefix):
            if 'Contents' in page:
                for obj in page['Contents']:
                    remote_files[obj['Key']] = obj['Size']
    except Exception as e:
        logs.append(f"   [Cảnh báo] Lỗi khi lấy danh sách file trên R2: {str(e)}")
        
    uploaded_count = 0
    skipped_count = 0
    
    for root, dirs, files in os.walk(media_dir):
        for file in files:
            local_path = os.path.join(root, file)
            rel_path = os.path.relpath(local_path, media_dir)
            s3_key = prefix + rel_path.replace('\\', '/')
            
            local_size = os.path.getsize(local_path)
            
            if s3_key not in remote_files or remote_files[s3_key] != local_size:
                try:
                    content_type = mimetypes.guess_type(local_path)[0] or 'application/octet-stream'
                    s3_client.upload_file(
                        local_path, 
                        bucket, 
                        s3_key,
                        ExtraArgs={'ContentType': content_type}
                    )
                    uploaded_count += 1
                except Exception as e:
                    logs.append(f"   [Cảnh báo] Không thể upload {rel_path}: {str(e)}")
            else:
                skipped_count += 1
                
    logs.append(f"   Thành công: Đã upload {uploaded_count} file mới. Đã bỏ qua {skipped_count} file cũ.")

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

        # 2. Đóng gói Dữ liệu (chỉ có DB)
        logs.append("2. Đang nén file dữ liệu (DB)...")
        date_str = datetime.now().strftime("%Y%m%d_%H%M%S")
        backup_tar = os.path.join(temp_dir, f'crm_db_backup_{date_str}.tar.gz')
        
        with tarfile.open(backup_tar, "w:gz") as tar:
            if os.path.exists(sync_file):
                tar.add(sync_file, arcname=os.path.basename(sync_file))
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
            response = s3_client.list_objects_v2(Bucket=config.r2_bucket_name, Prefix='crm_db_backup_')
            if 'Contents' in response:
                objects = sorted(response['Contents'], key=lambda x: x['LastModified'], reverse=True)
                objects_to_delete = objects[config.keep_latest_count:]
                if objects_to_delete:
                    delete_keys = [{'Key': obj['Key']} for obj in objects_to_delete]
                    s3_client.delete_objects(Bucket=config.r2_bucket_name, Delete={'Objects': delete_keys})
                    logs.append(f"   Đã xoá {len(delete_keys)} file DB cũ.")
            
            # 4. Sync Media incrementally
            sync_media_to_r2(config, s3_client, logs)
            
        else:
            logs.append("3. [Bỏ qua] Không có cấu hình R2/S3.")




        # Dọn dẹp file tạm
        if os.path.exists(backup_tar):
            os.remove(backup_tar)
            logs.append("5. Đã dọn dẹp file tạm.")

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

def garbage_collect_media(logs):
    from django.apps import apps
    from django.db.models import FileField, ImageField
    from django.conf import settings
    import os
    
    logs.append("3. Đang dọn dẹp file rác (Garbage Collection)...")
    
    media_dir = settings.MEDIA_ROOT
    if not os.path.exists(media_dir):
        logs.append("   [Bỏ qua] Thư mục media trống.")
        return
        
    referenced_files = set()
    
    for model in apps.get_models():
        file_fields = [f for f in model._meta.fields if isinstance(f, (FileField, ImageField))]
        if file_fields:
            try:
                for instance in model.objects.all():
                    for field in file_fields:
                        val = getattr(instance, field.name)
                        if val and hasattr(val, 'name') and val.name:
                            referenced_files.add(val.name)
            except Exception:
                pass
                
    try:
        from sales.models import Quotation, Order
        def extract_media_from_json(data):
            if isinstance(data, dict):
                for k, v in data.items():
                    if isinstance(v, str) and v.startswith('uploads/'):
                        referenced_files.add(v)
                    elif isinstance(v, str) and '/media/uploads/' in v:
                        try:
                            path = v.split('/media/')[1]
                            referenced_files.add(path)
                        except:
                            pass
                    extract_media_from_json(v)
            elif isinstance(data, list):
                for item in data:
                    extract_media_from_json(item)

        for q in Quotation.objects.all():
            if q.custom_data:
                extract_media_from_json(q.custom_data)
        for o in Order.objects.all():
            if o.custom_data:
                extract_media_from_json(o.custom_data)
    except Exception:
        pass
        
    deleted_count = 0
    for root, dirs, files in os.walk(media_dir):
        for file in files:
            local_path = os.path.join(root, file)
            rel_path = os.path.relpath(local_path, media_dir)
            rel_path_normalized = rel_path.replace('\\', '/')
            
            if rel_path_normalized not in referenced_files:
                try:
                    os.remove(local_path)
                    deleted_count += 1
                except:
                    pass
                    
    logs.append(f"   Thành công: Đã dọn dẹp {deleted_count} file mồ côi.")

def sync_media_from_r2(config, s3_client, logs):
    from django.conf import settings
    import os
    logs.append("4. Đang kéo file từ Cloudflare R2 về VPS (Media Pull)...")
    
    media_dir = settings.MEDIA_ROOT
    os.makedirs(media_dir, exist_ok=True)
    
    bucket = config.r2_bucket_name
    prefix = 'media_sync/'
    
    downloaded_count = 0
    skipped_count = 0
    
    try:
        paginator = s3_client.get_paginator('list_objects_v2')
        for page in paginator.paginate(Bucket=bucket, Prefix=prefix):
            if 'Contents' in page:
                for obj in page['Contents']:
                    s3_key = obj['Key']
                    if s3_key.endswith('/'): continue
                    
                    rel_path = s3_key[len(prefix):]
                    local_path = os.path.join(media_dir, rel_path.replace('/', os.sep))
                    remote_size = obj['Size']
                    
                    if os.path.exists(local_path):
                        local_size = os.path.getsize(local_path)
                        if local_size == remote_size:
                            skipped_count += 1
                            continue
                            
                    os.makedirs(os.path.dirname(local_path), exist_ok=True)
                    s3_client.download_file(bucket, s3_key, local_path)
                    downloaded_count += 1
                    
        logs.append(f"   Thành công: Đã kéo {downloaded_count} file mới. Đã bỏ qua {skipped_count} file cũ.")
    except Exception as e:
        logs.append(f"   [Cảnh báo] Lỗi khi pull media từ R2: {str(e)}")

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
        logs.append("1. Đang tải file DB từ Cloudflare R2...")
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
        
        logs.append("2. Đang giải nén Database...")
        log.save()
        with tarfile.open(tar_path, "r:gz") as tar:
            tar.extractall(path=temp_dir)
            
        json_path = os.path.join(temp_dir, 'sync_data.json')
        
        if os.path.exists(json_path):
            call_command('flush', '--no-input')
            call_command('loaddata', json_path)
            
        garbage_collect_media(logs)
        log.save()
        
        sync_media_from_r2(config, s3_client, logs)
        log.save()
            
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
