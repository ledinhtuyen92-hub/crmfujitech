# coding=utf-8
import re

path = 'frontend/src/pages/OrderList.jsx'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

# Fix the broken options
content = re.sub(
    r"return \{ value: displayName, label: \$\{displayName\} \(\) \};",
    r"return { value: displayName, label: `${displayName} (${p.unit || 'cái'})` };",
    content
)

with open(path, 'w', encoding='utf-8') as f:
    f.write(content)
