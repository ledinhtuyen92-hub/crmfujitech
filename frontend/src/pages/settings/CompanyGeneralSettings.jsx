import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
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
  CopyOutlined,
  FormatPainterOutlined,
  DeleteOutlined,
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
  Popconfirm,
} from 'antd'
import api from '../../utils/api'
import { useAuth } from '../../contexts/AuthContext'
import { useResponsive } from '../../hooks/useResponsive'
import QuotationRenderer from '../../components/QuotationRenderer'

const { Title, Text, Paragraph } = Typography
const { Option } = Select

export default function CompanyGeneralSettings() {
  const navigate = useNavigate()
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
      const res = await api.patchForm('users/my-company/', formData)
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

  const handleCloneTemplate = async (id) => {
    try {
      setLoading(true)
      const res = await api.post(`sales/quotation-templates/${id}/clone/`)
      messageApi.success('Đã tạo bản sao thành công!')
      fetchData()
      navigate(`/admin/quotation-templates/${res.data.id}/builder`)
    } catch (err) {
      messageApi.error('Lỗi khi tạo bản sao.')
      setLoading(false)
    }
  }

  const handleDeleteTemplate = async (id) => {
    try {
      setLoading(true)
      await api.delete(`sales/quotation-templates/${id}/`)
      messageApi.success('Đã xóa mẫu báo giá!')
      fetchData()
    } catch (err) {
      messageApi.error('Lỗi khi xóa mẫu báo giá.')
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
              <Form.Item name={['pipeline_status_labels', 'has_order']} label="Đã có đơn hàng (has_order) ⚡">
                <Input placeholder="VD: Đã có đơn hàng" />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12} md={8}>
              <Form.Item name={['pipeline_status_labels', 'repeat_order']} label="Mua thêm đơn hàng (repeat_order) ⚡">
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
                    flexDirection: 'column',
                    gap: 8,
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
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
                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                    {tmpl.is_system_template ? (
                      <Button size="small" type="primary" ghost icon={<CopyOutlined />} onClick={() => handleCloneTemplate(tmpl.id)}>
                        Tạo bản sao
                      </Button>
                    ) : (
                      <>
                        <Button 
                          size="small" 
                          type="primary" 
                          style={{ background: '#722ed1' }} 
                          icon={<FormatPainterOutlined />} 
                          onClick={() => navigate(`/admin/quotation-templates/${tmpl.id}/builder`)}
                        >
                          Thiết kế
                        </Button>
                        <Popconfirm title="Xóa mẫu này?" onConfirm={() => handleDeleteTemplate(tmpl.id)} okText="Xóa" cancelText="Hủy">
                          <Button size="small" danger icon={<DeleteOutlined />} />
                        </Popconfirm>
                      </>
                    )}
                  </div>
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
        {selectedTemplate && (
          <div style={{ background: '#f0f2f5', padding: 24, display: 'flex', justifyContent: 'center' }}>
            <div 
              style={{
                width: selectedTemplate.layout_config?.paper_orientation === 'landscape' ? '297mm' : '210mm',
                minHeight: selectedTemplate.layout_config?.paper_orientation === 'landscape' ? '210mm' : '297mm',
                background: 'white',
                padding: '20mm',
                boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                transform: selectedTemplate.layout_config?.paper_orientation === 'landscape' ? 'scale(0.85)' : 'scale(0.95)',
                transformOrigin: 'top center'
              }}
            >
              <QuotationRenderer 
                layoutConfig={selectedTemplate.layout_config || {}}
                layoutStyle={selectedTemplate.layout_style}
                data={{
                  customer: { name: 'CÔNG TY KHÁCH HÀNG', phone: '0912345678', address: 'Tòa nhà văn phòng XYZ', tax_code: '0109999999' },
                  company: { 
                    name: companyInfo?.name || 'CÔNG TY CỦA BẠN', 
                    phone: companyInfo?.phone || '0912345678', 
                    address: companyInfo?.address || 'Hà Nội', 
                    tax_code: companyInfo?.tax_code || '0101234567',
                    logo: companyInfo?.logo,
                    stamp_image: companyInfo?.stamp_image || companyInfo?.stamp,
                    director_signature: companyInfo?.director_signature || companyInfo?.signature,
                    director_name: companyInfo?.director_name || 'Nguyễn Anh Tuấn',
                    director_title: companyInfo?.director_title || 'Giám đốc'
                  },
                  items: [
                    { id: 1, product: 'Sản phẩm Demo 1', unit: 'Bộ', quantity: 2, unit_price: 1500000, discount_percent: 0, line_total: 3000000, item_type: 'product', height: 2200, width: 900, thickness: 45, symbol: 'D1', note: 'Kính trắng 8mm cường lực', custom_data: { custom_1786962666909: 'Màu vân gỗ' } },
                    { id: 2, product: 'Sản phẩm Demo 2', unit: 'Bộ', quantity: 1, unit_price: 3500000, discount_percent: 10, line_total: 3150000, item_type: 'product', height: 2400, width: 1200, thickness: 50, symbol: 'D2', note: 'Phụ kiện đồng bộ', custom_data: { custom_1786962666909: 'Màu trắng sứ' } },
                    { id: 3, product: 'Dịch vụ thi công lắp đặt', unit: 'Gói', quantity: 1, unit_price: 500000, discount_percent: 0, line_total: 500000, item_type: 'service', symbol: 'SV1', specs: 'Bao gồm vật tư phụ', note: 'Thi công trong ngày' },
                  ],
                  totals: {
                    subtotal: 3850000,
                    discount: 0,
                    tax_percent: 10,
                    tax: 385000,
                    total: 4235000,
                  }
                }}
              />
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
