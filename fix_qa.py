# -*- coding: utf-8 -*-
import re

with open('frontend/src/pages/settings/AiKnowledgeBase.jsx', 'r', encoding='utf-8') as f:
    content = f.read()

replacement = """  const handleEdit = (record) => {
    setCurrentDoc(record)
    
    let qa_list = [];
    if (record.doc_type === 'qa') {
      let text = record.content || '';
      text = text.replace(/\\n\\nKhách hàng:\\s*/g, '\\n\\nH?i: ')
                 .replace(/^Khách hàng:\\s*/, 'H?i: ')
                 .replace(/\\nNhân viên:\\s*/g, '\\nÐáp: ')
                 .replace(/\\n\\nKhách:\\s*/g, '\\n\\nH?i: ')
                 .replace(/^Khách:\\s*/, 'H?i: ')
                 .replace(/\\nSale:\\s*/g, '\\nÐáp: ');

      const blocks = text.split('\\n\\nH?i: ').filter(Boolean);"""

content = re.sub(
    r"  const handleEdit = \(record\) => \{\n    setCurrentDoc\(record\)\n    \n    let qa_list = \[\];\n    if \(record\.doc_type === 'qa'\) \{\n        const blocks = \(record\.content \|\| ''\)\.split\('\\n\\nH?i: '\)\.filter\(Boolean\);",
    replacement,
    content
)

with open('frontend/src/pages/settings/AiKnowledgeBase.jsx', 'w', encoding='utf-8') as f:
    f.write(content)
