import React, { useState, useEffect } from 'react'
import { Card, Typography, Button, Space, Tabs, Table, Upload, message, Modal, Form, Input, Select, Tag, Popconfirm } from 'antd'
import { PlusOutlined, UploadOutlined, DeleteOutlined, VideoCameraOutlined, PictureOutlined, AudioOutlined, BlockOutlined } from '@ant-design/icons'
import api from '../../utils/api'

const { Title, Text } = Typography

export default function LiveMediaAssets() {
  const [assets, setAssets] = useState([])
  const [loading, setLoading] = useState(false)
  
  // Upload Modal State
  const [uploadVisible, setUploadVisible] = useState(false)
  const [form] = Form.useForm()
  const [fileList, setFileList] = useState([])
  const [uploading, setUploading] = useState(false)

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

  const handleUploadSubmit = async () => {
    try {
      const values = await form.validateFields()
      if (fileList.length === 0) {
        message.error('Vui lòng chọn file để tải lên')
        return
      }

      setUploading(true)
      
      const uploadData = {
        name: values.name,
        asset_type: values.asset_type,
        file: fileList[0].originFileObj
      }
      
      await api.postForm('/live_sessions/media-assets/', uploadData)
      
      message.success('Tải lên thành công')
      setUploadVisible(false)
      form.resetFields()
      setFileList([])
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

  const renderAssetIcon = (type) => {
    switch (type) {
      case 'avatar': return <VideoCameraOutlined style={{ fontSize: 32, color: '#1890ff' }} />
      case 'background': return <PictureOutlined style={{ fontSize: 32, color: '#52c41a' }} />
      case 'overlay': return <BlockOutlined style={{ fontSize: 32, color: '#faad14' }} />
      case 'audio': return <AudioOutlined style={{ fontSize: 32, color: '#eb2f96' }} />
      default: return <PictureOutlined style={{ fontSize: 32 }} />
    }
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
              height: 120, 
              background: 'linear-gradient(135deg, #f5f7fa 0%, #e4ebf5 100%)', 
              display: 'flex', 
              justifyContent: 'center', 
              alignItems: 'center',
              marginBottom: 16,
              borderRadius: 8
            }}>
              {renderAssetIcon(item.asset_type)}
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
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <Title level={3} style={{ margin: 0 }}>Kho Tài Nguyên Live</Title>
          <Text type="secondary">Quản lý phông xanh, ảnh nền, logo và âm thanh cho luồng Livestream</Text>
        </div>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setUploadVisible(true)}>
          Tải lên tài nguyên
        </Button>
      </div>

      <Card style={{ borderRadius: 12 }}>
        <Tabs items={tabItems} />
      </Card>

      <Modal
        title="Tải lên tài nguyên mới"
        open={uploadVisible}
        onCancel={() => { setUploadVisible(false); form.resetFields(); setFileList([]) }}
        onOk={handleUploadSubmit}
        confirmLoading={uploading}
      >
        <Form form={form} layout="vertical">
          <Form.Item name="name" label="Tên tài nguyên" rules={[{ required: true, message: 'Nhập tên tài nguyên' }]}>
            <Input placeholder="VD: Cô Tuyết Mặc Áo Đỏ" />
          </Form.Item>
          
          <Form.Item name="asset_type" label="Loại tài nguyên" rules={[{ required: true }]}>
            <Select>
              <Select.Option value="avatar">Avatar (Video Phông Xanh .mp4, .webm)</Select.Option>
              <Select.Option value="background">Phông nền (Ảnh .png, .jpg hoặc Video loop)</Select.Option>
              <Select.Option value="overlay">Lớp phủ (Logo, Khung hình trong suốt .png)</Select.Option>
              <Select.Option value="audio">Âm thanh nền (Nhạc BGM .mp3)</Select.Option>
            </Select>
          </Form.Item>

          <Form.Item label="File đính kèm" required>
            <Upload
              beforeUpload={(file) => {
                setFileList([file])
                return false // Ngăn auto upload
              }}
              onRemove={() => setFileList([])}
              fileList={fileList}
              maxCount={1}
            >
              <Button icon={<UploadOutlined />}>Chọn File (Max 100MB)</Button>
            </Upload>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
