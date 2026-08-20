import re

path = 'frontend/src/pages/OrderList.jsx'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

# Replace product mapping 1
content = re.sub(
    r"options=\{products\.filter\(\s*p\s*=>\s*p\.product_type\s*!==\s*'service'\s*\)\.map\(\s*p\s*=>\s*\(\{\s*value:\s*p\.name,\s*label:.*?\}\)\)\}",
    '''options={products.filter(p => p.product_type !== 'service').map(p => {
                          const displayName = getProductDisplayName(p);
                          return { value: displayName, label: ${displayName} () };
                        })}''',
    content,
    flags=re.DOTALL
)

# Replace product mapping 2 (Services)
content = re.sub(
    r"options=\{products\.filter\(\s*\(p\)\s*=>\s*p\.product_type\s*===\s*'service'\s*\)\.map\(\s*\(p\)\s*=>\s*\(\{\s*value:\s*p\.name,\s*label:\s*p\.name\s*\}\)\)\}",
    '''options={products.filter(p => p.product_type === 'service').map(p => {
                          const displayName = getProductDisplayName(p);
                          return { value: displayName, label: displayName };
                        })}''',
    content,
    flags=re.DOTALL
)

with open(path, 'w', encoding='utf-8') as f:
    f.write(content)
