import re

with open('frontend/src/pages/settings/AiKnowledgeBase.jsx', 'r', encoding='utf-8') as f:
    content = f.read()

# Add Select to imports
content = re.sub(
    r"import \{ (.*?) \} from 'antd'",
    lambda m: f"import {{ {m.group(1)}, Select }} from 'antd'" if 'Select' not in m.group(1) else m.group(0),
    content,
    count=1
)

# Add states
state_code = """
  const [isImportModalVisible, setIsImportModalVisible] = useState(false)
  const [importForm] = Form.useForm()
  const [importSubmitting, setImportSubmitting] = useState(false)
"""
content = re.sub(
    r"(const \[editSubmitting, setEditSubmitting\] = useState\(false\))",
    r"\1\n" + state_code,
    content,
    count=1
)

# Add handlers
handler_code = """
  const handleExportData = async () => {
    try {
      const res = await api.get('/ai_agents/knowledge/export_data/')
      const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(res.data, null, 2))
      const downloadAnchorNode = document.createElement('a')
      downloadAnchorNode.setAttribute("href", dataStr)
      downloadAnchorNode.setAttribute("download", "ai_knowledge_export.json")
      document.body.appendChild(downloadAnchorNode)
      downloadAnchorNode.click()
      downloadAnchorNode.remove()
      message.success('Ðã xu?t d? li?u thành công')
    } catch (err) {
      message.error('L?i khi xu?t d? li?u')
    }
  }

  const handleImportSubmit = async (values) => {
    setImportSubmitting(true)
    try {
      const file = values.file[0].originFileObj
      const reader = new FileReader()
      reader.onload = async (e) => {
        try {
          const documents = JSON.parse(e.target.result)
          const payload = {
            agent_id: values.agent_id,
            documents: documents
          }
          await api.post('/ai_agents/knowledge/import_data/', payload)
          message.success('Ðã nh?p d? li?u thành công')
          setIsImportModalVisible(false)
          importForm.resetFields()
          fetchData()
        } catch (err) {
          message.error('File không dúng d?nh d?ng JSON ho?c có l?i x?y ra')
        }
      }
      reader.readAsText(file)
    } catch (err) {
      message.error('L?i khi d?c file')
    } finally {
      setImportSubmitting(false)
    }
  }
"""
content = re.sub(
    r"(const handleSaveCompanySettings = async \(values\) => \{)",
    handler_code + "\n  \\1",
    content,
    count=1
)

# Replace Title
title_orig = r"<Title level=\{5\} style=\{\{ marginBottom: 16 \}\}>Kho tài li?u dã hu?n luy?n</Title>"
title_new = """<div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <Title level={5} style={{ margin: 0 }}>Kho tài li?u dã hu?n luy?n</Title>
            <Space>
              <Button icon={<DownloadOutlined />} onClick={handleExportData}>Xu?t d? li?u</Button>
              <Button icon={<UploadOutlined />} onClick={() => setIsImportModalVisible(true)}>Nh?p d? li?u</Button>
            </Space>
          </div>"""
content = content.replace(title_orig, title_new)

# Add Import Modal
modal_code = """
      <Modal
        title="Nh?p Kho tri th?c t? File JSON"
        open={isImportModalVisible}
        onCancel={() => {
          setIsImportModalVisible(false)
          importForm.resetFields()
        }}
        footer={null}
      >
        <Form form={importForm} layout="vertical" onFinish={handleImportSubmit}>
          <Form.Item
            name="agent_id"
            label="Ch?n Tr? lý AI dích"
            rules={[{ required: true, message: 'Vui lòng ch?n Tr? lý AI' }]}
          >
            <Select placeholder="Ch?n m?t Tr? lý AI d? n?p tài li?u vào">
              {agents.map(a => (
                <Select.Option key={a.id} value={a.id}>{a.name}</Select.Option>
              ))}
            </Select>
          </Form.Item>
          
          <Form.Item
            name="file"
            label="File JSON"
            valuePropName="fileList"
            getValueFromEvent={e => {
              if (Array.isArray(e)) return e;
              return e?.fileList;
            }}
            rules={[{ required: true, message: 'Vui lòng ch?n file JSON d? nh?p' }]}
          >
            <Upload beforeUpload={() => false} maxCount={1} accept=".json">
              <Button icon={<UploadOutlined />}>Ch?n File</Button>
            </Upload>
          </Form.Item>
          
          <Form.Item>
            <Button type="primary" htmlType="submit" loading={importSubmitting} block>
              B?t d?u Nh?p
            </Button>
          </Form.Item>
        </Form>
      </Modal>
"""
content = re.sub(
    r"(<Modal\s+title=\"D?y thêm ki?n th?c cho AI\")",
    modal_code + "\n      \\1",
    content,
    count=1
)

with open('frontend/src/pages/settings/AiKnowledgeBase.jsx', 'w', encoding='utf-8') as f:
    f.write(content)
