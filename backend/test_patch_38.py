import urllib.request
import json
import sys

try:
    login_data = json.dumps({
        "workspace_id": "FUJI",
        "username": "admin_fuji",
        "password": "88888888"
    }).encode('utf-8')
    req = urllib.request.Request("http://localhost:8000/api/users/login/", data=login_data, headers={'Content-Type': 'application/json'})
    res = urllib.request.urlopen(req)
    token = json.loads(res.read())['access']
    
    # Get the customer 38
    req2 = urllib.request.Request("http://localhost:8000/api/crm/customers/38/", headers={'Authorization': f'Bearer {token}'})
    res2 = urllib.request.urlopen(req2)
    cust = json.loads(res2.read())
    print("Customer 38:", cust)
    
    # Try the patch that the frontend might be sending
    # The user was updating Customer 'Nhung' with phone '0966722222', adding company 'CÔNG TY ABC' and tax_code '1111022220'.
    # I'll simulate the frontend payload. Let's see what else might be in the payload.
    patch_data = json.dumps({
        "name": "Nhung",
        "phone": "0966722222",
        "company_name": "CÔNG TY ABC",
        "tax_code": "1111022220",
        "email": "tuanma.axiang@gmail.com",
        "city": "Hà Nội",
        "address": "Hà Đông",
        "birthday": "2026-07-22",
        "source": "other",
        "status": "active",
        "priority_level": "p1",
        "expected_quantity": 20,
        "tag_ids": []
    }).encode('utf-8')
    req_patch = urllib.request.Request(f"http://localhost:8000/api/crm/customers/38/", data=patch_data, headers={'Authorization': f'Bearer {token}', 'Content-Type': 'application/json'}, method='PATCH')
    try:
        res_patch = urllib.request.urlopen(req_patch)
        print("Success:", res_patch.read().decode())
    except urllib.error.HTTPError as e:
        print(f"Error {e.code}:", e.read().decode())
        
except Exception as e:
    print(f"ERROR: {e}")
