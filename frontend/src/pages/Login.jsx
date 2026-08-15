import {
  AppstoreOutlined,
  LockOutlined,
  SafetyCertificateOutlined,
  UserOutlined,
} from '@ant-design/icons'
import { Button, Col, Form, Input, Row, Space, Typography, message, theme } from 'antd'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import authTechnology from '../assets/auth-technology.png'

const { Paragraph, Text, Title } = Typography

function Login() {
  const navigate = useNavigate()
  const { token } = theme.useToken()
  const { login } = useAuth()
  const [messageApi, contextHolder] = message.useMessage()

  const handleSubmit = async (values) => {
    try {
      const loggedUser = await login(
        values.workspace_id?.trim() || '',
        values.username,
        values.password,
      )
      messageApi.success('Đăng nhập thành công!')

      // Redirect dựa theo role
      if (loggedUser?.is_superuser) {
        navigate('/admin/dashboard')
      } else {
        navigate('/dashboard')
      }
    } catch (error) {
      if (error.response?.status === 401) {
        messageApi.error('Sai tài khoản, mật khẩu hoặc tài khoản không tồn tại trên hệ thống.')
        return
      }

      const data = error.response?.data
      if (data && typeof data === 'object') {
        // Hiển thị lỗi theo từng field
        const msgs = Object.values(data).flat().join(' ')
        // Xử lý thông báo mặc định của DRF bằng tiếng Anh
        if (msgs.includes('No active account found with the given credentials')) {
          messageApi.error('Sai tài khoản, mật khẩu hoặc tài khoản không tồn tại trên hệ thống.')
        } else {
          messageApi.error(msgs)
        }
      } else {
        messageApi.error('Không thể đăng nhập. Vui lòng kiểm tra lại thông tin.')
      }
    }
  }

  return (
    <Row style={{ minHeight: '100vh', background: token.colorBgContainer }}>
      {contextHolder}

      {/* ── Left panel — hero image ─────────────────────────────── */}
      <Col xs={0} lg={12} xl={13}>
        <section
          style={{
            minHeight: '100vh',
            position: 'relative',
            display: 'flex',
            alignItems: 'center',
            overflow: 'hidden',
            padding: 'clamp(40px, 7vw, 104px)',
            backgroundImage: `linear-gradient(90deg, rgba(2, 8, 23, 0.32), rgba(2, 8, 23, 0.08)), url(${authTechnology})`,
            backgroundPosition: 'center',
            backgroundSize: 'cover',
          }}
        >
          <div
            style={{
              width: 'min(580px, 100%)',
              padding: '40px',
              border: '1px solid rgba(255, 255, 255, 0.2)',
              borderRadius: 8,
              color: '#fff',
              background: 'rgba(8, 23, 52, 0.54)',
              boxShadow: '0 24px 64px rgba(2, 8, 23, 0.28)',
              backdropFilter: 'blur(16px)',
              WebkitBackdropFilter: 'blur(16px)',
            }}
          >
            <Space size={12} style={{ marginBottom: 28 }}>
              <img src="/logo.png" alt="Fujitech Logo" style={{ height: 48, width: 'auto', objectFit: 'contain' }} />
              <Text strong style={{ color: '#fff', fontSize: 18 }}>
                Fujitech Hub
              </Text>
            </Space>
            <Title style={{ margin: 0, color: '#fff', fontSize: 42, lineHeight: 1.18 }}>
              Nền tảng Quản trị Doanh nghiệp Toàn diện
            </Title>
            <Paragraph
              style={{ margin: '20px 0 0', color: 'rgba(255, 255, 255, 0.76)', fontSize: 17 }}
            >
              Số hóa quy trình - Tối ưu hiệu suất - Đột phá doanh thu
            </Paragraph>

            {/* Feature bullets */}
            <div style={{ marginTop: 28 }}>
              {[
                'Phân quyền linh hoạt theo vai trò & chức danh',
                'Quản lý đa công ty trên một nền tảng',
                'Bảo mật dữ liệu tuyệt đối theo tổ chức',
              ].map((item) => (
                <div
                  key={item}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    marginBottom: 10,
                    color: 'rgba(255,255,255,0.85)',
                    fontSize: 14,
                  }}
                >
                  <span
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: '50%',
                      background: '#38bdf8',
                      flexShrink: 0,
                    }}
                  />
                  {item}
                </div>
              ))}
            </div>
          </div>
        </section>
      </Col>

      {/* ── Right panel — login form ────────────────────────────── */}
      <Col xs={24} lg={12} xl={11}>
        <main
          style={{
            minHeight: '100vh',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '32px 24px',
            background: token.colorBgContainer,
          }}
        >
          <div style={{ width: '100%', maxWidth: 440 }}>
            <div style={{ marginBottom: 36 }}>
              <Title level={2} style={{ margin: '0 0 10px', color: token.colorText }}>
                Chào mừng trở lại
              </Title>
              <Text type="secondary">Đăng nhập để tiếp tục quản lý doanh nghiệp của bạn.</Text>
            </div>

            <Form
              id="login-form"
              layout="vertical"
              requiredMark={false}
              onFinish={handleSubmit}
            >
              {/* Workspace ID — không bắt buộc cho superadmin */}
              <Form.Item
                name="workspace_id"
                label="Mã công ty (Workspace ID)"
                tooltip="Để trống nếu bạn là Quản trị viên hệ thống"
              >
                <Input
                  id="input-workspace-id"
                  size="large"
                  prefix={<SafetyCertificateOutlined style={{ color: token.colorTextSecondary }} />}
                  placeholder="Ví dụ: ANPHAT (để trống nếu là System Admin)"
                  autoComplete="organization"
                  style={{ textTransform: 'uppercase' }}
                />
              </Form.Item>

              <Form.Item
                name="username"
                label="Tên đăng nhập"
                rules={[{ required: true, message: 'Vui lòng nhập tên đăng nhập' }]}
              >
                <Input
                  id="input-username"
                  size="large"
                  prefix={<UserOutlined style={{ color: token.colorTextSecondary }} />}
                  placeholder="Tên đăng nhập"
                  autoComplete="username"
                />
              </Form.Item>

              <Form.Item
                name="password"
                label="Mật khẩu"
                rules={[{ required: true, message: 'Vui lòng nhập mật khẩu' }]}
              >
                <Input.Password
                  id="input-password"
                  size="large"
                  prefix={<LockOutlined style={{ color: token.colorTextSecondary }} />}
                  placeholder="Nhập mật khẩu"
                  autoComplete="current-password"
                />
              </Form.Item>

              <Form.Item style={{ marginBottom: 22 }}>
                <Button
                  id="btn-login"
                  type="primary"
                  htmlType="submit"
                  size="large"
                  block
                  style={{ height: 48, fontWeight: 700, background: '#1649c9' }}
                >
                  Đăng nhập
                </Button>
              </Form.Item>
            </Form>

            <div style={{ textAlign: 'center' }}>
              <Text type="secondary">Chưa có tài khoản? </Text>
              <Link to="/register" style={{ color: token.colorPrimary, fontWeight: 600 }}>
                Đăng ký công ty mới
              </Link>
            </div>
          </div>
        </main>
      </Col>
    </Row>
  )
}

export default Login
