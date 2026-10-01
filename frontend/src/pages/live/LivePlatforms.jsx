import React, { useState, useEffect } from 'react'
import { Card, Typography, Button, Table, Space, message, Tabs, Alert, Modal, Input } from 'antd'
import { ApiOutlined, DeleteOutlined, VideoCameraOutlined } from '@ant-design/icons'
import api from '../../utils/api'
import LiveStatusBadge from './components/LiveStatusBadge'

const { Title, Text, Paragraph } = Typography
const { TabPane } = Tabs

export default function LivePlatforms() {
  const [accounts, setAccounts] = useState([])
  const [loading, setLoading] = useState(false)

  const fetchAccounts = async () => {
    setLoading(true)
    try {
      const res = await api.get('/live_sessions/platform-accounts/')
      const data = Array.isArray(res.data) ? res.data : (res.data?.results || [])
      setAccounts(data)
    } catch (err) {
      message.error('Không thể tải danh sách kết nối')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchAccounts()
  }, [])

  const handleConnectShopee = async () => {
    try {
      const res = await api.get('/live_sessions/platforms/shopee/connect/')
      if (res.data && res.data.url) {
        window.location.href = res.data.url
      }
    } catch (err) {
      message.error('Lỗi khi lấy URL kết nối Shopee')
    }
  }

  const handleDelete = (id) => {
    Modal.confirm({
      title: 'Hủy kết nối tài khoản này?',
      content: 'Luồng phát đang sử dụng tài khoản này có thể bị gián đoạn.',
      okText: 'Đồng ý',
      cancelText: 'Hủy',
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          await api.delete(`/live_sessions/platform-accounts/${id}/`)
          message.success('Đã xóa kết nối')
          fetchAccounts()
        } catch (err) {
          message.error('Không thể xóa kết nối')
        }
      }
    })
  }

  const columns = [
    {
      title: 'Nền tảng',
      dataIndex: 'platform',
      key: 'platform',
      render: (text) => (
        <Text strong style={{ color: text === 'shopee' ? '#ee4d2d' : '#000' }}>
          {text === 'shopee' ? 'Shopee Live' : text?.toUpperCase()}
        </Text>
      ),
    },
    {
      title: 'Tên cửa hàng',
      dataIndex: 'display_name',
      key: 'display_name',
      render: (text) => <Text strong>{text}</Text>
    },
    {
      title: 'Shop ID',
      dataIndex: 'account_id',
      key: 'account_id',
      render: (text) => <Text type="secondary">{text}</Text>
    },
    {
      title: 'Trạng thái',
      dataIndex: 'status',
      key: 'status',
      render: (status) => <LiveStatusBadge status={status} />
    },
    {
      title: 'Thao tác',
      key: 'action',
      render: (_, record) => (
        <Button type="text" danger icon={<DeleteOutlined />} onClick={() => handleDelete(record.id)}>Xóa</Button>
      ),
    },
  ]

  return (
    <div style={{ padding: 24, width: '100%', boxSizing: 'border-box' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <Title level={3} style={{ margin: 0 }}>Kết nối Nền tảng (Platform Connections)</Title>
          <Text type="secondary">Quản lý cách hệ thống kết nối với các nền tảng Livestream</Text>
        </div>
      </div>

      <Card style={{ borderRadius: 12, padding: '8px 0' }} bodyStyle={{ padding: '0 24px 24px' }}>
        <Tabs defaultActiveKey="api" size="large">
          <TabPane 
            tab={<span><ApiOutlined />Kết nối API (Tự động)</span>} 
            key="api"
          >
            <div style={{ marginBottom: 24 }}>
              <Paragraph type="secondary" style={{ maxWidth: 800 }}>
                Sử dụng API Mode để hệ thống tự động thiết lập luồng phát, đồng bộ bình luận và lấy danh sách sản phẩm.
                Bạn chỉ cần cấp quyền cho ứng dụng trên nền tảng đích.
              </Paragraph>
              <Button 
                type="primary" 
                icon={<ApiOutlined />}
                onClick={handleConnectShopee}
                style={{ backgroundColor: '#ee4d2d', borderColor: '#ee4d2d', height: 40, borderRadius: 6 }}
              >
                Kết nối Shopee Live (OAuth)
              </Button>
            </div>

            <Table 
              columns={columns} 
              dataSource={accounts} 
              rowKey="id" 
              loading={loading}
              pagination={false}
              locale={{ emptyText: 'Chưa có tài khoản nào được kết nối qua API' }}
            />
          </TabPane>
          
          <TabPane 
            tab={<span><VideoCameraOutlined />Kết nối RTMP (Thủ công)</span>} 
            key="rtmp"
          >
            <div style={{ maxWidth: 800 }}>
              <Alert 
                message="Chế độ phát sóng linh hoạt"
                description="Manual RTMP cho phép bạn đẩy luồng trực tiếp đến bất kỳ nền tảng nào có hỗ trợ Stream Key (Shopee PC, TikTok PC, Facebook, YouTube) mà không cần xác thực tài khoản qua hệ thống của chúng tôi."
                type="info" 
                showIcon 
                style={{ marginBottom: 24, borderRadius: 8 }}
              />
              <Card title="Cách sử dụng Manual RTMP" size="small" style={{ borderRadius: 8, background: '#fafafa', border: '1px solid #e8e8e8' }}>
                <ol style={{ paddingLeft: 20, color: '#595959', lineHeight: 2 }}>
                  <li>Tạo một <b>Phiên Livestream</b> mới tại tab quản lý Phiên.</li>
                  <li>Mở ứng dụng hoặc trang web của nền tảng đích (Ví dụ: Shopee Live PC).</li>
                  <li>Tạo một phiên Live trên nền tảng đó và copy thông số <b>Server URL</b> cùng <b>Stream Key</b>.</li>
                  <li>Quay lại màn hình tạo Phiên của hệ thống, chọn <b>Nền tảng đích</b>.</li>
                  <li>Chọn chế độ <b>RTMP (Thủ công)</b> và dán các thông số vừa copy vào.</li>
                  <li>Hệ thống sẽ bảo mật mã Key của bạn và tự động đẩy luồng video đến địa chỉ đó.</li>
                </ol>
                <div style={{ marginTop: 16 }}>
                  <Text type="secondary" style={{ fontStyle: 'italic' }}>
                    * Hệ thống <b>không lưu trữ</b> mật khẩu dạng plaintext và <b>không hiển thị</b> lại Stream Key trên giao diện. Trạng thái kết nối sẽ được hiển thị là "Đã cấu hình".
                  </Text>
                </div>
              </Card>
            </div>
          </TabPane>
        </Tabs>
      </Card>
    </div>
  )
}
