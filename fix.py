import os

def fix_file(path):
    with open(path, 'r', encoding='utf-8') as f:
        content = f.read()

    # Fix the broken function definition
    content = content.replace('const getProductDisplayName = (p) => p.sku ?  -  : p.name;', 'const getProductDisplayName = (p) => p.sku ? []  : p.name;')
    content = content.replace('const getProductDisplayName = (p) => p.sku ?  -  : p.name;', 'const getProductDisplayName = (p) => p.sku ? []  : p.name;')
    
    with open(path, 'w', encoding='utf-8') as f:
        f.write(content)

fix_file('frontend/src/pages/QuotationList.jsx')
fix_file('frontend/src/pages/OrderList.jsx')
print('Fixed!')
