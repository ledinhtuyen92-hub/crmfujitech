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
      const formData = new FormData()
      formData.append('name', values.name)
      formData.append('asset_type', values.asset_type)
      formData.append('file', fileList[0].originFileObj)
      
      await api.post('/live_sessions/media-assets/', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      })
      
      message.success('Tải lên thành công')
      setUploadVisible(false)
      form.resetFields()
      setFileList([])
      fetchAssets()
    } catch (err) {
      message.error('Lỗi khi tải lên: ' + (err.response?.data?.detail || err.message))
    } finally {
      setUploading(false)
    }
  }

  const columns = [
    {
      title: 'Tên tài nguyên',
      dataIndex: 'name',
      key: 'name',
      render: (text, record) => (
        <Space>
          {record.asset_type === 'avatar' && <VideoCameraOutlined style={{ color: '#1890ff' }} />}
          {record.asset_type === 'background' && <PictureOutlined style={{ color: '#52c41a' }} />}
          {record.asset_type === 'overlay' && <BlockOutlined style={{ color: '#faad14' }} />}
          {record.asset_type === 'audio' && <AudioOutlined style={{ color: '#eb2f96' }} />}
          <Text strong>{text}</Text>
          {record.is_system && <Tag color="gold">Hệ thống</Tag>}
        </Space>
      )
    },
    {
      title: 'Loại',
      dataIndex: 'asset_type_display',
      key: 'asset_type_display',
    },
    {
      title: 'File',
      key: 'file',
      render: (_, record) => (
        <a href={record.file} target="_blank" rel="noreferrer">Xem / Tải về</a>
      )
    },
    {
      title: 'Ngày tạo',
      dataIndex: 'created_at',
      key: 'created_at',
      render: (val) => new Date(val).toLocaleString('vi-VN')
    },
    {
      title: 'Thao tác',
      key: 'action',
      render: (_, record) => (
        <Popconfirm title="Chắc chắn xóa?" onConfirm={() => handleDelete(record.id)} disabled={record.is_system}>
          <Button danger type="text" icon={<DeleteOutlined />} disabled={record.is_system} />
        </Popconfirm>
      )
    }
  ]

  const getFilteredAssets = (type) => {
    if (type === 'all') return assets
    return assets.filter(a => a.asset_type === type)
  }

  const tabItems = [
    { key: 'all', label: 'Tất cả', children: <Table columns={columns} dataSource={getFilteredAssets('all')} rowKey="id" loading={loading} /> },
    { key: 'avatar', label: 'Avatar (Phông xanh)', children: <Table columns={columns} dataSource={getFilteredAssets('avatar')} rowKey="id" loading={loading} /> },
    { key: 'background', label: 'Phông nền', children: <Table columns={columns} dataSource={getFilteredAssets('background')} rowKey="id" loading={loading} /> },
    { key: 'overlay', label: 'Lớp phủ / Logo', children: <Table columns={columns} dataSource={getFilteredAssets('overlay')} rowKey="id" loading={loading} /> },
    { key: 'audio', label: 'Âm thanh', children: <Table columns={columns} dataSource={getFilteredAssets('audio')} rowKey="id" loading={loading} /> },
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
              <Select.Option value="audio">Âm thanh (Nhạc nền .mp3)</Select.Option>
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
