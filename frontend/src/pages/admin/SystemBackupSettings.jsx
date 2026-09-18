import React, { useEffect, useState } from 'react'
import { Card, Tabs, Form, Input, Select, Button, Switch, Table, Tag, message, Space, Typography, TimePicker, Modal } from 'antd'
import { SaveOutlined, PlayCircleOutlined, DeleteOutlined } from '@ant-design/icons'
import api from '../../utils/api'
import dayjs from 'dayjs'

const { Title, Text } = Typography

export default function SystemBackupSettings() {
  const [form] = Form.useForm()
  const [loading, setLoading] = useState(false)
  const [triggering, setTriggering] = useState(false)
  const [historyData, setHistoryData] = useState([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const [activeTab, setActiveTab] = useState('1')

  const [r2Backups, setR2Backups] = useState([])
  const [r2Loading, setR2Loading] = useState(false)
  const [restoreModalVisible, setRestoreModalVisible] = useState(false)
  const [selectedBackup, setSelectedBackup] = useState(null)
  const [adminPassword, setAdminPassword] = useState('')
  const [restoring, setRestoring] = useState(false)

  useEffect(() => {
    if (activeTab === '1') fetchConfig()
    if (activeTab === '2') fetchHistory()
    if (activeTab === '3') fetchR2Backups()
  }, [activeTab])

  const fetchConfig = async () => {
    setLoading(true)
    try {
      const res = await api.get('dashboard/backup-config/')
      // Server returns the single object because we overrode list()
      const data = res.data
      if (data) {
        form.setFieldsValue({
          ...data,
          schedule_time: data.schedule_time ? dayjs(data.schedule_time, 'HH:mm:ss') : null
        })
      }
    } catch (err) {
      message.error('Không thể tải cấu hình backup.')
    } finally {
      setLoading(false)
    }
  }

  const fetchHistory = async () => {
    setHistoryLoading(true)
    try {
      const res = await api.get('dashboard/backup-history/')
      const list = Array.isArray(res.data) ? res.data : res.data.results || []
      // Sắp xếp mới nhất lên đầu
      const sorted = list.sort((a, b) => new Date(b.start_time) - new Date(a.start_time))
      setHistoryData(sorted)
    } catch (err) {
      message.error('Không thể tải lịch sử backup.')
    } finally {
      setHistoryLoading(false)
    }
  }

  const handleClearLogs = async () => {
    try {
      const res = await api.delete('dashboard/backup-history/clear_logs/')
      message.success(res.data?.message || 'Đã xoá lịch sử thành công')
      fetchHistory()
    } catch (err) {
      message.error('Có lỗi xảy ra khi xoá lịch sử')
    }
  }

  const fetchR2Backups = async () => {
    setR2Loading(true)
    try {
      const res = await api.get('dashboard/backup-config/list_r2_backups/')
      setR2Backups(res.data || [])
    } catch (err) {
      message.error(err.response?.data?.error || 'Không thể tải danh sách file trên R2.')
    } finally {
      setR2Loading(false)
    }
  }

  const handleConfirmRestore = async () => {
    if (!adminPassword) {
      return message.error('Vui lòng nhập mật khẩu quản trị!')
    }
    setRestoring(true)
    try {
      const res = await api.post('dashboard/backup-config/trigger_restore/', {
        filename: selectedBackup,
        password: adminPassword
      })
      message.success(res.data.message)
      setRestoreModalVisible(false)
      setAdminPassword('')
      // Tự động chuyển qua tab log để xem
      setActiveTab('2')
    } catch (err) {
      message.error(err.response?.data?.error || 'Lỗi khi yêu cầu phục hồi.')
    } finally {
      setRestoring(false)
    }
  }

  const onFinish = async (values) => {
    setLoading(true)
    try {
      const payload = {
        ...values,
        schedule_time: values.schedule_time ? values.schedule_time.format('HH:mm:ss') : null
      }
      await api.put('dashboard/backup-config/1/', payload)
      message.success('Đã lưu cấu hình backup thành công!')
    } catch (err) {
      message.error('Lỗi khi lưu cấu hình.')
    } finally {
      setLoading(false)
    }
  }

  const handleTriggerBackup = async () => {
    setTriggering(true)
    try {
      await api.post('dashboard/backup-config/trigger_backup/')
      message.success('Tiến trình backup đã bắt đầu chạy ngầm!')
      setActiveTab('2')
      setTimeout(() => fetchHistory(), 2000)
    } catch (err) {
      message.error('Không thể chạy backup ngay.')
    } finally {
      setTriggering(false)
    }
  }

  const columns = [
    {
      title: 'Thời gian bắt đầu',
      dataIndex: 'start_time',
      key: 'start_time',
      render: (val) => dayjs(val).format('YYYY-MM-DD HH:mm:ss')
    },
    {
      title: 'Loại',
      dataIndex: 'action_type',
      key: 'action_type',
      render: (type) => {
        if (type === 'restore') return <Tag color="magenta">Khôi phục</Tag>
        return <Tag color="blue">Sao lưu</Tag>
      }
    },
    {
      title: 'Trạng thái',
      dataIndex: 'status',
      key: 'status',
      render: (status) => {
        if (status === 'success') return <Tag color="success">Thành công</Tag>
        if (status === 'error') return <Tag color="error">Lỗi</Tag>
        return <Tag color="processing">Đang chạy</Tag>
      }
    },
    {
      title: 'Logs chi tiết',
      dataIndex: 'logs',
      key: 'logs',
      render: (logs) => (
        <pre style={{ maxHeight: 150, overflow: 'auto', fontSize: 12, background: '#f8fafc', padding: 8, borderRadius: 4 }}>
          {logs || 'Không có dữ liệu log'}
        </pre>
      )
    },
    {
      title: 'Thời gian hoàn thành',
      dataIndex: 'end_time',
      key: 'end_time',
      render: (val) => val ? dayjs(val).format('YYYY-MM-DD HH:mm:ss') : '-'
    }
  ]

  const r2Columns = [
    {
      title: 'Tên file Backup',
      dataIndex: 'key',
      key: 'key',
      render: (text) => <strong>{text}</strong>
    },
    {
      title: 'Dung lượng',
      dataIndex: 'size',
      key: 'size',
      render: (size) => `${(size / 1024 / 1024).toFixed(2)} MB`
    },
    {
      title: 'Thời gian tạo',
      dataIndex: 'last_modified',
      key: 'last_modified',
      render: (val) => dayjs(val).format('YYYY-MM-DD HH:mm:ss')
    },
    {
      title: 'Hành động',
      key: 'action',
      render: (_, record) => (
        <Button 
          danger
          onClick={() => {
            setSelectedBackup(record.key)
            setRestoreModalVisible(true)
          }}
        >
          Khôi phục (Restore)
        </Button>
      )
    }
  ]

  return (
    <div style={{ padding: '4px 0' }}>
      <Title level={3} style={{ marginBottom: 24 }}>Hệ thống Quản trị Sao lưu (Backup)</Title>
      
      <Card>
        <Tabs activeKey={activeTab} onChange={setActiveTab}>
          <Tabs.TabPane tab="Cấu hình Backup" key="1">
            <Form form={form} layout="vertical" onFinish={onFinish}>
              
              <Card title="Trạng thái & Lịch trình" type="inner" style={{ marginBottom: 24 }}>
                <Form.Item name="is_active" label="Kích hoạt tự động sao lưu" valuePropName="checked">
                  <Switch />
                </Form.Item>
                <div style={{ display: 'flex', gap: 16 }}>
                  <Form.Item name="schedule_type" label="Tần suất" style={{ flex: 1 }}>
                    <Select>
                      <Select.Option value="hourly">Hàng giờ</Select.Option>
                      <Select.Option value="daily">Hàng ngày</Select.Option>
                      <Select.Option value="weekly">Hàng tuần</Select.Option>
                    </Select>
                  </Form.Item>
                  <Form.Item noStyle shouldUpdate={(prev, curr) => prev.schedule_type !== curr.schedule_type}>
                    {({ getFieldValue }) => {
                      const type = getFieldValue('schedule_type')
                      if (type === 'hourly') return null
                      
                      return (
                        <>
                          {type === 'weekly' && (
                            <Form.Item name="schedule_day_of_week" label="Ngày chạy" style={{ flex: 1 }}>
                              <Select>
                                <Select.Option value={0}>Thứ Hai</Select.Option>
                                <Select.Option value={1}>Thứ Ba</Select.Option>
                                <Select.Option value={2}>Thứ Tư</Select.Option>
                                <Select.Option value={3}>Thứ Năm</Select.Option>
                                <Select.Option value={4}>Thứ Sáu</Select.Option>
                                <Select.Option value={5}>Thứ Bảy</Select.Option>
                                <Select.Option value={6}>Chủ Nhật</Select.Option>
                              </Select>
                            </Form.Item>
                          )}
                          <Form.Item name="schedule_time" label="Thời gian chạy (Giờ)" style={{ flex: 1 }}>
                            <TimePicker format="HH:mm" style={{ width: '100%' }} />
                          </Form.Item>
                        </>
                      )
                    }}
                  </Form.Item>
                </div>
              </Card>



              <Card title="Cấu hình lưu trữ Media (Cloudflare R2 / S3)" type="inner" style={{ marginBottom: 24 }}>
                <Form.Item name="r2_endpoint_url" label="R2 Endpoint URL">
                  <Input placeholder="https://<account-id>.r2.cloudflarestorage.com" />
                </Form.Item>
                <div style={{ display: 'flex', gap: 16 }}>
                  <Form.Item name="r2_access_key" label="Access Key ID" style={{ flex: 1 }}>
                    <Input />
                  </Form.Item>
                  <Form.Item name="r2_secret_key" label="Secret Access Key" style={{ flex: 1 }}>
                    <Input.Password />
                  </Form.Item>
                </div>
                <div style={{ display: 'flex', gap: 16 }}>
                  <Form.Item name="r2_bucket_name" label="Bucket Name" style={{ flex: 1 }}>
                    <Input placeholder="crm-backup-bucket" />
                  </Form.Item>
                  <Form.Item name="keep_latest_count" label="Số bản sao lưu giữ lại (Retention)" style={{ flex: 1 }}>
                    <Select>
                      <Select.Option value={5}>5 bản gần nhất</Select.Option>
                      <Select.Option value={10}>10 bản gần nhất</Select.Option>
                      <Select.Option value={20}>20 bản gần nhất</Select.Option>
                      <Select.Option value={50}>50 bản gần nhất</Select.Option>
                    </Select>
                  </Form.Item>
                </div>
                <Text type="secondary" style={{ fontSize: 13 }}>
                  * Chức năng Retention Policy sẽ tự động đếm và xóa đi các file nén Media cũ trên R2 để giải phóng dung lượng.
                </Text>
              </Card>

              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <Button 
                  icon={<PlayCircleOutlined />} 
                  onClick={handleTriggerBackup} 
                  loading={triggering}
                  style={{ borderColor: '#f59e0b', color: '#f59e0b' }}
                >
                  Chạy Backup Ngay
                </Button>
                <Button type="primary" htmlType="submit" icon={<SaveOutlined />} loading={loading}>
                  Lưu Cấu Hình
                </Button>
              </div>

            </Form>
          </Tabs.TabPane>

          <Tabs.TabPane tab="Lịch sử Backup (Logs)" key="2">
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16, gap: 12 }}>
              <Button danger icon={<DeleteOutlined />} onClick={handleClearLogs}>Xoá lịch sử</Button>
              <Button onClick={fetchHistory} loading={historyLoading}>Làm mới</Button>
            </div>
            <Table 
              columns={columns} 
              dataSource={historyData} 
              rowKey="id" 
              loading={historyLoading}
              pagination={{ pageSize: 10 }}
            />
          </Tabs.TabPane>

          <Tabs.TabPane tab="Phục hồi (Restore)" key="3">
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
              <Text type="danger">
                <strong>CẢNH BÁO:</strong> Việc phục hồi sẽ đè xoá toàn bộ dữ liệu mới hiện tại của hệ thống. Tất cả người dùng sẽ bị đăng xuất sau khi phục hồi thành công.
              </Text>
              <Button onClick={fetchR2Backups} loading={r2Loading}>Làm mới</Button>
            </div>
            <Table 
              columns={r2Columns} 
              dataSource={r2Backups} 
              rowKey="key" 
              loading={r2Loading}
              pagination={{ pageSize: 10 }}
            />
          </Tabs.TabPane>
        </Tabs>
      </Card>

      <Modal
        title={
          <span style={{ color: 'red' }}>
            Xác nhận Phục hồi Dữ liệu ĐẶC BIỆT NGUY HIỂM
          </span>
        }
        open={restoreModalVisible}
        onOk={handleConfirmRestore}
        onCancel={() => {
          setRestoreModalVisible(false)
          setAdminPassword('')
        }}
        confirmLoading={restoring}
        okText="BẮT ĐẦU PHỤC HỒI"
        okButtonProps={{ danger: true }}
      >
        <p>Bạn đang yêu cầu khôi phục lại máy chủ từ file:</p>
        <p><strong>{selectedBackup}</strong></p>
        <br />
        <p style={{ color: 'red' }}>
          Tất cả Đơn hàng, Khách hàng, Hình ảnh được tạo <strong>SAU</strong> thời điểm của file backup này sẽ bị <strong>XOÁ VĨNH VIỄN</strong> để đè dữ liệu cũ lên. Hành động này không thể hoàn tác!
        </p>
        <br />
        <p>Để tiếp tục, vui lòng nhập <strong>Mật khẩu Quản trị viên</strong> của bạn:</p>
        <Input.Password 
          placeholder="Nhập mật khẩu của bạn..." 
          value={adminPassword}
          onChange={(e) => setAdminPassword(e.target.value)}
        />
      </Modal>
    </div>
  )
}
