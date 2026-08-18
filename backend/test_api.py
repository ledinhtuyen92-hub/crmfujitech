import urllib.request
import json

try:
    login_data = json.dumps({
        "workspace_id": "FUJI",
        "username": "admin_fuji",
        "password": "88888888"
    }).encode('utf-8')
    req = urllib.request.Request("http://localhost:8000/api/token/", data=login_data, headers={'Content-Type': 'application/json'})
    res = urllib.request.urlopen(req)
    token = json.loads(res.read())['access']
    
    req2 = urllib.request.Request("http://localhost:8000/api/orders/orders/", headers={'Authorization': f'Bearer {token}'})
    res2 = urllib.request.urlopen(req2)
    data = json.loads(res2.read())
    
    if len(data['results']) > 0:
        order = data['results'][0]
        print("COMPANY INFO:")
        print(json.dumps(order.get('company_info'), indent=2, ensure_ascii=False))
        print("CUSTOMER INFO:")
        print(json.dumps(order.get('customer_info'), indent=2, ensure_ascii=False))
    else:
        print("No orders found.")
except Exception as e:
    print(f"ERROR: {e}")
