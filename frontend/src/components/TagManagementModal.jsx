import React, { useState, useEffect, useCallback } from 'react'
import { Modal, Table, Button, Space, Input, ColorPicker, Form, Popconfirm, message, Tag } from 'antd'
import { PlusOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons'
import api from '../utils/api'

function TagManagementModal({ open, onCancel }) {
  const [tags, setTags] = useState([])
  const [loading, setLoading] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [form] = Form.useForm()

  const fetchTags = useCallback(async () => {
    setLoading(true)
    try {
      const res = await api.get('/crm/tags/')
      const data = Array.isArray(res.data) ? res.data : res.data?.results ?? []
      setTags(data)
    } catch {
      message.error('Không thể tải danh sách thẻ (tags).')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (open) {
      fetchTags()
    } else {
      form.resetFields()
      setEditingId(null)
    }
  }, [open, fetchTags, form])

  const handleSave = async (values) => {
    // values.color from ColorPicker is an object or string
    const colorHex = typeof values.color === 'string' 
      ? values.color 
      : values.color?.toHexString?.() || '#1649c9'

    const payload = {
      name: values.name,
      color: colorHex
    }

    try {
      if (editingId) {
        await api.patch(`/crm/tags/${editingId}/`, payload)
        message.success('Cập nhật tag thành công')
      } else {
        await api.post('/crm/tags/', payload)
        message.success('Thêm tag thành công')
      }
      form.resetFields()
      setEditingId(null)
      fetchTags()
    } catch (err) {
      message.error(err.response?.data?.detail || 'Có lỗi xảy ra khi lưu tag.')
    }
  }

  const handleEdit = (record) => {
    setEditingId(record.id)
    form.setFieldsValue({
      name: record.name,
      color: record.color,
    })
  }

  const handleCancelEdit = () => {
    setEditingId(null)
    form.resetFields()
  }

  const handleDelete = async (id) => {
    try {
      await api.delete(`/crm/tags/${id}/`)
      message.success('Đã xóa tag')
      fetchTags()
    } catch {
      message.error('Lỗi khi xóa tag.')
    }
  }

  const columns = [
    {
      title: 'Tên Tag',
      dataIndex: 'name',
      render: (text, record) => <Tag color={record.color}>{text}</Tag>,
    },
    {
      title: 'Màu',
      dataIndex: 'color',
    },
    {
      title: 'Thao tác',
      align: 'right',
      render: (_, record) => (
        <Space>
          <Button size="small" icon={<EditOutlined />} onClick={() => handleEdit(record)} />
          <Popconfirm title="Xóa tag này?" onConfirm={() => handleDelete(record.id)}>
            <Button size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      )
    }
  ]

  return (
    <Modal
      title="Quản lý Tags Khách hàng"
      open={open}
      onCancel={onCancel}
      footer={null}
      width={600}
    >
      <Form 
        form={form} 
        layout="inline" 
        onFinish={handleSave} 
        style={{ marginBottom: 16 }}
      >
        <Form.Item name="name" rules={[{ required: true, message: 'Nhập tên tag' }]}>
          <Input placeholder="Tên tag mới..." />
        </Form.Item>
        <Form.Item name="color" initialValue="#1649c9">
          <ColorPicker showText />
        </Form.Item>
        <Form.Item>
          <Button type="primary" htmlType="submit" icon={<PlusOutlined />}>
            {editingId ? 'Cập nhật' : 'Thêm'}
          </Button>
          {editingId && (
            <Button style={{ marginLeft: 8 }} onClick={handleCancelEdit}>Hủy</Button>
          )}
        </Form.Item>
      </Form>

      <Table scroll={{ x: 'max-content' }}
        dataSource={tags}
        columns={columns}
        rowKey="id"
        pagination={{ pageSize: 25 }}
        loading={loading}
        size="small"
      />
    </Modal>
  )
}

export default TagManagementModal
