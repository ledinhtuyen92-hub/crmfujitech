import { CheckCircleOutlined, CloseCircleOutlined, ClockCircleOutlined, EyeOutlined, CheckOutlined, CloseOutlined, DeleteOutlined, AuditOutlined } from '@ant-design/icons'
import { Alert, Badge, Button, Card, Col, Divider, Form, Input, Modal, Row, Select, Space, Table, Tag, Tooltip, Typography, message, Tabs, Steps, List, Collapse } from 'antd'
import dayjs from 'dayjs'
import React, { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import api from '../utils/api'
import { useResponsive } from '../hooks/useResponsive'

const { Title, Text, Paragraph } = Typography
const { TextArea } = Input

const statusConfig = {
  pending: { label: 'Chờ duyệt', color: 'warning', icon: <ClockCircleOutlined /> },
  approved: { label: 'Đã duyệt', color: 'success', icon: <CheckCircleOutlined /> },
  rejected: { label: 'Từ chối', color: 'error', icon: <CloseCircleOutlined /> },
  canceled: { label: 'Đã hủy', color: 'default', icon: <CloseCircleOutlined /> },
}

export default function ApprovalList() {
  const { user, hasPermission, isCompanyAdmin } = useAuth()
  const canDelete = isCompanyAdmin || user?.is_superuser || hasPermission('approvals.delete')

  const [activeTab, setActiveTab] = useState('to_approve')
  const [requests, setRequests] = useState([])
  const [loading, setLoading] = useState(false)
  const [selectedReq, setSelectedReq] = useState(null)
  
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')

  const [modalVisible, setModalVisible] = useState(false)
  const [actionType, setActionType] = useState('') // 'approve' | 'reject'
  const [comment, setComment] = useState('')
  const [processing, setProcessing] = useState(false)
  const [selectedStepId, setSelectedStepId] = useState(null)

  const [deleteModalVisible, setDeleteModalVisible] = useState(false)
  const [targetDeleteMode, setTargetDeleteMode] = useState('single') // 'single' | 'all'
  const [selectedDeleteReq, setSelectedDeleteReq] = useState(null)
  const [deleteConfirmText, setDeleteConfirmText] = useState('')
  const [deleting, setDeleting] = useState(false)

  // Factory selection for order approvals
  const [factories, setFactories] = useState([])
  const [selectedFactoryId, setSelectedFactoryId] = useState(null)
  const [needsFactory, setNeedsFactory] = useState(false)

  const fetchRequests = useCallback(async () => {
    setLoading(true)
    try {
      const { data } = await api.get(`/approvals/requests/?mode=${activeTab}&search=${search}&status=${statusFilter}`)
      setRequests(data.results || data)
    } catch (err) {
      message.error('Lỗi tải danh sách phê duyệt')
    } finally {
      setLoading(false)
    }
  }, [activeTab, search, statusFilter])

  useEffect(() => {
    fetchRequests()
  }, [fetchRequests])

  const openActionModal = async (req, step, type) => {
    setSelectedReq(req)
    setSelectedStepId(step.id)
    setActionType(type)
    setComment('')
    setSelectedFactoryId(null)
    setNeedsFactory(false)

    // Kiểm tra nếu là duyệt đơn hàng chưa có nhà máy
    if (type === 'approve' && req.title?.toLowerCase().includes('đơn hàng')) {
      try {
        const orderRes = await api.get(`/orders/orders/${req.object_id}/`)
        const order = orderRes.data
        if (!order.factory) {
          setNeedsFactory(true)
          if (factories.length === 0) {
            const facRes = await api.get('/production/factories/')
            setFactories(Array.isArray(facRes.data) ? facRes.data : (facRes.data?.results || []))
          }
        }
      } catch (e) {
        // ignore - không block flow duyệt
      }
    }

    setModalVisible(true)
  }

  const handleAction = async () => {
    if (needsFactory && actionType === 'approve' && !selectedFactoryId) {
      message.error('Vui lòng chọn nhà máy sản xuất cho đơn hàng này.')
      return
    }
    setProcessing(true)
    try {
      const endpoint = actionType === 'approve' ? 'approve-step' : 'reject-step'
      await api.post(`/approvals/requests/${selectedReq.id}/${endpoint}/`, {
        step_id: selectedStepId,
        comment,
        ...(needsFactory && selectedFactoryId ? { factory_id: selectedFactoryId } : {})
      })
      message.success(`Đã ${actionType === 'approve' ? 'duyệt' : 'từ chối'} thành công.`)
      setModalVisible(false)
      fetchRequests()
      window.dispatchEvent(new Event('refresh-notifications'))
    } catch (err) {
      message.error(err.response?.data?.detail || 'Lỗi xử lý phê duyệt')
    } finally {
      setProcessing(false)
    }
  }

  const openDeleteModal = (mode, req = null) => {
    setTargetDeleteMode(mode)
    setSelectedDeleteReq(req)
    setDeleteConfirmText('')
    setDeleteModalVisible(true)
  }

  const handleConfirmDelete = async () => {
    setDeleting(true)
    try {
      if (targetDeleteMode === 'single') {
        await api.delete(`/approvals/requests/${selectedDeleteReq.id}/`)
        message.success('Đã xóa yêu cầu phê duyệt thành công.')
      } else {
        const res = await api.post(`/approvals/requests/bulk-delete/`, { delete_all: true })
        message.success(res.data?.detail || 'Đã xóa toàn bộ yêu cầu phê duyệt thành công.')
      }
      setDeleteModalVisible(false)
      fetchRequests()
      window.dispatchEvent(new Event('refresh-notifications'))
    } catch (err) {
      message.error(err.response?.data?.detail || 'Lỗi khi xóa yêu cầu phê duyệt')
    } finally {
      setDeleting(false)
    }
  }

  const columns = [
    {
      title: 'Tiêu đề',
      dataIndex: 'title',
      key: 'title',
      render: (text, record) => (
        <div>
          <Text strong style={{ color: '#1649c9', fontSize: 15 }}>{text}</Text>
          <div style={{ color: '#64748b', fontSize: 13, marginTop: 4 }}>
            Loại: <Tag color="blue">{record.content_type}</Tag> ID: {record.object_id}
          </div>
        </div>
      )
    },
    {
      title: 'Người gửi',
      dataIndex: 'requester_name',
      key: 'requester',
      render: (val) => <Text strong>{val}</Text>
    },
    {
      title: 'Ngày tạo',
      dataIndex: 'created_at',
      key: 'created_at',
      render: (val) => dayjs(val).format('DD/MM/YYYY HH:mm')
    },
    {
      title: 'Trạng thái',
      dataIndex: 'status',
      key: 'status',
      render: (st) => {
        const cfg = statusConfig[st] || { label: st, color: 'default' }
        return <Tag color={cfg.color} icon={cfg.icon} style={{ fontSize: 13, padding: '4px 8px' }}>{cfg.label}</Tag>
      }
    },
    {
      title: 'Hành động',
      key: 'action',
      align: 'right',
      render: (_, record) => {
        // Tìm bước duyệt mà user này có thể thao tác
        const pendingStep = (record.steps || []).find(s => s.status === 'pending')
        let canAct = false
        if (activeTab === 'to_approve' && pendingStep && record.status === 'pending') {
          if (pendingStep.approver_user === user.id) canAct = true
          if (!pendingStep.approver_user && pendingStep.approver_role === user.role) canAct = true
          if (!pendingStep.approver_user && !pendingStep.approver_role) {
            if (hasPermission('orders.approve') && record.title?.toLowerCase().includes('đơn hàng')) canAct = true
            if (hasPermission('sales.approve') && record.title?.toLowerCase().includes('báo giá')) canAct = true
            if (hasPermission('approvals.approve') && !record.title?.toLowerCase().includes('đơn hàng') && !record.title?.toLowerCase().includes('báo giá')) canAct = true
          }
          if (user.is_superuser || user.is_company_admin) canAct = true
        }

        return (
          <Space>
            {canAct && (
              <>
                <Button type="primary" icon={<CheckOutlined />} style={{ background: '#16a34a' }} onClick={() => openActionModal(record, pendingStep, 'approve')}>
                  Duyệt
                </Button>
                <Button danger icon={<CloseOutlined />} onClick={() => openActionModal(record, pendingStep, 'reject')}>
                  Từ chối
                </Button>
              </>
            )}
            <Button type="text" icon={<EyeOutlined style={{ color: '#2563eb' }} />} onClick={() => setSelectedReq(record)} />
            {canDelete && (
              <Tooltip title={record.status === 'pending' ? 'Không thể xóa yêu cầu đang ở trạng thái chờ duyệt' : 'Xóa yêu cầu'}>
                <Button 
                  type="text" 
                  danger 
                  icon={<DeleteOutlined />} 
                  disabled={record.status === 'pending'}
                  onClick={() => openDeleteModal('single', record)} 
                />
              </Tooltip>
            )}
          </Space>
        )
      }
    }
  ]

  const { isMobile, padding } = useResponsive()

  const renderMobileList = () => (
    <List
      dataSource={requests}
      loading={loading}
      pagination={{ pageSize: 25, size: "small" }}
      renderItem={(record) => {
        const cfg = statusConfig[record.status] || { label: record.status, color: 'default' }
        const pendingStep = (record.steps || []).find(s => s.status === 'pending')
        let canAct = false
        if (activeTab === 'to_approve' && pendingStep && record.status === 'pending') {
          if (pendingStep.approver_user === user.id) canAct = true
          if (!pendingStep.approver_user && pendingStep.approver_role === user.role) canAct = true
          if (!pendingStep.approver_user && !pendingStep.approver_role) {
            if (hasPermission('orders.approve') && record.title?.toLowerCase().includes('đơn hàng')) canAct = true
            if (hasPermission('sales.approve') && record.title?.toLowerCase().includes('báo giá')) canAct = true
            if (hasPermission('approvals.approve') && !record.title?.toLowerCase().includes('đơn hàng') && !record.title?.toLowerCase().includes('báo giá')) canAct = true
          }
          if (user.is_superuser || user.is_company_admin) canAct = true
        }

        return (
          <List.Item
            style={{ background: '#fff', borderRadius: 8, padding: 12, marginBottom: 8, border: '1px solid #f0f0f0' }}
          >
            <List.Item.Meta
              title={
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', width: '100%' }}>
                  <div style={{ flex: 1, paddingRight: 8 }}>
                    <Text strong style={{ fontSize: 14, color: '#1649c9' }}>{record.title}</Text>
                    <div style={{ marginTop: 4 }}>
                      <Tag color="blue">{record.content_type}</Tag>
                      <Text type="secondary" style={{ fontSize: 12 }}>ID: {record.object_id}</Text>
                    </div>
                  </div>
                  <Tag color={cfg.color} icon={cfg.icon} style={{ fontSize: 12 }}>{cfg.label}</Tag>
                </div>
              }
              description={
                <div style={{ marginTop: 8 }}>
                  <Space direction="vertical" size={2}>
                    <Text type="secondary">Gửi bởi: <Text strong>{record.requester_name}</Text></Text>
                    <Text type="secondary">Ngày tạo: {dayjs(record.created_at).format('DD/MM/YYYY HH:mm')}</Text>
                  </Space>
                  <div style={{ marginTop: 12, display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                    <Button type="default" size="small" icon={<EyeOutlined style={{ color: '#2563eb' }} />} onClick={() => setSelectedReq(record)}>Chi tiết</Button>
                    {canAct && (
                      <>
                        <Button type="primary" size="small" icon={<CheckOutlined />} style={{ background: '#16a34a' }} onClick={() => openActionModal(record, pendingStep, 'approve')}>
                          Duyệt
                        </Button>
                        <Button danger size="small" icon={<CloseOutlined />} onClick={() => openActionModal(record, pendingStep, 'reject')}>
                          Từ chối
                        </Button>
                      </>
                    )}
                    {canDelete && (
                      <Button danger size="small" icon={<DeleteOutlined />} disabled={record.status === 'pending'} onClick={() => openDeleteModal('single', record)}>Xóa</Button>
                    )}
                  </div>
                </div>
              }
            />
          </List.Item>
        )
      }}
    />
  )


  return (
    <section style={{ width: '100%', minWidth: 0 }}>
      <Row justify="space-between" align="middle" style={{ marginBottom: 24 }} gutter={[16, 16]}>
        <Col xs={24} md={12}>
          <Title level={isMobile ? 4 : 3} style={{ margin: 0 }}>
            <AuditOutlined style={{ color: '#0284c7', marginRight: 10 }} />
            Luồng Phê Duyệt
          </Title>
          <Text type="secondary">Quản lý và xét duyệt các yêu cầu tập trung</Text>
        </Col>
        <Col xs={24} md={12} style={{ textAlign: isMobile ? 'left' : 'right' }}>
          <Space wrap>
            <Input.Search
              placeholder="Tìm theo tiêu đề..."
              allowClear
              onSearch={(val) => setSearch(val)}
              style={{ width: isMobile ? '100%' : 220 }}
            />
            <Select
              placeholder="Lọc trạng thái"
              allowClear
              value={statusFilter || undefined}
              onChange={(val) => setStatusFilter(val || '')}
              style={{ width: isMobile ? '100%' : 150 }}
            >
              <Select.Option value="pending">Chờ duyệt</Select.Option>
              <Select.Option value="approved">Đã duyệt</Select.Option>
              <Select.Option value="rejected">Từ chối</Select.Option>
              <Select.Option value="canceled">Đã hủy</Select.Option>
            </Select>
            {canDelete && (
              <Button 
                danger 
                icon={<DeleteOutlined />} 
                onClick={() => openDeleteModal('all')}
              >
                Xóa toàn bộ
              </Button>
            )}
          </Space>
        </Col>
      </Row>

      <Card 
        bodyStyle={{ padding: 0 }} 
        style={{ borderRadius: 12, boxShadow: '0 4px 16px rgba(0,0,0,0.05)' }}
      >
        {isMobile ? (
          <Collapse
            accordion
            activeKey={activeTab}
            onChange={(key) => setActiveTab(key || 'to_approve')}
            items={[
              {
                label: <Text strong>Cần tôi duyệt</Text>,
                key: 'to_approve',
                children: renderMobileList()
              },
              {
                label: <Text strong>Yêu cầu của tôi</Text>,
                key: 'my_requests',
                children: renderMobileList()
              },
              {
                label: <Text strong>Tất cả</Text>,
                key: 'all',
                children: renderMobileList()
              },
            ]}
          />
        ) : (
          <>
            <Tabs 
              activeKey={activeTab} 
              onChange={setActiveTab}
              style={{ padding: '0 24px' }}
              tabBarStyle={{ marginBottom: 0 }}
              items={[
                { label: 'Cần tôi duyệt', key: 'to_approve' },
                { label: 'Yêu cầu của tôi', key: 'my_requests' },
                { label: 'Tất cả', key: 'all' },
              ]}
            />
            <Table scroll={{ x: 'max-content' }} 
              columns={columns} 
              dataSource={requests} 
              rowKey="id" 
              loading={loading}
              pagination={{ pageSize: 25 }}
            />
          </>
        )}
      </Card>

      {/* Modal Detail & Action */}
      <Modal
        title={`Chi tiết phê duyệt: ${selectedReq?.title}`}
        open={!!selectedReq && !modalVisible}
        onCancel={() => setSelectedReq(null)}
        footer={null}
        width={700}
      >
        {selectedReq && (
          <div style={{ marginTop: 16 }}>
            <div style={{ background: '#f8fafc', padding: 16, borderRadius: 8, marginBottom: 24 }}>
              <Paragraph style={{ margin: 0 }}><strong>Mô tả:</strong> {selectedReq.description || 'Không có mô tả'}</Paragraph>
              <div style={{ marginTop: 8, color: '#64748b' }}>
                Gửi bởi: <strong>{selectedReq.requester_name}</strong> lúc {dayjs(selectedReq.created_at).format('DD/MM/YYYY HH:mm')}
              </div>
            </div>

            <Title level={5} style={{ marginBottom: 16 }}>Tiến trình phê duyệt</Title>
            <Steps
              direction="vertical"
              current={(selectedReq.steps || []).findIndex(s => s.status === 'pending')}
              status={selectedReq.status === 'rejected' ? 'error' : 'process'}
              items={(selectedReq.steps || []).map(step => ({
                title: `Cấp ${step.step_order}: ${step.approver_user_name || step.approver_role_name || 'Admin'}`,
                description: (
                  <div>
                    <div style={{ marginBottom: 4 }}>
                      <Tag color={statusConfig[step.status]?.color}>{statusConfig[step.status]?.label || step.status}</Tag>
                      {step.acted_by_name && <span style={{ marginLeft: 8, fontSize: 12, color: '#64748b' }}>Bởi {step.acted_by_name} ({dayjs(step.acted_at).format('DD/MM/YYYY HH:mm')})</span>}
                    </div>
                    {step.comment && <div style={{ fontStyle: 'italic', color: '#475569', background: '#f1f5f9', padding: '4px 8px', borderRadius: 4, display: 'inline-block' }}>"{step.comment}"</div>}
                  </div>
                )
              }))}
            />
          </div>
        )}
      </Modal>

      <Modal
        title={actionType === 'approve' ? 'Xác nhận duyệt' : 'Xác nhận từ chối'}
        open={modalVisible}
        onCancel={() => setModalVisible(false)}
        onOk={handleAction}
        confirmLoading={processing}
        okText={actionType === 'approve' ? 'Duyệt' : 'Từ chối'}
        okButtonProps={{ danger: actionType === 'reject', style: actionType === 'approve' ? { background: '#16a34a' } : {} }}
      >
        {needsFactory && actionType === 'approve' && (
          <div style={{ marginBottom: 16, padding: '12px 16px', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8 }}>
            <Text strong style={{ color: '#b45309', display: 'block', marginBottom: 8 }}>
              ⚠️ Đơn hàng này chưa được chọn nhà máy sản xuất
            </Text>
            <Text type="secondary" style={{ fontSize: 13, display: 'block', marginBottom: 10 }}>
              Vui lòng chọn nhà máy để hệ thống tự động tạo lệnh sản xuất sau khi duyệt.
            </Text>
            <Select
              style={{ width: '100%' }}
              placeholder="--- Chọn nhà máy sản xuất ---"
              value={selectedFactoryId}
              onChange={setSelectedFactoryId}
              options={factories.map(f => ({ label: f.name, value: f.id }))}
            />
          </div>
        )}
        <div style={{ marginTop: needsFactory ? 0 : 16 }}>
          <Text strong>Nhập ghi chú (không bắt buộc):</Text>
          <TextArea 
            rows={4} 
            value={comment} 
            onChange={e => setComment(e.target.value)} 
            placeholder="Lý do từ chối hoặc ghi chú duyệt..." 
            style={{ marginTop: 8 }}
          />
        </div>
      </Modal>

      {/* Modal Confirm Delete with Keyword */}
      <Modal
        title={targetDeleteMode === 'single' ? 'Xác nhận xóa yêu cầu phê duyệt' : 'Xác nhận xóa toàn bộ phê duyệt'}
        open={deleteModalVisible}
        onCancel={() => setDeleteModalVisible(false)}
        onOk={handleConfirmDelete}
        confirmLoading={deleting}
        okText="Xác nhận xóa"
        cancelText="Hủy"
        okButtonProps={{ 
          danger: true, 
          disabled: !['XÓA', 'XOÁ', 'XOA', 'DELETE'].includes(deleteConfirmText.trim().toUpperCase()) 
        }}
      >
        <div style={{ marginTop: 16 }}>
          <Alert
            type="warning"
            showIcon
            message="Cảnh báo an toàn dữ liệu"
            description={
              targetDeleteMode === 'single'
                ? `Bạn có chắc chắn muốn xóa vĩnh viễn yêu cầu phê duyệt "${selectedDeleteReq?.title}" không? Hành động này không thể khôi phục.`
                : `Bạn có chắc chắn muốn xóa TOÀN BỘ lịch sử yêu cầu phê duyệt của công ty không? (Lưu ý: Các yêu cầu đang ở trạng thái "Chờ duyệt" sẽ được hệ thống tự động giữ lại theo quy định an toàn). Hành động này không thể khôi phục!`
            }
            style={{ marginBottom: 16 }}
          />
          <Text strong>Vui lòng gõ chữ <Tag color="error">Xóa</Tag> (hoặc <Tag color="error">XÓA</Tag> / <Tag color="error">XOA</Tag>) vào ô bên dưới để xác nhận hành động:</Text>
          <Input 
            value={deleteConfirmText} 
            onChange={e => setDeleteConfirmText(e.target.value)} 
            placeholder="Nhập chữ Xóa..." 
            style={{ marginTop: 8 }}
            onPressEnter={() => {
              if (['XÓA', 'XOÁ', 'XOA', 'DELETE'].includes(deleteConfirmText.trim().toUpperCase())) {
                handleConfirmDelete()
              }
            }}
          />
        </div>
      </Modal>

    </section>
  )
}
