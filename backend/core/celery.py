"""
core/celery.py
Celery application configuration cho CRM SaaS.
"""

import os

from celery import Celery

# Thiết lập Django settings cho Celery
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "core.settings")

app = Celery("crm_saas")

# Đọc cấu hình Celery từ Django settings với prefix CELERY_
app.config_from_object("django.conf:settings", namespace="CELERY")

# Tự động discover tasks từ tất cả INSTALLED_APPS
app.autodiscover_tasks()

# Đăng ký thủ công các task nằm trong core/
app.conf.imports = ('core.tasks',)


@app.task(bind=True, ignore_result=True)
def debug_task(self):
    print(f"Request: {self.request!r}")

