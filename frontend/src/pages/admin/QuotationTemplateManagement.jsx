import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  CheckCircleOutlined,
  DeleteOutlined,
  EditOutlined,
  EyeOutlined,
  EyeInvisibleOutlined,
  FileTextOutlined,
  PlusOutlined,
  ArrowUpOutlined,
  ArrowDownOutlined,
  BgColorsOutlined,
  LayoutOutlined,
  SettingOutlined,
} from '@ant-design/icons'
import {
  Badge,
  Button,
  Card,
  Col,
  Divider,
  Form,
  Input,
  Modal,
  Popconfirm,
  Row,
  Select,
  Space,
  Table,
  Tag,
  Typography,
  message,
  theme,
  Tooltip,
} from 'antd'
import api from '../../utils/api'
import QuotationRenderer from '../../components/QuotationRenderer'

const { Title, Text, Paragraph } = Typography
const { Option } = Select
const { TextArea } = Input

const DEFAULT_SECTIONS = [
  { id: 'header', name: '🏢 Khối Header & Logo Công ty', visible: true, order: 1 },
  { id: 'title', name: '📌 Khối Tiêu đề & Lời chào', visible: true, order: 2 },
  { id: 'customer_info', name: '👤 Khối Thông tin Khách hàng / Đối tác', visible: true, order: 3 },
  { id: 'items_table', name: '📦 Khối Bảng Hạng mục Sản phẩm & Dịch vụ', visible: true, order: 4 },
  { id: 'summary', name: '💰 Khối Tổng kết Thanh toán & Chiết khấu', visible: true, order: 5 },
  { id: 'terms', name: '📜 Khối Ghi chú & Điều khoản (Từ Admin Công ty)', visible: true, order: 6 },
  { id: 'signatures', name: '✍️ Khối Chữ ký Xác nhận', visible: true, order: 7, columns: 2 },
]

const THEME_COLORS = [
  { label: 'Xanh Navy (Chuẩn SaaS)', value: '#1649c9', color: '#1649c9' },
  { label: 'Xanh Lục Bảo (Emerald)', value: '#16a34a', color: '#16a34a' },
  { label: 'Vàng Hổ Phách (Amber)', value: '#d97706', color: '#d97706' },
  { label: 'Tím Hoàng Gia (Royal Purple)', value: '#7c3aed', color: '#7c3aed' },
  { label: 'Xám Than Lịch Sự (Slate)', value: '#0f172a', color: '#0f172a' },
]

export default function QuotationTemplateManagement() {
  const navigate = useNavigate()
  const { token } = theme.useToken()
  const [messageApi, contextHolder] = message.useMessage()
  const [loading, setLoading] = useState(false)
  const [templates, setTemplates] = useState([])

  // Modal State
  const [modalVisible, setModalVisible] = useState(false)
  const [editingTemplate, setEditingTemplate] = useState(null)
  const [form] = Form.useForm()
  const [submitting, setSubmitting] = useState(false)

  // Visual Builder State
  const [themeColor, setThemeColor] = useState('#1649c9')
  const [tableStyle, setTableStyle] = useState('classic_border')
  const [paperOrientation, setPaperOrientation] = useState('portrait')
  const [customTitle, setCustomTitle] = useState('BÁO GIÁ SẢN XUẤT CỬA COMPOSITE')
  const [sections, setSections] = useState(DEFAULT_SECTIONS)

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
    setEditingTemplate(null)
    form.resetFields()
    setThemeColor('#1649c9')
    setTableStyle('classic_border')
    setPaperOrientation('portrait')
    setCustomTitle('BÁO GIÁ SẢN XUẤT CỬA COMPOSITE')
    setSections(DEFAULT_SECTIONS)
    form.setFieldsValue({
      layout_style: 'modern_navy',
      is_default: false,
      is_active: true,
      header_content: '',
      footer_content: "1. Báo giá có hiệu lực trong vòng 15 ngày kể từ ngày xuất báo giá.\n2. Thanh toán: Tạm ứng 50% ngay sau khi xác nhận đơn hàng, 50% còn lại thanh toán sau khi bàn giao nghiệm thu.\n3. Đơn giá trên chưa bao gồm thuế VAT (nếu xuất hóa đơn).\n4. Bảo hành: Theo tiêu chuẩn từ nhà sản xuất kể từ ngày bàn giao.",
    })
    setModalVisible(true)
  }

  const handleOpenEdit = (record) => {
    setEditingTemplate(record)
    form.setFieldsValue(record)
    const config = record.layout_config || {}
    setThemeColor(config.theme_color || '#1649c9')
    setTableStyle(config.table_style || record.layout_style || 'classic_border')
    setPaperOrientation(config.paper_orientation || 'portrait')
    setCustomTitle(config.custom_title || (record.code === 'production_landscape_a4' || config.paper_orientation === 'landscape' ? 'BÁO GIÁ SẢN XUẤT CỬA COMPOSITE' : 'BẢNG BÁO GIÁ CHI TIẾT'))
    if (config.sections && Array.isArray(config.sections) && config.sections.length > 0) {
      setSections(config.sections)
    } else {
      setSections(DEFAULT_SECTIONS)
    }
    setModalVisible(true)
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

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields()
      setSubmitting(true)
      values.layout_config = {
        theme_color: themeColor,
        table_style: tableStyle,
        paper_orientation: paperOrientation,
        custom_title: customTitle,
        sections: sections,
      }
      if (editingTemplate) {
        await api.patch(`sales/quotation-templates/${editingTemplate.id}/`, values)
        messageApi.success('Cập nhật mẫu báo giá thành công!')
      } else {
        await api.post('sales/quotation-templates/', values)
        messageApi.success('Tạo mới mẫu báo giá thành công!')
      }
      setModalVisible(false)
      fetchTemplates()
    } catch (err) {
      if (err.errorFields) return
      messageApi.error('Lỗi khi lưu mẫu báo giá.')
    } finally {
      setSubmitting(false)
    }
  }

  const handlePreview = (record) => {
    setPreviewTemplate(record)
    setPreviewVisible(true)
  }

  // Section Ordering Helpers
  const moveSection = (index, direction) => {
    const targetIndex = index + direction
    if (targetIndex < 0 || targetIndex >= sections.length) return
    const updated = [...sections]
    const temp = updated[index]
    updated[index] = updated[targetIndex]
    updated[targetIndex] = temp
    updated.forEach((s, idx) => { s.order = idx + 1 })
    setSections(updated)
  }

  const toggleSectionVisibility = (id) => {
    setSections(prev => prev.map(s => s.id === id ? { ...s, visible: !s.visible } : s))
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
            <Tag color={isLand ? 'purple' : 'cyan'} style={{ margin: 0 }}>{isLand ? '📐 Khổ Ngang A4' : '📄 Khổ Dọc A4'}</Tag>
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
      width: 320,
      align: 'right',
      render: (_, record) => (
        <Space>
          <Button size="small" icon={<EyeOutlined />} onClick={() => handlePreview(record)}>
            Xem
          </Button>
          <Button size="small" type="primary" ghost icon={<EditOutlined />} onClick={() => handleOpenEdit(record)}>
            Sửa
          </Button>
          <Button size="small" type="primary" style={{ background: '#722ed1' }} icon={<LayoutOutlined />} onClick={() => navigate(`/admin/quotation-templates/${record.id}/builder`)}>
            Thiết kế Kéo thả
          </Button>
          <Popconfirm
            title="Xác nhận xóa mẫu này?"
            onConfirm={() => handleDelete(record.id)}
            okText="Xóa"
            cancelText="Hủy"
          >
            <Button size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ]

  // Render Simulated Block in Preview
  const renderSimulatedSection = (sec, clr, tblStyle, footerText, orientation = paperOrientation, cTitle = customTitle) => {
    if (!sec.visible) return null
    switch (sec.id) {
      case 'header':
        return (
          <div key="header" style={{ marginBottom: 16, padding: '14px 18px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8 }}>
            <Row justify="space-between" align="middle">
              <Col xs={24} md={8}>
                <div style={{ width: 56, height: 56, borderRadius: 6, background: '#e0e7ff', color: clr, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 16 }}>
                  LOGO
                </div>
              </Col>
              <Col xs={24} md={16} style={{ textAlign: 'right' }}>
                <div style={{ fontWeight: 700, color: clr, fontSize: 16 }}>TÊN CÔNG TY CỦA BẠN</div>
                <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>MST: 0101234567 • Hotline: 1900 xxxx</div>
                <div style={{ fontSize: 12, color: '#64748b' }}>Địa chỉ: Tòa nhà SaaS, TP. Hà Nội</div>
              </Col>
            </Row>
          </div>
        )
      case 'title':
        return (
          <div key="title" style={{ textAlign: 'center', margin: '18px 0' }}>
            <div style={{ fontSize: 20, fontWeight: 700, color: clr, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              {cTitle || (orientation === 'landscape' ? 'BÁO GIÁ SẢN XUẤT CỬA COMPOSITE' : 'BẢNG BÁO GIÁ CHI TIẾT')}
            </div>
            <div style={{ display: 'inline-block', background: '#eff6ff', padding: '2px 12px', borderRadius: 12, border: '1px solid #bfdbfe', fontSize: 12, color: '#1d4ed8', margin: '6px 0' }}>
              Số: <strong>BG-202607-001</strong> | Ngày: <strong>07/07/2026</strong>
            </div>
            <div style={{ fontSize: 12.5, fontStyle: 'italic', color: '#475569', marginTop: 4 }}>
              Kính gửi Quý khách hàng, chúng tôi xin trân trọng gửi bảng báo giá các hạng mục chi tiết dưới đây:
            </div>
          </div>
        )
      case 'customer_info':
        if (orientation === 'landscape' || sec.columns === 2) {
          return (
            <Row key="customer_info" gutter={16} style={{ marginBottom: 16 }}>
              <Col xs={24} md={12}>
                <div style={{ padding: '10px 14px', background: '#f8fafc', border: `1px solid ${clr}40`, borderRadius: 6, height: '100%' }}>
                  <div style={{ fontWeight: 700, color: clr, fontSize: 13, marginBottom: 4 }}>🏢 BÊN BÁN (BÊN B): CÔNG TY CỦA BẠN</div>
                  <div style={{ fontSize: 12, color: '#334155' }}><strong>Đại diện:</strong> Nguyễn Anh Tuấn • <strong>Chức vụ:</strong> Giám đốc</div>
                  <div style={{ fontSize: 12, color: '#334155' }}><strong>Mã số thuế:</strong> 0111100289 • <strong>Điện thoại:</strong> 0961442882</div>
                  <div style={{ fontSize: 12, color: '#334155' }}><strong>Địa chỉ:</strong> KĐT Xa La, Hà Đông, TP Hà Nội</div>
                </div>
              </Col>
              <Col xs={24} md={12}>
                <div style={{ padding: '10px 14px', background: '#fff', border: '1px solid #e2e8f0', borderRadius: 6, height: '100%' }}>
                  <div style={{ fontWeight: 700, color: '#0f172a', fontSize: 13, marginBottom: 4 }}>👤 BÊN MUA (BÊN A): CÔNG TY KHÁCH HÀNG</div>
                  <div style={{ fontSize: 12, color: '#334155' }}><strong>Khách hàng:</strong> Công ty Kiến trúc và Nội thất K2</div>
                  <div style={{ fontSize: 12, color: '#334155' }}><strong>Mã số thuế:</strong> 0109999999 • <strong>Điện thoại:</strong> 0912345678</div>
                  <div style={{ fontSize: 12, color: '#334155' }}><strong>Địa chỉ:</strong> Vườn Cam, Hoài Đức, TP Hà Nội</div>
                </div>
              </Col>
            </Row>
          )
        }
        return (
          <div key="customer_info" style={{ marginBottom: 16, padding: '10px 14px', background: '#fff', border: '1px solid #e2e8f0', borderRadius: 6 }}>
            <div style={{ fontWeight: 600, color: clr, fontSize: 13, marginBottom: 4 }}>👤 Thông tin Khách hàng / Đối tác</div>
            <div style={{ fontSize: 12.5, color: '#334155' }}>
              <strong>Khách hàng:</strong> Công ty Cổ phần Khách hàng Mẫu • <strong>Điện thoại:</strong> 0988888888
            </div>
            <div style={{ fontSize: 12.5, color: '#334155' }}>
              <strong>Địa chỉ:</strong> 123 Đường Công Nghệ, Q. Cầu Giấy, Hà Nội
            </div>
          </div>
        )
      case 'items_table':
        const isLand = orientation === 'landscape'
        const landCols = [
          { title: 'STT', dataIndex: 'id', width: 45, align: 'center', render: (v, __, idx) => <span style={{ color: clr, fontWeight: 600 }}>{idx + 1}</span> },
          {
            title: 'MẪU CỬA / SẢN PHẨM',
            key: 'product_info',
            width: 240,
            render: (_, r, idx) => {
              let rowSpan = 1
              if (idx === 0) rowSpan = 2
              else if (idx === 1) rowSpan = 0
              else rowSpan = 1

              return {
                children: (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '4px 0', gap: 6 }}>
                    {r.img ? (
                      <img src={r.img} alt="prod" style={{ width: 64, height: 64, objectFit: 'cover', borderRadius: 6, border: '1px solid #cbd5e1' }} />
                    ) : null}
                    <strong style={{ display: 'block', color: '#0f172a', fontSize: 12.5, textAlign: 'center', lineHeight: 1.3 }}>{r.name}</strong>
                  </div>
                ),
                props: { rowSpan },
              }
            },
          },
          {
            title: 'KÍCH THƯỚC Ô CHỜ (mm)',
            children: [
              { title: 'Cao', dataIndex: 'height', width: 65, align: 'center', render: v => <strong style={{ color: '#1e293b' }}>{v}</strong> },
              { title: 'Rộng', dataIndex: 'width', width: 65, align: 'center', render: v => <strong style={{ color: '#1e293b' }}>{v}</strong> },
              { title: 'Dày', dataIndex: 'thickness', width: 65, align: 'center', render: v => <span>{v}</span> },
            ],
          },
          { title: 'KÝ HIỆU', dataIndex: 'symbol', width: 80, align: 'center', render: v => <Tag color="blue" style={{ fontWeight: 600 }}>{v}</Tag> },
          { title: 'GHI CHÚ KỸ THUẬT', dataIndex: 'note', width: 140, render: v => <span style={{ fontSize: 11.5 }}>{v}</span> },
          { title: 'SL', dataIndex: 'qty', align: 'center', width: 45 },
          { title: 'ĐVT', dataIndex: 'unit', align: 'center', width: 50 },
          { title: 'ĐƠN GIÁ/BỘ', dataIndex: 'price', align: 'right', width: 110, render: v => v.toLocaleString('vi-VN') + ' đ' },
          { title: 'TỔNG TIỀN', dataIndex: 'total', align: 'right', width: 120, render: v => <strong style={{ color: clr }}>{v.toLocaleString('vi-VN')} đ</strong> },
        ]
        const portCols = [
          { title: 'STT', dataIndex: 'id', width: 42, align: 'center', render: v => <span style={{ color: clr, fontWeight: 600 }}>{v}</span> },
          { title: 'Tên hàng hóa / Dịch vụ', dataIndex: 'name', width: 240, render: v => <strong style={{ color: '#1e293b' }}>{v}</strong> },
          { title: 'Kích thước / Ghi chú', dataIndex: 'note', width: 175, render: v => <span style={{ fontSize: 12, color: '#334155' }}>{v || '—'}</span> },
          { title: 'ĐVT', dataIndex: 'unit', width: 55, align: 'center' },
          { title: 'SL', dataIndex: 'qty', align: 'center', width: 48 },
          { title: 'Đơn giá', dataIndex: 'price', align: 'right', width: 110, render: v => v.toLocaleString('vi-VN') + ' đ' },
          { title: 'Thành tiền', dataIndex: 'total', align: 'right', width: 125, render: v => <strong style={{ color: clr }}>{v.toLocaleString('vi-VN')} đ</strong> },
        ]
        return (
          <div key="items_table" style={{ marginBottom: 16 }}>
            <Table
              dataSource={
                isLand
                  ? [
                      { id: 1, prodId: 'P1', name: 'Cửa Gỗ Nhựa Composite Cao Cấp - Cánh Phẳng', img: 'https://images.unsplash.com/photo-1513694203232-719a280e022f?w=150&auto=format&fit=crop&q=80', height: 2355, width: 997, thickness: 125, symbol: 'D1.1', note: 'Phòng Ngủ 1 (ko khoét lỗ khoá)', qty: 1, unit: 'bộ', price: 3370000, total: 3370000 },
                      { id: 2, prodId: 'P1', name: 'Cửa Gỗ Nhựa Composite Cao Cấp - Cánh Phẳng', img: 'https://images.unsplash.com/photo-1513694203232-719a280e022f?w=150&auto=format&fit=crop&q=80', height: 2355, width: 810, thickness: 125, symbol: 'D1.2', note: 'Phòng Ngủ 2 (khoá FT-103)', qty: 1, unit: 'bộ', price: 3370000, total: 3370000 },
                      { id: 3, prodId: 'P2', name: 'Cửa Gỗ Nhựa Composite - Có Ô Kính (DW1.1)', img: 'https://images.unsplash.com/photo-1506377247377-2a5b3b417ebb?w=150&auto=format&fit=crop&q=80', height: 2365, width: 690, thickness: 135, symbol: 'DW1.1', note: 'Phòng Vệ Sinh', qty: 1, unit: 'bộ', price: 2970000, total: 2970000 },
                    ]
                  : [
                      { id: 1, name: 'Sản phẩm demo A (Bàn văn phòng cao cấp)', note: 'KT: 1600x800mm, gỗ MDF chống ẩm', unit: 'bộ', qty: 1, price: 2500000, total: 2500000 },
                      { id: 2, name: 'Sản phẩm demo B (Ghế xoay công thái học)', note: 'Khung lưới thoáng khí, tay áo điều chỉnh', unit: 'chiếc', qty: 2, price: 1250000, total: 2500000 },
                    ]
              }
              rowKey="id"
              pagination={false}
              size="small"
              bordered={tblStyle === 'classic_border'}
              style={{ border: tblStyle === 'modern_clean' ? 'none' : undefined }}
              columns={isLand ? landCols : portCols}
              scroll={{ x: isLand ? 980 : undefined }}
            />
          </div>
        )
      case 'summary':
        const isLandSum = orientation === 'landscape'
        return (
          <Row key="summary" justify="end" style={{ marginBottom: 16 }}>
            <Col xs={24} md={11} style={{ textAlign: 'right', padding: '10px 14px', background: '#f8fafc', borderRadius: 6, border: '1px solid #e2e8f0' }}>
              <div style={{ fontSize: 12, color: '#64748b' }}>Cộng tiền hàng: {isLandSum ? '9,710,000 đ' : '10,000,000 đ'}</div>
              <div style={{ fontSize: 12, color: '#64748b' }}>Chiết khấu chung: -0 đ</div>
              <div style={{ fontSize: 15, fontWeight: 700, color: clr, marginTop: 4 }}>
                TỔNG THANH TOÁN: {isLandSum ? '9,710,000 đ' : '10,000,000 đ'}
              </div>
            </Col>
          </Row>
        )
      case 'terms':
        return (
          <div key="terms" style={{ marginBottom: 16 }}>
            <div style={{ fontWeight: 600, color: '#0f172a', fontSize: 13, marginBottom: 6 }}>📜 Ghi chú & Điều khoản thanh toán:</div>
            <div style={{ background: '#f8fafc', padding: '10px 14px', borderRadius: 6, borderLeft: `4px solid ${clr}`, whiteSpace: 'pre-wrap', fontSize: 12, color: '#334155' }}>
              {footerText || '1. Báo giá có hiệu lực trong vòng 15 ngày.\n2. Thanh toán: Tạm ứng 50% ngay sau khi xác nhận.'}
            </div>
            <div style={{ fontSize: 11, color: '#94a3b8', fontStyle: 'italic', marginTop: 4 }}>
              * Lưu ý: Khi áp dụng, Admin Công ty có thể tùy chỉnh điều khoản và số tài khoản ngân hàng riêng của công ty họ.
            </div>
          </div>
        )
      case 'signatures':
        return (
          <Row key="signatures" justify="space-around" style={{ marginTop: 24, textAlign: 'center', paddingBottom: 16 }}>
            <Col xs={24} md={10}>
              <div style={{ fontWeight: 700, color: clr, fontSize: 13 }}>ĐẠI DIỆN CÔNG TY</div>
              <div style={{ fontSize: 11, color: '#64748b', fontStyle: 'italic' }}>(Ký, đóng dấu & ghi rõ họ tên)</div>
              <div style={{ height: 60 }} />
              <div style={{ fontWeight: 600, color: '#334155', fontSize: 12 }}>Người lập báo giá</div>
            </Col>
            <Col xs={24} md={10}>
              <div style={{ fontWeight: 700, color: clr, fontSize: 13 }}>ĐẠI DIỆN KHÁCH HÀNG</div>
              <div style={{ fontSize: 11, color: '#64748b', fontStyle: 'italic' }}>(Ký & ghi rõ họ tên)</div>
              <div style={{ height: 60 }} />
            </Col>
          </Row>
        )
      default:
        return null
    }
  }

  return (
    <section>
      {contextHolder}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <Title level={2} style={{ margin: 0 }}>
            <FileTextOutlined style={{ marginRight: 12, color: token.colorPrimary }} />
            Quản Lý Mẫu Báo Giá Hệ Thống
          </Title>
          <Text type="secondary">
            Thiết lập bố cục, màu sắc và cấu trúc khối (Kéo-Thả / Sắp xếp trực quan) cho các doanh nghiệp SaaS
          </Text>
        </div>
        <Button type="primary" icon={<PlusOutlined />} size="large" onClick={handleOpenAdd}>
          Tạo Mẫu Báo Giá Mới
        </Button>
      </div>

      <Card style={{ borderRadius: 10, boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
        <Table
          columns={columns}
          dataSource={templates}
          rowKey="id"
          loading={loading}
          pagination={{ pageSize: 10 }}
          scroll={{ x: 1300 }}
        />
      </Card>

      {/* ── Modal Split-Screen Visual Builder ───────────────────────────── */}
      <Modal
        title={
          <Space>
            <LayoutOutlined style={{ color: themeColor }} />
            <span style={{ fontSize: 18, fontWeight: 700 }}>
              {editingTemplate ? 'Trình Thiết Kế & Chỉnh Sửa Mẫu Báo Giá' : 'Trình Thiết Kế Mẫu Báo Giá Mới'}
            </span>
          </Space>
        }
        open={modalVisible}
        onCancel={() => setModalVisible(false)}
        onOk={handleSubmit}
        confirmLoading={submitting}
        width={paperOrientation === 'landscape' ? 1480 : 1180}
        okText="💾 Lưu Cấu Hình Mẫu"
        cancelText="Hủy"
        style={{ top: 16, maxWidth: '96vw' }}
      >
        <Form form={form} layout="vertical" style={{ marginTop: 12 }}>
          {/* Top Row: General info */}
          <Row gutter={16}>
            <Col xs={24} md={9}>
              <Form.Item
                name="name"
                label="Tên mẫu báo giá"
                rules={[{ required: true, message: 'Vui lòng nhập tên mẫu' }]}
              >
                <Input placeholder="VD: Mẫu Chuẩn Hiện Đại - Xanh Navy" />
              </Form.Item>
            </Col>
            <Col xs={24} md={5}>
              <Form.Item
                name="code"
                label="Mã định danh (Code)"
                rules={[{ required: true, message: 'Vui lòng nhập mã code' }]}
              >
                <Input placeholder="VD: modern_navy" disabled={!!editingTemplate} />
              </Form.Item>
            </Col>
            <Col xs={24} md={5}>
              <Form.Item name="is_default" label="Thiết lập mẫu" valuePropName="checked">
                <Select>
                  <Option value={false}>Mẫu tùy chọn</Option>
                  <Option value={true}>Mặc định SaaS</Option>
                </Select>
              </Form.Item>
            </Col>
            <Col xs={24} md={5}>
              <Form.Item name="layout_style" label="Nhóm phong cách">
                <Select>
                  <Option value="modern_navy">Hiện đại (Modern)</Option>
                  <Option value="classic_border">Cổ điển (Classic)</Option>
                  <Option value="minimal_clean">Tối giản (Minimal)</Option>
                </Select>
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col xs={24} md={14}>
              <Form.Item name="description" label="Mô tả ngắn">
                <Input placeholder="Mô tả phong cách và đối tượng doanh nghiệp phù hợp..." />
              </Form.Item>
            </Col>
            <Col xs={24} md={10}>
              <Form.Item
                name="footer_content"
                label="Điều khoản gợi ý chuẩn cho công ty (Reference Terms)"
              >
                <Input.TextArea rows={1} placeholder="1. Báo giá có hiệu lực 15 ngày..." />
              </Form.Item>
            </Col>
          </Row>

          <Divider style={{ margin: '12px 0 18px 0' }} />

          {/* Split Screen Area */}
          <Row gutter={24}>
            {/* Left Col: Toolbox & Section Ordering */}
            <Col span={paperOrientation === 'landscape' ? 7 : 11}>
              <div style={{ background: '#f8fafc', padding: 16, borderRadius: 8, border: '1px solid #e2e8f0', height: 620, overflow: 'auto' }}>
                <Title level={5} style={{ margin: '0 0 12px 0', color: '#1e293b' }}>
                  ⚙️ Cấu Hình Khối & Sắp Xếp (Toolbox)
                </Title>
                <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 14 }}>
                  Sử dụng mũi tên Lên/Xuống để thay đổi thứ tự hoặc biểu tượng Mắt để ẩn/hiện các khối trên báo giá.
                </Text>

                {/* Custom Title Setting */}
                <div style={{ marginBottom: 16 }}>
                  <Text strong style={{ fontSize: 13, display: 'block', marginBottom: 6 }}>
                    🏷️ Tiêu đề chính hiển thị trên Báo giá:
                  </Text>
                  <Input
                    value={customTitle}
                    onChange={(e) => setCustomTitle(e.target.value)}
                    placeholder="VD: BÁO GIÁ SẢN XUẤT CỬA COMPOSITE"
                  />
                </div>

                {/* Theme Selector */}
                <div style={{ marginBottom: 16 }}>
                  <Text strong style={{ fontSize: 13, display: 'block', marginBottom: 6 }}>
                    🎨 Màu sắc chủ đạo (Theme Color):
                  </Text>
                  <Space wrap>
                    {THEME_COLORS.map((col) => (
                      <Button
                        key={col.value}
                        size="small"
                        style={{
                          background: col.value,
                          color: '#fff',
                          border: themeColor === col.value ? '2px solid #000' : 'none',
                          fontWeight: themeColor === col.value ? 700 : 400,
                        }}
                        onClick={() => setThemeColor(col.value)}
                      >
                        {themeColor === col.value ? '✓ ' : ''}{col.label.split(' ')[0]}
                      </Button>
                    ))}
                  </Space>
                </div>

                {/* Table Style Selector */}
                <div style={{ marginBottom: 16 }}>
                  <Text strong style={{ fontSize: 13, display: 'block', marginBottom: 6 }}>
                    📊 Kiểu viền bảng sản phẩm:
                  </Text>
                  <Select value={tableStyle} onChange={setTableStyle} style={{ width: '100%' }}>
                    <Option value="classic_border">Viền cổ điển đầy đủ (Classic Border)</Option>
                    <Option value="modern_clean">Khung hiện đại thanh lịch (Modern Clean)</Option>
                    <Option value="modern_striped">Dòng kẻ xen kẽ màu (Zebra Striped)</Option>
                  </Select>
                </div>

                {/* Paper Orientation Selector */}
                <div style={{ marginBottom: 16 }}>
                  <Text strong style={{ fontSize: 13, display: 'block', marginBottom: 6 }}>
                    📐 Khổ giấy & Định dạng bảng:
                  </Text>
                  <Select value={paperOrientation} onChange={setPaperOrientation} style={{ width: '100%' }}>
                    <Option value="portrait">Khổ Dọc A4 (Portrait - Bảng chuẩn 5 cột)</Option>
                    <Option value="landscape">Khổ Ngang A4 (Landscape - Bảng kỹ thuật 9 cột như Excel)</Option>
                  </Select>
                </div>

                <Divider style={{ margin: '12px 0' }} />
                <Text strong style={{ fontSize: 13, display: 'block', marginBottom: 8 }}>
                  📌 Sắp xếp thứ tự Khối trên tờ Báo Giá:
                </Text>

                {/* Sections List */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {sections.map((sec, idx) => (
                    <div
                      key={sec.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '8px 12px',
                        background: sec.visible ? '#fff' : '#f1f5f9',
                        border: sec.visible ? `1px solid ${themeColor}40` : '1px dashed #cbd5e1',
                        borderRadius: 6,
                        opacity: sec.visible ? 1 : 0.6,
                        boxShadow: sec.visible ? '0 1px 3px rgba(0,0,0,0.05)' : 'none',
                        transition: 'all 0.2s',
                      }}
                    >
                      <Space>
                        <Tag color={sec.visible ? 'blue' : 'default'} style={{ marginRight: 4 }}>
                          #{idx + 1}
                        </Tag>
                        <Text strong={sec.visible} style={{ color: sec.visible ? '#1e293b' : '#64748b', fontSize: 13 }}>
                          {sec.name}
                        </Text>
                      </Space>
                      <Space size={4}>
                        <Tooltip title={sec.visible ? 'Khối đang hiện' : 'Khối bị ẩn'}>
                          <Button
                            size="small"
                            type="text"
                            icon={sec.visible ? <EyeOutlined style={{ color: '#16a34a' }} /> : <EyeInvisibleOutlined style={{ color: '#94a3b8' }} />}
                            onClick={() => toggleSectionVisibility(sec.id)}
                          />
                        </Tooltip>
                        <Tooltip title="Chuyển lên trên">
                          <Button
                            size="small"
                            type="text"
                            disabled={idx === 0}
                            icon={<ArrowUpOutlined />}
                            onClick={() => moveSection(idx, -1)}
                          />
                        </Tooltip>
                        <Tooltip title="Chuyển xuống dưới">
                          <Button
                            size="small"
                            type="text"
                            disabled={idx === sections.length - 1}
                            icon={<ArrowDownOutlined />}
                            onClick={() => moveSection(idx, 1)}
                          />
                        </Tooltip>
                      </Space>
                    </div>
                  ))}
                </div>
              </div>
            </Col>

            {/* Right Col: Live A4 Preview */}
            <Col span={paperOrientation === 'landscape' ? 17 : 13}>
              <div style={{ background: '#334155', padding: 20, borderRadius: 8, height: 620, overflow: 'auto' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <Text style={{ color: '#f8fafc', fontWeight: 600, fontSize: 14 }}>
                    🖥️ Màn Hình Xem Trước A4 (Real-time Preview)
                  </Text>
                  <Tag color="cyan">Tự động cập nhật khi kéo/sắp xếp</Tag>
                </div>

                {/* Simulated A4 Sheet */}
                <div
                  style={{
                    background: '#fff',
                    padding: '28px 32px',
                    borderRadius: 4,
                    boxShadow: '0 10px 25px rgba(0,0,0,0.2)',
                    minHeight: 650,
                    minWidth: paperOrientation === 'landscape' ? 980 : undefined,
                    overflowX: 'auto',
                  }}
                >
                  {sections.map((sec) =>
                    renderSimulatedSection(sec, themeColor, tableStyle, form.getFieldValue('footer_content'), paperOrientation, customTitle)
                  )}
                </div>
              </div>
            </Col>
          </Row>
        </Form>
      </Modal>

      {/* ── Modal Preview from Table ────────────────────────────────────── */}
      <Modal
        title={`Xem Trước Mẫu: ${previewTemplate?.name || ''}`}
        open={previewVisible}
        onCancel={() => setPreviewVisible(false)}
        footer={[
          <Button key="close" type="primary" onClick={() => setPreviewVisible(false)}>
            Đóng
          </Button>,
        ]}
        width={previewTemplate?.layout_config?.paper_orientation === 'landscape' ? 1150 : 850}
      >
        {previewTemplate && (
          <div
            style={{
              padding: 24,
              border: '1px solid #e2e8f0',
              borderRadius: 8,
              background: '#fff',
              color: '#1e293b',
            }}
          >
            {previewTemplate.layout_config?.blocks ? (
              <QuotationRenderer layoutConfig={previewTemplate.layout_config} data={{
                customer: { name: 'Công ty Cổ phần ABC', address: '123 Nguyễn Văn Linh', phone: '0901234567', email: 'contact@abc.vn', tax_code: '0123456789' },
                items: [
                  { product_name: 'Dịch vụ Tư vấn', unit: 'Gói', quantity: 1, unit_price: 5000000, total_price: 5000000 },
                  { product_name: 'Phần mềm Quản lý', unit: 'License', quantity: 2, unit_price: 2000000, total_price: 4000000 }
                ],
                totals: { subtotal: 9000000, discount: 0, vat: 900000, grandTotal: 9900000 }
              }} />
            ) : (
              <div style={{ textAlign: 'center', padding: 40, color: '#888' }}>
                Mẫu báo giá này chưa được thiết kế Kéo thả. Hãy ấn nút "Thiết kế Kéo thả" để cấu hình.
              </div>
            )}
          </div>
        )}
      </Modal>
    </section>
  )
}
