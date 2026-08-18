import urllib.request
import json

try:
    login_data = json.dumps({
        "workspace_id": "FUJI",
        "username": "admin_fuji",
        "password": "88888888"
    }).encode('utf-8')
    req = urllib.request.Request("http://localhost:8000/api/users/login/", data=login_data, headers={'Content-Type': 'application/json'})
    res = urllib.request.urlopen(req)
    token = json.loads(res.read())['access']
    
    # Get the first customer
    req2 = urllib.request.Request("http://localhost:8000/api/crm/customers/", headers={'Authorization': f'Bearer {token}'})
    res2 = urllib.request.urlopen(req2)
    custs = json.loads(res2.read())['results']
    cust_id = custs[0]['id']
    
    # Patch customer
    patch_data = json.dumps({"company_name": "CÔNG TY ABC", "tax_code": "1111022220"}).encode('utf-8')
    req_patch = urllib.request.Request(f"http://localhost:8000/api/crm/customers/{cust_id}/", data=patch_data, headers={'Authorization': f'Bearer {token}', 'Content-Type': 'application/json'}, method='PATCH')
    try:
        res_patch = urllib.request.urlopen(req_patch)
        print("Success:", res_patch.read().decode())
    except urllib.error.HTTPError as e:
        print(f"Error {e.code}:", e.read().decode())
        
except Exception as e:
    print(f"ERROR: {e}")
