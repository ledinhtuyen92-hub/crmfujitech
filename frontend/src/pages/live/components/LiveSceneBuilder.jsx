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
          avatar_asset: session.avatar_asset || undefined,
          avatar_speaking_asset: session.avatar_speaking_asset || undefined,
          background_asset: session.background_asset || undefined,
          overlay_asset: session.overlay_asset || undefined,
          audio_asset: session.audio_asset || undefined,
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
      // Explicitly convert undefined/falsy to null so DRF clears ForeignKey fields
      const payload = {
        avatar_asset: values.avatar_asset || null,
        avatar_speaking_asset: values.avatar_speaking_asset || null,
        background_asset: values.background_asset || null,
        overlay_asset: values.overlay_asset || null,
        audio_asset: values.audio_asset || null,
      }
      const res = await api.patch(`/live_sessions/sessions/${session.id}/`, payload)
      message.success('Đã lưu cấu hình Cảnh (Scene)')
      if (onUpdateSuccess) {
        onUpdateSuccess(res.data)
      }
      onClose()
    } catch (err) {
      console.error('Failed to save scene:', err)
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
      styles={{ wrapper: { width: 450 } }}
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
          <Card size="small" title={<Space><VideoCameraOutlined /> Người mẫu AI / Avatar (Tùy chọn)</Space>} style={{ marginBottom: 16 }}>
            <Text type="secondary" style={{ display: 'block', marginBottom: 12 }}>
              Chọn video/ảnh người mẫu phông xanh. Kết hợp Video lúc nghỉ và Video lúc nói giúp người mẫu chuyển động và nhép miệng hoàn toàn tự nhiên!
            </Text>
            <Form.Item label="Video / Ảnh Lúc Nghỉ (Idle - Đứng cười, chớp mắt)" name="avatar_asset" style={{ marginBottom: 12 }}>
              <Select placeholder="Chọn Video Lúc Nghỉ (Phông Xanh)" allowClear showSearch optionFilterProp="label">
                {renderOptions('avatar')}
              </Select>
            </Form.Item>
            <Form.Item label="Video / Ảnh Lúc Nói (Speaking - Cử động miệng, thuyết trình)" name="avatar_speaking_asset" style={{ marginBottom: 0 }}>
              <Select placeholder="Chọn Video Lúc Nói (Phông Xanh)" allowClear showSearch optionFilterProp="label">
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
