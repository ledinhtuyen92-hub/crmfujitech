import React, { useState, useEffect } from 'react'
import { Drawer, Form, Button, Select, Space, message, Typography, Card, Spin, Input, Tag, Popconfirm } from 'antd'
import { CheckCircleOutlined, PictureOutlined, VideoCameraOutlined, BlockOutlined, AudioOutlined, PlusOutlined, DeleteOutlined, SmileOutlined } from '@ant-design/icons'
import api from '../../../utils/api'

const { Text, Title } = Typography
const { Option } = Select

export default function LiveSceneBuilder({ visible, onClose, session, onUpdateSuccess }) {
  const [form] = Form.useForm()
  const [assets, setAssets] = useState([])
  const [actions, setActions] = useState([])
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
        setActions(Array.isArray(session.avatar_actions) ? session.avatar_actions : [])
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

  const handleAddAction = () => {
    const newAction = {
      id: `act_${Date.now().toString(36)}`,
      name: `Cử động ${actions.length + 1}`,
      asset_id: undefined,
      keywords: '',
    }
    setActions([...actions, newAction])
  }

  const handleRemoveAction = (index) => {
    setActions(actions.filter((_, i) => i !== index))
  }

  const handleActionChange = (index, field, value) => {
    const updated = [...actions]
    updated[index] = { ...updated[index], [field]: value }
    setActions(updated)
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
        avatar_actions: actions,
      }
      const res = await api.patch(`/live_sessions/sessions/${session.id}/`, payload)
      message.success('Đã lưu cấu hình Cảnh & Thư viện cử động')
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

  const renderAvatarOptions = () => {
    return assets.filter(a => a.asset_type === 'avatar' || a.asset_type === 'avatar_action').map(asset => (
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

          <Card 
            size="small" 
            title={
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Space><SmileOutlined /> Thư viện cử động (Avatar Actions)</Space>
                <Button type="dashed" size="small" icon={<PlusOutlined />} onClick={handleAddAction}>
                  Thêm cử động
                </Button>
              </div>
            } 
            style={{ marginBottom: 16 }}
          >
            <Text type="secondary" style={{ display: 'block', marginBottom: 12 }}>
              Cài đặt các clip cử động ngắn (3-6s như chỉ giỏ hàng, vẫy chào). Hệ thống sẽ tự động kích hoạt khi lời nói AI chứa từ khóa tương ứng!
            </Text>
            {actions.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '16px 0', color: '#999', border: '1px dashed #d9d9d9', borderRadius: 6 }}>
                Chưa có cử động nào. Bấm "Thêm cử động" để bổ sung các hành động như chỉ giỏ hàng, chào hỏi...
              </div>
            ) : (
              <Space direction="vertical" style={{ width: '100%' }} size={12}>
                {actions.map((act, index) => (
                  <Card key={act.id || index} size="small" type="inner" style={{ background: '#fafafa' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                      <Input 
                        placeholder="Tên cử động (VD: Chỉ giỏ hàng)" 
                        value={act.name} 
                        onChange={(e) => handleActionChange(index, 'name', e.target.value)}
                        style={{ width: '70%', fontWeight: 500 }}
                        size="small"
                      />
                      <Popconfirm title="Xóa cử động này?" onConfirm={() => handleRemoveAction(index)} okText="Xóa" cancelText="Hủy">
                        <Button type="text" danger size="small" icon={<DeleteOutlined />} />
                      </Popconfirm>
                    </div>
                    <div style={{ marginBottom: 8 }}>
                      <Text style={{ fontSize: 12, color: '#666' }}>Video cử động (3 - 6 giây):</Text>
                      <Select 
                        placeholder="Chọn Video cử động" 
                        value={act.asset_id} 
                        onChange={(val) => handleActionChange(index, 'asset_id', val)}
                        style={{ width: '100%', marginTop: 4 }}
                        size="small"
                        allowClear
                        showSearch
                        optionFilterProp="label"
                      >
                        {renderAvatarOptions()}
                      </Select>
                    </div>
                    <div>
                      <Text style={{ fontSize: 12, color: '#666' }}>Từ khóa kích hoạt (ngăn cách bởi dấu phẩy):</Text>
                      <Input 
                        placeholder="VD: giỏ hàng, bấm mua, đặt hàng, ưu đãi" 
                        value={act.keywords} 
                        onChange={(e) => handleActionChange(index, 'keywords', e.target.value)}
                        style={{ width: '100%', marginTop: 4 }}
                        size="small"
                      />
                    </div>
                  </Card>
                ))}
              </Space>
            )}
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
