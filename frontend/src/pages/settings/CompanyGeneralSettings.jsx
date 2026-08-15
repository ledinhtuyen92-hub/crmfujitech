import { useState, useEffect, useCallback } from 'react'
import {
  BankOutlined,
  CheckCircleOutlined,
  EyeOutlined,
  FileTextOutlined,
  SaveOutlined,
  SettingOutlined,
  TagOutlined,
  UploadOutlined,
  UserOutlined,
  SafetyCertificateOutlined,
  PartitionOutlined,
  ProfileOutlined,
} from '@ant-design/icons'
import {
  Badge,
  Button,
  Card,
  Col,
  Divider,
  Form,
  Input,
  InputNumber,
  Modal,
  Row,
  Select,
  Space,
  Table,
  Tag,
  Typography,
  Upload,
  message,
  theme,
  Switch,
} from 'antd'
import api from '../../utils/api'
import { useAuth } from '../../contexts/AuthContext'
import { useResponsive } from '../../hooks/useResponsive'

const { Title, Text, Paragraph } = Typography
const { Option } = Select

export default function CompanyGeneralSettings() {
  const { token } = theme.useToken()
  const { checkMaintenance, hasPermission, isCompanyAdmin } = useAuth()
  const { isMobile } = useResponsive()
  const canEditSettings = isCompanyAdmin || hasPermission('settings.company')
  const [messageApi, contextHolder] = message.useMessage()
  const [loading, setLoading] = useState(false)

  const [settings, setSettings] = useState(null)
  const [templates, setTemplates] = useState([])
  const [companyInfo, setCompanyInfo] = useState(null)
  const [logoFile, setLogoFile] = useState(null)
  const [stampFile, setStampFile] = useState(null)
  const [signatureFile, setSignatureFile] = useState(null)

  const [form] = Form.useForm()
  const [companyForm] = Form.useForm()

  // Preview modal
  const [previewModalVisible, setPreviewModalVisible] = useState(false)
  const [selectedTemplate, setSelectedTemplate] = useState(null)

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const [settingsRes, templatesRes, compRes] = await Promise.all([
        api.get('users/company-settings/'),
        api.get('sales/quotation-templates/active/'),
        api.get('users/my-company/').catch(() => ({ data: null })),
      ])
      setSettings(settingsRes.data)
      setTemplates(templatesRes.data || [])
      if (compRes?.data) {
        setCompanyInfo(compRes.data)
        companyForm.setFieldsValue({
          name: compRes.data.name || '',
          tax_code: compRes.data.tax_code || '',
          phone: compRes.data.phone || '',
          address: compRes.data.address || '',
          director_name: compRes.data.director_name || '',
          director_title: compRes.data.director_title || 'Giám đốc',
        })
      }
      form.setFieldsValue({
        order_prefix: settingsRes.data.order_prefix || 'DH',
        continuous_sequence_numbering: settingsRes.data.continuous_sequence_numbering || false,
        lead_routing: settingsRes.data.lead_routing || 'manual',
        timezone: settingsRes.data.timezone || 'Asia/Ho_Chi_Minh',
        inactive_days_threshold: settingsRes.data.inactive_days_threshold || 0,
        quotation_template: settingsRes.data.quotation_template || null,
        default_quotation_terms: settingsRes.data.default_quotation_terms || '',
        custom_quotation_title: settingsRes.data.custom_quotation_title || '',
        custom_order_title: settingsRes.data.custom_order_title || '',
        default_warranty_content: settingsRes.data.default_warranty_content || '',
        default_warranty_rules: settingsRes.data.default_warranty_rules || '',
        pipeline_status_labels: settingsRes.data.pipeline_status_labels || {
          new: 'Khách mới',
          potential: 'Tiềm năng',
          active: 'Đang hoạt động',
          has_order: 'Đã có đơn hàng',
          repeat_order: 'Mua thêm đơn hàng',
          lost: 'Đã mất',
        },
      })
    } catch (err) {
      console.error('Failed to fetch company settings:', err)
      messageApi.error('Không thể tải cài đặt công ty.')
    } finally {
      setLoading(false)
    }
  }, [form, companyForm, messageApi])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const handleSaveCompany = async (values) => {
    if (checkMaintenance()) return
    setLoading(true)
    try {
      const formData = new FormData()
      formData.append('name', values.name || '')
      formData.append('tax_code', values.tax_code || '')
      formData.append('phone', values.phone || '')
      formData.append('address', values.address || '')
      formData.append('director_name', values.director_name || '')
      formData.append('director_title', values.director_title || 'Giám đốc')
      if (logoFile) {
        formData.append('logo', logoFile)
      }
      if (stampFile) {
        formData.append('stamp_image', stampFile)
      }
      if (signatureFile) {
        formData.append('director_signature', signatureFile)
      }
      const res = await api.patch('users/my-company/', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      setCompanyInfo(res.data)
      setLogoFile(null)
      setStampFile(null)
      setSignatureFile(null)
      messageApi.success('Cập nhật thông tin, Logo, Con dấu và Chữ ký thành công!')
      fetchData()
    } catch {
      messageApi.error('Lỗi khi cập nhật thông tin công ty.')
    } finally {
      setLoading(false)
    }
  }

  const handleSaveGeneral = async (values) => {
    if (checkMaintenance()) return
    setLoading(true)
    try {
      await api.patch('users/company-settings/', values)
      messageApi.success('Cập nhật cài đặt chung thành công!')
      fetchData()
    } catch {
      messageApi.error('Lỗi khi lưu cài đặt.')
    } finally {
      setLoading(false)
    }
  }

  const handleApplyTemplate = async (templateId) => {
    if (checkMaintenance()) return
    setLoading(true)
    try {
      await api.patch('users/company-settings/', { quotation_template: templateId })
      const tmpl = templates.find((t) => t.id === templateId)
      messageApi.success(`Đã áp dụng mẫu báo giá "${tmpl?.name || ''}" cho doanh nghiệp!`)
      fetchData()
    } catch {
      messageApi.error('Lỗi khi áp dụng mẫu báo giá.')
    } finally {
      setLoading(false)
    }
  }

  const handlePreview = (template) => {
    setSelectedTemplate(template)
    setPreviewModalVisible(true)
  }

  // Xác định ID mẫu đang áp dụng (nếu null thì mẫu có is_default là mẫu áp dụng)
  const activeTemplateId =
    settings?.quotation_template ||
    templates.find((t) => t.is_default)?.id ||
    null

  return (
    <div style={{ padding: isMobile ? '16px 12px' : '24px 32px' }}>
      {contextHolder}

      <div style={{ marginBottom: 28 }}>
        <Title level={2} style={{ margin: 0 }}>
          <SettingOutlined style={{ marginRight: 12, color: token.colorPrimary }} />
          Cài đặt chung & Mẫu Báo Giá
        </Title>
        <Text type="secondary">
          Cấu hình quy tắc nghiệp vụ, tiền tố đơn hàng và lựa chọn Mẫu báo giá hiển thị khi in ấn cho doanh nghiệp
        </Text>
      </div>

      {/* ── Section 0: Company Info & Logo ──────────────────────────────── */}
      <Card
        title={
          <Space>
            <BankOutlined style={{ color: '#16a34a' }} />
            <Text strong>Thông Tin Tài Khoản Công Ty & Logo Báo Giá</Text>
          </Space>
        }
        style={{ marginBottom: 32, borderRadius: 10, borderTop: '3px solid #16a34a' }}
      >
        <Form
          form={companyForm}
          layout="vertical"
          onFinish={handleSaveCompany}
        >
          <Row gutter={24}>
            <Col xs={24} md={12}>
              <Row gutter={16}>
                <Col xs={24} md={24}>
                  <Form.Item
                    name="name"
                    label="Tên doanh nghiệp / Công ty"
                    rules={[{ required: true, message: 'Vui lòng nhập tên công ty' }]}
                  >
                    <Input placeholder="CÔNG TY CỔ PHẦN..." />
                  </Form.Item>
                </Col>
                <Col xs={24} md={12}>
                  <Form.Item name="tax_code" label="Mã số thuế (MST)">
                    <Input placeholder="0101234567" />
                  </Form.Item>
                </Col>
                <Col xs={24} md={12}>
                  <Form.Item name="phone" label="Số điện thoại / Hotline">
                    <Input placeholder="0243.888.9999 / 0988.xxx.xxx" />
                  </Form.Item>
                </Col>
                <Col xs={24} md={24}>
                  <Form.Item name="address" label="Địa chỉ trụ sở">
                    <Input placeholder="Số 1, Đại Cồ Việt, Hà Nội..." />
                  </Form.Item>
                </Col>
                <Col xs={24} md={12}>
                  <Form.Item name="director_name" label="Họ tên Người đại diện / Giám đốc">
                    <Input placeholder="Ví dụ: Nguyễn Văn A..." />
                  </Form.Item>
                </Col>
                <Col xs={24} md={12}>
                  <Form.Item name="director_title" label="Chức danh ký báo giá">
                    <Input placeholder="Ví dụ: Giám đốc / Tổng Giám đốc..." />
                  </Form.Item>
                </Col>
              </Row>
            </Col>
            <Col xs={24} md={12} style={{ borderLeft: '1px solid #f0f0f0', paddingLeft: 24 }}>
              <Row gutter={16}>
                {/* Logo */}
                <Col xs={24} sm={8} style={{ textAlign: 'center', marginBottom: 16 }}>
                  <Text strong style={{ display: 'block', marginBottom: 8, fontSize: 12 }}>Logo Công Ty</Text>
                  {companyInfo?.logo ? (
                    <img
                      src={companyInfo.logo}
                      alt="Logo"
                      style={{ display: 'block', margin: '0 auto', maxHeight: 70, maxWidth: '100%', objectFit: 'contain', marginBottom: 8, border: '1px solid #e2e8f0', padding: 4, borderRadius: 6 }}
                    />
                  ) : (
                    <div style={{ padding: 12, background: '#f8fafc', border: '1px dashed #cbd5e1', borderRadius: 8, marginBottom: 8 }}>
                      <Text type="secondary" style={{ fontSize: 11 }}>Chưa có logo</Text>
                    </div>
                  )}
                  <Upload
                    fileList={logoFile ? [{ uid: '-1', name: logoFile.name, status: 'done' }] : []}
                    beforeUpload={(file) => { setLogoFile(file); return false }}
                    maxCount={1}
                    accept="image/*"
                    showUploadList={true}
                    onRemove={() => setLogoFile(null)}
                  >
                    <Button size="small" icon={<UploadOutlined />}>Chọn Logo</Button>
                  </Upload>
                </Col>
                {/* Con dấu */}
                <Col xs={24} sm={8} style={{ textAlign: 'center', marginBottom: 16 }}>
                  <Text strong style={{ display: 'block', marginBottom: 8, fontSize: 12 }}>Con Dấu Công Ty</Text>
                  {companyInfo?.stamp_image ? (
                    <img
                      src={companyInfo.stamp_image}
                      alt="Stamp"
                      style={{ display: 'block', margin: '0 auto', maxHeight: 70, maxWidth: '100%', objectFit: 'contain', marginBottom: 8, border: '1px solid #e2e8f0', padding: 4, borderRadius: 6 }}
                    />
                  ) : (
                    <div style={{ padding: 12, background: '#f8fafc', border: '1px dashed #cbd5e1', borderRadius: 8, marginBottom: 8 }}>
                      <Text type="secondary" style={{ fontSize: 11 }}>Chưa tải dấu</Text>
                    </div>
                  )}
                  <Upload
                    fileList={stampFile ? [{ uid: '-1', name: stampFile.name, status: 'done' }] : []}
                    beforeUpload={(file) => { setStampFile(file); return false }}
                    maxCount={1}
                    accept="image/*"
                    showUploadList={true}
                    onRemove={() => setStampFile(null)}
                  >
                    <Button size="small" icon={<UploadOutlined />}>Chọn Con Dấu</Button>
                  </Upload>
                </Col>
                {/* Chữ ký */}
                <Col xs={24} sm={8} style={{ textAlign: 'center', marginBottom: 16 }}>
                  <Text strong style={{ display: 'block', marginBottom: 8, fontSize: 12 }}>Chữ Ký Giám Đốc</Text>
                  {companyInfo?.director_signature ? (
                    <img
                      src={companyInfo.director_signature}
                      alt="Signature"
                      style={{ display: 'block', margin: '0 auto', maxHeight: 70, maxWidth: '100%', objectFit: 'contain', marginBottom: 8, border: '1px solid #e2e8f0', padding: 4, borderRadius: 6 }}
                    />
                  ) : (
                    <div style={{ padding: 12, background: '#f8fafc', border: '1px dashed #cbd5e1', borderRadius: 8, marginBottom: 8 }}>
                      <Text type="secondary" style={{ fontSize: 11 }}>Chưa có chữ ký</Text>
                    </div>
                  )}
                  <Upload
                    fileList={signatureFile ? [{ uid: '-1', name: signatureFile.name, status: 'done' }] : []}
                    beforeUpload={(file) => { setSignatureFile(file); return false }}
                    maxCount={1}
                    accept="image/*"
                    showUploadList={true}
                    onRemove={() => setSignatureFile(null)}
                  >
                    <Button size="small" icon={<UploadOutlined />}>Chọn Chữ Ký</Button>
                  </Upload>
                </Col>
              </Row>
              <div style={{ marginTop: 8, fontSize: 12, color: '#64748b', textAlign: 'center' }}>
                💡 Gợi ý: Ảnh con dấu và chữ ký nên dùng nền trong suốt (định dạng PNG).
              </div>
            </Col>
          </Row>

          <Divider style={{ margin: '16px 0' }} />

          {canEditSettings && (
            <Button type="primary" style={{ background: '#16a34a', borderColor: '#16a34a' }} icon={<SaveOutlined />} htmlType="submit" loading={loading}>
              Lưu Thông Tin, Logo, Con Dấu & Chữ Ký
            </Button>
          )}
        </Form>
      </Card>

      {/* ── Section 1: General Settings ─────────────────────────────────── */}
      <Card
        title={
          <Space>
            <TagOutlined style={{ color: '#1677ff' }} />
            <Text strong>Cấu Hình Nghiệp Vụ Công Ty</Text>
          </Space>
        }
        style={{ marginBottom: 32, borderRadius: 10 }}
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={handleSaveGeneral}
          style={{ maxWidth: 900 }}
        >
          <Row gutter={16}>
            <Col xs={24} md={12}>
              <Form.Item
                name="order_prefix"
                label="Tiền tố mã chứng từ công ty (Prefix chung)"
                rules={[{ required: true, message: 'Vui lòng nhập tiền tố' }]}
                help="Ví dụ: 'ABC' → Mã Đơn: ABC-DH-..., Báo Giá: ABC-BG-..., Xuất Kho: ABC-EXP-..., Phiếu Thu: ABC-PT-..."
              >
                <Input placeholder="VD: ABC hoặc CTY1" maxLength={10} style={{ textTransform: 'uppercase' }} />
              </Form.Item>
              <Form.Item
                name="continuous_sequence_numbering"
                valuePropName="checked"
                label="Sinh số thứ tự liên tục toàn bộ thời gian"
                help="Khi bật, số thứ tự (001, 002...) sẽ tăng liên tục qua các ngày và không bị làm mới mỗi ngày."
              >
                <Switch checkedChildren="Bật" unCheckedChildren="Tắt" />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item name="timezone" label="Múi giờ hệ thống">
                <Select>
                  <Option value="Asia/Ho_Chi_Minh">(GMT+07:00) Hà Nội, Bangkok, Jakarta</Option>
                  <Option value="Asia/Singapore">(GMT+08:00) Singapore, Kuala Lumpur</Option>
                  <Option value="UTC">(GMT+00:00) UTC Universal Time</Option>
                </Select>
              </Form.Item>
            </Col>
          </Row>

          <Form.Item
            name="default_quotation_terms"
            label={
              <Space wrap>
                <Text strong style={{ color: '#1e293b' }}>📜 Ghi Chú & Điều Khoản Báo Giá Mặc Định Của Công Ty</Text>
                <Button
                  type="link"
                  size="small"
                  onClick={() => {
                    const activeTmpl = templates.find((t) => t.id === activeTemplateId) || templates.find((t) => t.is_default)
                    if (activeTmpl?.footer_content) {
                      form.setFieldsValue({ default_quotation_terms: activeTmpl.footer_content })
                      messageApi.info('Đã tải nội dung gợi ý từ mẫu hệ thống!')
                    } else {
                      messageApi.warning('Mẫu hiện tại không có văn bản gợi ý.')
                    }
                  }}
                >
                  💡 Lấy gợi ý từ mẫu hệ thống
                </Button>
              </Space>
            }
            help="Đoạn văn bản này (thông tin tài khoản ngân hàng, thời hạn báo giá, bảo hành...) sẽ được tự động điền vào các tờ báo giá mới do nhân viên kinh doanh tạo ra."
          >
            <Input.TextArea
              rows={8}
              placeholder="Nhập ghi chú, điều khoản thanh toán, bảo hành, số tài khoản ngân hàng của công ty bạn..."
            />
          </Form.Item>

          <Divider dashed />

          <div style={{ padding: '12px 16px', background: '#f6ffed', borderLeft: '4px solid #16a34a', borderRadius: 6, marginBottom: 24, marginTop: 16 }}>
            <Space>
              <SafetyCertificateOutlined style={{ fontSize: 18, color: '#16a34a' }} />
              <Text strong style={{ fontSize: 16, color: '#16a34a' }}>Cấu Hình Phiếu Bảo Hành Mặc Định</Text>
            </Space>
            <div style={{ marginTop: 4 }}>
              <Text type="secondary" style={{ fontSize: 13 }}>Nội dung ở đây sẽ tự động được sử dụng khi hệ thống sinh ra Phiếu bảo hành mới từ Đơn hàng/Giao hàng.</Text>
            </div>
          </div>

          <Row gutter={24}>
            <Col xs={24} md={24}>
              <Form.Item
                name="default_warranty_content"
                label={
                  <Space>
                    <FileTextOutlined style={{ color: '#16a34a' }} />
                    <Text strong>Nội dung bảo hành (Hiển thị bên cột trái)</Text>
                  </Space>
                }
              >
                <Input.TextArea
                  rows={6}
                  placeholder={`Ví dụ:\n- Thực hiện bảo hành công trình khi sử dụng sản phẩm...\n- Chính sách bảo hành: Bộ cửa Composite bảo hành 36 tháng...\n- Lưu ý: Thời gian xem xét...`}
                />
              </Form.Item>
            </Col>
            <Col xs={24} md={24}>
              <Form.Item
                name="default_warranty_rules"
                label={
                  <Space>
                    <ProfileOutlined style={{ color: '#16a34a' }} />
                    <Text strong>Quy định bảo hành (Hiển thị bên cột phải)</Text>
                  </Space>
                }
              >
                <Input.TextArea
                  rows={8}
                  placeholder={`Ví dụ:\n1. Trường hợp được bảo hành:\n- Sản phẩm còn trong thời hạn bảo hành.\n\n2. Các trường hợp không bảo hành:\n- Lỗi sản phẩm phát sinh do khách hàng...`}
                />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col xs={24} md={12}>
              <Form.Item
                name="custom_quotation_title"
                label="Tiêu đề mẫu in Báo Giá (Tùy chỉnh)"
                help="Nếu để trống sẽ dùng mặc định (VD: BÁO GIÁ SẢN XUẤT)"
              >
                <Input placeholder="VD: BÁO GIÁ DỊCH VỤ, HỢP ĐỒNG NGUYÊN TẮC..." style={{ textTransform: 'uppercase' }} />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item
                name="custom_order_title"
                label="Tiêu đề mẫu in Đơn Hàng (Tùy chỉnh)"
                help="Nếu để trống sẽ dùng mặc định (VD: ĐƠN HÀNG SẢN XUẤT)"
              >
                <Input placeholder="VD: HỢP ĐỒNG THI CÔNG, ĐƠN ĐẶT HÀNG..." style={{ textTransform: 'uppercase' }} />
              </Form.Item>
            </Col>
          </Row>

          <Divider dashed />

          <div style={{ padding: '12px 16px', background: '#e6f4ff', borderLeft: '4px solid #1677ff', borderRadius: 6, marginBottom: 24, marginTop: 16 }}>
            <Space>
              <PartitionOutlined style={{ fontSize: 18, color: '#1677ff' }} />
              <Text strong style={{ fontSize: 16, color: '#1677ff' }}>Tùy Chỉnh Tên Trạng Thái Quy Trình (Pipeline CRM)</Text>
            </Space>
            <div style={{ marginTop: 4 }}>
              <Text type="secondary" style={{ fontSize: 13 }}>Admin có thể đổi tên hiển thị các trạng thái quy trình bán hàng cho phù hợp với đặc thù nghiệp vụ doanh nghiệp. Tên mới sẽ hiển thị cho toàn bộ nhân viên.</Text>
            </div>
          </div>

          <Row gutter={16}>
            <Col xs={24} sm={12} md={8}>
              <Form.Item name={['pipeline_status_labels', 'new']} label="Khách mới (new)">
                <Input placeholder="VD: Khách mới" />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12} md={8}>
              <Form.Item name={['pipeline_status_labels', 'potential']} label="Tiềm năng (potential)">
                <Input placeholder="VD: Tìm hiểu nhu cầu" />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12} md={8}>
              <Form.Item name={['pipeline_status_labels', 'active']} label="Đang hoạt động (active)">
                <Input placeholder="VD: Sắp chốt" />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12} md={8}>
              <Form.Item name={['pipeline_status_labels', 'lost']} label="Đã mất (lost)">
                <Input placeholder="VD: Không còn nhu cầu" />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12} md={8}>
              <Form.Item name={['pipeline_status_labels', 'has_order']} label="Trạng thái: Đã có đơn hàng (has_order) ⚡">
                <Input placeholder="VD: Đã có đơn hàng" />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12} md={8}>
              <Form.Item name={['pipeline_status_labels', 'repeat_order']} label="Trạng thái: Mua thêm đơn hàng (repeat_order) ⚡">
                <Input placeholder="VD: Mua thêm đơn hàng" />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col xs={24} md={12}>
              <Form.Item
                name="inactive_days_threshold"
                label="Số ngày tính là khách ngủ đông"
                help="Tính từ ngày mua hàng gần nhất (hoặc ngày tạo khách). Điền 0 để tắt tự động đánh dấu."
              >
                <InputNumber min={0} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
          </Row>

          {canEditSettings && (
            <Button type="primary" icon={<SaveOutlined />} htmlType="submit" loading={loading}>
              Lưu cài đặt nghiệp vụ
            </Button>
          )}
        </Form>
      </Card>

      {/* ── Section 2: Quotation Templates Gallery ───────────────────────── */}
      <div style={{ marginBottom: 16 }}>
        <Title level={4} style={{ margin: 0 }}>
          <FileTextOutlined style={{ marginRight: 8, color: '#16a34a' }} />
          Kho Mẫu Báo Giá Hệ Thống
        </Title>
        <Text type="secondary">
          Lựa chọn giao diện và cấu trúc điều khoản báo giá áp dụng cho toàn bộ nhân viên kinh doanh của doanh nghiệp
        </Text>
      </div>

      <Row gutter={[24, 24]}>
        {templates.map((tmpl) => {
          const isCurrent = tmpl.id === activeTemplateId
          const isLand = tmpl.layout_config?.paper_orientation === 'landscape' || tmpl.code?.includes('landscape') || tmpl.name?.toLowerCase()?.includes('khổ ngang')
          const themeClr = tmpl.layout_config?.theme_color || '#1649c9'

          return (
            <Col xs={24} md={12} lg={8} key={tmpl.id}>
              <Card
                hoverable
                style={{
                  height: '100%',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  borderRadius: 16,
                  border: isCurrent ? '2px solid #16a34a' : '1px solid #e2e8f0',
                  background: '#fff',
                  boxShadow: isCurrent ? '0 10px 25px -5px rgba(22, 163, 74, 0.15)' : '0 4px 12px rgba(0,0,0,0.03)',
                  overflow: 'hidden',
                  transition: 'all 0.3s ease',
                }}
                bodyStyle={{ padding: 0, flex: 1, display: 'flex', flexDirection: 'column' }}
              >
                {/* ── Top Status Bar / Header Banner ── */}
                <div
                  style={{
                    padding: '12px 18px',
                    background: isCurrent ? 'linear-gradient(135deg, #dcfce7 0%, #bbf7d0 100%)' : '#f8fafc',
                    borderBottom: isCurrent ? '1px solid #86efac' : '1px solid #f1f5f9',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}
                >
                  <div>
                    {isCurrent ? (
                      <Tag color="green" icon={<CheckCircleOutlined />} style={{ fontWeight: 700, fontSize: 12, padding: '2px 8px', borderRadius: 12, margin: 0 }}>
                        ĐANG ÁP DỤNG
                      </Tag>
                    ) : tmpl.is_default ? (
                      <Tag color="blue" style={{ fontWeight: 600, fontSize: 11, padding: '1px 8px', borderRadius: 10, margin: 0 }}>
                        MẶC ĐỊNH SAAS
                      </Tag>
                    ) : (
                      <Tag color="default" style={{ fontSize: 11, padding: '1px 8px', borderRadius: 10, margin: 0 }}>
                        TÙY CHỌN
                      </Tag>
                    )}
                  </div>

                  <Space size={6}>
                    <span style={{ display: 'inline-block', width: 12, height: 12, borderRadius: '50%', background: themeClr, border: '2px solid #fff', boxShadow: '0 0 0 1px #cbd5e1' }} />
                    {isLand ? (
                      <Tag color="purple" style={{ margin: 0, fontWeight: 600, borderRadius: 6 }}>📐 Khổ Ngang</Tag>
                    ) : (
                      <Tag color="cyan" style={{ margin: 0, fontWeight: 600, borderRadius: 6 }}>📄 Khổ Dọc</Tag>
                    )}
                  </Space>
                </div>

                {/* ── Card Content Body ── */}
                <div style={{ padding: '20px 20px 16px', flex: 1, display: 'flex', flexDirection: 'column' }}>
                  <Title level={5} style={{ margin: '0 0 10px 0', color: isCurrent ? '#15803d' : '#0f172a', fontWeight: 700, fontSize: 17, lineHeight: 1.4 }}>
                    {tmpl.name}
                  </Title>

                  <div style={{ marginBottom: 14, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    <Tag style={{ background: '#f1f5f9', border: '1px solid #e2e8f0', color: '#475569', fontWeight: 500, margin: 0, borderRadius: 6 }}>
                      Mã: {tmpl.code}
                    </Tag>
                    {tmpl.layout_style && (
                      <Tag style={{ background: '#eff6ff', border: '1px solid #bfdbfe', color: '#1d4ed8', fontWeight: 500, margin: 0, borderRadius: 6 }}>
                        Layout: {tmpl.layout_style}
                      </Tag>
                    )}
                  </div>

                  <div
                    style={{
                      background: '#f8fafc',
                      padding: '12px 14px',
                      borderRadius: 10,
                      border: '1px solid #f1f5f9',
                      flex: 1,
                    }}
                  >
                    <Paragraph
                      type="secondary"
                      style={{ fontSize: 13, margin: 0, color: '#64748b', lineHeight: 1.6 }}
                    >
                      {tmpl.description || 'Mẫu báo giá chuẩn hệ thống phù hợp cho các doanh nghiệp vừa và nhỏ.'}
                    </Paragraph>
                  </div>
                </div>

                {/* ── Card Footer Action Buttons ── */}
                <div
                  style={{
                    padding: '14px 16px',
                    background: '#fafbfc',
                    borderTop: '1px solid #f1f5f9',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: 8,
                  }}
                >
                  <Button
                    type="default"
                    icon={<EyeOutlined />}
                    style={{ borderRadius: 8, fontWeight: 500, flexShrink: 0 }}
                    onClick={() => handlePreview(tmpl)}
                  >
                    Xem mẫu
                  </Button>
                  <Button
                    type={isCurrent ? 'default' : 'primary'}
                    icon={<CheckCircleOutlined />}
                    disabled={isCurrent}
                    style={
                      isCurrent
                        ? { background: '#dcfce7', borderColor: '#86efac', color: '#15803d', borderRadius: 8, fontWeight: 600, flex: 1, whiteSpace: 'nowrap' }
                        : { background: 'linear-gradient(90deg, #1649c9 0%, #2563eb 100%)', border: 'none', borderRadius: 8, fontWeight: 600, flex: 1, boxShadow: '0 4px 10px rgba(37, 99, 235, 0.2)', whiteSpace: 'nowrap' }
                    }
                    onClick={() => handleApplyTemplate(tmpl.id)}
                  >
                    {isCurrent ? 'Đang áp dụng' : 'Áp dụng'}
                  </Button>
                </div>
              </Card>
            </Col>
          )
        })}
      </Row>

      {/* ── Modal Preview Quotation Template ────────────────────────────── */}
      <Modal
        title={
          <Space>
            <EyeOutlined style={{ color: '#2563eb' }} />
            <Text strong>Xem Trước Mẫu Báo Giá: {selectedTemplate?.name}</Text>
          </Space>
        }
        open={previewModalVisible}
        onClose={() => setPreviewModalVisible(false)}
        onCancel={() => setPreviewModalVisible(false)}
        footer={[
          <Button key="close" onClick={() => setPreviewModalVisible(false)}>
            Đóng
          </Button>,
          selectedTemplate?.id !== activeTemplateId && (
            <Button
              key="apply"
              type="primary"
              style={{ background: '#16a34a', borderColor: '#16a34a' }}
              onClick={() => {
                setPreviewModalVisible(false)
                handleApplyTemplate(selectedTemplate?.id)
              }}
            >
              Áp Dụng Mẫu Này Ngay
            </Button>
          ),
        ]}
        width={
          (selectedTemplate?.layout_config?.paper_orientation === 'landscape' ||
            selectedTemplate?.code?.includes('landscape') ||
            selectedTemplate?.name?.toLowerCase()?.includes('khổ ngang'))
            ? 1150
            : 920
        }
      >
        {selectedTemplate && (() => {
          const isLand = selectedTemplate.layout_config?.paper_orientation === 'landscape' ||
            selectedTemplate.code?.includes('landscape') ||
            selectedTemplate.name?.toLowerCase()?.includes('khổ ngang');
          const themeClr = selectedTemplate.layout_config?.theme_color || '#1649c9';

          return (
            <div
              style={{
                padding: '28px 32px',
                border: '1px solid #e2e8f0',
                borderRadius: 8,
                background: '#fff',
                color: '#1e293b',
                boxShadow: '0 4px 12px rgba(0,0,0,0.05)',
                minWidth: isLand ? 980 : undefined,
                overflowX: 'auto',
              }}
            >
              {/* ── Header: Bên trái Logo, Bên phải TT Công ty ───────────── */}
              <div
                style={{
                  marginBottom: 20,
                  padding: '20px 24px',
                  background: '#f8fafc',
                  border: '1px solid #e2e8f0',
                  borderRadius: 12,
                  boxShadow: '0 2px 6px rgba(0,0,0,0.02)',
                }}
              >
                <Row justify="space-between" align="middle" gutter={24}>
                  {/* Cột trái: Logo */}
                  <Col xs={24} sm={8} style={{ textAlign: 'left' }}>
                    {(companyInfo?.logo || selectedTemplate?.company_info?.logo) ? (
                      <img
                        src={companyInfo?.logo || selectedTemplate?.company_info?.logo}
                        alt="Logo công ty"
                        style={{ maxHeight: 75, maxWidth: '100%', objectFit: 'contain', borderRadius: 4 }}
                      />
                    ) : (
                      <div
                        style={{
                          width: 64,
                          height: 64,
                          borderRadius: 8,
                          background: '#e0e7ff',
                          color: '#3730a3',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontWeight: 700,
                          fontSize: 18,
                        }}
                      >
                        LOGO
                      </div>
                    )}
                  </Col>

                  {/* Cột phải: Thông tin công ty */}
                  <Col xs={24} sm={16} style={{ textAlign: 'right' }}>
                    <Title level={4} style={{ margin: '0 0 4px 0', color: themeClr, fontWeight: 700 }}>
                      {companyInfo?.name || selectedTemplate?.company_info?.name || 'TÊN CÔNG TY CỦA BẠN'}
                    </Title>
                    <div style={{ color: '#475569', fontSize: 13.5, lineHeight: '1.6' }}>
                      <div><strong>MST:</strong> {companyInfo?.tax_code || selectedTemplate?.company_info?.tax_code || 'Chưa cập nhật'}</div>
                      <div><strong>Địa chỉ:</strong> {companyInfo?.address || selectedTemplate?.company_info?.address || 'Chưa cập nhật'}</div>
                      <div><strong>Hotline:</strong> {companyInfo?.phone || selectedTemplate?.company_info?.phone || 'Chưa cập nhật'}</div>
                    </div>
                  </Col>
                </Row>
              </div>

              {/* ── Tiêu đề Bảng Báo Giá (Căn giữa) ──────────────────────── */}
              <div style={{ textAlign: 'center', margin: '24px 0 24px', padding: '0 16px' }}>
                <Title level={2} style={{ margin: '0 0 8px 0', color: themeClr, textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 700 }}>
                  {selectedTemplate?.layout_config?.custom_title || (isLand ? 'BÁO GIÁ SẢN XUẤT CỬA COMPOSITE' : 'Bảng Báo Giá Chi Tiết')}
                </Title>
                <div style={{ marginBottom: 12 }}>
                  <Space size={16} style={{ justifyContent: 'center', display: 'inline-flex', background: '#eff6ff', padding: '4px 16px', borderRadius: 20, border: '1px solid #bfdbfe' }}>
                    <span style={{ color: '#1d4ed8', fontSize: 13.5 }}>Số báo giá: <strong>BG-202607-001</strong></span>
                    <span style={{ color: '#cbd5e1' }}>|</span>
                    <span style={{ color: '#334155', fontSize: 13.5 }}>Ngày báo giá: <strong>07/07/2026</strong></span>
                  </Space>
                </div>
                <div
                  style={{
                    color: '#475569',
                    fontSize: 14,
                    fontStyle: 'italic',
                    maxWidth: 680,
                    margin: '0 auto',
                    lineHeight: '1.6',
                  }}
                >
                  Kính gửi Quý khách hàng, chúng tôi xin trân trọng gửi bảng báo giá các hạng mục sản phẩm / dịch vụ chi tiết dưới đây:
                </div>
              </div>

              {/* ── Thông tin Khách hàng / Bên bán & Bên mua ───────────── */}
              {isLand ? (
                <Row gutter={24} style={{ marginBottom: 20 }}>
                  {/* BÊN BÁN */}
                  <Col xs={24} md={12}>
                    <div style={{ padding: '16px 20px', background: '#f8fafc', border: '1px solid #94a3b8', borderRadius: 8, height: '100%' }}>
                      <div style={{ fontWeight: 700, color: '#1e3a8a', fontSize: 14, marginBottom: 8, borderBottom: '1px solid #cbd5e1', paddingBottom: 6 }}>
                        🏢 BÊN BÁN (BÊN B): {companyInfo?.name || selectedTemplate?.company_info?.name || 'CÔNG TY CỦA BẠN'}
                      </div>
                      <div style={{ fontSize: 13, color: '#334155', lineHeight: 1.7 }}>
                        <div><strong>Đại diện:</strong> Nguyễn Anh Tuấn &nbsp;•&nbsp; <strong>Chức vụ:</strong> Giám đốc</div>
                        <div><strong>Mã số thuế:</strong> {companyInfo?.tax_code || selectedTemplate?.company_info?.tax_code || '0111100289'}</div>
                        <div><strong>Điện thoại:</strong> {companyInfo?.phone || selectedTemplate?.company_info?.phone || '0961442882'}</div>
                        <div><strong>Địa chỉ:</strong> {companyInfo?.address || selectedTemplate?.company_info?.address || 'KĐT Xa La, Hà Đông, Hà Nội'}</div>
                      </div>
                    </div>
                  </Col>
                  {/* BÊN MUA */}
                  <Col xs={24} md={12}>
                    <div style={{ padding: '16px 20px', background: '#fff', border: '1px solid #cbd5e1', borderRadius: 8, height: '100%', boxShadow: '0 2px 6px rgba(0,0,0,0.02)' }}>
                      <div style={{ fontWeight: 700, color: '#0f172a', fontSize: 14, marginBottom: 8, borderBottom: '1px solid #e2e8f0', paddingBottom: 6 }}>
                        👤 BÊN MUA (BÊN A): CÔNG TY KHÁCH HÀNG
                      </div>
                      <div style={{ fontSize: 13, color: '#334155', lineHeight: 1.7 }}>
                        <div><strong>Khách hàng:</strong> Công ty Kiến trúc và Nội thất K2</div>
                        <div><strong>Mã số thuế:</strong> 0109999999 &nbsp;•&nbsp; <strong>Điện thoại:</strong> 0912345678</div>
                        <div><strong>Địa chỉ:</strong> Vườn Cam, Hoài Đức, TP Hà Nội</div>
                        <div><strong>Ngày lắp đặt dự kiến:</strong> <strong style={{ color: '#2563eb' }}>15/07/2026</strong></div>
                      </div>
                    </div>
                  </Col>
                </Row>
              ) : (
                <div
                  style={{
                    marginBottom: 18,
                    padding: '12px 18px',
                    background: '#eff6ff',
                    border: '1px solid #bfdbfe',
                    borderRadius: 8,
                  }}
                >
                  <div style={{ fontWeight: 700, color: '#1d4ed8', fontSize: 13.5, marginBottom: 8, borderBottom: '1px solid #dbeafe', paddingBottom: 6, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                    <span>👤 THÔNG TIN KHÁCH HÀNG / ĐỐI TÁC (MẪU)</span>
                    <span style={{ fontSize: 13, fontWeight: 600, color: '#2563eb' }}>
                      📅 Ngày lắp đặt dự kiến: 15/07/2026
                    </span>
                  </div>
                  <Row gutter={[20, 6]} style={{ fontSize: 13.5, color: '#1e293b', lineHeight: 1.7 }}>
                    <Col xs={24} md={12}>
                      <strong>Khách hàng:</strong> <span style={{ fontWeight: 600, color: '#1e3a8a' }}>Anh Nguyễn Văn A — Công ty ABC</span>
                    </Col>
                    <Col xs={24} md={12}>
                      <strong>Điện thoại:</strong> <span style={{ fontWeight: 600 }}>0988.123.456</span>
                    </Col>
                    <Col xs={24} md={12}>
                      <strong>Địa chỉ:</strong> Số 10, Đường Phố Huế, Q. Hai Bà Trưng, Hà Nội
                    </Col>
                    <Col xs={24} md={12}>
                      <strong>Email:</strong> contact@congtyabc.vn
                    </Col>
                  </Row>
                </div>
              )}

              {/* Sample Items Table */}
              <Table
                dataSource={
                  isLand
                    ? [
                        { id: 1, prodId: 'P1', name: 'Cửa Gỗ Nhựa Composite Cao Cấp - Cánh Phẳng', img: 'https://images.unsplash.com/photo-1513694203232-719a280e022f?w=150&auto=format&fit=crop&q=80', height: 2355, width: 997, thickness: 125, symbol: 'D1.1', note: 'Phòng Ngủ 1 (ko khoét lỗ khoá)', qty: 1, unit: 'bộ', price: 3370000, total: 3370000 },
                        { id: 2, prodId: 'P1', name: 'Cửa Gỗ Nhựa Composite Cao Cấp - Cánh Phẳng', img: 'https://images.unsplash.com/photo-1513694203232-719a280e022f?w=150&auto=format&fit=crop&q=80', height: 2355, width: 810, thickness: 125, symbol: 'D1.2', note: 'Phòng Ngủ 2 (khoá FT-103)', qty: 1, unit: 'bộ', price: 3370000, total: 3370000 },
                        { id: 3, prodId: 'P2', name: 'Cửa Gỗ Nhựa Composite - Có Ô Kính (DW1.1)', img: 'https://images.unsplash.com/photo-1506377247377-2a5b3b417ebb?w=150&auto=format&fit=crop&q=80', height: 2365, width: 690, thickness: 135, symbol: 'DW1.1', note: 'Phòng Vệ Sinh', qty: 1, unit: 'bộ', price: 2970000, total: 2970000 },
                      ]
                    : [
                        { id: 1, name: 'Cửa Composite Grand Door màu óc chó', note: 'KT: 800x2200mm, khung bao 100', unit: 'bộ', qty: 2, price: 3950000, total: 7900000 },
                        { id: 2, name: 'Khóa tay gạt hợp kim cao cấp FT-103', note: 'Màu đen nhám, bao lăp đặt', unit: 'chiếc', qty: 2, price: 450000, total: 900000 },
                      ]
                }
                rowKey="id"
                pagination={false}
                size="small"
                bordered={selectedTemplate.layout_style === 'classic_border'}
                style={{ marginBottom: 20 }}
                scroll={{ x: isLand ? 980 : undefined }}
                columns={
                  isLand
                    ? [
                        {
                          title: 'STT',
                          dataIndex: 'id',
                          width: 50,
                          align: 'center',
                          render: (v, __, idx) => {
                            let rowSpan = 1
                            if (idx === 0) rowSpan = 2
                            else if (idx === 1) rowSpan = 0
                            else rowSpan = 1
                            const sttNum = idx <= 1 ? 1 : 2
                            return {
                              children: <span style={{ color: themeClr, fontWeight: 600 }}>{sttNum}</span>,
                              props: { rowSpan },
                            }
                          },
                        },
                        {
                          title: 'MẪU CỬA / SẢN PHẨM',
                          key: 'product_info',
                          width: 260,
                          render: (_, r, idx) => {
                            let rowSpan = 1
                            if (idx === 0) rowSpan = 2
                            else if (idx === 1) rowSpan = 0
                            else rowSpan = 1

                            return {
                              children: (
                                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', padding: '6px 4px', gap: 6, width: '100%' }}>
                                  {r.img ? (
                                    <img src={r.img} alt="prod" style={{ width: 68, height: 68, objectFit: 'cover', borderRadius: 6, border: '1px solid #cbd5e1', boxShadow: '0 2px 4px rgba(0,0,0,0.05)' }} />
                                  ) : null}
                                  <strong style={{ display: 'block', color: '#0f172a', fontSize: 13.5, textAlign: 'left', width: '100%', lineHeight: 1.3 }}>{r.name}</strong>
                                  {r.note && (
                                    <div style={{ fontSize: 11.5, color: '#475569', textAlign: 'left', width: '100%', lineHeight: 1.4, marginTop: 2, fontStyle: 'italic', whiteSpace: 'pre-wrap' }}>
                                      {r.note}
                                    </div>
                                  )}
                                </div>
                              ),
                              props: { rowSpan },
                            }
                          },
                        },
                        {
                          title: 'KÍCH THƯỚC Ô CHỜ (mm)',
                          children: [
                            { title: 'Cao', dataIndex: 'height', width: 70, align: 'center', render: v => <strong style={{ color: '#1e293b' }}>{v}</strong> },
                            { title: 'Rộng', dataIndex: 'width', width: 70, align: 'center', render: v => <strong style={{ color: '#1e293b' }}>{v}</strong> },
                            { title: 'Dày', dataIndex: 'thickness', width: 70, align: 'center', render: v => <span>{v}</span> },
                          ],
                        },
                        { title: 'KÝ HIỆU', dataIndex: 'symbol', width: 90, align: 'center', render: v => <Tag color="blue" style={{ fontWeight: 600 }}>{v}</Tag> },
                        { title: 'GHI CHÚ KỸ THUẬT', dataIndex: 'note', width: 160, render: v => <span style={{ fontSize: 12 }}>{v}</span> },
                        { title: 'SL', dataIndex: 'qty', align: 'center', width: 50 },
                        { title: 'ĐVT', dataIndex: 'unit', align: 'center', width: 60 },
                        { title: 'ĐƠN GIÁ/BỘ', dataIndex: 'price', align: 'right', width: 120, render: v => v.toLocaleString('vi-VN') + ' đ' },
                        { title: 'TỔNG TIỀN', dataIndex: 'total', align: 'right', width: 130, render: v => <strong style={{ color: themeClr }}>{v.toLocaleString('vi-VN')} đ</strong> },
                      ]
                    : [
                        { title: 'STT', dataIndex: 'id', width: 42, align: 'center', render: (v) => <span style={{ color: themeClr, fontWeight: 600 }}>{v}</span> },
                        { title: 'Tên hàng hóa / Dịch vụ', dataIndex: 'name', width: 240, render: (v) => <strong style={{ color: '#0f172a' }}>{v}</strong> },
                        { title: 'Kích thước / Ghi chú', dataIndex: 'note', width: 175, render: (v) => <span style={{ fontSize: 12, color: '#334155' }}>{v || '—'}</span> },
                        { title: 'ĐVT', dataIndex: 'unit', width: 55, align: 'center' },
                        { title: 'SL', dataIndex: 'qty', align: 'center', width: 48 },
                        { title: 'Đơn giá', dataIndex: 'price', align: 'right', width: 110, render: (v) => v.toLocaleString('vi-VN') + ' đ' },
                        { title: 'Thành tiền', dataIndex: 'total', align: 'right', width: 125, render: (v) => <strong style={{ color: '#16a34a' }}>{v.toLocaleString('vi-VN')} đ</strong> },
                      ]
                }
              />

              <Row justify="end" style={{ marginBottom: 24 }}>
                <Col xs={24} md={10} style={{ textAlign: 'right' }}>
                  <div style={{ color: '#64748b' }}>Chiết khấu: {isLand ? '0 đ' : '-500,000 đ'}</div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: themeClr, marginTop: 4 }}>
                    TỔNG THANH TOÁN: {isLand ? '9,710,000 đ' : '10,500,000 đ'}
                  </div>
                </Col>
              </Row>
              <Divider style={{ margin: '16px 0' }} />

              {/* Footer terms section */}
              <div>
                <Text strong style={{ color: '#0f172a', display: 'block', marginBottom: 8 }}>
                  Ghi chú & Điều khoản (mặc định áp dụng cho mẫu này):
                </Text>
                <div
                  style={{
                    background: '#f8fafc',
                    padding: '12px 16px',
                    borderRadius: 6,
                    borderLeft: '4px solid #3b82f6',
                    whiteSpace: 'pre-wrap',
                    fontSize: 13,
                    color: '#334155',
                  }}
                >
                  {settings?.default_quotation_terms || selectedTemplate.footer_content || 'Không có điều khoản đặc biệt.'}
                </div>
              </div>

              {/* Signatures & Stamp preview */}
              <Row justify="space-between" style={{ marginTop: 32, textAlign: 'center' }}>
                <Col xs={24} md={10}>
                  <Text strong style={{ display: 'block', fontSize: 13, color: '#1e293b' }}>BÊN MUA / KHÁCH HÀNG</Text>
                  <Text type="secondary" style={{ fontSize: 11, fontStyle: 'italic' }}>(Ký, ghi rõ họ tên)</Text>
                  <div style={{ height: 80 }} />
                </Col>
                <Col xs={24} md={10}>
                  <Text strong style={{ display: 'block', fontSize: 13, color: '#1e293b' }}>
                    {settings?.director_title || 'ĐẠI DIỆN CÔNG TY'}
                  </Text>
                  <Text type="secondary" style={{ fontSize: 11, fontStyle: 'italic' }}>(Ký, đóng dấu)</Text>
                  <div style={{ height: 145, display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', marginTop: 12 }}>
                    {settings?.stamp_image && (
                      <img
                        src={settings.stamp_image}
                        alt="Stamp"
                        style={{ height: 135, maxWidth: 165, position: 'absolute', opacity: 0.88, zIndex: 1, objectFit: 'contain' }}
                      />
                    )}
                    {settings?.director_signature && (
                      <img
                        src={settings.director_signature}
                        alt="Signature"
                        style={{ height: 115, maxWidth: 200, position: 'relative', zIndex: 2, objectFit: 'contain' }}
                      />
                    )}
                  </div>
                  <Text strong style={{ display: 'block', fontSize: 15, color: '#0f172a', marginTop: 8 }}>
                    {settings?.director_name || ''}
                  </Text>
                </Col>
              </Row>
            </div>
          );
        })()}
      </Modal>
    </div>
  )
}
