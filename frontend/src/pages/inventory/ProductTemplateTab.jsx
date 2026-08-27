import {
  AppstoreAddOutlined,
  DeleteOutlined,
  EditOutlined,
  PlusOutlined,
  SisternodeOutlined
} from '@ant-design/icons'
import {
  Button, Card, Col, Form, Input, Modal, Popconfirm, Row, Select, Space, Table, Tag, Typography, message, List, Upload
} from 'antd'
import React, { useCallback, useEffect, useState } from 'react'
import api from '../../utils/api'
import { useResponsive } from '../../hooks/useResponsive'

const { Text } = Typography

export default function ProductTemplateTab({ categories }) {
  const { isMobile } = useResponsive()
  const [templates, setTemplates] = useState([])
  const [loading, setLoading] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [variantModalOpen, setVariantModalOpen] = useState(false)
  const [editingTemplate, setEditingTemplate] = useState(null)
  
  const [variantImageFile, setVariantImageFile] = useState(null)
  const [variantPreviewImage, setVariantPreviewImage] = useState(null)
  
  const [form] = Form.useForm()
  const [variantForm] = Form.useForm()

  const fetchTemplates = useCallback(async () => {
    setLoading(true)
    try {
      const res = await api.get('/inventory/product-templates/')
      setTemplates(Array.isArray(res.data) ? res.data : res.data?.results ?? [])
    } catch {
      message.error('Không thể tải danh sách mẫu sản phẩm.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchTemplates()
  }, [fetchTemplates])

  const handleOpenModal = (template = null) => {
    setEditingTemplate(template)
    form.setFieldsValue(
      template
        ? { name: template.name, sku: template.sku, category: template.category, description: template.description }
        : { name: '', sku: '', category: null, description: '' }
    )
    setModalOpen(true)
  }

  const handleSubmit = async (values) => {
    try {
      if (editingTemplate) {
        await api.patch(`/inventory/product-templates/${editingTemplate.id}/`, values)
        message.success('Cập nhật thành công.')
      } else {
        await api.post('/inventory/product-templates/', values)
        message.success('Tạo mẫu sản phẩm thành công.')
      }
      setModalOpen(false)
      fetchTemplates()
    } catch {
      message.error('Có lỗi xảy ra.')
    }
  }

  const handleDelete = async (id) => {
    try {
      await api.delete(`/inventory/product-templates/${id}/`)
      message.success('Đã xóa mẫu sản phẩm.')
      fetchTemplates()
    } catch {
      message.error('Không thể xóa.')
    }
  }

  const handleOpenVariantModal = (template) => {
    setEditingTemplate(template)
    setVariantImageFile(null)
    setVariantPreviewImage(null)
    variantForm.setFieldsValue({
      attributes: [
        { name: 'Màu sắc', values: [] },
        { name: 'Kích thước', values: [] }
      ]
    })
    setVariantModalOpen(true)
  }

  const handleGenerateVariants = async (values) => {
    try {
      // attributes structure: [{name: 'Màu', values: ['Đỏ', 'Xanh']}]
      const validAttributes = values.attributes.filter(a => a.name && a.values && a.values.length > 0)
      
      const formData = new FormData()
      formData.append('attributes', JSON.stringify(validAttributes))
      if (variantImageFile) {
        formData.append('image', variantImageFile)
      }
      
      await api.postForm(`/inventory/product-templates/${editingTemplate.id}/generate_variants/`, formData)
      message.success('Sinh biến thể thành công! Bạn có thể xem trong tab Sản phẩm.')
      setVariantModalOpen(false)
    } catch (err) {
      message.error('Có lỗi khi sinh biến thể.')
    }
  }

  const columns = [
    {
      title: 'Tên mẫu sản phẩm',
      dataIndex: 'name',
      key: 'name',
      render: (name) => <Text strong>{name}</Text>
    },
    {
      title: 'Mã mẫu',
      dataIndex: 'sku',
      key: 'sku',
      render: (sku) => sku ? <Text type="secondary">{sku}</Text> : <Text type="secondary">—</Text>
    },
    {
      title: 'Loại sản phẩm',
      dataIndex: 'category',
      key: 'category',
      render: (catId) => {
        const c = categories.find(x => x.id === catId)
        return c ? <Tag color="blue">{c.name}</Tag> : <Text type="secondary">—</Text>
      }
    },
    {
      title: 'Mô tả',
      dataIndex: 'description',
      key: 'description'
    },
    {
      title: 'Thao tác',
      key: 'actions',
      render: (_, record) => (
        <Space>
          <Button 
            type="primary" 
            icon={<SisternodeOutlined />} 
            onClick={() => handleOpenVariantModal(record)}
            size="small"
          >
            Sinh biến thể
          </Button>
          <Button icon={<EditOutlined />} onClick={() => handleOpenModal(record)} size="small" />
          <Popconfirm title="Xóa mẫu này?" onConfirm={() => handleDelete(record.id)}>
            <Button danger icon={<DeleteOutlined />} size="small" />
          </Popconfirm>
        </Space>
      )
    }
  ]

  return (
    <div>
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'flex-end' }}>
        <Button type="primary" icon={<AppstoreAddOutlined />} onClick={() => handleOpenModal()}>
          Tạo Mẫu Sản Phẩm
        </Button>
      </div>

      {isMobile ? (
        <List
          dataSource={templates}
          loading={loading}
          pagination={{ pageSize: 10, size: "small" }}
          renderItem={(record) => {
            const c = categories.find(x => x.id === record.category)
            return (
              <List.Item style={{ background: '#fff', borderRadius: 8, padding: 12, marginBottom: 8, border: '1px solid #f0f0f0' }}>
                <List.Item.Meta
                  title={
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div>
                        <Text strong style={{ fontSize: 14, display: 'block' }}>{record.name}</Text>
                        {record.sku && <Text type="secondary" style={{ fontSize: 12 }}>Mã: {record.sku}</Text>}
                      </div>
                      <Space size={0}>
                        <Button type="text" size="small" icon={<EditOutlined style={{ color: '#d97706' }} />} onClick={() => handleOpenModal(record)} />
                        <Popconfirm title="Xóa mẫu này?" onConfirm={() => handleDelete(record.id)}>
                          <Button danger type="text" size="small" icon={<DeleteOutlined />} />
                        </Popconfirm>
                      </Space>
                    </div>
                  }
                  description={
                    <div style={{ marginTop: 4 }}>
                      <div style={{ marginBottom: 8 }}>
                        {c ? <Tag color="blue">{c.name}</Tag> : <Text type="secondary">—</Text>}
                      </div>
                      <Text type="secondary" style={{ display: 'block' }}>{record.description || 'Không có mô tả'}</Text>
                      <Button 
                        type="primary" 
                        icon={<SisternodeOutlined />} 
                        onClick={() => handleOpenVariantModal(record)}
                        size="small"
                        style={{ marginTop: 8 }}
                      >
                        Sinh biến thể
                      </Button>
                    </div>
                  }
                />
              </List.Item>
            )
          }}
        />
      ) : (
        <Table 
          columns={columns} 
          dataSource={templates} 
          rowKey="id" 
          loading={loading}
          scroll={{ x: 'max-content' }}
        />
      )}

      {/* CRUD Modal */}
      <Modal
        title={editingTemplate ? "Sửa mẫu sản phẩm" : "Tạo mẫu sản phẩm"}
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onOk={() => form.submit()}
      >
        <Form form={form} layout="vertical" onFinish={handleSubmit}>
          <Form.Item name="name" label="Tên mẫu" rules={[{ required: true }]}>
            <Input placeholder="VD: Áo thun Polo nam..." />
          </Form.Item>
          <Form.Item name="sku" label="Mã mẫu (Tiền tố SKU)" help="Dùng làm tiền tố khi sinh biến thể tự động (ví dụ: POLO)">
            <Input placeholder="VD: POLO" />
          </Form.Item>
          <Form.Item name="category" label="Loại sản phẩm">
            <Select placeholder="Chọn loại...">
              {categories.map(c => <Select.Option key={c.id} value={c.id}>{c.name}</Select.Option>)}
            </Select>
          </Form.Item>
          <Form.Item name="description" label="Mô tả">
            <Input.TextArea rows={3} />
          </Form.Item>
        </Form>
      </Modal>

      {/* Variant Generator Modal */}
      <Modal
        title={
          <Space>
            <SisternodeOutlined />
            <span>Sinh biến thể cho: {editingTemplate?.name}</span>
          </Space>
        }
        open={variantModalOpen}
        onCancel={() => setVariantModalOpen(false)}
        onOk={() => variantForm.submit()}
        width={600}
        okText="Tiến hành sinh"
      >
        <div style={{ marginBottom: 16 }}>
          <Text type="secondary">Nhập các thuộc tính để hệ thống tự động nhân bản thành các sản phẩm con (biến thể).</Text>
        </div>
        <Form form={variantForm} layout="vertical" onFinish={handleGenerateVariants}>
          <Form.Item label="Hình ảnh dùng chung cho các biến thể">
            <Upload
              listType="picture-card"
              showUploadList={false}
              beforeUpload={(file) => {
                setVariantImageFile(file)
                const reader = new FileReader()
                reader.onload = (e) => setVariantPreviewImage(e.target.result)
                reader.readAsDataURL(file)
                return false
              }}
            >
              {variantPreviewImage ? (
                <img src={variantPreviewImage} alt="preview" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              ) : (
                <div>
                  <PlusOutlined />
                  <div style={{ marginTop: 8 }}>Tải ảnh lên</div>
                </div>
              )}
            </Upload>
          </Form.Item>
          
          <Form.List name="attributes">
            {(fields, { add, remove }) => (
              <>
                {fields.map(({ key, name, ...restField }) => (
                  <Row key={key} gutter={12} style={{ marginBottom: 8, alignItems: 'center' }}>
                    <Col xs={24} md={8}>
                      <Form.Item
                        {...restField}
                        name={[name, 'name']}
                        rules={[{ required: true, message: 'Nhập tên thuộc tính' }]}
                        style={{ marginBottom: 0 }}
                      >
                        <Input placeholder="Tên: Màu sắc, Size..." />
                      </Form.Item>
                    </Col>
                    <Col xs={24} md={14}>
                      <Form.Item
                        {...restField}
                        name={[name, 'values']}
                        style={{ marginBottom: 0 }}
                      >
                        <Select
                          mode="tags"
                          style={{ width: '100%' }}
                          placeholder="Nhập giá trị và ấn Enter: Đỏ, Xanh..."
                        />
                      </Form.Item>
                    </Col>
                    <Col xs={24} md={2}>
                      <Button danger icon={<DeleteOutlined />} onClick={() => remove(name)} type="text" />
                    </Col>
                  </Row>
                ))}
                <Form.Item style={{ marginTop: 16 }}>
                  <Button type="dashed" onClick={() => add()} block icon={<PlusOutlined />}>
                    Thêm thuộc tính
                  </Button>
                </Form.Item>
              </>
            )}
          </Form.List>
        </Form>
      </Modal>
    </div>
  )
}
