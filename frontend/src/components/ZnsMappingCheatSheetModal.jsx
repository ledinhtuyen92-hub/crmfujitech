import React, { useState, useEffect, useMemo } from 'react'
import {
  Modal, Input, Tabs, Table, Tag, Typography, Button, Space, Alert,
  Tooltip, message, Badge, Card
} from 'antd'
import {
  SearchOutlined, CopyOutlined, CheckOutlined, InfoCircleOutlined,
  UserOutlined, ShoppingOutlined, CreditCardOutlined, CarOutlined,
  CalendarOutlined, PlusOutlined, ThunderboltOutlined
} from '@ant-design/icons'
import api from '../utils/api'

const { Text, Paragraph } = Typography

// Dữ liệu fallback nếu API chưa kịp tải
const DEFAULT_VARIABLES = [
  {
    category: 'customer',
    category_label: 'Thông tin Khách hàng',
    category_icon: 'UserOutlined',
    variables: [
      { key: 'customer_name', label: 'Tên khách hàng', type: 'STRING', example: 'Nguyễn Văn A', desc: 'Họ và tên đầy đủ của khách hàng', aliases: ['ten_khach_hang', 'ten_kh', 'ho_ten', 'name'] },
      { key: 'phone', label: 'Số điện thoại', type: 'STRING', example: '0987654321', desc: 'Số điện thoại liên hệ của khách hàng', aliases: ['so_dien_thoai', 'sdt', 'phone_number'] },
      { key: 'birthday', label: 'Ngày sinh nhật', type: 'DATE', example: '15/08/1992', desc: 'Ngày tháng năm sinh (định dạng DD/MM/YYYY)', aliases: ['ngay_sinh', 'sinh_nhat'] },
      { key: 'address', label: 'Địa chỉ khách hàng', type: 'STRING', example: 'Số 123 Cầu Giấy, Hà Nội', desc: 'Địa chỉ thường trú hoặc nơi ở của khách', aliases: ['dia_chi', 'customer_address'] },
      { key: 'city', label: 'Tỉnh / Thành phố', type: 'STRING', example: 'Hà Nội', desc: 'Tỉnh hoặc thành phố của khách', aliases: ['thanh_pho', 'tinh_thanh'] },
      { key: 'company_name', label: 'Tên công ty (Khách)', type: 'STRING', example: 'Công ty TNHH Ánh Dương', desc: 'Tên doanh nghiệp của khách hàng (B2B)', aliases: ['ten_cong_ty', 'customer_company'] },
      { key: 'sender_company', label: 'Tên công ty gửi', type: 'STRING', example: 'Fujitech Group', desc: 'Tên thương hiệu doanh nghiệp gửi', aliases: ['ten_cong_ty_gui', 'brand_name'] },
    ],
  },
  {
    category: 'order',
    category_label: 'Đơn hàng & Bán hàng',
    category_icon: 'ShoppingOutlined',
    variables: [
      { key: 'order_number', label: 'Mã đơn hàng', type: 'STRING', example: 'DH-20261027-001', desc: 'Mã định danh đơn hàng trên CRM', aliases: ['order_code', 'ma_don_hang', 'ma_don'] },
      { key: 'total_amount', label: 'Tổng tiền đơn hàng', type: 'NUMBER/STRING', example: '2.500.000đ', desc: 'Tổng giá trị đơn hàng sau thuế và chiết khấu', aliases: ['tong_tien', 'amount', 'gia_tri_don'] },
      { key: 'order_date', label: 'Ngày đặt hàng', type: 'DATE', example: '27/10/2026', desc: 'Ngày tạo hoặc xác nhận đơn hàng', aliases: ['ngay_dat', 'ngay_tao', 'date'] },
      { key: 'status', label: 'Trạng thái đơn hàng', type: 'STRING', example: 'Đã xác nhận', desc: 'Trạng thái xử lý của đơn hàng', aliases: ['trang_thai', 'order_status'] },
      { key: 'delivery_address', label: 'Địa chỉ giao hàng', type: 'STRING', example: 'Tòa nhà FPT, Cầu Giấy', desc: 'Địa chỉ nhận hàng thực tế', aliases: ['dia_chi_giao', 'dia_chi_nhan'] },
      { key: 'delivery_time', label: 'Thời gian giao hàng', type: 'STRING', example: '29/10/2026 (Giờ hành chính)', desc: 'Thời gian hẹn giao hàng tới khách', aliases: ['thoi_gian_giao', 'ngay_giao_du_kien'] },
      { key: 'warranty_months', label: 'Thời hạn bảo hành', type: 'STRING', example: '12 tháng', desc: 'Số tháng bảo hành của sản phẩm', aliases: ['bao_hanh', 'thoi_gian_bao_hanh'] },
      { key: 'note', label: 'Ghi chú đơn hàng', type: 'STRING', example: 'Gọi trước khi giao', desc: 'Ghi chú bổ sung của đơn hàng', aliases: ['ghi_chu', 'notes'] },
    ],
  },
  {
    category: 'receipt',
    category_label: 'Thu tiền & Thanh toán',
    category_icon: 'CreditCardOutlined',
    variables: [
      { key: 'receipt_code', label: 'Mã phiếu thu', type: 'STRING', example: 'PT-00892', desc: 'Mã số phiếu thu tiền đã lập', aliases: ['ma_phieu_thu', 'ma_phieu', 'so_phieu'] },
      { key: 'amount', label: 'Số tiền đã thu', type: 'NUMBER/STRING', example: '1.000.000đ', desc: 'Số tiền thực tế khách thanh toán', aliases: ['so_tien', 'payment_amount', 'tien_thu'] },
      { key: 'payment_date', label: 'Ngày thu tiền', type: 'DATE', example: '27/10/2026', desc: 'Ngày giờ ghi nhận giao dịch thu', aliases: ['ngay_thu', 'ngay_thanh_toan'] },
      { key: 'payment_method', label: 'Phương thức thanh toán', type: 'STRING', example: 'Chuyển khoản ngân hàng', desc: 'Hình thức thanh toán (Tiền mặt, CK...)', aliases: ['hinh_thuc', 'phuong_thuc'] },
      { key: 'milestone_title', label: 'Kỳ / Đợt thanh toán', type: 'STRING', example: 'Kỳ 1: Đặt cọc 30%', desc: 'Tên kỳ thanh toán theo tiến độ', aliases: ['ky_thanh_toan', 'dot_thanh_toan'] },
      { key: 'reference_code', label: 'Mã GD Ngân hàng', type: 'STRING', example: 'FT26102799182', desc: 'Mã tham chiếu ngân hàng hoặc UNC', aliases: ['ma_giao_dich', 'ref_code'] },
      { key: 'remaining_amount', label: 'Số tiền còn lại', type: 'NUMBER/STRING', example: '1.500.000đ', desc: 'Công nợ còn lại của đơn hàng', aliases: ['so_tien_con_lai', 'con_lai'] },
    ],
  },
  {
    category: 'delivery',
    category_label: 'Giao hàng & Bảo hành',
    category_icon: 'CarOutlined',
    variables: [
      { key: 'tracking_code', label: 'Mã vận đơn', type: 'STRING', example: 'VNPOST8847291', desc: 'Mã theo dõi hành trình đơn vị vận chuyển', aliases: ['ma_van_don', 'van_don', 'tracking_number'] },
      { key: 'carrier_name', label: 'Đơn vị vận chuyển', type: 'STRING', example: 'Viettel Post / GHTK', desc: 'Tên đơn vị hoặc nhà xe vận chuyển', aliases: ['don_vi_van_chuyen', 'nha_xe'] },
      { key: 'delivery_date', label: 'Ngày giao hàng', type: 'DATE', example: '28/10/2026', desc: 'Ngày giao hàng thực tế', aliases: ['ngay_giao', 'ngay_nhan_du_kien'] },
    ],
  },
  {
    category: 'appointment',
    category_label: 'Lịch hẹn & Chăm sóc',
    category_icon: 'CalendarOutlined',
    variables: [
      { key: 'appointment_time', label: 'Thời gian hẹn', type: 'STRING', example: '09:30 ngày 28/10/2026', desc: 'Thời gian hẹn gặp hoặc bảo trì', aliases: ['thoi_gian_hen', 'ngay_hen', 'gio_hen'] },
      { key: 'service_name', label: 'Dịch vụ / Nội dung hẹn', type: 'STRING', example: 'Bảo dưỡng máy in công nghiệp', desc: 'Nội dung hoặc mục đích cuộc hẹn', aliases: ['dich_vu', 'noi_dung_hen'] },
      { key: 'staff_name', label: 'Nhân viên phụ trách', type: 'STRING', example: 'KTV Lê Văn Hùng', desc: 'Tên nhân viên phụ trách tư vấn/hẹn', aliases: ['nhan_vien', 'ky_thuat_vien'] },
      { key: 'voucher_code', label: 'Mã voucher ưu đãi', type: 'STRING', example: 'FUJI2026', desc: 'Mã voucher tri ân hoặc khuyến mại', aliases: ['ma_giam_gia', 'ma_uu_dai', 'voucher'] },
    ],
  },
]

export default function ZnsMappingCheatSheetModal({ open, onCancel, onInsertParam }) {
  const [categories, setCategories] = useState(DEFAULT_VARIABLES)
  const [activeTab, setActiveTab] = useState('all')
  const [search, setSearch] = useState('')
  const [copiedKey, setCopiedKey] = useState(null)

  useEffect(() => {
    if (open) {
      api.get('/zalo/templates/mapping-variables/')
        .then(res => {
          if (Array.isArray(res.data) && res.data.length > 0) {
            setCategories(res.data)
          }
        })
        .catch(() => {})
    }
  }, [open])

  const copyToClipboard = (text, type = 'variable') => {
    navigator.clipboard.writeText(text)
    setCopiedKey(text)
    message.success(`Đã sao chép: ${text}`)
    setTimeout(() => setCopiedKey(null), 2000)
  }

  // Lọc biến theo danh mục và từ khóa tìm kiếm
  const filteredData = useMemo(() => {
    let list = []
    categories.forEach(cat => {
      if (activeTab === 'all' || activeTab === cat.category) {
        cat.variables.forEach(v => {
          list.push({ ...v, category: cat.category, category_label: cat.category_label })
        })
      }
    })

    if (search.trim()) {
      const q = search.trim().toLowerCase()
      list = list.filter(item =>
        item.key.toLowerCase().includes(q) ||
        item.label.toLowerCase().includes(q) ||
        item.desc.toLowerCase().includes(q) ||
        (item.aliases && item.aliases.some(a => a.toLowerCase().includes(q)))
      )
    }

    return list
  }, [categories, activeTab, search])

  const columns = [
    {
      title: 'Tên biến chuẩn (Khuyên dùng)',
      dataIndex: 'key',
      key: 'key',
      width: 230,
      render: (key, row) => (
        <div>
          <Space>
            <Tag color="#1d4ed8" style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: 13, padding: '2px 8px' }}>
              {key}
            </Tag>
            <Tooltip title={`Sao chép <${key}> để dán vào Zalo Cloud`}>
              <Button
                type="text"
                size="small"
                icon={copiedKey === `<${key}>` ? <CheckOutlined style={{ color: '#16a34a' }} /> : <CopyOutlined />}
                onClick={() => copyToClipboard(`<${key}>`, 'tag')}
                style={{ color: '#2563eb' }}
              >
                &lt;&gt;
              </Button>
            </Tooltip>
          </Space>
          <div style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>
            {row.label} • <span style={{ color: '#0891b2' }}>{row.type}</span>
          </div>
        </div>
      ),
    },
    {
      title: 'Tên Tiếng Việt thay thế (Smart Alias)',
      dataIndex: 'aliases',
      key: 'aliases',
      width: 250,
      render: (aliases = []) => (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
          {aliases.map(al => (
            <Tooltip key={al} title="Click để copy">
              <Tag
                style={{ cursor: 'pointer', fontFamily: 'monospace', fontSize: 11, background: '#f1f5f9', border: '1px solid #cbd5e1' }}
                onClick={() => copyToClipboard(al)}
              >
                {al}
              </Tag>
            </Tooltip>
          ))}
        </div>
      ),
    },
    {
      title: 'Mô tả & Giá trị mẫu từ CRM',
      key: 'desc',
      render: (_, row) => (
        <div>
          <div style={{ fontSize: 13, color: '#0f172a' }}>{row.desc}</div>
          <div style={{ fontSize: 12, color: '#059669', marginTop: 2, background: '#f0fdf4', padding: '2px 8px', borderRadius: 4, display: 'inline-block' }}>
            Ví dụ: <strong>{row.example}</strong>
          </div>
        </div>
      ),
    },
    {
      title: 'Thao tác',
      key: 'actions',
      width: 140,
      align: 'center',
      render: (_, row) => (
        <Space size="small">
          <Tooltip title={`Copy tên biến "${row.key}"`}>
            <Button
              size="small"
              icon={copiedKey === row.key ? <CheckOutlined style={{ color: '#16a34a' }} /> : <CopyOutlined />}
              onClick={() => copyToClipboard(row.key)}
            >
              Copy
            </Button>
          </Tooltip>
          {onInsertParam && (
            <Tooltip title="Chèn vào ô Cấu trúc JSON">
              <Button
                size="small"
                type="primary"
                ghost
                icon={<PlusOutlined />}
                onClick={() => {
                  onInsertParam(row.key, row.label)
                  message.success(`Đã thêm biến ${row.key}`)
                }}
              >
                Chèn
              </Button>
            </Tooltip>
          )}
        </Space>
      ),
    },
  ]

  const tabItems = [
    { key: 'all', label: `Tất cả (${categories.reduce((acc, c) => acc + c.variables.length, 0)})` },
    ...categories.map(c => ({
      key: c.category,
      label: (
        <span>
          {c.category === 'customer' && <UserOutlined />}
          {c.category === 'order' && <ShoppingOutlined />}
          {c.category === 'receipt' && <CreditCardOutlined />}
          {c.category === 'delivery' && <CarOutlined />}
          {c.category === 'appointment' && <CalendarOutlined />}
          {' '}{c.category_label} ({c.variables.length})
        </span>
      ),
    })),
  ]

  return (
    <Modal
      title={
        <Space>
          <ThunderboltOutlined style={{ color: '#2563eb', fontSize: 20 }} />
          <div>
            <div style={{ fontSize: 16, fontWeight: 700 }}>Danh mục Biến Mapping Chuẩn ZNS</div>
            <div style={{ fontSize: 12, color: '#64748b', fontWeight: 400 }}>
              Hệ thống tự động điền dữ liệu tương ứng từ CRM sang Zalo ZNS
            </div>
          </div>
        </Space>
      }
      open={open}
      onCancel={onCancel}
      footer={[
        <Button key="close" type="primary" onClick={onCancel} style={{ background: '#2563eb' }}>
          Đóng
        </Button>,
      ]}
      width={900}
      bodyStyle={{ maxHeight: 'calc(80vh - 120px)', overflowY: 'auto', padding: '16px 24px' }}
    >
      <Alert
        type="info"
        showIcon
        icon={<InfoCircleOutlined style={{ color: '#2563eb' }} />}
        style={{ marginBottom: 16, borderRadius: 8, background: '#eff6ff', borderColor: '#bfdbfe' }}
        message={
          <div>
            <div style={{ fontWeight: 600, color: '#1e3a8a' }}>💡 Cơ chế Ánh xạ Thông minh (Smart Alias Mapping):</div>
            <div style={{ fontSize: 12, color: '#1e40af', marginTop: 2 }}>
              Khi tạo mẫu trên Zalo Cloud (ZCA), bạn đặt biến trong dấu ngoặc nhọn: ví dụ <code>&lt;customer_name&gt;</code> hoặc <code>&lt;ten_khach_hang&gt;</code>.
              Hệ thống CRM hỗ trợ song song cả <strong>tên tiếng Anh chuẩn</strong> và các <strong>tên tiếng Việt thay thế</strong>, tự động nhận diện và điền đúng dữ liệu 100%!
            </div>
          </div>
        }
      />

      <div style={{ marginBottom: 16, display: 'flex', gap: 12, alignItems: 'center' }}>
        <Input
          prefix={<SearchOutlined style={{ color: '#94a3b8' }} />}
          placeholder="Tìm kiếm theo tên biến, tên tiếng Việt, mô tả (VD: order, ten_khach_hang, so_tien...)"
          value={search}
          onChange={e => setSearch(e.target.value)}
          allowClear
          style={{ maxWidth: 460, borderRadius: 8 }}
        />
        <div style={{ fontSize: 12, color: '#64748b' }}>
          Tìm thấy <strong>{filteredData.length}</strong> biến
        </div>
      </div>

      <Tabs
        activeKey={activeTab}
        onChange={setActiveTab}
        items={tabItems}
        size="small"
        style={{ marginBottom: 12 }}
      />

      <Table
        dataSource={filteredData}
        columns={columns}
        rowKey="key"
        size="small"
        pagination={false}
        bordered
      />
    </Modal>
  )
}
