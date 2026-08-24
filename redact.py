import json

with open('backend/sync_data.json', 'r', encoding='utf-8') as f:
    data = json.load(f)

for item in data:
    if item['model'] in ('ai_agents.companyaikey', 'ai_agents.systemaikey', 'ai_agents.systemaikey', 'ai_agents.companyaikey'):
        if 'api_key' in item['fields']:
            item['fields']['api_key'] = "sk-..."

with open('backend/sync_data.json', 'w', encoding='utf-8') as f:
    json.dump(data, f, ensure_ascii=False, indent=2)
