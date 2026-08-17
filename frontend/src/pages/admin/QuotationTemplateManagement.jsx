import React, { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Card, Table, Button, Space, Typography, Tag,
  message, Popconfirm, theme, Modal, Input
} from 'antd'
import {
  PlusOutlined, EditOutlined, DeleteOutlined,
  EyeOutlined, LayoutOutlined, FormatPainterOutlined
} from '@ant-design/icons'
import api from '../../utils/api'
import QuotationRenderer from '../../components/QuotationRenderer'

const { Title, Text } = Typography

export default function QuotationTemplateManagement() {
  const navigate = useNavigate()
  const { token } = theme.useToken()
  const [messageApi, contextHolder] = message.useMessage()
  const [loading, setLoading] = useState(false)
  const [templates, setTemplates] = useState([])

  // Preview Modal
  const [previewVisible, setPreviewVisible] = useState(false)
  const [previewTemplate, setPreviewTemplate] = useState(null)

  const fetchTemplates = useCallback(async () => {
    setLoading(true)
    try {
      const res = await api.get('sales/quotation-templates/')
      const data = Array.isArray(res.data) ? res.data : res.data?.results || []
      setTemplates(data)
    } catch {
      messageApi.error('Không thể tải danh sách mẫu báo giá.')
    } finally {
      setLoading(false)
    }
  }, [messageApi])

  useEffect(() => {
    fetchTemplates()
  }, [fetchTemplates])

  const handleOpenAdd = () => {
    let name = ''
    Modal.confirm({
      title: 'Tạo mẫu báo giá mới',
      content: (
        <div style={{ marginTop: 16 }}>
          <Input
            placeholder="Nhập tên mẫu báo giá (VD: Mẫu Hiện Đại)"
            autoFocus
            onChange={(e) => { name = e.target.value }}
          />
        </div>
      ),
      okText: 'Tạo & Thiết kế',
      cancelText: 'Huỷ',
      onOk: async () => {
        if (!name.trim()) {
          messageApi.error('Vui lòng nhập tên mẫu!')
          return Promise.reject()
        }
        try {
          const res = await api.post('sales/quotation-templates/', {
            name: name,
            code: `template_${Date.now()}`,
            is_active: true,
            is_default: false,
            layout_style: 'modern_navy',
            layout_config: {
              paper_orientation: 'portrait',
              theme_color: '#1649c9',
              table_style: 'classic_border'
            }
          })
          messageApi.success('Đã tạo mẫu thành công!')
          navigate(`/admin/quotation-templates/${res.data.id}/builder`)
        } catch (err) {
          messageApi.error('Lỗi khi tạo mẫu báo giá.')
          return Promise.reject()
        }
      }
    })
  }

  const handleDelete = async (id) => {
    try {
      await api.delete(`sales/quotation-templates/${id}/`)
      messageApi.success('Đã xóa mẫu báo giá!')
      fetchTemplates()
    } catch {
      messageApi.error('Lỗi khi xóa mẫu báo giá.')
    }
  }

  const handlePreview = (record) => {
    setPreviewTemplate(record)
    setPreviewVisible(true)
  }

  const columns = [
    {
      title: 'Mã mẫu',
      dataIndex: 'code',
      width: 190,
      render: (code) => (
        <Tag color="purple" style={{ whiteSpace: 'normal', wordBreak: 'break-all', margin: 0 }}>
          {code}
        </Tag>
      ),
    },
    {
      title: 'Tên mẫu báo giá',
      dataIndex: 'name',
      width: 280,
      render: (name, record) => (
        <Space direction="vertical" size={4} style={{ display: 'flex' }}>
          <Text strong style={{ wordBreak: 'break-word', display: 'block' }}>{name}</Text>
          <Space wrap size={[4, 4]}>
            {record.is_default && <Tag color="blue" style={{ margin: 0 }}>Mặc định hệ thống</Tag>}
            {!record.is_active && <Tag color="default" style={{ margin: 0 }}>Đã ẩn</Tag>}
          </Space>
        </Space>
      ),
    },
    {
      title: 'Màu Theme / Kiểu & Khổ',
      width: 250,
      render: (_, record) => {
        const cfg = record.layout_config || {}
        const clr = cfg.theme_color || '#1649c9'
        const isLand = cfg.paper_orientation === 'landscape'
        return (
          <Space wrap size={[6, 6]} style={{ display: 'flex', alignItems: 'center' }}>
            <span style={{ display: 'inline-block', width: 16, height: 16, borderRadius: '50%', background: clr, border: '1px solid #ccc', flexShrink: 0 }} />
            <Tag color="geekblue" style={{ margin: 0 }}>{cfg.table_style || record.layout_style || 'modern_navy'}</Tag>
            <Tag color={isLand ? 'purple' : 'cyan'} style={{ margin: 0 }}>{isLand ? '📄 Khổ Ngang A4' : '📄 Khổ Dọc A4'}</Tag>
          </Space>
        )
      },
    },
    {
      title: 'Mô tả ngắn',
      dataIndex: 'description',
      ellipsis: true,
      minWidth: 200,
    },
    {
      title: 'Thao tác',
      key: 'actions',
      width: 300,
      align: 'right',
      render: (_, record) => (
        <Space>
          <Button size="small" icon={<EyeOutlined />} onClick={() => handlePreview(record)}>
            Xem
          </Button>
          <Button 
            size="small" 
            type="primary" 
            style={{ background: '#722ed1' }} 
            icon={<FormatPainterOutlined />} 
            onClick={() => navigate(`/admin/quotation-templates/${record.id}/builder`)}
          >
            Thiết kế
          </Button>
          <Popconfirm title="Xóa mẫu này?" onConfirm={() => handleDelete(record.id)} okText="Xóa" cancelText="Hủy">
            <Button size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ]

  return (
    <div style={{ padding: '0 24px 24px 24px', maxWidth: 1400, margin: '0 auto' }}>
      {contextHolder}
      
      <div style={{ marginBottom: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <Title level={3} style={{ margin: '0 0 8px 0', color: '#1e293b' }}>Kho Mẫu Báo Giá</Title>
          <Text type="secondary" style={{ fontSize: 15 }}>
            Quản lý và thiết kế các mẫu báo giá đẹp mắt gửi cho khách hàng.
          </Text>
        </div>
        <Button type="primary" size="large" icon={<PlusOutlined />} onClick={handleOpenAdd} style={{ background: '#16a34a' }}>
          Tạo mẫu mới
        </Button>
      </div>

      <Card variant="borderless" style={{ borderRadius: 12, boxShadow: '0 4px 20px rgba(0,0,0,0.06)' }} styles={{ body: { padding: 0 } }}>
        <Table
          dataSource={templates}
          columns={columns}
          rowKey="id"
          loading={loading}
          pagination={false}
          scroll={{ x: 'max-content' }}
        />
      </Card>

      {/* Preview Modal */}
      <Modal
        title={previewTemplate ? `Xem trước: ${previewTemplate.name}` : 'Xem trước'}
        open={previewVisible}
        onCancel={() => setPreviewVisible(false)}
        footer={null}
        width={1000}
        destroyOnHidden
        style={{ top: 20 }}
      >
        {previewTemplate && (
          <div style={{ background: '#f0f2f5', padding: 24, display: 'flex', justifyContent: 'center' }}>
            <div 
              style={{
                width: previewTemplate.layout_config?.paper_orientation === 'landscape' ? '297mm' : '210mm',
                minHeight: previewTemplate.layout_config?.paper_orientation === 'landscape' ? '210mm' : '297mm',
                background: 'white',
                padding: '20mm',
                boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                transform: previewTemplate.layout_config?.paper_orientation === 'landscape' ? 'scale(0.85)' : 'scale(0.95)',
                transformOrigin: 'top center'
              }}
            >
              <QuotationRenderer 
                layoutConfig={previewTemplate.layout_config || {}}
                layoutStyle={previewTemplate.layout_style}
                data={{
                  customer: { name: 'CÔNG TY KHÁCH HÀNG', phone: '0912345678', address: 'Tòa nhà văn phòng XYZ', tax_code: '0109999999' },
                  company: { name: 'CÔNG TY CỦA BẠN', phone: '0912345678', address: 'Hà Nội', tax_code: '0101234567' },
                  items: [
                    { product_name: 'Sản phẩm demo A', spec: 'Mô tả sản phẩm demo', width: 900, height: 2200, thickness: 45, symbol: 'D1', note: 'Khung ngoại 45x110', unit: 'Bộ', quantity: 2, unit_price: 1250000, total_price: 2500000, custom_data: { custom_1: 'Dữ liệu mẫu' } }
                  ],
                  totals: { subtotal: 2500000, discount: 50000, tax_percent: 10, tax: 250000, shipping_fee: 50000, installation_fee: 100000, total: 2850000 },
                  payment_terms_schedule: [ { title: 'Tạm ứng', percentage: 50 }, { title: 'Thanh toán', percentage: 50 } ],
                  paid_amount: 0,
                  total_amount: 2850000
                }}
              />
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
