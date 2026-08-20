import re

def fix_file(path):
    with open(path, 'r', encoding='utf-8') as f:
        content = f.read()

    # Regex to find the broken line and replace it
    content = re.sub(r'const getProductDisplayName = \(p\) => p\.sku \? .*? : p\.name;', 
                     'const getProductDisplayName = (p) => p.sku ? `[${p.sku}] ${p.name}` : p.name;', 
                     content)

    with open(path, 'w', encoding='utf-8') as f:
        f.write(content)

fix_file('frontend/src/pages/QuotationList.jsx')
fix_file('frontend/src/pages/OrderList.jsx')
print('Fixed!')
