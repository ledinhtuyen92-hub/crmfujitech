from django.apps import AppConfig


class AiAgentsConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'ai_agents'
    verbose_name = 'Trợ lý AI'
    
    crm_modules = [
        {"code": "ai_agent", "name": "Trợ lý AI (Auto-Sale)"}
    ]

    def ready(self):
        import ai_agents.signals
