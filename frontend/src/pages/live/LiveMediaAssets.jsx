import React, { useState, useEffect, useRef } from 'react'
import { 
  Card, 
  Typography, 
  Button, 
  Space, 
  Tabs, 
  message, 
  Modal, 
  Form, 
  Input, 
  Select, 
  Tag, 
  Popconfirm,
  Progress,
  Spin
} from 'antd'
import { 
  PlusOutlined, 
  UploadOutlined, 
  DeleteOutlined, 
  VideoCameraOutlined, 
  PictureOutlined, 
  AudioOutlined, 
  BlockOutlined,
  CloudUploadOutlined
} from '@ant-design/icons'
import api from '../../utils/api'

const { Title, Text } = Typography

export default function LiveMediaAssets() {
  const [assets, setAssets] = useState([])
  const [loading, setLoading] = useState(false)
  const [activeTab, setActiveTab] = useState('all')
  
  // Upload Modal State
  const [uploadVisible, setUploadVisible] = useState(false)
  const [form] = Form.useForm()
  const [selectedFile, setSelectedFile] = useState(null)
  const [previewUrl, setPreviewUrl] = useState(null)
  const [previewType, setPreviewType] = useState(null) // 'image' | 'video' | 'audio'
  const [thumbnailBlob, setThumbnailBlob] = useState(null)
  const [uploading, setUploading] = useState(false)
  const [uploadPercent, setUploadPercent] = useState(0)
  const [loadedBytes, setLoadedBytes] = useState(0)
  const [totalBytes, setTotalBytes] = useState(0)
  const [isDragOver, setIsDragOver] = useState(false)
  
  const fileInputRef = useRef(null)

  const fetchAssets = async () => {
    setLoading(true)
    try {
      const res = await api.get('/live_sessions/media-assets/')
      setAssets(Array.isArray(res.data) ? res.data : (res.data?.results || []))
    } catch (err) {
      message.error('Lỗi khi tải kho tài nguyên')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchAssets()
  }, [])

  const handleDelete = async (id) => {
    try {
      await api.delete(`/live_sessions/media-assets/${id}/`)
      message.success('Đã xóa tài nguyên')
      fetchAssets()
    } catch (err) {
      message.error('Lỗi khi xóa tài nguyên')
    }
  }

  // File Picker Trigger (100% reliable 1-click)
  const openFilePicker = () => {
    if (fileInputRef.current) {
      fileInputRef.current.value = '' // Reset to allow selecting the same file
      fileInputRef.current.click()
    }
  }

  const clearSelectedFile = () => {
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl)
    }
    setSelectedFile(null)
    setPreviewUrl(null)
    setPreviewType(null)
    setThumbnailBlob(null)
    setUploadPercent(0)
    setLoadedBytes(0)
    setTotalBytes(0)
  }

  const handleFileSelected = (file) => {
    if (!file) return
    if (file.size > 100 * 1024 * 1024) {
      message.error('File vượt quá giới hạn 100MB')
      return
    }

    if (previewUrl) {
      URL.revokeObjectURL(previewUrl)
    }

    setSelectedFile(file)
    setUploadPercent(0)
    setLoadedBytes(0)
    setTotalBytes(file.size)

    const newUrl = URL.createObjectURL(file)
    setPreviewUrl(newUrl)

    const ext = file.name.split('.').pop().toLowerCase()
    let detectedType = 'image'
    if (['mp4', 'webm', 'mov'].includes(ext)) {
      detectedType = 'video'
    } else if (['mp3', 'wav', 'aac', 'm4a', 'ogg'].includes(ext)) {
      detectedType = 'audio'
    }
    setPreviewType(detectedType)

    // Auto-fill resource name if empty
    const currentName = form.getFieldValue('name')
    if (!currentName) {
      const baseName = file.name.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' ')
      form.setFieldsValue({ name: baseName })
    }

    // Auto-adjust asset_type based on file extension
    const currentType = form.getFieldValue('asset_type')
    if (detectedType === 'audio') {
      form.setFieldsValue({ asset_type: 'audio' })
    } else if (detectedType === 'video') {
      if (!currentType || currentType === 'audio' || currentType === 'overlay') {
        form.setFieldsValue({ asset_type: 'avatar' })
      }
    } else if (detectedType === 'image') {
      if (!currentType || currentType === 'audio' || currentType === 'avatar') {
        form.setFieldsValue({ asset_type: 'background' })
      }
    }
  }

  // Extract thumbnail from frame 0 of video preview using canvas
  const handleVideoLoadedData = (e) => {
    const video = e.target
    try {
      const canvas = document.createElement('canvas')
      canvas.width = video.videoWidth || 640
      canvas.height = video.videoHeight || 360
      const ctx = canvas.getContext('2d')
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
      canvas.toBlob((blob) => {
        if (blob) setThumbnailBlob(blob)
      }, 'image/jpeg', 0.85)
    } catch (err) {
      console.warn('Cannot extract video thumbnail:', err)
    }
  }

  const handleOpenUpload = () => {
    let defaultType = 'avatar'
    if (activeTab === 'background') defaultType = 'background'
    else if (activeTab === 'overlay') defaultType = 'overlay'
    else if (activeTab === 'audio') defaultType = 'audio'

    form.setFieldsValue({ asset_type: defaultType })
    setUploadVisible(true)
  }

  const handleCloseModal = () => {
    if (uploading) return
    setUploadVisible(false)
    form.resetFields()
    clearSelectedFile()
  }

  const handleUploadSubmit = async () => {
    try {
      const values = await form.validateFields()
      if (!selectedFile) {
        message.error('Vui lòng chọn file để tải lên')
        return
      }

      setUploading(true)
      setUploadPercent(0)
      
      const formData = new FormData()
      formData.append('name', values.name)
      formData.append('asset_type', values.asset_type)
      formData.append('file', selectedFile)
      if (thumbnailBlob) {
        formData.append('thumbnail', thumbnailBlob, 'thumb.jpg')
      }
      
      await api.post('/live_sessions/media-assets/', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        onUploadProgress: (progressEvent) => {
          if (progressEvent.total) {
            const percent = Math.round((progressEvent.loaded * 100) / progressEvent.total)
            setUploadPercent(percent)
            setLoadedBytes(progressEvent.loaded)
            setTotalBytes(progressEvent.total)
          }
        }
      })
      
      message.success('Tải lên thành công!')
      handleCloseModal()
      fetchAssets()
    } catch (err) {
      console.error(err.response?.data)
      const errorData = err.response?.data
      const errorString = errorData ? (typeof errorData === 'object' ? JSON.stringify(errorData) : errorData) : err.message
      message.error('Lỗi khi tải lên: ' + errorString)
    } finally {
      setUploading(false)
    }
  }

  const getFilteredAssets = (type) => {
    if (type === 'all') return assets
    return assets.filter(a => a.asset_type === type)
  }

  const renderAssetThumbnail = (item) => {
    if (item.asset_type === 'audio' || !item.file) {
      switch (item.asset_type) {
        case 'avatar': return <VideoCameraOutlined style={{ fontSize: 32, color: '#1890ff' }} />
        case 'background': return <PictureOutlined style={{ fontSize: 32, color: '#52c41a' }} />
        case 'overlay': return <BlockOutlined style={{ fontSize: 32, color: '#faad14' }} />
        case 'audio': return <AudioOutlined style={{ fontSize: 32, color: '#eb2f96' }} />
        default: return <PictureOutlined style={{ fontSize: 32 }} />
      }
    }

    const isVideo = item.file.match(/\.(mp4|webm)$/i)
    if (isVideo) {
      return (
        <video 
          src={item.file} 
          style={{ width: '100%', height: '100%', objectFit: 'contain', borderRadius: 8 }} 
          muted 
          playsInline
          onMouseEnter={(e) => e.target.play()}
          onMouseLeave={(e) => { e.target.pause(); e.target.currentTime = 0 }}
        />
      )
    }

    return (
      <img 
        src={item.file} 
        alt={item.name} 
        style={{ width: '100%', height: '100%', objectFit: 'contain', borderRadius: 8 }} 
      />
    )
  }

  const renderAssetGrid = (type) => {
    const filtered = getFilteredAssets(type)
    if (filtered.length === 0 && !loading) {
      return (
        <div style={{ padding: '40px 0', textAlign: 'center' }}>
          <Typography.Text type="secondary">Chưa có tài nguyên nào. Hãy tải lên!</Typography.Text>
        </div>
      )
    }
    
    return (
      <div style={{ 
        display: 'grid', 
        gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', 
        gap: '20px',
        padding: '10px 0'
      }}>
        {filtered.map(item => (
          <Card 
            key={item.id} 
            hoverable
            style={{ borderRadius: 16, overflow: 'hidden', border: '1px solid #f0f0f0' }}
            bodyStyle={{ padding: 16 }}
            actions={[
              <a href={item.file} target="_blank" rel="noreferrer" key="view">Xem file</a>,
              <Popconfirm 
                title="Xóa tài nguyên này?" 
                onConfirm={() => handleDelete(item.id)} 
                disabled={item.is_system}
                key="delete"
              >
                <Button type="text" danger icon={<DeleteOutlined />} disabled={item.is_system} size="small" />
              </Popconfirm>
            ]}
          >
            <div style={{ 
              height: 180, 
              background: 'linear-gradient(135deg, #1f1c2c 0%, #928dab 100%)', 
              display: 'flex', 
              justifyContent: 'center', 
              alignItems: 'center',
              marginBottom: 16,
              borderRadius: 8,
              position: 'relative',
              overflow: 'hidden'
            }}>
              {renderAssetThumbnail(item)}
            </div>
            
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <Text strong style={{ fontSize: 14, marginBottom: 4 }} ellipsis={{ tooltip: item.name }}>
                {item.name}
              </Text>
              <Space size={4} style={{ marginBottom: 8 }}>
                {item.is_system && <Tag color="gold" style={{ margin: 0 }}>Hệ thống</Tag>}
                <Tag color="blue" style={{ margin: 0 }}>{item.asset_type_display}</Tag>
              </Space>
              <Text type="secondary" style={{ fontSize: 12 }}>
                Tải lên: {new Date(item.created_at).toLocaleDateString('vi-VN')}
              </Text>
            </div>
          </Card>
        ))}
      </div>
    )
  }

  const tabItems = [
    { key: 'all', label: 'Tất cả', children: renderAssetGrid('all') },
    { key: 'avatar', label: 'Avatar (Phông xanh)', children: renderAssetGrid('avatar') },
    { key: 'background', label: 'Phông nền', children: renderAssetGrid('background') },
    { key: 'overlay', label: 'Lớp phủ / Logo', children: renderAssetGrid('overlay') },
    { key: 'audio', label: 'Âm thanh nền (BGM)', children: renderAssetGrid('audio') },
  ]

  return (
    <div style={{ padding: 24, width: '100%', boxSizing: 'border-box' }}>
      {/* Hidden native input for 100% reliable 1-click file dialog */}
      <input
        type="file"
        ref={fileInputRef}
        style={{ display: 'none' }}
        accept=".mp4,.webm,.mov,.png,.jpg,.jpeg,.webp,.mp3,.wav,.aac,.m4a"
        onChange={(e) => {
          if (e.target.files && e.target.files[0]) {
            handleFileSelected(e.target.files[0])
          }
        }}
      />

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <Title level={3} style={{ margin: 0 }}>Kho Tài Nguyên Live</Title>
          <Text type="secondary">Quản lý phông xanh, ảnh nền, logo và âm thanh cho luồng Livestream</Text>
        </div>
        <Button type="primary" icon={<PlusOutlined />} onClick={handleOpenUpload}>
          Tải lên tài nguyên
        </Button>
      </div>

      <Card style={{ borderRadius: 12 }}>
        <Tabs activeKey={activeTab} onChange={setActiveTab} items={tabItems} />
      </Card>

      <Modal
        title="Tải lên tài nguyên mới"
        open={uploadVisible}
        onCancel={handleCloseModal}
        onOk={handleUploadSubmit}
        confirmLoading={uploading}
        okText={uploading ? 'Đang tải lên...' : 'Tải lên ngay'}
        cancelText="Hủy"
        cancelButtonProps={{ disabled: uploading }}
        okButtonProps={{ disabled: !selectedFile || uploading }}
        width={540}
        destroyOnClose
      >
        <Form form={form} layout="vertical" style={{ marginTop: 12 }}>
          <Form.Item 
            name="name" 
            label="Tên tài nguyên" 
            rules={[{ required: true, message: 'Nhập tên tài nguyên' }]}
            tooltip="Tên hiển thị để dễ nhận biết khi dựng kịch bản phiên live"
          >
            <Input placeholder="VD: Mẫu tĩnh, Phông nền sang trọng..." disabled={uploading} />
          </Form.Item>
          
          <Form.Item name="asset_type" label="Loại tài nguyên" rules={[{ required: true }]}>
            <Select disabled={uploading}>
              <Select.Option value="avatar">Avatar (Video Phông Xanh .mp4, .webm)</Select.Option>
              <Select.Option value="background">Phông nền (Ảnh .png, .jpg hoặc Video loop)</Select.Option>
              <Select.Option value="overlay">Lớp phủ (Logo, Khung hình trong suốt .png)</Select.Option>
              <Select.Option value="audio">Âm thanh nền (Nhạc BGM .mp3)</Select.Option>
            </Select>
          </Form.Item>

          <Form.Item label="File đính kèm" required style={{ marginBottom: 8 }}>
            {!selectedFile ? (
              <div
                onClick={openFilePicker}
                onDragOver={(e) => { e.preventDefault(); setIsDragOver(true) }}
                onDragLeave={(e) => { e.preventDefault(); setIsDragOver(false) }}
                onDrop={(e) => {
                  e.preventDefault()
                  setIsDragOver(false)
                  if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                    handleFileSelected(e.dataTransfer.files[0])
                  }
                }}
                style={{
                  border: `2px dashed ${isDragOver ? '#1890ff' : '#d9d9d9'}`,
                  borderRadius: 12,
                  backgroundColor: isDragOver ? '#f0f7ff' : '#fafafa',
                  padding: '30px 20px',
                  textAlign: 'center',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 10
                }}
              >
                <div style={{
                  width: 52, 
                  height: 52, 
                  borderRadius: '50%',
                  backgroundColor: isDragOver ? '#1890ff' : '#e6f4ff',
                  display: 'flex', 
                  alignItems: 'center', 
                  justifyContent: 'center',
                  transition: 'all 0.2s ease'
                }}>
                  <CloudUploadOutlined style={{ fontSize: 26, color: isDragOver ? '#fff' : '#1890ff' }} />
                </div>
                <div>
                  <Text strong style={{ fontSize: 14, display: 'block', color: '#262626' }}>
                    Bấm để chọn file hoặc kéo thả file vào đây
                  </Text>
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    Hỗ trợ Video (MP4, WebM), Ảnh (PNG, JPG) hoặc Nhạc (MP3) • Tối đa 100MB
                  </Text>
                </div>
                <Button 
                  icon={<UploadOutlined />} 
                  type="default" 
                  size="middle" 
                  style={{ marginTop: 4, pointerEvents: 'none' }}
                >
                  Chọn File từ thiết bị
                </Button>
              </div>
            ) : (
              <div style={{
                border: '1px solid #d9d9d9',
                borderRadius: 12,
                overflow: 'hidden',
                backgroundColor: '#141414',
                boxShadow: '0 2px 8px rgba(0,0,0,0.06)'
              }}>
                {/* Instant Visual Preview like in Products */}
                {previewType === 'video' && (
                  <div style={{ position: 'relative', width: '100%', maxHeight: 220, display: 'flex', justifyContent: 'center', alignItems: 'center', background: '#000' }}>
                    <video
                      src={previewUrl}
                      controls
                      autoPlay
                      muted
                      loop
                      playsInline
                      onLoadedData={handleVideoLoadedData}
                      style={{ width: '100%', maxHeight: 220, objectFit: 'contain' }}
                    />
                  </div>
                )}
                {previewType === 'image' && (
                  <div style={{
                    width: '100%', 
                    maxHeight: 220, 
                    display: 'flex', 
                    justifyContent: 'center', 
                    alignItems: 'center',
                    background: 'repeating-conic-gradient(#202020 0% 25%, #141414 0% 50%) 50% / 20px 20px',
                    padding: 12
                  }}>
                    <img
                      src={previewUrl}
                      alt="Preview"
                      style={{ maxWidth: '100%', maxHeight: 196, objectFit: 'contain', borderRadius: 6 }}
                    />
                  </div>
                )}
                {previewType === 'audio' && (
                  <div style={{ padding: '24px 20px', background: 'linear-gradient(135deg, #1f1c2c 0%, #928dab 100%)', textAlign: 'center' }}>
                    <AudioOutlined style={{ fontSize: 36, color: '#fff', marginBottom: 12 }} />
                    <audio src={previewUrl} controls style={{ width: '100%' }} />
                  </div>
                )}

                {/* File info bar and controls */}
                <div style={{
                  padding: '10px 14px',
                  backgroundColor: '#fff',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  borderTop: '1px solid #f0f0f0'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, flex: 1, marginRight: 8 }}>
                    <Tag color={previewType === 'video' ? 'blue' : previewType === 'image' ? 'green' : 'purple'} style={{ margin: 0, fontSize: 11 }}>
                      {previewType?.toUpperCase()}
                    </Tag>
                    <div style={{ minWidth: 0 }}>
                      <Text strong ellipsis style={{ display: 'block', fontSize: 13 }}>
                        {selectedFile.name}
                      </Text>
                      <Text type="secondary" style={{ fontSize: 11 }}>
                        {(selectedFile.size / (1024 * 1024)).toFixed(1)} MB
                      </Text>
                    </div>
                  </div>
                  <Space size={6}>
                    <Button size="small" icon={<UploadOutlined />} onClick={openFilePicker} disabled={uploading}>
                      Đổi file
                    </Button>
                    <Button size="small" danger icon={<DeleteOutlined />} onClick={clearSelectedFile} disabled={uploading}>
                      Xóa
                    </Button>
                  </Space>
                </div>
              </div>
            )}
          </Form.Item>

          {/* Real-time Upload Progress Bar */}
          {uploading && (
            <div style={{ marginTop: 12, padding: '12px 14px', backgroundColor: '#f6ffed', border: '1px solid #b7eb8f', borderRadius: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: '#389e0d' }}>
                  {uploadPercent < 100 ? 'Đang tải lên máy chủ...' : 'Đang xử lý & lưu trữ tài nguyên...'}
                </span>
                <span style={{ fontSize: 12, color: '#595959', fontFamily: 'monospace' }}>
                  {(loadedBytes / (1024 * 1024)).toFixed(1)} / {(totalBytes / (1024 * 1024)).toFixed(1)} MB ({uploadPercent}%)
                </span>
              </div>
              <Progress
                percent={uploadPercent}
                status={uploadPercent === 100 ? 'normal' : 'active'}
                strokeColor={{ '0%': '#1890ff', '100%': '#52c41a' }}
                showInfo={false}
              />
            </div>
          )}
        </Form>
      </Modal>
    </div>
  )
}
