import React, { useState, useEffect } from 'react'
import { Card, Typography, Button, Table, Tag, Space, message, Row, Col } from 'antd'
import { ApiOutlined, PlusOutlined, DeleteOutlined } from '@ant-design/icons'
import api from '../../utils/api'

const { Title, Text } = Typography

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

  const handleDelete = async (id) => {
    try {
      await api.delete(`/live_sessions/platform-accounts/${id}/`)
      message.success('Đã xóa kết nối')
      fetchAccounts()
    } catch (err) {
      message.error('Không thể xóa kết nối')
    }
  }

  const columns = [
    {
      title: 'Nền tảng',
      dataIndex: 'platform',
      key: 'platform',
      render: (text) => <Tag color="orange">{text?.toUpperCase()}</Tag>,
    },
    {
      title: 'Tên hiển thị',
      dataIndex: 'display_name',
      key: 'display_name',
    },
    {
      title: 'Account ID',
      dataIndex: 'account_id',
      key: 'account_id',
    },
    {
      title: 'Trạng thái',
      dataIndex: 'status',
      key: 'status',
      render: (status) => (
        <Tag color={status === 'connected' ? 'green' : 'default'}>
          {status === 'connected' ? 'Đã kết nối' : status}
        </Tag>
      ),
    },
    {
      title: 'Thao tác',
      key: 'action',
      render: (_, record) => (
        <Space size="middle">
          <Button danger icon={<DeleteOutlined />} onClick={() => handleDelete(record.id)}>Xóa</Button>
        </Space>
      ),
    },
  ]

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <Title level={3} style={{ margin: 0 }}>Kết nối Nền tảng</Title>
      </div>

      <Row gutter={[24, 24]}>
        <Col xs={24} lg={8}>
          <Card title="Thêm kết nối mới">
            <Space direction="vertical" style={{ width: '100%' }}>
              <Button 
                type="primary" 
                block 
                icon={<ApiOutlined />}
                onClick={handleConnectShopee}
                style={{ backgroundColor: '#ee4d2d', borderColor: '#ee4d2d' }}
              >
                Kết nối Shopee Live (API Mode)
              </Button>
              <Text type="secondary" style={{ display: 'block' }}>
                Lưu ý: API Mode yêu cầu tài khoản Shopee đã được cấp quyền Livestream. Nền tảng sẽ tự động thiết lập luồng phát.
              </Text>
            </Space>
          </Card>

          <Card title="Chế độ Manual RTMP" style={{ marginTop: 24 }}>
            <Text type="secondary" style={{ display: 'block', marginBottom: 12 }}>
              Manual RTMP là chế độ thủ công, không yêu cầu kết nối tài khoản trước.
            </Text>
            <Text type="secondary" style={{ display: 'block' }}>
              Bạn có thể nhập <b>Server URL</b> và <b>Stream Key</b> trực tiếp khi tạo Phiên Livestream mới.
            </Text>
          </Card>
        </Col>
        <Col xs={24} lg={16}>
          <Card title="Tài khoản đã kết nối">
            <Table 
              columns={columns} 
              dataSource={accounts} 
              rowKey="id" 
              loading={loading}
              pagination={false}
            />
          </Card>
        </Col>
      </Row>
    </div>
  )
}
