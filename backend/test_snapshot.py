import urllib.request
import json
import sys

try:
    with open('token.txt', 'rb') as f:
        token = f.read().decode('utf-16').strip()
        
    print("Testing API for Quotations...")
    req = urllib.request.Request("http://localhost:8000/api/sales/quotations/?limit=1", headers={
        'Authorization': f'Bearer {token}'
    })
    
    with urllib.request.urlopen(req) as response:
        data = json.loads(response.read().decode())
        
    if data['results']:
        quotation = data['results'][0]
        print(f"Quotation ID: {quotation['id']}")
        print(f"Customer Name Snapshot/Fallback: {quotation['customer_name']}")
        print(f"Customer Info Snapshot/Fallback: {quotation['customer_info']}")
        
    print("\nTesting API for Orders...")
    req = urllib.request.Request("http://localhost:8000/api/orders/orders/?limit=1", headers={
        'Authorization': f'Bearer {token}'
    })
    
    with urllib.request.urlopen(req) as response:
        data = json.loads(response.read().decode())
        
    if data['results']:
        order = data['results'][0]
        print(f"Order ID: {order['id']}")
        print(f"Customer Name Snapshot/Fallback: {order['customer_name']}")
        print(f"Customer Info Snapshot/Fallback: {order['customer_info']}")
        
except Exception as e:
    print(f"Error: {e}")
