import React, { useState, useEffect } from 'react'
import { Drawer, Form, Button, Select, Space, message, Typography, Card, Spin } from 'antd'
import { CheckCircleOutlined, PictureOutlined, VideoCameraOutlined, BlockOutlined, AudioOutlined } from '@ant-design/icons'
import api from '../../../utils/api'

const { Text, Title } = Typography
const { Option } = Select

export default function LiveSceneBuilder({ visible, onClose, session, onUpdateSuccess }) {
  const [form] = Form.useForm()
  const [assets, setAssets] = useState([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (visible) {
      fetchAssets()
      if (session) {
        form.setFieldsValue({
          avatar_asset: session.avatar_asset,
          background_asset: session.background_asset,
          overlay_asset: session.overlay_asset,
          audio_asset: session.audio_asset,
        })
      }
    }
  }, [visible, session, form])

  const fetchAssets = async () => {
    setLoading(true)
    try {
      const res = await api.get('/live_sessions/media-assets/')
      setAssets(Array.isArray(res.data) ? res.data : (res.data?.results || []))
    } catch (err) {
      message.error('Không thể tải kho tài nguyên')
    } finally {
      setLoading(false)
    }
  }

  const handleSave = async () => {
    try {
      setSaving(true)
      const values = await form.validateFields()
      await api.patch(`/live_sessions/sessions/${session.id}/`, values)
      message.success('Đã lưu cấu hình Cảnh (Scene)')
      onUpdateSuccess() // Trigger parent to reload session
      onClose()
    } catch (err) {
      message.error('Lỗi khi lưu cấu hình')
    } finally {
      setSaving(false)
    }
  }

  const renderOptions = (type) => {
    return assets.filter(a => a.asset_type === type).map(asset => (
      <Option key={asset.id} value={asset.id} label={asset.name}>
        <Space>
          {asset.is_system ? <Text type="secondary">[Hệ thống]</Text> : null}
          {asset.name}
        </Space>
      </Option>
    ))
  }

  return (
    <Drawer
      title={
        <Space>
          <PictureOutlined />
          Thiết kế Cảnh (Scene Builder)
        </Space>
      }
      placement="right"
      onClose={onClose}
      open={visible}
      width={450}
      extra={
        <Button type="primary" icon={<CheckCircleOutlined />} onClick={handleSave} loading={saving}>
          Lưu thiết kế
        </Button>
      }
    >
      {loading ? (
        <div style={{ textAlign: 'center', padding: 50 }}>
          <Spin />
        </div>
      ) : (
        <Form form={form} layout="vertical">
          <Card size="small" title={<Space><VideoCameraOutlined /> Avatar (Tùy chọn)</Space>} style={{ marginBottom: 16 }}>
            <Text type="secondary" style={{ display: 'block', marginBottom: 12 }}>
              Nếu bỏ trống, AI sẽ phát dưới dạng "Giấu mặt" (Faceless Livestream).
            </Text>
            <Form.Item name="avatar_asset">
              <Select placeholder="Chọn Video Phông Xanh" allowClear showSearch optionFilterProp="label">
                {renderOptions('avatar')}
              </Select>
            </Form.Item>
          </Card>

          <Card size="small" title={<Space><PictureOutlined /> Phông nền Background</Space>} style={{ marginBottom: 16 }}>
            <Form.Item name="background_asset">
              <Select placeholder="Chọn Ảnh/Video nền" allowClear showSearch optionFilterProp="label">
                {renderOptions('background')}
              </Select>
            </Form.Item>
          </Card>

          <Card size="small" title={<Space><BlockOutlined /> Lớp phủ Overlay (Logo, Khung)</Space>} style={{ marginBottom: 16 }}>
            <Form.Item name="overlay_asset">
              <Select placeholder="Chọn Lớp phủ (PNG trong suốt)" allowClear showSearch optionFilterProp="label">
                {renderOptions('overlay')}
              </Select>
            </Form.Item>
          </Card>

          <Card size="small" title={<Space><AudioOutlined /> Âm thanh nền BGM</Space>} style={{ marginBottom: 16 }}>
            <Text type="secondary" style={{ display: 'block', marginBottom: 12 }}>
              Nhạc sẽ tự động giảm âm lượng (ducking) khi AI nói.
            </Text>
            <Form.Item name="audio_asset">
              <Select placeholder="Chọn Nhạc nền BGM" allowClear showSearch optionFilterProp="label">
                {renderOptions('audio')}
              </Select>
            </Form.Item>
          </Card>
        </Form>
      )}
    </Drawer>
  )
}
