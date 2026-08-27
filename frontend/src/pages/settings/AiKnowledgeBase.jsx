import { useState, useEffect, useMemo } from 'react'
import { Card, Table, Button, Space, Typography, Tag, Modal, Form, Input, Upload, message, Radio, Divider, Spin, Collapse, Alert, Checkbox, Segmented, Row, Col, List, Select } from 'antd'
import { PlusOutlined, UploadOutlined, RobotOutlined, BookOutlined, EyeOutlined, EditOutlined, SyncOutlined, DeleteOutlined, BulbOutlined, MinusCircleOutlined, QuestionCircleOutlined, DownloadOutlined, ScissorOutlined } from '@ant-design/icons'
import api from '../../utils/api'
import { useAuth } from '../../contexts/AuthContext'
import { useResponsive } from '../../hooks/useResponsive'

const { Title, Text } = Typography

export default function AiKnowledgeBase() {
  const { maintenanceMode, hasPermission } = useAuth()
  const { isMobile } = useResponsive()
  const [agents, setAgents] = useState([])
  const [documents, setDocuments] = useState([])
  const [loading, setLoading] = useState(false)
  
  const [isModalVisible, setIsModalVisible] = useState(false)
  const [form] = Form.useForm()
  const [settingsForm] = Form.useForm()
  const [fileList, setFileList] = useState([])
  const [imageDetails, setImageDetails] = useState({})
  const [selectedImageIds, setSelectedImageIds] = useState([])
  const [bulkInput, setBulkInput] = useState({ title: '', content: '' })
  const [submitting, setSubmitting] = useState(false)
  const [manualSyncing, setManualSyncing] = useState(false)
  const [companySettings, setCompanySettings] = useState(null)
  const [settingsLoading, setSettingsLoading] = useState(false)
  
  const [isViewModalVisible, setIsViewModalVisible] = useState(false)
  const [isEditModalVisible, setIsEditModalVisible] = useState(false)
  const [currentDoc, setCurrentDoc] = useState(null)
  const [editForm] = Form.useForm()
  const [editSubmitting, setEditSubmitting] = useState(false)
  const [splittingIndex, setSplittingIndex] = useState(null)

  // Hàm tách nội dung một cặp Hỏi-Đáp đang chứa nhiều cặp chất chồng thành nhiều entry riêng
  const splitQAItem = (name, index, add, remove) => {
    const qaList = editForm.getFieldValue('qa_list');
    const currentItem = qaList[name];
    const combinedText = [currentItem.question, currentItem.answer].filter(Boolean).join('\n');

    // Tất cả các pattern nhận dạng ĐẦU CÂU HỎI
    // Hỗ trợ: Q:, Hỏi:, Câu hỏi:, Khách hàng:, Khách:, KH:, Question:
    const questionLineRegex = /^(?:Q|Question|Hỏi|Câu hỏi|Khách hàng|Khách|KH)\s*[:.]\s*/i;

    // Tất cả các pattern nhận dạng ĐẦU CÂU TRẢ LỜI
    // Hỗ trợ: A:, Answer:, Đáp:, Trả lời:, TL:, Bot:, AI:, Shop:, CSKH:, Sale:
    const answerLineRegex = /^(?:A|Answer|Đáp|Trả lời|TL|Bot|AI|Shop|CSKH|Sale|Nhân viên)\s*[:.]\s*/i;

    // Tách đoạn theo điểm bắt đầu câu hỏi mới (dùng multiline)
    const splitRegex = /(?=^(?:Q|Question|Hỏi|Câu hỏi|Khách hàng|Khách|KH)\s*[:.]\s*)/im;

    const segments = combinedText.split(splitRegex).map(s => s.trim()).filter(Boolean);

    if (segments.length <= 1) {
      message.info('Không phát hiện được nhiều cặp Hỏi-Đáp để tách. Hệ thống nhận dạng các định dạng: Q:, A:, Hỏi:, Đáp:, Khách hàng:, Trả lời:...');
      return;
    }

    const newPairs = segments.map(seg => {
      const lines = seg.split('\n').map(l => l.trim()).filter(Boolean);
      let question = '';
      let answerLines = [];
      let inAnswer = false;
      for (const line of lines) {
        if (questionLineRegex.test(line)) {
          question = line.replace(questionLineRegex, '').trim();
          inAnswer = false;
        } else if (answerLineRegex.test(line)) {
          answerLines.push(line.replace(answerLineRegex, '').trim());
          inAnswer = true;
        } else if (inAnswer) {
          answerLines.push(line);
        } else if (!question) {
          question = line;
        } else {
          answerLines.push(line);
        }
      }
      return { question: question || seg, answer: answerLines.join('\n'), images: [] };
    }).filter(p => p.question || p.answer);

    if (newPairs.length <= 1) {
      message.info('Không phát hiện được nhiều cặp Hỏi-Đáp để tách.');
      return;
    }

    // Xóa cái cũ, thêm các cặp mới vào đúng vị trí
    remove(name);
    for (let i = newPairs.length - 1; i >= 0; i--) {
      add(newPairs[i], index);
    }
    message.success(`Đã tách thành ${newPairs.length} cặp Hỏi-Đáp riêng biệt.`);
  };
  
  const [isImportModalVisible, setIsImportModalVisible] = useState(false)
  const [importForm] = Form.useForm()
  const [importSubmitting, setImportSubmitting] = useState(false)
  
  const docType = Form.useWatch('doc_type', form)

  const fetchData = async (showLoading = true) => {
    if (showLoading) setLoading(true)
    try {
      const [agentsRes, docsRes, settingsRes] = await Promise.all([
        api.get('/ai_agents/agents/'),
        api.get('/ai_agents/knowledge/'),
        api.get('/ai_agents/settings/mine/')
      ])
      setAgents(agentsRes.data.results || agentsRes.data)
      setDocuments(docsRes.data.results || docsRes.data)
      setCompanySettings(settingsRes.data)
      settingsForm.setFieldsValue(settingsRes.data)
    } catch (err) {
      if (showLoading) message.error('Lỗi khi tải dữ liệu Tri thức')
    } finally {
      if (showLoading) setLoading(false)
    }
  }

  const handleExportData = async () => {
    try {
      const res = await api.get('/ai_agents/knowledge/export_data/')
      const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(res.data, null, 2))
      const downloadAnchorNode = document.createElement('a')
      downloadAnchorNode.setAttribute("href", dataStr)
      downloadAnchorNode.setAttribute("download", "ai_knowledge_export.json")
      document.body.appendChild(downloadAnchorNode) // required for firefox
      downloadAnchorNode.click()
      downloadAnchorNode.remove()
      message.success('Đã xuất dữ liệu thành công')
    } catch (err) {
      message.error('Lỗi khi xuất dữ liệu')
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
          message.success('Đã nhập dữ liệu thành công')
          setIsImportModalVisible(false)
          importForm.resetFields()
          fetchData()
        } catch (err) {
          message.error('File không đúng định dạng JSON hoặc có lỗi xảy ra')
        }
      }
      reader.readAsText(file)
    } catch (err) {
      message.error('Lỗi khi đọc file')
    } finally {
      setImportSubmitting(false)
    }
  }

  const handleSaveCompanySettings = async (values) => {
    setSettingsLoading(true)
    try {
      await api.put('ai_agents/settings/mine/', values)
      message.success('Đã lưu cấu hình Hệ thống Đọc')
      fetchData()
    } catch (error) {
      console.error(error)
      message.error(error.response?.data?.detail || 'Lỗi khi lưu cấu hình')
    } finally {
      setSettingsLoading(false)
    }
  }

  const handleManualSyncProducts = async () => {
    if (maintenanceMode) {
      message.warning('⚠️ Hệ thống đang bảo trì dữ liệu. Chức năng này tạm thời bị khóa!')
      return
    }
    setManualSyncing(true)
    try {
      const res = await api.post('ai_agents/settings/manual_sync_products/')
      message.success(res.data.status || 'Đã gửi yêu cầu đồng bộ danh sách sản phẩm thành công')
      fetchData()
      
      // Bắt đầu poll trạng thái file
      const checkInterval = setInterval(async () => {
         try {
            const fetchRes = await api.get('ai_agents/knowledge/')
            const docs = fetchRes.data.results || fetchRes.data
            const targetDoc = docs.find(d => d.title === 'Danh mục Sản phẩm Hệ thống (Auto)')
            if (targetDoc && targetDoc.status !== 'pending') {
                clearInterval(checkInterval)
                setManualSyncing(false)
                setDocuments(docs)
                message.success('Tiến trình đồng bộ dữ liệu đã hoàn tất!')
            }
         } catch (e) {
            clearInterval(checkInterval)
            setManualSyncing(false)
         }
      }, 3000)
    } catch (err) {
      message.error('Lỗi khi yêu cầu đồng bộ Sản phẩm')
      setManualSyncing(false)
    }
  }

  useEffect(() => {
    fetchData()
  }, [])

  useEffect(() => {
    const hasPending = documents.some(doc => doc.status === 'pending' || doc.status === 'processing')
    let interval = null
    if (hasPending) {
      interval = setInterval(() => {
        fetchData(false)
      }, 3000)
    }
    return () => clearInterval(interval)
  }, [documents])

  const handleDelete = (record) => {
    if (maintenanceMode) {
      message.warning('⚠️ Hệ thống đang bảo trì dữ liệu. Chức năng này tạm thời bị khóa!')
      return
    }
    Modal.confirm({
      title: 'Xác nhận xóa tài liệu?',
      content: `Bạn có chắc chắn muốn xóa tài liệu "${record.title || 'này'}"? Trợ lý AI sẽ mất đi kiến thức này vĩnh viễn.`,
      okText: 'Xóa ngay',
      okType: 'danger',
      cancelText: 'Hủy bỏ',
      onOk: async () => {
        try {
          await api.delete(`/ai_agents/knowledge/${record.id}/`)
          message.success('Đã xóa tài liệu')
          fetchData()
        } catch (err) {
          message.error('Lỗi khi xóa tài liệu')
        }
      }
    })
  }

  const handleRetry = async (id) => {
    try {
      await api.post(`/ai_agents/knowledge/${id}/retry/`)
      message.success('Đã gửi yêu cầu học lại')
      fetchData()
    } catch (err) {
      message.error('Lỗi khi yêu cầu học lại')
    }
  }

  const handleView = async (record) => {
    if (record.doc_type === 'file' && record.file_attachment) {
      const rawUrl = record.file_attachment
      
      // Sửa lỗi tải xuống: Đảm bảo URL luôn cùng domain với Frontend 
      // (để tránh lỗi Mixed Content hoặc Cross-Origin block fetch)
      let safePath = rawUrl
      if (rawUrl.startsWith('http')) {
        try {
          safePath = new URL(rawUrl).pathname
        } catch (e) {}
      }
      const absoluteUrl = `${window.location.origin}${safePath}`
      
      const ext = absoluteUrl.split('.').pop().toLowerCase()
      const fileName = record.title + '.' + ext

      // Hàm tải file dùng fetch+blob → vượt qua giới hạn cross-origin download
      const handleDownload = async () => {
        try {
          message.loading({ content: 'Đang chuẩn bị tải file...', key: 'dl' })
          // Bỏ header Authorization vì Nginx có thể chặn khi request file tĩnh (/media/)
          const response = await fetch(absoluteUrl)
          if (!response.ok) throw new Error('Network error')
          const blob = await response.blob()
          const blobUrl = window.URL.createObjectURL(blob)
          const link = document.createElement('a')
          link.href = blobUrl
          link.download = fileName
          document.body.appendChild(link)
          link.click()
          document.body.removeChild(link)
          window.URL.revokeObjectURL(blobUrl)
          message.success({ content: 'Tải file thành công!', key: 'dl' })
        } catch (e) {
          message.destroy('dl')
          // Nếu fetch thất bại (CORS/Network), fallback mở URL trực tiếp để tải
          window.open(absoluteUrl, '_blank')
        }
      }

      // Dùng Google Docs Viewer cho cả PDF vì nó ổn định hơn native <object> (đặc biệt trên mobile)
      const isGoogleViewerSupported = ['doc', 'docx', 'xlsx', 'xls', 'ppt', 'pptx', 'pdf'].includes(ext)

      Modal.info({
        title: `📄 ${record.title}`,
        content: (
          <div>
            <div style={{ marginBottom: 12 }}>
              <Button
                size="small"
                icon={<DownloadOutlined />}
                onClick={handleDownload}
              >
                Tải file gốc xuống
              </Button>
            </div>
            
            {isGoogleViewerSupported && (
              <iframe
                src={`https://docs.google.com/viewer?url=${encodeURIComponent(absoluteUrl)}&embedded=true`}
                style={{ width: '100%', height: '70vh', border: 'none', marginTop: 8, borderRadius: 8 }}
                title={record.title}
              />
            )}

            {!isGoogleViewerSupported && (
              <div
                style={{
                  whiteSpace: 'pre-wrap',
                  maxHeight: '65vh',
                  overflowY: 'auto',
                  background: '#f9f9f9',
                  padding: '12px 16px',
                  borderRadius: 8,
                  border: '1px solid #e0e0e0',
                  fontSize: 13,
                  lineHeight: 1.7,
                  fontFamily: 'monospace',
                }}
              >
                {record.content || <span style={{ color: '#aaa', fontStyle: 'italic' }}>Không thể hiển thị định dạng này trực tiếp. Vui lòng tải file xuống.</span>}
              </div>
            )}
          </div>
        ),
        width: '80vw',
        okText: 'Đóng',
        icon: null,
      })
    } else {
      setCurrentDoc(record)
      setIsViewModalVisible(true)
    }
  }

  const handleEdit = (record) => {
    setCurrentDoc(record)
    
    let qa_list = [];
    if (record.doc_type === 'qa') {
      let text = record.content || '';
      text = text.replace(/\n\nKhách hàng:\s*/g, '\n\nHỏi: ')
                 .replace(/^Khách hàng:\s*/, 'Hỏi: ')
                 .replace(/\nNhân viên:\s*/g, '\nĐáp: ')
                 .replace(/\n\nKhách:\s*/g, '\n\nHỏi: ')
                 .replace(/^Khách:\s*/, 'Hỏi: ')
                 .replace(/\nSale:\s*/g, '\nĐáp: ');
      const blocks = text.split('\n\nHỏi: ').filter(Boolean);
      qa_list = blocks.map((block, index) => {
        let raw = block;
        if (index === 0 && raw.startsWith('Hỏi: ')) {
          raw = raw.substring(5);
        }
        const parts = raw.split('\nĐáp: ');
        if (parts.length >= 2) {
          let answerRaw = parts.slice(1).join('\nĐáp: ');
          
          const imgRegex = /!\[.*?\]\((.*?)\)/g;
          const images = [];
          let match;
          while ((match = imgRegex.exec(answerRaw)) !== null) {
            images.push({
              uid: Math.random().toString(36).substring(7),
              name: 'image.jpg',
              status: 'done',
              url: match[1],
              isExisting: true
            });
          }
          
          const cleanAnswer = answerRaw.replace(/!\[.*?\]\((.*?)\)/g, '').trim();

          return {
            question: parts[0],
            answer: cleanAnswer,
            images: images
          }
        }
        return { question: '', answer: raw, images: [] }
      });
    }

    editForm.setFieldsValue({
      title: record.title,
      agent: record.agent,
      content: record.content,
      qa_list: qa_list.length > 0 ? qa_list : [{ question: '', answer: '' }]
    })
    setIsEditModalVisible(true)
  }

  const handleSaveEdit = async (values) => {
    setEditSubmitting(true)
    try {
      if (currentDoc.doc_type === 'qa' && values.qa_list) {
        let uploadedQaList = [];
        for (const qa of (values.qa_list || [])) {
          let answerText = qa.answer || '';
          if (qa.images && qa.images.length > 0) {
            for (const fileItem of qa.images) {
              if (fileItem.isExisting && fileItem.url) {
                answerText += `\n\n![${fileItem.name || 'image'}](${fileItem.url})`;
              } else {
                const file = fileItem.originFileObj;
                if (file) {
                  const uploadFormData = new FormData();
                  uploadFormData.append('file', file);
                  try {
                    const uploadRes = await api.postForm('core/upload/', uploadFormData);
                    if (uploadRes.data?.url) answerText += `\n\n![${file.name}](${uploadRes.data.url})`;
                  } catch (err) {
                    console.error("Lỗi khi tải ảnh:", err);
                    message.error(`Không thể tải lên ảnh: ${file.name}`);
                  }
                }
              }
            }
          }
          uploadedQaList.push({ question: qa.question || '', answer: answerText });
        }

        // Luôn gộp tất cả cặp Q&A vào content của CÙNG 1 tài liệu
        const content = uploadedQaList
          .filter(qa => qa.question || qa.answer)
          .map(qa => `Hỏi: ${qa.question}\nĐáp: ${qa.answer}`)
          .join('\n\n') || '';
        const payload = { ...values, content };
        delete payload.qa_list;

        if (currentDoc.isGroup) {
          await Promise.all(currentDoc.children.map(c => api.patch(`/ai_agents/knowledge/${c.id}/`, payload)))
        } else {
          await api.patch(`/ai_agents/knowledge/${currentDoc.id}/`, payload)
        }
      } else {
        const payload = { ...values };
        delete payload.qa_list;
        if (currentDoc.isGroup) {
          await Promise.all(currentDoc.children.map(c => api.patch(`/ai_agents/knowledge/${c.id}/`, payload)))
        } else {
          await api.patch(`/ai_agents/knowledge/${currentDoc.id}/`, payload)
        }
      }

      message.success('Đã lưu thành công!')
      setIsEditModalVisible(false)
      fetchData()
    } catch (err) {
      console.error(err)
      message.error('Lỗi khi lưu: ' + (err?.response?.data?.detail || err.message || ''))
    } finally {
      setEditSubmitting(false)
    }
  }

  const handleFinish = async (values) => {
    setSubmitting(true)
    try {
      if (docType === 'image' && fileList.length > 0) {
        const promises = fileList.map(file => {
          const details = imageDetails[file.uid] || {}
          if (!details.title) {
            throw new Error(`Vui lòng nhập tên/tiêu đề cho ảnh: ${file.name}`)
          }
          const formData = new FormData()
          formData.append('title', details.title)
          formData.append('agent', values.agent)
          formData.append('doc_type', 'image')
          formData.append('file_attachment', file.originFileObj || file)
          if (details.content) {
            formData.append('content', details.content)
          }
          return api.postForm('/ai_agents/knowledge/', formData)
        })
        await Promise.all(promises)
      } else if (docType === 'file' && fileList.length > 0) {
        const promises = fileList.map(file => {
          const formData = new FormData()
          const finalTitle = fileList.length > 1 ? `${values.title} - ${file.name}` : values.title
          formData.append('title', finalTitle)
          formData.append('agent', values.agent)
          formData.append('doc_type', 'file')
          formData.append('file_attachment', file.originFileObj || file)
          return api.postForm('/ai_agents/knowledge/', formData)
        })
        await Promise.all(promises)
      } else if (values.doc_type === 'qa') {
        let uploadedQaList = [];
        
        for (const qa of (values.qa_list || [])) {
          let answerText = qa.answer || '';
          
          if (qa.images && qa.images.length > 0) {
            for (const fileItem of qa.images) {
              const file = fileItem.originFileObj;
              if (file) {
                const uploadFormData = new FormData();
                uploadFormData.append('file', file);
                try {
                  const uploadRes = await api.postForm('core/upload/', uploadFormData);
                  if (uploadRes.data?.url) {
                    answerText += `\n\n![${file.name}](${uploadRes.data.url})`;
                  }
                } catch (err) {
                  console.error("Lỗi khi tải ảnh Hỏi-Đáp:", err);
                  message.error(`Không thể tải lên ảnh: ${file.name}`);
                }
              }
            }
          }
          uploadedQaList.push({ question: qa.question, answer: answerText });
        }

        const formData = new FormData()
        formData.append('title', values.title)
        formData.append('agent', values.agent)
        formData.append('doc_type', values.doc_type)
        const qaContent = uploadedQaList.map(qa => `Hỏi: ${qa.question}\nĐáp: ${qa.answer}`).join('\n\n') || ''
        formData.append('content', qaContent)
        await api.postForm('/ai_agents/knowledge/', formData)
      } else {
        message.warning('Vui lòng chọn file tải lên')
        setSubmitting(false)
        return
      }
      
      message.success('Đã thêm tài liệu, hệ thống đang tiến hành học (Mã hóa Vector ngầm)')
      setIsModalVisible(false)
      form.resetFields()
      setFileList([])
      fetchData()
    } catch (err) {
      message.error(err.response?.data?.error || 'Lỗi khi lưu tài liệu')
    } finally {
      setSubmitting(false)
    }
  }

  const columns = [
    {
      title: 'Tiêu đề tài liệu',
      dataIndex: 'title',
      key: 'title',
      align: 'left',
      render: (text, record) => {
        if (record.doc_type === 'image') {
          if (record.isGroup) {
            return (
              <Space direction="vertical" size={2}>
                <Text strong>{text} <Tag color="blue">{record.children.length} ảnh</Tag></Text>
                <Space wrap style={{ marginTop: 4 }}>
                  {record.children.map(child => (
                    <div key={child.id} style={{ width: 40, height: 40, borderRadius: 4, overflow: 'hidden', border: '1px solid #d9d9d9' }}>
                      <img src={child.file_attachment} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    </div>
                  ))}
                </Space>
              </Space>
            )
          } else {
            return (
              <Space>
                <div style={{ width: 32, height: 32, borderRadius: 4, overflow: 'hidden', border: '1px solid #d9d9d9' }}>
                  <img src={record.file_attachment} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                </div>
                <Text strong>{text}</Text>
              </Space>
            )
          }
        }
        
        let icon = <RobotOutlined style={{color: '#52c41a'}}/>
        if (record.doc_type === 'file') icon = <BookOutlined style={{color: '#1890ff'}} />
        return (
          <Space>
            {icon}
            <Text strong>{text}</Text>
          </Space>
        )
      }
    },
    {
      title: 'Trợ lý AI',
      dataIndex: 'agent',
      key: 'agent',
      filters: agents.map(a => ({ text: a.name, value: a.id })),
      onFilter: (value, record) => record.agent === value,
      render: (agentId) => {
        const agent = agents.find(a => a.id === agentId)
        return <Tag color="blue">{agent ? agent.name : 'Unknown'}</Tag>
      }
    },
    {
      title: 'Loại',
      dataIndex: 'doc_type',
      key: 'doc_type',
      render: (type) => {
        if (type === 'file') return 'File PDF/Word'
        if (type === 'image') return 'Hình ảnh Mẫu'
        return 'Hỏi & Đáp'
      }
    },
    {
      title: 'Trạng thái học',
      dataIndex: 'status',
      key: 'status',
      filters: [
        { text: 'Đã học xong', value: 'completed' },
        { text: 'Chờ xử lý', value: 'pending' },
        { text: 'Đang học', value: 'processing' },
        { text: 'Lỗi', value: 'failed' }
      ],
      onFilter: (value, record) => record.status === value,
      render: (status, record) => {
        let finalStatus = status
        let errorMsg = record.error_message || ''
        
        if (record.isGroup) {
          const statuses = record.children.map(c => c.status)
          if (statuses.includes('failed')) finalStatus = 'failed'
          else if (statuses.includes('processing')) finalStatus = 'processing'
          else if (statuses.includes('pending')) finalStatus = 'pending'
          else finalStatus = 'completed'
          
          if (finalStatus === 'failed') {
            const failedChild = record.children.find(c => c.status === 'failed' && c.error_message)
            if (failedChild) errorMsg = failedChild.error_message
          }
        }

        let color = 'default'
        let text = finalStatus
        if (finalStatus === 'pending') { color = 'default'; text = 'Chờ xử lý' }
        else if (finalStatus === 'processing') { color = 'processing'; text = 'Đang học (Embedding)...' }
        else if (finalStatus === 'completed') { color = 'success'; text = 'Đã học xong' }
        else if (finalStatus === 'failed') { color = 'error'; text = 'Lỗi' }
        
        if (errorMsg) {
          if (errorMsg.includes('401')) errorMsg = 'Lỗi 401: Chìa khóa API (API Key) không hợp lệ hoặc bị từ chối.'
          else if (errorMsg.includes('429')) errorMsg = 'Lỗi 429: Tài khoản AI đã hết tiền (Quota) hoặc gửi quá nhanh.'
          else if (errorMsg.includes('503')) errorMsg = 'Lỗi 503: Máy chủ AI quá tải (Thường gặp ở tài khoản Free). Vui lòng thử lại.'
          else if (errorMsg.includes('500')) errorMsg = 'Lỗi 500: Máy chủ OpenAI đang gặp sự cố.'
        }
        
        return (
          <Space direction="vertical" size={0}>
            <Tag color={color}>{text}</Tag>
            {finalStatus === 'failed' && <Text type="danger" style={{fontSize: 12}}>{errorMsg}</Text>}
          </Space>
        )
      }
    },
    {
      title: 'Nền tảng đọc',
      dataIndex: 'embedding_provider',
      key: 'embedding_provider',
      filters: [
        { text: 'OpenAI', value: 'openai' },
        { text: 'Google Gemini', value: 'gemini' }
      ],
      onFilter: (value, record) => record.embedding_provider === value,
      render: (provider) => (
        <Tag color={provider === 'gemini' ? 'purple' : 'geekblue'}>
          {provider === 'gemini' ? 'Google Gemini' : 'OpenAI'}
        </Tag>
      )
    },
    {
      title: 'Thao tác',
      key: 'action',
      render: (_, record) => {
        if (record.isGroup) {
          const statuses = record.children.map(c => c.status)
          const canRetry = statuses.includes('failed') || statuses.includes('completed')
          return (
            <Space>
              <Button type="text" icon={<EyeOutlined />} onClick={() => {
                setCurrentDoc(record)
                setIsViewModalVisible(true)
              }} />
              <Button type="text" icon={<EditOutlined />} onClick={() => handleEdit(record)} />
              {canRetry && (
                <Button type="text" style={{ color: '#faad14' }} icon={<SyncOutlined />} onClick={async () => {
                  try {
                    await Promise.all(record.children.map(c => api.post(`/ai_agents/knowledge/${c.id}/retry/`)))
                    message.success(`Đã gửi yêu cầu học lại cho ${record.children.length} ảnh`)
                    fetchData()
                  } catch (e) {
                    message.error('Lỗi khi thử lại')
                  }
                }} />
              )}
              <Button type="text" danger icon={<DeleteOutlined />} onClick={() => {
                Modal.confirm({
                  title: `Xóa ${record.children.length} tài liệu này?`,
                  onOk: async () => {
                    await Promise.all(record.children.map(c => api.delete(`/ai_agents/knowledge/${c.id}/`)))
                    fetchData()
                  }
                })
              }} />
            </Space>
          )
        }
        return (
          <Space size="small">
            <Button type="text" icon={<EyeOutlined />} onClick={() => handleView(record)} />
            <Button type="text" icon={<EditOutlined />} onClick={() => handleEdit(record)} />
            <Button type="text" style={{ color: '#faad14' }} icon={<SyncOutlined />} onClick={() => handleRetry(record.id)} />
            <Button danger type="text" icon={<DeleteOutlined />} onClick={() => handleDelete(record)} />
          </Space>
        )
      }
    }
  ]

  const groupedDocuments = useMemo(() => {
    const groups = {}
    const result = []
    documents.forEach(doc => {
      if (doc.doc_type === 'image' && doc.title) {
        const key = `${doc.title}_${doc.agent}` // Group by title and agent
        if (!groups[key]) {
          groups[key] = { ...doc, id: `group_${key}`, isGroup: true, children: [] }
          result.push(groups[key])
        }
        groups[key].children.push(doc)
      } else {
        result.push(doc)
      }
    })
    return result
  }, [documents])

  return (
    <div>
        <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', justifyContent: 'space-between', alignItems: isMobile ? 'flex-start' : 'center', marginBottom: 24, gap: isMobile ? 16 : 0 }}>
          <div>
            <Title level={isMobile ? 5 : 4} style={{ margin: 0, whiteSpace: 'normal', wordBreak: 'break-word' }}>Huấn luyện Trợ lý AI (RAG)</Title>
            <Text type="secondary" style={{ display: 'block' }}>Quản lý kho tri thức, tài liệu bán hàng để AI học và trả lời khách</Text>
          </div>
          <Space direction={isMobile ? 'vertical' : 'horizontal'} style={{ width: isMobile ? '100%' : 'auto' }}>
            <Button icon={<RobotOutlined />} onClick={() => fetchData()} block={isMobile}>Làm mới trạng thái</Button>
            <Button type="primary" icon={<PlusOutlined />} block={isMobile} onClick={() => {
          if (maintenanceMode) {
            message.warning('⚠️ Hệ thống đang bảo trì dữ liệu. Chức năng này tạm thời bị khóa!')
            return
          }
          setIsModalVisible(true)
        }}>
              Dạy thêm kiến thức
            </Button>
          </Space>
        </div>

        <Collapse 
          style={{ marginBottom: 24, borderRadius: 12, border: '1px solid #1677ff40' }}
          items={[
            {
              key: '1',
              label: <Text strong style={{ color: '#1677ff' }}><BulbOutlined style={{ marginRight: 8 }}/> Bí kíp Huấn luyện Trợ lý AI & Chuẩn bị tài liệu</Text>,
              children: (
                <div style={{ lineHeight: '1.8' }}>
                  <Alert 
                    type="warning" 
                    showIcon 
                    message="Lưu ý cực kỳ quan trọng: Đồng nhất Nền tảng đọc (Embedding Model)" 
                    description="Các nền tảng (OpenAI, Gemini) sử dụng ngôn ngữ số hóa (vector) hoàn toàn khác nhau. Nếu bạn dùng Hệ thống đọc là OpenAI, Trợ lý AI sẽ KHÔNG THỂ tìm kiếm và đọc hiểu được những tài liệu đã được tải lên trước đó bằng mô hình Gemini. Lời khuyên: Hãy chốt sử dụng duy nhất 1 nền tảng đọc ngay từ đầu để tránh lỗi tìm kiếm!"
                    style={{ marginBottom: 16 }}
                  />
                  <Title level={5}>Thứ tự ưu tiên các loại tài liệu nên nạp cho AI (Từ hiệu quả cao nhất):</Title>
                  <ul>
                    <li><b>1. Hỏi & Đáp (Q&A) thực tế:</b> AI học nhanh và khôn nhất. Nên nạp các kịch bản từ chối, FAQ kèm theo câu trả lời mẫu chuẩn mực nhất của công ty.</li>
                    <li><b>2. Thông số sản phẩm & Bảng giá:</b> File Word/PDF chứa Bảng báo giá chi tiết, Specs sản phẩm (Nên trình bày dạng Bảng hoặc gạch đầu dòng rõ ràng).</li>
                    <li><b>3. Chính sách & Quy trình:</b> Chính sách bảo hành, đổi trả, quy định giao hàng, thời gian làm việc để AI không bao giờ tư vấn sai luật.</li>
                    <li><b>4. Kịch bản chốt Sale:</b> Cách xin số điện thoại, cách up-sell để AI học được "Giọng điệu" chuyên nghiệp của doanh nghiệp.</li>
                  </ul>
                  <Title level={5} style={{ marginTop: 12 }}>3 Bí kíp soạn thảo tài liệu (File PDF/Word):</Title>
                  <ul>
                    <li><Text strong type="danger">1. Không dùng file toàn Hình ảnh:</Text> AI hiện tại chỉ đọc hiểu chữ (Text), không đọc được chữ nằm trong ảnh chụp. Hãy đảm bảo File của bạn có thể bôi đen và copy chữ được.</li>
                    <li><Text strong>2. Tách nhỏ thay vì gộp chung:</Text> Đừng nén mọi thứ vào 1 file PDF 500 trang. Hãy chia nhỏ thành nhiều file chuyên đề (VD: Bảng giá Tủ lạnh, Chính sách bảo hành). Trợ lý AI sẽ lục tìm cực kỳ chính xác.</li>
                    <li><Text strong>3. Cấu trúc rõ ràng mạch lạc:</Text> Hãy dùng các Heading (Tiêu đề), Gạch đầu dòng để phân chia nội dung. File càng gọn gàng, AI càng thông minh.</li>
                  </ul>
                </div>
              )
            }
          ]}
        />

          <Collapse 
            style={{ marginBottom: 24, borderRadius: 12, backgroundColor: '#fff' }}
            expandIconPosition="end"
            bordered={false}
          >
            <Collapse.Panel 
              header={<Title level={5} style={{ margin: 0 }}><BookOutlined style={{color: '#1677ff'}} /> Hệ thống Đọc Dữ liệu (Embedding Model)</Title>}
              key="embedding_settings"
              style={{ border: 'none' }}
            >
          <Spin spinning={settingsLoading}>
            <Form form={settingsForm} layout='vertical' onFinish={handleSaveCompanySettings}>
              <Text type='secondary' style={{ display: 'block', marginBottom: 12, lineHeight: '1.6' }}>
                Nền tảng được sử dụng để đọc và băm tài liệu. <b>Lưu ý:</b> Nếu thay đổi nền tảng, toàn bộ tài liệu đã đọc bằng hệ thống cũ sẽ không thể tìm kiếm được, bạn cần xóa tài liệu cũ và tải lại.
              </Text>
              
              <Form.Item name='default_embedding_provider' style={{ marginBottom: 16 }}>
                <Radio.Group style={{ width: '100%' }}>
                  <Space direction="vertical" style={{ width: '100%' }}>
                    <Radio value="openai">OpenAI (1536 chiều - Đề xuất, nhanh và rẻ nhất)</Radio>
                    <Radio value="gemini">Google Gemini (768 chiều)</Radio>
                  </Space>
                </Radio.Group>
              </Form.Item>
              
              <Form.Item name='auto_sync_products' valuePropName='checked' style={{ marginBottom: 0 }}>
                <Checkbox>
                  <Text strong>Tự động đồng bộ Sản phẩm làm Tri thức RAG</Text>
                </Checkbox>
              </Form.Item>
              <div style={{ paddingLeft: 24, marginBottom: 16, marginTop: 4 }}>
                <Text type='secondary' style={{ fontSize: 13, display: 'block', marginBottom: 8 }}>Khi bật, phần mềm tự động lấy tên, giá và mô tả của tất cả Sản phẩm & Dịch vụ đưa vào Trí nhớ AI.</Text>
                <Button size="small" icon={<SyncOutlined />} onClick={handleManualSyncProducts} loading={manualSyncing}>
                  Đồng bộ thủ công ngay
                </Button>
              </div>

              <Form.Item name='enable_chat_extraction' valuePropName='checked' style={{ marginBottom: 0 }}>
                <Checkbox>
                  <Text strong>Cho phép Đóng gói Hội thoại (RAG)</Text>
                </Checkbox>
              </Form.Item>
              <div style={{ paddingLeft: 24, marginBottom: 16, marginTop: 4 }}>
                <Text type='secondary' style={{ fontSize: 13 }}>Hiển thị nút Đóng gói Hội thoại (tia sét) trong khung chat để lưu các ca tư vấn khó thành Cẩm nang xử lý từ chối cho AI.</Text>
              </div>

              <div style={{ textAlign: 'left' }}>
                <Button type='primary' htmlType='submit'>
                  Lưu Hệ Thống Đọc
                </Button>
              </div>
            </Form>
            </Spin>
            </Collapse.Panel>
          </Collapse>

        <Card bordered={false} style={{ borderRadius: 12 }} styles={{ body: { padding: isMobile ? '16px 12px' : 24 } }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <Title level={5} style={{ margin: 0 }}>Kho tài liệu đã huấn luyện</Title>
            <Space>
              <Button icon={<DownloadOutlined />} onClick={handleExportData}>Xuất dữ liệu</Button>
              <Button icon={<UploadOutlined />} onClick={() => setIsImportModalVisible(true)}>Nhập dữ liệu</Button>
            </Space>
          </div>
          {isMobile ? (
            <List
              dataSource={groupedDocuments}
              loading={loading}
              pagination={{ pageSize: 10, size: 'small' }}
              renderItem={(record) => {
                let finalStatus = record.status
                let errorMsg = record.error_message || ''
                if (record.isGroup) {
                  const statuses = record.children.map(c => c.status)
                  if (statuses.includes('failed')) finalStatus = 'failed'
                  else if (statuses.includes('processing')) finalStatus = 'processing'
                  else if (statuses.includes('pending')) finalStatus = 'pending'
                  else finalStatus = 'completed'
                  
                  if (finalStatus === 'failed') {
                    const failedChild = record.children.find(c => c.status === 'failed' && c.error_message)
                    if (failedChild) errorMsg = failedChild.error_message
                  }
                }

                let color = 'default'
                let textStatus = finalStatus
                if (finalStatus === 'pending') { color = 'default'; textStatus = 'Chờ xử lý' }
                else if (finalStatus === 'processing') { color = 'processing'; textStatus = 'Đang học (Embedding)...' }
                else if (finalStatus === 'completed') { color = 'success'; textStatus = 'Đã học xong' }
                else if (finalStatus === 'failed') { color = 'error'; textStatus = 'Lỗi' }
                
                if (errorMsg) {
                  if (errorMsg.includes('401')) errorMsg = 'Lỗi 401: Chìa khóa API không hợp lệ.'
                  else if (errorMsg.includes('429')) errorMsg = 'Lỗi 429: Hết tiền (Quota) hoặc quá tải.'
                  else if (errorMsg.includes('503')) errorMsg = 'Lỗi 503: Máy chủ quá tải.'
                  else if (errorMsg.includes('500')) errorMsg = 'Lỗi 500: Lỗi máy chủ.'
                }

                const agent = agents.find(a => a.id === record.agent)

                let titleContent = null
                if (record.doc_type === 'image') {
                  if (record.isGroup) {
                    titleContent = (
                      <div style={{ marginBottom: 12 }}>
                        <Text strong style={{ fontSize: 15, display: 'block', marginBottom: 4 }}>
                          {record.title} <Tag color="blue">{record.children.length} ảnh</Tag>
                        </Text>
                        <Space wrap size={4}>
                          {record.children.map(child => (
                            <div key={child.id} style={{ width: 40, height: 40, borderRadius: 4, overflow: 'hidden', border: '1px solid #d9d9d9' }}>
                              <img src={child.file_attachment} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                            </div>
                          ))}
                        </Space>
                      </div>
                    )
                  } else {
                    titleContent = (
                      <div style={{ marginBottom: 12, display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                        <div style={{ width: 32, height: 32, borderRadius: 4, overflow: 'hidden', border: '1px solid #d9d9d9', flexShrink: 0 }}>
                          <img src={record.file_attachment} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        </div>
                        <Text strong style={{ fontSize: 15 }}>{record.title}</Text>
                      </div>
                    )
                  }
                } else {
                  titleContent = (
                    <div style={{ marginBottom: 12 }}>
                      {record.doc_type === 'file' ? <BookOutlined style={{color: '#1890ff', marginRight: 8}} /> : <RobotOutlined style={{color: '#52c41a', marginRight: 8}}/>}
                      <Text strong style={{ fontSize: 15 }}>{record.title}</Text>
                    </div>
                  )
                }

                const canRetry = record.isGroup 
                  ? record.children.some(c => c.status === 'failed' || c.status === 'completed')
                  : true 

                let typeStr = 'Hỏi & Đáp'
                if (record.doc_type === 'file') typeStr = 'File PDF/Word'
                if (record.doc_type === 'image') typeStr = 'Hình ảnh Mẫu'

                return (
                  <List.Item style={{ padding: '16px', borderBottom: '1px solid #f0f0f0', display: 'block', background: '#fff' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                      <Tag color={record.embedding_provider === 'gemini' ? 'purple' : 'geekblue'}>
                        {record.embedding_provider === 'gemini' ? 'Gemini' : 'OpenAI'}
                      </Tag>
                      <Space direction="vertical" size={0} align="end">
                        <Tag color={color} style={{ margin: 0 }}>{textStatus}</Tag>
                      </Space>
                    </div>
                    {finalStatus === 'failed' && <div style={{ textAlign: 'right', marginBottom: 8 }}><Text type="danger" style={{fontSize: 12}}>{errorMsg}</Text></div>}

                    {titleContent}

                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        <div><Text type="secondary" style={{ fontSize: 13 }}>Loại:</Text> <Text>{typeStr}</Text></div>
                        <div><Text type="secondary" style={{ fontSize: 13 }}>Trợ lý:</Text> <Tag color="blue" style={{ margin: 0 }}>{agent ? agent.name : 'Unknown'}</Tag></div>
                      </div>
                      
                      <div style={{ display: 'flex', justifyContent: 'flex-end', borderTop: '1px dashed #f0f0f0', paddingTop: 12, marginTop: 4 }}>
                        <Space size="small">
                        {record.isGroup ? (
                          <>
                            <Button type="text" icon={<EyeOutlined />} onClick={() => { setCurrentDoc(record); setIsViewModalVisible(true) }} />
                            <Button type="text" icon={<EditOutlined />} onClick={() => handleEdit(record)} />
                            {canRetry && (
                              <Button type="text" style={{ color: '#faad14' }} icon={<SyncOutlined />} onClick={async () => {
                                try {
                                  await Promise.all(record.children.map(c => api.post(`/ai_agents/knowledge/${c.id}/retry/`)))
                                  message.success(`Đã gửi yêu cầu học lại`)
                                  fetchData()
                                } catch (e) {
                                  message.error('Lỗi khi thử lại')
                                }
                              }} />
                            )}
                            <Button type="text" danger icon={<DeleteOutlined />} onClick={() => {
                              Modal.confirm({
                                title: `Xóa ${record.children.length} tài liệu này?`,
                                onOk: async () => {
                                  await Promise.all(record.children.map(c => api.delete(`/ai_agents/knowledge/${c.id}/`)))
                                  fetchData()
                                }
                              })
                            }} />
                          </>
                        ) : (
                          <>
                            <Button type="text" icon={<EyeOutlined />} onClick={() => handleView(record)} />
                            <Button type="text" icon={<EditOutlined />} onClick={() => handleEdit(record)} />
                            <Button type="text" style={{ color: '#faad14' }} icon={<SyncOutlined />} onClick={() => handleRetry(record.id)} />
                            <Button danger type="text" icon={<DeleteOutlined />} onClick={() => handleDelete(record.id)} />
                          </>
                        )}
                      </Space>
                    </div>
                    </div>
                  </List.Item>
                )
              }}
            />
          ) : (
            <Table 
              columns={columns} 
              dataSource={groupedDocuments} 
              rowKey="id" 
              loading={loading}
              pagination={{ pageSize: 10 }}
              scroll={{ x: 'max-content' }}
            />
          )}
        </Card>

      <Modal
        title="Nhập Kho tri thức từ File JSON"
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
            label="Chọn Trợ lý AI đích"
            rules={[{ required: true, message: 'Vui lòng chọn Trợ lý AI' }]}
          >
            <Select placeholder="Chọn một Trợ lý AI để nạp tài liệu vào">
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
            rules={[{ required: true, message: 'Vui lòng chọn file JSON để nhập' }]}
          >
            <Upload beforeUpload={() => false} maxCount={1} accept=".json">
              <Button icon={<UploadOutlined />}>Chọn File</Button>
            </Upload>
          </Form.Item>
          
          <Form.Item>
            <Button type="primary" htmlType="submit" loading={importSubmitting} block>
              Bắt đầu Nhập
            </Button>
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="Dạy thêm kiến thức cho AI"
        open={isModalVisible}
        onCancel={() => {
          setIsModalVisible(false)
          form.resetFields()
          setFileList([])
          setImageDetails({})
          setBulkInput({ title: '', content: '' })
          setSelectedImageIds([])
        }}
        footer={null}
        width={700}
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={handleFinish}
          initialValues={{ doc_type: 'file' }}
        >
          <Form.Item
            name="agent"
            label="Chọn Trợ lý AI để dạy"
            rules={[{ required: true, message: 'Vui lòng chọn trợ lý AI' }]}
          >
            <Radio.Group>
              <Space direction="vertical">
                {agents.map(agent => (
                  <Radio key={agent.id} value={agent.id}>{agent.name}</Radio>
                ))}
              </Space>
            </Radio.Group>
          </Form.Item>

          <Form.Item
            name="title"
            label="Tiêu đề tài liệu"
            rules={[{ required: docType !== 'image', message: 'Vui lòng nhập tiêu đề' }]}
            style={{ display: docType === 'image' ? 'none' : 'block' }}
          >
            <Input placeholder="Ví dụ: Chính sách bảo hành tủ lạnh 2026" />
          </Form.Item>

          <Form.Item name="doc_type" label="Hình thức cung cấp kiến thức">
            <Segmented
              block
              options={[
                { label: 'Tải File (PDF/DOCX/TXT)', value: 'file' },
                { label: 'Hình ảnh Mẫu (JPG/PNG)', value: 'image' },
                { label: 'Nhập Hỏi - Đáp', value: 'qa' },
              ]}
            />
          </Form.Item>

          {docType === 'file' ? (
            <Form.Item label="File tài liệu">
              <Upload
                multiple={true}
                beforeUpload={() => false}
                onChange={(info) => {
                  setFileList([...info.fileList])
                }}
                fileList={fileList}
                accept=".pdf,.doc,.docx,.txt"
              >
                <Button icon={<UploadOutlined />}>Chọn file tải lên</Button>
              </Upload>
              <div style={{ marginTop: 8 }}>
                <Text type="secondary" style={{ fontSize: 12 }}>
                  * Hỗ trợ PDF, Word, Text. Backend sẽ tự động băm nhỏ và nhúng Vector.
                </Text>
              </div>
            </Form.Item>
          ) : docType === 'image' ? (
            <>
              <Form.Item label={
                <span>
                  📷 Ảnh mẫu cần học&nbsp;
                  <Text type="secondary" style={{ fontSize: 12 }}>(.jpg, .jpeg, .png, .webp)</Text>
                </span>
              }>
                <Upload
                  multiple={true}
                  beforeUpload={() => false}
                  showUploadList={false}
                  onChange={(info) => {
                    setFileList([...info.fileList])
                    const newDetails = { ...imageDetails }
                    info.fileList.forEach(file => {
                      if (!newDetails[file.uid]) {
                        newDetails[file.uid] = { title: '', content: '' }
                      }
                    })
                    setImageDetails(newDetails)
                  }}
                  fileList={fileList}
                  accept=".jpg,.jpeg,.png,.webp"
                >
                  <Button icon={<UploadOutlined />}>Thêm ảnh tải lên</Button>
                </Upload>
              </Form.Item>

              {fileList.length > 0 && (
                <div style={{ marginTop: 16, maxHeight: 400, overflowY: 'auto', paddingRight: 8 }}>
                  {fileList.length > 1 && (
                    <div style={{ marginBottom: 12, padding: 12, background: '#e6f7ff', borderRadius: 8, border: '1px solid #91d5ff' }}>
                      <div style={{ marginBottom: 8 }}>
                        <Text strong style={{ color: '#096dd9' }}>💡 Nhập nhanh chung cho nhiều góc chụp của 1 sản phẩm:</Text>
                      </div>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
                          <Input 
                            placeholder="Tiêu đề chung..." 
                            value={bulkInput.title}
                            onChange={e => setBulkInput({...bulkInput, title: e.target.value})}
                          />
                          <Input.TextArea 
                            rows={2} 
                            placeholder="Mô tả / Kịch bản tư vấn chung..." 
                            value={bulkInput.content}
                            onChange={e => setBulkInput({...bulkInput, content: e.target.value})}
                          />
                        </div>
                        <Button 
                          type="primary" 
                          style={{ height: 'auto', padding: '24px 16px' }}
                          onClick={() => {
                            const targetIds = selectedImageIds.length > 0 ? selectedImageIds : fileList.map(f => f.uid);
                            const newDetails = { ...imageDetails };
                            targetIds.forEach(uid => {
                              newDetails[uid] = { 
                                title: bulkInput.title || newDetails[uid]?.title || '', 
                                content: bulkInput.content || newDetails[uid]?.content || '' 
                              };
                            });
                            setImageDetails(newDetails);
                            setSelectedImageIds([]);
                            message.success(selectedImageIds.length > 0 ? `Đã áp dụng chung cho ${selectedImageIds.length} ảnh được chọn!` : 'Đã áp dụng chung cho tất cả ảnh!');
                          }}
                        >
                          {selectedImageIds.length > 0 ? `Áp dụng cho ${selectedImageIds.length} ảnh đang chọn` : 'Áp dụng tất cả'}
                        </Button>
                      </div>
                    </div>
                  )}
                  {fileList.map((file) => {
                    let src = '';
                    if (file.originFileObj) {
                      src = URL.createObjectURL(file.originFileObj);
                    } else if (file.url) {
                      src = file.url;
                    }
                    
                    return (
                      <Card key={file.uid} size="small" style={{ marginBottom: 12, background: selectedImageIds.includes(file.uid) ? '#f0f5ff' : '#fafafa', border: selectedImageIds.includes(file.uid) ? '1px solid #1890ff' : '1px solid #e8e8e8' }}>
                        <div style={{ display: 'flex', gap: 16 }}>
                          <div style={{ display: 'flex', alignItems: 'center' }}>
                            <Checkbox 
                              checked={selectedImageIds.includes(file.uid)} 
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setSelectedImageIds([...selectedImageIds, file.uid])
                                } else {
                                  setSelectedImageIds(selectedImageIds.filter(id => id !== file.uid))
                                }
                              }}
                            />
                          </div>
                          <div style={{ width: 100, height: 100, flexShrink: 0, overflow: 'hidden', borderRadius: 6, border: '1px solid #d9d9d9', position: 'relative' }}>
                            <img src={src} alt="thumb" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                            <Button 
                              type="primary" 
                              danger 
                              size="small" 
                              icon={<DeleteOutlined />} 
                              style={{ position: 'absolute', top: 4, right: 4, opacity: 0.8 }}
                              onClick={() => {
                                setFileList(prev => prev.filter(f => f.uid !== file.uid))
                                const newDetails = { ...imageDetails }
                                delete newDetails[file.uid]
                                setImageDetails(newDetails)
                                setSelectedImageIds(prev => prev.filter(id => id !== file.uid))
                              }}
                            />
                          </div>
                          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
                            <Input 
                              placeholder="* Tên sản phẩm / Tiêu đề ảnh (Bắt buộc)..." 
                              value={imageDetails[file.uid]?.title} 
                              onChange={e => setImageDetails(prev => ({...prev, [file.uid]: {...prev[file.uid], title: e.target.value}}))}
                            />
                            <Input.TextArea 
                              rows={2} 
                              placeholder="Mô tả / Kịch bản tư vấn..." 
                              value={imageDetails[file.uid]?.content} 
                              onChange={e => setImageDetails(prev => ({...prev, [file.uid]: {...prev[file.uid], content: e.target.value}}))}
                            />
                          </div>
                        </div>
                      </Card>
                    )
                  })}
                  <div style={{ marginBottom: 16 }}>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      AI Vision sẽ quét, nhận diện và phân tích toàn bộ dấu hiệu thị giác của các bức ảnh này.
                    </Text>
                  </div>
                </div>
              )}
            </>
          ) : docType === 'qa' ? (
            <Form.List name="qa_list" initialValue={[{ question: '', answer: '' }]}>
              {(fields, { add, remove }) => (
                <>
                  <div style={{ marginBottom: 8 }}>
                    <Text strong>Nội dung Kiến thức (Hỏi & Đáp)</Text>
                  </div>
                  {fields.map(({ key, name, ...restField }) => (
                    <Card size="small" key={key} style={{ marginBottom: 12, background: '#fafafa', borderRadius: 8 }}>
                      <Row gutter={12}>
                        <Col span={22}>
                          <Form.Item
                            {...restField}
                            name={[name, 'question']}
                            rules={[{ required: true, message: 'Nhập câu hỏi' }]}
                            style={{ marginBottom: 12 }}
                          >
                            <Input placeholder="Câu hỏi (Ví dụ: Shop có giao hàng chủ nhật không?)" prefix={<QuestionCircleOutlined style={{ color: '#1677ff', marginRight: 4 }} />} />
                          </Form.Item>
                          <Form.Item
                            {...restField}
                            name={[name, 'answer']}
                            rules={[{ required: true, message: 'Nhập câu trả lời' }]}
                            style={{ marginBottom: 0 }}
                          >
                            <Input.TextArea autoSize={{ minRows: 2, maxRows: 6 }} placeholder="Câu trả lời (Ví dụ: Dạ bên em có giao hàng chủ nhật ạ)" />
                          </Form.Item>
                          <Form.Item
                            {...restField}
                            name={[name, 'images']}
                            valuePropName="fileList"
                            getValueFromEvent={(e) => Array.isArray(e) ? e : e?.fileList}
                            style={{ marginBottom: 0, marginTop: 12 }}
                          >
                            <Upload
                              listType="picture-card"
                              multiple
                              beforeUpload={() => false}
                              accept="image/*"
                            >
                              <div>
                                <PlusOutlined />
                                <div style={{ marginTop: 8 }}>Thêm ảnh</div>
                              </div>
                            </Upload>
                          </Form.Item>
                        </Col>
                        <Col span={2} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <Button type="text" danger icon={<MinusCircleOutlined />} onClick={() => remove(name)} />
                        </Col>
                      </Row>
                    </Card>
                  ))}
                  <Form.Item>
                    <Button type="dashed" onClick={() => add()} block icon={<PlusOutlined />}>
                      Thêm bộ Hỏi - Đáp mới
                    </Button>
                  </Form.Item>
                </>
              )}
            </Form.List>
          ) : null}

          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 24 }}>
            <Space>
              <Button onClick={() => setIsModalVisible(false)}>Hủy</Button>
              <Button type="primary" htmlType="submit" loading={submitting}>
                Lưu và Bắt đầu học
              </Button>
            </Space>
          </div>
        </Form>
      </Modal>

      {/* View Modal */}
      <Modal
        title={currentDoc?.title || "Xem tài liệu"}
        open={isViewModalVisible}
        onCancel={() => setIsViewModalVisible(false)}
        footer={[
          <Button key="close" onClick={() => setIsViewModalVisible(false)}>Đóng</Button>
        ]}
        width={700}
      >
        <div style={{ background: '#f5f5f5', padding: 16, borderRadius: 8, minHeight: 200, maxHeight: '60vh', overflowY: 'auto' }}>
          {(() => {
            if (!currentDoc) return null;
            
            const renderDoc = (doc) => (
              <div key={doc.id || doc.title} style={{ marginBottom: 16 }}>
                {doc?.doc_type === 'image' && doc?.file_attachment && (
                  <div style={{ textAlign: 'center', marginBottom: 16 }}>
                    <img 
                      src={doc.file_attachment} 
                      alt={doc.title} 
                      style={{ maxWidth: '100%', maxHeight: 300, objectFit: 'contain', borderRadius: 8, border: '1px solid #d9d9d9' }} 
                    />
                  </div>
                )}
                <div style={{ whiteSpace: 'pre-wrap', lineHeight: '1.6' }}>
                  {(() => {
                    if (!doc?.content) return null;
                    
                    const parts = doc.content.split(/\|\s*Hình ảnh \(URL\):\s*([^\n]+)/g);
                    const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:8000/api/';
                    const baseUrl = apiUrl.split('/api')[0];

                    return parts.map((part, index) => {
                      if (index % 2 === 1) { 
                        const url = part.trim();
                        if (!url || url === 'None') return null;
                        const fullUrl = url.startsWith('/') ? `${baseUrl}${url}` : url;
                        return (
                          <div key={index} style={{ margin: '12px 0', padding: 8, background: '#fff', borderRadius: 8, display: 'block', width: 'fit-content', border: '1px solid #e8e8e8' }}>
                            <img src={fullUrl} alt="product" style={{ width: 120, height: 120, objectFit: 'cover', borderRadius: 4 }} />
                          </div>
                        );
                      }
                      return <span key={index}>{part}</span>;
                    });
                  })()}
                </div>
              </div>
            );

            if (currentDoc?.isGroup) {
              return currentDoc.children.map((child, idx) => (
                <div key={child.id}>
                  {idx > 0 && <Divider />}
                  {renderDoc(child)}
                </div>
              ));
            }
            return renderDoc(currentDoc);
          })()}
        </div>
      </Modal>

      {/* Edit Modal */}
      <Modal
        title="Sửa thông tin tài liệu"
        open={isEditModalVisible}
        onCancel={() => setIsEditModalVisible(false)}
        footer={null}
        width={600}
      >
        <Form
          form={editForm}
          layout="vertical"
          onFinish={handleSaveEdit}
        >
          <Form.Item
            name="title"
            label="Tiêu đề tài liệu"
            rules={[{ required: true, message: 'Vui lòng nhập tiêu đề' }]}
          >
            <Input disabled={currentDoc?.title?.endsWith('(Auto)')} />
          </Form.Item>

          <Form.Item
            name="agent"
            label="Chọn Trợ lý AI"
            rules={[{ required: true, message: 'Vui lòng chọn trợ lý AI' }]}
          >
            <Radio.Group>
              <Space direction="vertical">
                {agents.map(agent => (
                  <Radio key={agent.id} value={agent.id}>{agent.name}</Radio>
                ))}
              </Space>
            </Radio.Group>
          </Form.Item>

          {(currentDoc?.doc_type === 'qa') ? (
            <Form.List name="qa_list">
              {(fields, { add, remove }) => (
                <>
                  <div style={{ marginBottom: 8 }}>
                    <Text strong>Nội dung Kiến thức (Hỏi & Đáp)</Text>
                  </div>
                  {fields.map(({ key, name, ...restField }) => (
                    <Card size="small" key={key} style={{ marginBottom: 12, background: '#fafafa', borderRadius: 8 }}>
                      <Row gutter={12}>
                        <Col span={22}>
                          <Form.Item
                            {...restField}
                            name={[name, 'question']}
                            style={{ marginBottom: 12 }}
                          >
                            <Input placeholder="Câu hỏi (Ví dụ: Shop có giao hàng chủ nhật không?)" prefix={<QuestionCircleOutlined style={{ color: '#1677ff', marginRight: 4 }} />} />
                          </Form.Item>
                          <Form.Item
                            {...restField}
                            name={[name, 'answer']}
                            style={{ marginBottom: 0 }}
                          >
                            <Input.TextArea autoSize={{ minRows: 2, maxRows: 6 }} placeholder="Câu trả lời (có thể chứa link ảnh cũ)" />
                          </Form.Item>
                          <Form.Item
                            {...restField}
                            name={[name, 'images']}
                            valuePropName="fileList"
                            getValueFromEvent={(e) => Array.isArray(e) ? e : e?.fileList}
                            style={{ marginBottom: 0, marginTop: 12 }}
                          >
                            <Upload
                              listType="picture-card"
                              multiple
                              beforeUpload={() => false}
                              accept="image/*"
                            >
                              <div>
                                <PlusOutlined />
                                <div style={{ marginTop: 8 }}>Thêm ảnh mới</div>
                              </div>
                            </Upload>
                          </Form.Item>
                        </Col>
                        <Col span={2} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                          <Button
                            type="text"
                            icon={<ScissorOutlined style={{ color: '#faad14' }} />}
                            onClick={() => splitQAItem(name, name, add, remove)}
                            title="Tách các cặp Hỏi-Đáp đang lằn lộn trong mục này thành nhiều mục riêng"
                          />
                          <Button type="text" danger icon={<MinusCircleOutlined />} onClick={() => remove(name)} />
                        </Col>
                      </Row>
                    </Card>
                  ))}
                  <Form.Item>
                    <Button type="dashed" onClick={() => add()} block icon={<PlusOutlined />}>
                      Thêm bộ Hỏi - Đáp mới
                    </Button>
                  </Form.Item>
                </>
              )}
            </Form.List>
          ) : (currentDoc?.doc_type === 'image') ? (
            <Form.Item
              name="content"
              label="Nội dung / Mô tả Kiến thức"
              extra="Lưu ý: Thay đổi nội dung sẽ yêu cầu AI phải học lại từ đầu."
            >
              <Input.TextArea rows={6} />
            </Form.Item>
          ) : null}

          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 24 }}>
            <Space>
              <Button onClick={() => setIsEditModalVisible(false)}>Hủy</Button>
              <Button
                type="primary"
                loading={editSubmitting}
                onClick={async () => {
                  try {
                    const values = await editForm.validateFields();
                    handleSaveEdit(values);
                  } catch (err) {
                    console.error('Form validation failed:', err);
                    message.error('Vui lòng kiểm tra lại các trường bị bỏ trống.');
                  }
                }}
              >
                Lưu thay đổi
              </Button>
            </Space>
          </div>
        </Form>
      </Modal>
    </div>
  )
}