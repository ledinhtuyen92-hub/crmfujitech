from rest_framework import serializers
from .models import SystemBackupConfig, BackupHistoryLog

class SystemBackupConfigSerializer(serializers.ModelSerializer):
    class Meta:
        model = SystemBackupConfig
        fields = '__all__'

class BackupHistoryLogSerializer(serializers.ModelSerializer):
    class Meta:
        model = BackupHistoryLog
        fields = '__all__'
