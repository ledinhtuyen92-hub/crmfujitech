"""
Management command: replace_rag_domain
---------------------------------------
Thay thế domain cũ bằng domain mới trong toàn bộ hệ thống
(Đơn hàng, Báo giá, Tài chính, RAG, Facebook messages...) trực tiếp trong DB.

Cách dùng (chạy trên VPS bên trong container crm_web):
    docker exec crm_web python manage.py replace_rag_domain \
        --old crm.fujitechgroup.vn \
        --new crm.fujitechgroup.com
"""
from django.core.management.base import BaseCommand
from django.db import connection, transaction


class Command(BaseCommand):
    help = 'Thay thế domain cũ bằng domain mới trong toàn bộ hệ thống (Đơn hàng, Báo giá, RAG, Facebook, Tài chính)'

    def add_arguments(self, parser):
        parser.add_argument(
            '--old',
            type=str,
            required=True,
            help='Domain cũ cần thay (VD: crm.fujitechgroup.vn)'
        )
        parser.add_argument(
            '--new',
            type=str,
            required=True,
            help='Domain mới (VD: crm.fujitechgroup.com)'
        )
        parser.add_argument(
            '--dry-run',
            action='store_true',
            default=False,
            help='Chỉ xem trước số lượng bản ghi sẽ thay, KHÔNG thực sự ghi vào DB'
        )

    def handle(self, *args, **options):
        old_domain = options['old'].strip()
        new_domain = options['new'].strip()
        dry_run = options['dry_run']

        # Chuẩn hoá: đảm bảo không có protocol trong domain nhập vào
        for d in (old_domain, new_domain):
            if d.startswith('http'):
                self.stderr.write(
                    self.style.ERROR(f'Nhập domain không cần tiền tố http/https (VD: crm.fujitechgroup.vn). Bạn nhập: "{d}"')
                )
                return

        self.stdout.write(f'Domain cũ : {old_domain}')
        self.stdout.write(f'Domain mới: {new_domain}')
        if dry_run:
            self.stdout.write(self.style.WARNING('[DRY RUN] Không có thay đổi thực sự nào được ghi vào DB.\n'))

        total_updated = 0

        # Quét tất cả các bảng và cột text/json trong PostgreSQL
        cursor = connection.cursor()
        cursor.execute("""
            SELECT table_name, column_name, data_type 
            FROM information_schema.columns 
            WHERE data_type IN ('character varying', 'text', 'jsonb', 'json')
            AND table_schema = 'public';
        """)
        cols = cursor.fetchall()

        self.stdout.write(f'Đang quét {len(cols)} cột trong CSDL...')

        for table, col, dtype in cols:
            try:
                # Kiểm tra số lượng bản ghi chứa domain cũ
                cursor.execute(
                    f'SELECT COUNT(*) FROM "{table}" WHERE "{col}"::text LIKE %s;',
                    [f'%{old_domain}%']
                )
                cnt = cursor.fetchone()[0]
                if cnt > 0:
                    self.stdout.write(f'  🔍 Tìm thấy {cnt} dòng trong {table}.{col}')
                    if not dry_run:
                        with transaction.atomic():
                            if dtype in ('jsonb', 'json'):
                                cursor.execute(
                                    f'UPDATE "{table}" SET "{col}" = REPLACE("{col}"::text, %s, %s)::{dtype} WHERE "{col}"::text LIKE %s;',
                                    [old_domain, new_domain, f'%{old_domain}%']
                                )
                            else:
                                cursor.execute(
                                    f'UPDATE "{table}" SET "{col}" = REPLACE("{col}", %s, %s) WHERE "{col}" LIKE %s;',
                                    [old_domain, new_domain, f'%{old_domain}%']
                                )
                        self.stdout.write(self.style.SUCCESS(f'     ✅ Đã cập nhật {cnt} dòng trong {table}.{col}'))
                    total_updated += cnt
            except Exception as e:
                self.stderr.write(self.style.WARNING(f'     ⚠️ Bỏ qua {table}.{col} do lỗi: {e}'))

        self.stdout.write('')
        if dry_run:
            self.stdout.write(self.style.WARNING(
                f'[DRY RUN] Sẽ cập nhật tổng cộng {total_updated} bản ghi trên toàn bộ hệ thống.\n'
                f'Chạy lại không có --dry-run để thực hiện thực sự.'
            ))
        else:
            self.stdout.write(self.style.SUCCESS(
                f'🎉 Hoàn tất! Đã thay thế "{old_domain}" → "{new_domain}" '
                f'cho tổng cộng {total_updated} bản ghi trong toàn bộ CSDL!'
            ))
