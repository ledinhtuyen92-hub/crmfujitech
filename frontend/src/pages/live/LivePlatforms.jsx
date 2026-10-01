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
          <Text type="secondary">Quản lý kết nối và phương thức phát livestream trên các nền tảng được hỗ trợ.</Text>
        </div>
      </div>

      <Card style={{ borderRadius: 12, padding: '8px 0' }} bodyStyle={{ padding: '0 24px 24px' }}>
        <Tabs defaultActiveKey="shopee" size="large">
          <TabPane 
            tab={<span><img src="https://img.icons8.com/color/24/000000/shopee.png" style={{marginRight: 8, verticalAlign: 'middle'}} alt="shopee"/>Shopee Live</span>} 
            key="shopee"
          >
            <div style={{ marginBottom: 24 }}>
              <Paragraph type="secondary" style={{ maxWidth: 800 }}>
                Sử dụng API Mode để hệ thống tự động thiết lập luồng phát, đồng bộ bình luận và lấy danh sách sản phẩm.
                Bạn chỉ cần cấp quyền cho ứng dụng trên nền tảng đích. Hỗ trợ phát RTMP (Thủ công) qua Shopee Live PC.
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
              dataSource={accounts.filter(a => a.platform === 'shopee')} 
              rowKey="id" 
              loading={loading}
              pagination={false}
              locale={{ emptyText: 'Chưa có tài khoản Shopee nào được kết nối qua API' }}
            />
          </TabPane>
          
          <TabPane 
            tab={<span><img src="https://img.icons8.com/color/24/000000/tiktok.png" style={{marginRight: 8, verticalAlign: 'middle'}} alt="tiktok"/>TikTok Shop</span>} 
            key="tiktok"
          >
            <div style={{ maxWidth: 800 }}>
              <Alert 
                message="Kết nối TikTok (Chế độ External Source)"
                description="Tính năng tạo luồng phát tự động qua API của TikTok hiện yêu cầu cấp quyền đặc biệt từ nền tảng. Chế độ hiện tại hỗ trợ phát thông qua TikTok LIVE Studio hoặc Máy tính."
                type="info" 
                showIcon 
                style={{ marginBottom: 24, borderRadius: 8 }}
              />
              <Card title="Phương thức khả dụng" size="small" style={{ borderRadius: 8, marginBottom: 24 }}>
                <ul style={{ paddingLeft: 20, lineHeight: 2 }}>
                  <li><b>Tạo luồng (Phát sóng):</b> <Text type="success">Khả dụng qua Manual RTMP / TikTok LIVE Manager</Text></li>
                  <li><b>Đọc bình luận:</b> <Text type="secondary">Chưa hỗ trợ (Yêu cầu quyền nền tảng)</Text></li>
                  <li><b>Gắn sản phẩm:</b> <Text type="secondary">Chưa hỗ trợ (Yêu cầu quyền nền tảng)</Text></li>
                </ul>
              </Card>

              <Card title="Cách sử dụng TikTok LIVE Manager" size="small" style={{ borderRadius: 8, background: '#fafafa', border: '1px solid #e8e8e8' }}>
                <ol style={{ paddingLeft: 20, color: '#595959', lineHeight: 2 }}>
                  <li>Tạo <b>Phiên Livestream</b> mới, chọn nền tảng <b>TikTok Shop</b>.</li>
                  <li>Sử dụng tùy chọn <b>RTMP (Thủ công)</b>.</li>
                  <li>Mở <b>TikTok LIVE Studio</b> hoặc trên web nhấn "Go LIVE", chọn "Phát qua phần mềm (External Source)".</li>
                  <li>Copy <b>Server URL</b> và <b>Stream Key</b> được cấp từ TikTok.</li>
                  <li>Dán thông số vào ứng dụng của chúng tôi. Hệ thống sẽ kết nối luồng phát an toàn.</li>
                </ol>
                <div style={{ marginTop: 16 }}>
                  <Text type="secondary" style={{ fontStyle: 'italic' }}>
                    * Lưu ý: TikTok Shop cấm phát song song cùng lúc (Simulcast) trên nhiều nền tảng.
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
