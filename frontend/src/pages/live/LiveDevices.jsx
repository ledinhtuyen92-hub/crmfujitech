import React, { useState, useEffect } from 'react'
import { Card, Typography, Row, Col, Button, Empty, Space, Spin, message, Alert, Modal, Form, Input, Popconfirm, Select } from 'antd'
import { SyncOutlined, DesktopOutlined, DownloadOutlined, WindowsOutlined, PlusOutlined } from '@ant-design/icons'
import api from '../../utils/api'
import DeviceStatusWidget from './components/DeviceStatusWidget'

const { Title, Text, Paragraph } = Typography

export default function LiveDevices() {
  const [devices, setDevices] = useState([])
  const [loading, setLoading] = useState(false)
  const [editingDevice, setEditingDevice] = useState(null)
  const [form] = Form.useForm()

  const fetchDevices = async () => {
    setLoading(true)
    try {
      const res = await api.get('/live_sessions/devices/')
      const data = Array.isArray(res.data) ? res.data : (res.data?.results || [])
      setDevices(data)
    } catch (err) {
      message.error('Lỗi khi tải danh sách máy chủ')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchDevices()
  }, [])

  const handleUpdateDevice = async (values) => {
    try {
      await api.patch(`/live_sessions/devices/${editingDevice.id}/`, values)
      message.success('Cập nhật thành công')
      setEditingDevice(null)
      fetchDevices()
    } catch (e) {
      message.error('Lỗi cập nhật')
    }
  }

  const handleDeleteDevice = async (id) => {
    try {
      await api.delete(`/live_sessions/devices/${id}/`)
      message.success('Đã xóa máy chủ')
      setEditingDevice(null)
      fetchDevices()
    } catch (e) {
      message.error('Không thể xóa. Có thể máy chủ đang liên kết với phiên Live.')
    }
  }

  return (
    <div style={{ padding: 24, width: '100%', boxSizing: 'border-box' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <Title level={3} style={{ margin: 0 }}>Máy chủ Phát sóng (Live Devices)</Title>
          <Text type="secondary">Quản lý và giám sát các trạm máy chủ đang chạy Windows Live Studio</Text>
        </div>
        <Space>
          <Button icon={<SyncOutlined />} onClick={fetchDevices}>Làm mới</Button>
          <Button type="primary" icon={<PlusOutlined />} style={{ backgroundColor: '#1649c9' }} onClick={() => message.info('Tính năng Thêm Máy chủ mới đang được phát triển.')}>
            Thêm Máy chủ
          </Button>
        </Space>
      </div>

      <Alert 
        message="Kiến trúc Máy chủ Trạm (Edge Computing)"
        description={
          <div style={{ color: '#595959' }}>
            Hệ thống Livestream yêu cầu các Máy chủ phát sóng chạy HĐH Windows. Bạn cần cài đặt phần mềm <b>Fujitech Windows Live Studio</b> trên các máy tính/máy chủ này để xử lý video và kết nối luồng phát tự động từ đám mây (Cloud).
            <br />
            <Button type="link" icon={<DownloadOutlined />} style={{ padding: '8px 0 0' }} onClick={() => message.info('Link tải phần mềm sẽ sớm được cung cấp trong Phase 2.')}>
              Tải phần mềm cài đặt (Windows)
            </Button>
          </div>
        }
        type="info" 
        showIcon 
        icon={<WindowsOutlined />}
        style={{ marginBottom: 24, borderRadius: 8 }}
      />

      <Spin spinning={loading}>
        {devices.length === 0 && !loading ? (
          <Card style={{ borderRadius: 12, textAlign: 'center', padding: 48 }}>
            <Empty 
              image={<DesktopOutlined style={{ fontSize: 64, color: '#e6f7ff' }} />}
              description={<span style={{ color: '#8c8c8c' }}>Chưa có máy chủ phát sóng nào được kết nối</span>} 
            />
          </Card>
        ) : (
          <Row gutter={[24, 24]}>
            {devices.map(dev => (
              <Col xs={24} sm={12} lg={8} key={dev.id}>
                <DeviceStatusWidget device={dev} />
                {/* Wrap in extra card logic if full page needs more details later */}
                <div style={{ textAlign: 'right', marginTop: -8 }}>
                  <Button type="link" size="small" onClick={() => {
                    setEditingDevice(dev)
                    form.setFieldsValue({ 
                      name: dev.name,
                      video_resolution: dev.video_resolution || '1280x720',
                      video_bitrate: dev.video_bitrate || '2500k',
                      video_fps: dev.video_fps || 30
                    })
                  }}>Cấu hình máy chủ</Button>
                </div>
              </Col>
            ))}
          </Row>
        )}
      </Spin>

      <Modal
        title="Cấu hình máy chủ"
        open={!!editingDevice}
        onCancel={() => setEditingDevice(null)}
        footer={null}
      >
        <Form form={form} layout="vertical" onFinish={handleUpdateDevice}>
          <Form.Item name="name" label="Tên máy chủ" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          
          <Row gutter={16}>
            <Col span={8}>
              <Form.Item name="video_resolution" label="Độ phân giải">
                <Select>
                  <Select.Option value="1920x1080">1080p (FHD)</Select.Option>
                  <Select.Option value="1280x720">720p (HD)</Select.Option>
                  <Select.Option value="854x480">480p (SD)</Select.Option>
                </Select>
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="video_bitrate" label="Video Bitrate">
                <Select>
                  <Select.Option value="4500k">Cao (4500k)</Select.Option>
                  <Select.Option value="2500k">Vừa (2500k)</Select.Option>
                  <Select.Option value="1500k">Thấp (1500k)</Select.Option>
                </Select>
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="video_fps" label="FPS (Khung hình)">
                <Select>
                  <Select.Option value={60}>60 FPS</Select.Option>
                  <Select.Option value={30}>30 FPS</Select.Option>
                  <Select.Option value={24}>24 FPS</Select.Option>
                </Select>
              </Form.Item>
            </Col>
          </Row>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <Popconfirm title="Xóa máy chủ này?" onConfirm={() => handleDeleteDevice(editingDevice?.id)}>
              <Button danger>Xóa máy chủ</Button>
            </Popconfirm>
            <Space>
              <Button onClick={() => setEditingDevice(null)}>Hủy</Button>
              <Button type="primary" htmlType="submit">Lưu thay đổi</Button>
            </Space>
          </div>
        </Form>
      </Modal>
    </div>
  )

}
