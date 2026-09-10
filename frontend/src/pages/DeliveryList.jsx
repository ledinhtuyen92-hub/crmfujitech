import React, { useState, useEffect, useCallback } from 'react'
import {
  Table,
  Card,
  Typography,
  Space,
  Button,
  Tag,
  Row,
  Col,
  Input,
  Select,
  Modal,
  Form,
  DatePicker,
  Drawer,
  List,
  message,
} from 'antd'
import { CarOutlined, SearchOutlined, EditOutlined, EyeOutlined, PlusOutlined, DeleteOutlined, UserAddOutlined, FileTextOutlined, PrinterOutlined, CheckCircleOutlined, CloseCircleOutlined, SyncOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import { useResponsive } from '../hooks/useResponsive'

import api from '../utils/api'
import { useAuth } from '../contexts/AuthContext'
import QuotationPrintView from '../components/QuotationPrintView'

const { Title, Text } = Typography
const { Option } = Select

const statusConfig = {
  pending: { label: 'Chờ giao hàng', color: 'orange' },
  in_transit: { label: 'Đang giao', color: 'blue' },
  delivered: { label: 'Giao thành công', color: 'green' },
  failed: { label: 'Giao thất bại', color: 'red' },
}

export default function DeliveryList() {
  const { checkMaintenance, hasPermission, companySettings } = useAuth()
  const [deliveries, setDeliveries] = useState([])
  const [loading, setLoading] = useState(false)
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(50)
  const [totalCount, setTotalCount] = useState(0)
  const [searchText, setSearchText] = useState('')
  const [statusFilter, setStatusFilter] = useState(null)

  const [modalVisible, setModalVisible] = useState(false)
  const [editingDelivery, setEditingDelivery] = useState(null)
  const [form] = Form.useForm()
  const [submitting, setSubmitting] = useState(false)
  const [availableOrders, setAvailableOrders] = useState([])

  const canEdit = hasPermission('delivery.edit')
  const canCreate = hasPermission('delivery.edit') // Reuse edit permission for simplicity or use delivery.create if exists
  const canDelete = hasPermission('delivery.delete')
  const [isCompanyAdmin, setIsCompanyAdmin] = useState(false)
  const [shippers, setShippers] = useState([])
  const [assignModalVisible, setAssignModalVisible] = useState(false)
  const [assigningDelivery, setAssigningDelivery] = useState(null)
  const [selectedShipperId, setSelectedShipperId] = useState(null)
  
  const [drawerVisible, setDrawerVisible] = useState(false)
  const [viewingOrder, setViewingOrder] = useState(null)
  const [activeTemplates, setActiveTemplates] = useState([])
  const [isPrinting, setIsPrinting] = useState(false)

  const fetchShippers = async (factoryId) => {
    try {
      const params = { role: 'shipper', limit: 100 }
      if (factoryId) params.factory_id = factoryId
      const res = await api.get('/users/users/', { params })
      setShippers(Array.isArray(res.data) ? res.data : res.data?.results ?? [])
    } catch (err) {
      console.error(err)
      setShippers([])
    }
  }

  const fetchDataForForm = async () => {
    try {
      const resOrders = await api.get('/orders/orders/', { params: { page_size: companySettings?.list_page_size || 1000, ready_for_delivery: 'true' } })
      setAvailableOrders(Array.isArray(resOrders.data) ? resOrders.data : resOrders.data?.results ?? [])

      const resTmpl = await api.get('/sales/quotation-templates/active/')
      setActiveTemplates(Array.isArray(resTmpl.data) ? resTmpl.data : resTmpl.data?.results ?? [])
    } catch {}
  }

  const getEffectiveTemplate = (order) => {
    if (order?.custom_data?.template_snapshot?.code) {
      return order.custom_data.template_snapshot
    }
    if (order?.quotation_detail?.custom_data?.template_snapshot?.code) {
      return order.quotation_detail.custom_data.template_snapshot
    }
    if (activeTemplates && activeTemplates.length > 0) {
      return activeTemplates.find(t => t.is_default) || activeTemplates[0]
    }
    return null
  }

  const fetchDeliveries = useCallback(async (page = 1) => {
    setLoading(true)
    try {
      const params = {
        page: page,
        page_size: pageSize
      }
      if (statusFilter) params.status = statusFilter
      if (searchText) params.search = searchText
      
      const res = await api.get('/delivery/deliveries/', { params })
      const data = res.data?.results ?? (Array.isArray(res.data) ? res.data : [])
      
      setTotalCount(res.data.count || data.length || 0)
      setDeliveries(data)
      setCurrentPage(page)
    } catch {
      message.error('Lỗi khi tải danh sách giao hàng.')
    } finally {
      setLoading(false)
    }
  }, [statusFilter, searchText, pageSize])

  useEffect(() => {
    fetchDeliveries()
    fetchDataForForm()
  }, [fetchDeliveries])

  const openModal = (record = null) => {
    if (checkMaintenance()) return
    setEditingDelivery(record)
    if (record) {
      form.setFieldsValue({
        order: record.order,
        status: record.status,
        shipper_name: record.shipper_name,
        shipper_phone: record.shipper_phone,
        shipping_address: record.shipping_address,
        expected_date: record.expected_date ? dayjs(record.expected_date) : null,
        actual_date: record.actual_date ? dayjs(record.actual_date) : null,
        notes: record.notes,
      })
    } else {
      form.resetFields()
      form.setFieldsValue({ status: 'pending' })
    }
    setModalVisible(true)
  }

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields()
      setSubmitting(true)
      const payload = {
        order: values.order,
        status: values.status,
        shipper_name: values.shipper_name,
        shipper_phone: values.shipper_phone,
        shipping_address: values.shipping_address,
        expected_date: values.expected_date ? values.expected_date.format('YYYY-MM-DD') : null,
        actual_date: values.actual_date ? values.actual_date.format('YYYY-MM-DD') : null,
        notes: values.notes,
      }
      if (editingDelivery) {
        await api.patch(`/delivery/deliveries/${editingDelivery.id}/`, payload)
        message.success('Cập nhật trạng thái giao hàng thành công!')
      } else {
        await api.post(`/delivery/deliveries/`, payload)
        message.success('Tạo Lệnh giao hàng thành công!')
      }
      setModalVisible(false)
      fetchDeliveries()
    } catch (error) {
      const data = error.response?.data
      let errorMsg = 'Có lỗi xảy ra khi lưu.'
      if (data) {
        if (Array.isArray(data.status)) errorMsg = data.status[0]
        else if (typeof data.status === 'string') errorMsg = data.status
        else if (data.detail) errorMsg = data.detail
        else if (Array.isArray(data.non_field_errors)) errorMsg = data.non_field_errors[0]
        else if (Array.isArray(data.order)) errorMsg = data.order[0]
        else if (Object.values(data).length > 0 && Array.isArray(Object.values(data)[0])) errorMsg = Object.values(data)[0][0]
        else if (typeof data === 'string') errorMsg = data
      }
      message.error(errorMsg)
    } finally {
      setSubmitting(false)
    }
  }

  const handleDelete = (record) => {
    if (checkMaintenance()) return
    Modal.confirm({
      title: 'Xóa lệnh giao hàng',
      content: `Bạn có chắc chắn muốn xóa lệnh giao hàng ${record.delivery_code || `GH-${record.id}`} không?`,
      okText: 'Xóa',
      okType: 'danger',
      cancelText: 'Hủy',
      onOk: async () => {
        try {
          await api.delete(`/delivery/deliveries/${record.id}/`)
          message.success('Đã xóa lệnh giao hàng!')
          fetchDeliveries()
        } catch {
          message.error('Lỗi khi xóa lệnh giao hàng.')
        }
      }
    })
  }

  const handleUpdateStatus = async (record, newStatus) => {
    if (checkMaintenance()) return
    
    // Lưu lại trạng thái cũ để revert nếu lỗi
    const previousStatus = record.status
    
    // TRUE Optimistic UI: Cập nhật giao diện NGAY LẬP TỨC
    setDeliveries(prev => prev.map(item => String(item.id) === String(record.id) ? { ...item, status: newStatus } : item))

    try {
      const payload = { status: newStatus }
      if (newStatus === 'delivered' && !record.actual_date) {
        payload.actual_date = dayjs().format('YYYY-MM-DD')
      }
      
      const res = await api.patch(`/delivery/deliveries/${record.id}/`, payload)
      message.success('Cập nhật trạng thái thành công!')
      // Đồng bộ lại dữ liệu chuẩn từ server (vd: actual_date)
      setDeliveries(prev => prev.map(item => String(item.id) === String(record.id) ? { ...item, ...res.data } : item))
    } catch (error) {
      // Nếu lỗi thì hoàn tác giao diện về trạng thái cũ
      setDeliveries(prev => prev.map(item => String(item.id) === String(record.id) ? { ...item, status: previousStatus } : item))
      
      const data = error.response?.data
      let errorMsg = 'Có lỗi xảy ra khi cập nhật.'
      if (data) {
        if (Array.isArray(data.status)) errorMsg = data.status[0]
        else if (typeof data.status === 'string') errorMsg = data.status
        else if (data.detail) errorMsg = data.detail
        else if (Array.isArray(data.non_field_errors)) errorMsg = data.non_field_errors[0]
      }
      message.error(errorMsg)
    }
  }

  const handleRecreateWarranty = async (id) => {
    if (checkMaintenance()) return
    Modal.confirm({
      title: 'Tạo lại Phiếu bảo hành',
      content: 'Đơn hàng này chưa có Phiếu bảo hành. Bạn có muốn tự động tạo mới Phiếu bảo hành ngay bây giờ không?',
      okText: 'Tạo mới',
      cancelText: 'Hủy',
      onOk: async () => {
        try {
          await api.post(`/delivery/deliveries/${id}/recreate_warranty/`)
          message.success('Đã tạo phiếu bảo hành thành công!')
          fetchDeliveries()
        } catch (error) {
          message.error(error.response?.data?.detail || 'Lỗi khi tạo phiếu bảo hành.')
        }
      }
    })
  }

  const handleViewOrder = async (record) => {
    if (checkMaintenance()) return
    try {
      const res = await api.get(`/orders/orders/${record.order}/`)
      setViewingOrder(res.data)
      setDrawerVisible(true)
    } catch {
      message.error('Không thể tải thông tin đơn hàng.')
    }
  }

  const handlePrintOrPDF = () => {
    setIsPrinting(true)
    setTimeout(() => {
      window.print()
      setIsPrinting(false)
    }, 500)
  }

  const handleAssignShipper = async () => {
    if (!selectedShipperId) {
      message.error("Vui lòng chọn nhân viên giao hàng.")
      return
    }
    setSubmitting(true)
    try {
      const res = await api.post(`/delivery/deliveries/${assigningDelivery.id}/assign_shipper/`, {
        shipper_user_id: selectedShipperId
      })
      message.success('Gán nhân viên giao hàng thành công!')
      setAssignModalVisible(false)
      setDeliveries(prev => prev.map(item => String(item.id) === String(assigningDelivery.id) ? { ...item, ...res.data } : item))
    } catch (error) {
      const data = error.response?.data
      let errorMsg = 'Lỗi khi gán nhân viên giao hàng.'
      if (data?.detail) errorMsg = data.detail
      else if (data && Object.values(data).length > 0 && Array.isArray(Object.values(data)[0])) errorMsg = Object.values(data)[0][0]
      message.error(errorMsg)
    } finally {
      setSubmitting(false)
    }
  }

  const renderDeliveryActions = (r) => (
    <Space wrap size={8}>
      {canEdit && r.status === 'pending' && (
        <Button
          size="small"
          type="primary"
          ghost
          icon={<CarOutlined />}
          onClick={() => handleUpdateStatus(r, 'in_transit')}
        >
          Giao hàng
        </Button>
      )}
      {canEdit && r.status === 'in_transit' && (
        <>
          <Button
            size="small"
            style={{ color: '#16a34a', borderColor: '#16a34a' }}
            icon={<CheckCircleOutlined />}
            onClick={() => handleUpdateStatus(r, 'delivered')}
          >
            Thành công
          </Button>
          <Button
            size="small"
            danger
            icon={<CloseCircleOutlined />}
            onClick={() => handleUpdateStatus(r, 'failed')}
          >
            Thất bại
          </Button>
        </>
      )}
      {canEdit && r.status === 'failed' && (
        <Button
          size="small"
          type="primary"
          icon={<SyncOutlined />}
          onClick={() => handleUpdateStatus(r, 'pending')}
        >
          Giao lại
        </Button>
      )}
      {hasPermission('delivery.assign') && (
        <Button
          type="text"
          style={{ color: '#10b981' }}
          icon={<UserAddOutlined />}
          title="Gán nhân viên giao hàng"
          onClick={() => {
            setAssigningDelivery(r)
            setSelectedShipperId(r.shipper_user)
            fetchShippers(r.factory_id)
            setAssignModalVisible(true)
          }}
        />
      )}
      <Button
        type="text"
        style={{ color: '#0284c7' }}
        icon={<FileTextOutlined />}
        title="Xem chi tiết đơn hàng"
        onClick={() => handleViewOrder(r)}
      />
      <Button
        type="text"
        icon={canEdit ? <EditOutlined /> : <EyeOutlined />}
        onClick={() => openModal(r)}
      />
      {canDelete && (
        <Button
          type="text"
          danger
          icon={<DeleteOutlined />}
          onClick={() => handleDelete(r)}
        />
      )}
    </Space>
  )

  const columns = [
    {
      title: 'Mã GH',
      dataIndex: 'delivery_code',
      key: 'delivery_code',
      render: (v, r) => <Text strong style={{ color: '#0284c7' }}>{v || `GH-${r.id}`}</Text>,
    },
    {
      title: 'Đơn hàng',
      dataIndex: 'order_number',
      key: 'order_number',
      render: (v) => <Tag color="blue">{v}</Tag>,
    },
    {
      title: 'Khách hàng',
      key: 'customer',
      render: (_, r) => (
        <div>
          <Text strong>{r.customer_name}</Text>
          <br />
          <Text type="secondary" style={{ fontSize: 12 }}>{r.customer_phone}</Text>
        </div>
      ),
    },
    {
      title: 'Nhà máy',
      key: 'factory',
      render: (_, r) => (
        <Text>{r.factory_name || <Text type="secondary">Chưa rõ</Text>}</Text>
      ),
    },
    {
      title: 'Công nợ',
      key: 'debt',
      render: (_, r) => (
        <div style={{ fontSize: 13 }}>
          {r.order_remaining_debt > 0 ? (
            <Text type="danger" strong>
              {Number(r.order_remaining_debt).toLocaleString('vi-VN')} đ
            </Text>
          ) : (
            <Text type="success" strong>Đã thu đủ</Text>
          )}
        </div>
      ),
    },
    {
      title: 'Trạng thái',
      dataIndex: 'status',
      key: 'status',
      render: (st, r) => {
        const c = statusConfig[st] || { label: st, color: 'default' }
        return (
          <Space direction="vertical" size={2}>
            <Tag color={c.color}>{c.label}</Tag>
            {st === 'delivered' && r.has_warranty === false && (
              (isCompanyAdmin || hasPermission('warranty.create')) ? (
                <Button type="primary" danger size="small" style={{ fontSize: 11, padding: '0 8px', marginTop: 4 }} onClick={() => handleRecreateWarranty(r.id)}>
                  Tạo phiếu BH
                </Button>
              ) : (
                <Text type="danger" style={{ fontSize: 11, display: 'block', lineHeight: 1.2, textAlign: 'center', marginTop: 4 }}>Chưa có phiếu BH</Text>
              )
            )}
          </Space>
        )
      },
    },
    {
      title: 'Giao hàng',
      key: 'shipper',
      render: (_, r) => (
        <div style={{ fontSize: 12 }}>
          {r.shipper_name ? (
            <>
              <div><Text strong>{r.shipper_name}</Text></div>
              <div>{r.shipper_phone}</div>
            </>
          ) : (
            <Text type="secondary">Chưa gán</Text>
          )}
        </div>
      ),
    },
    {
      title: 'Thời gian',
      key: 'dates',
      render: (_, r) => (
        <div style={{ fontSize: 12 }}>
          {r.expected_date && <div>Dự kiến: {dayjs(r.expected_date).format('DD/MM/YYYY')}</div>}
          {r.actual_date && <div style={{ color: '#16a34a' }}>Thực tế: {dayjs(r.actual_date).format('DD/MM/YYYY')}</div>}
        </div>
      ),
    },
    {
      title: '',
      key: 'actions',
      align: 'right',
      render: (_, r) => renderDeliveryActions(r),
    },
  ]

  const { isMobile, padding } = useResponsive()

  return (
    <section>
      <Row justify="space-between" align="middle" style={{ marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
        <Title level={isMobile ? 4 : 3} style={{ margin: 0 }}>
          <CarOutlined style={{ marginRight: 8, color: '#f59e0b' }} />
          Quản lý Giao hàng
        </Title>
        {canCreate && (
          <Button type="primary" icon={<PlusOutlined />} onClick={() => openModal()} size={isMobile ? 'middle' : 'large'} style={{ borderRadius: 8 }}>
            {isMobile ? 'Tạo GH' : 'Tạo Giao Hàng Mới'}
          </Button>
        )}
      </Row>

      <Card style={{ marginBottom: 16, borderRadius: 12 }} bodyStyle={{ padding: 16 }}>
        <Row gutter={[16, 16]}>
          <Col xs={24} sm={12} md={8}>
            <Input
              placeholder="Tìm kiếm mã GH, đơn hàng, người giao..."
              prefix={<SearchOutlined />}
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              allowClear
            />
          </Col>
          <Col xs={24} sm={12} md={6}>
            <Select
              style={{ width: '100%' }}
              placeholder="Lọc trạng thái"
              allowClear
              value={statusFilter}
              onChange={setStatusFilter}
            >
              {Object.entries(statusConfig).map(([key, c]) => (
                <Option key={key} value={key}>{c.label}</Option>
              ))}
            </Select>
          </Col>
        </Row>
      </Card>

      {isMobile ? (
        <List
          rowKey="id"
          dataSource={deliveries}
          loading={loading}
          pagination={{
            current: currentPage,
            pageSize: pageSize,
            total: totalCount,
            showSizeChanger: false,
            size: 'small',
            showTotal: (total) => `Tổng cộng ${total} lệnh`,
            onChange: (page) => fetchDeliveries(page)
          }}
          renderItem={(r) => {
            const cfg = statusConfig[r.status] || { label: r.status, color: 'default' }
            return (
              <List.Item style={{ padding: '16px', borderBottom: '1px solid #f0f0f0', display: 'block', background: '#fff' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, alignItems: 'center' }}>
                  <Text strong style={{ color: '#2563eb' }}>{r.delivery_code}</Text>
                  <Tag color={cfg.color} style={{ margin: 0 }}>{cfg.label}</Tag>
                </div>
                <div style={{ marginBottom: 4 }}>
                  <Text type="secondary" style={{ fontSize: 13 }}>Đơn hàng: </Text>
                  <Text strong>{r.order_number}</Text>
                </div>
                <div style={{ marginBottom: 4 }}>
                  <Text type="secondary" style={{ fontSize: 13 }}>Khách hàng: </Text>
                  <Text>{r.customer_name}</Text>
                </div>
                <div style={{ marginBottom: 4 }}>
                  <Text type="secondary" style={{ fontSize: 13 }}>Nhà máy: </Text>
                  <Text>{r.factory_name || 'Chưa rõ'}</Text>
                </div>
                <div style={{ marginBottom: 4 }}>
                  <Text type="secondary" style={{ fontSize: 13 }}>Người giao: </Text>
                  {r.shipper_name ? <Text>{r.shipper_name} ({r.shipper_phone})</Text> : <Text type="secondary">Chưa gán</Text>}
                </div>
                <div style={{ marginBottom: 12 }}>
                  <Text type="secondary" style={{ fontSize: 13 }}>Dự kiến giao: </Text>
                  {r.expected_date ? <Text>{dayjs(r.expected_date).format('DD/MM/YYYY')}</Text> : <Text>—</Text>}
                </div>
                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                  {renderDeliveryActions(r)}
                </div>
              </List.Item>
            )
          }}
        />
      ) : (
        <Table scroll={{ x: 'max-content' }}
          dataSource={deliveries}
          columns={columns}
          rowKey="id"
          loading={loading}
          onChange={(pagination) => {
            if (pagination.current !== currentPage) {
              fetchDeliveries(pagination.current)
            }
          }}
          pagination={{
            current: currentPage,
            pageSize: pageSize,
            total: totalCount,
            showSizeChanger: false,
            showTotal: (total, range) => `${range[0]}-${range[1]} của ${total} lệnh`,
          }}
        />
      )}

      <Modal
        title={editingDelivery ? (canEdit ? "Cập nhật Lệnh Giao hàng" : "Chi tiết Lệnh Giao hàng") : "Tạo Lệnh Giao Hàng Mới"}
        open={modalVisible}
        onCancel={() => setModalVisible(false)}
        onOk={handleSubmit}
        confirmLoading={submitting}
        okButtonProps={{ disabled: !canEdit }}
      >
        <Form form={form} layout="vertical">
          <Form.Item name="order" label="Đơn hàng liên kết" rules={[{ required: !editingDelivery, message: 'Vui lòng chọn đơn hàng' }]}>
            <Select 
              disabled={!!editingDelivery || !canEdit} 
              placeholder="Chọn đơn hàng" 
              showSearch 
              optionFilterProp="children"
              onChange={(orderId) => {
                const order = availableOrders.find(o => o.id === orderId);
                if (order && order.customer_address) {
                  form.setFieldsValue({ shipping_address: order.customer_address });
                }
              }}
            >
              {availableOrders.map(o => (
                <Option key={o.id} value={o.id}>{o.order_number} - {o.customer_name}</Option>
              ))}
            </Select>
          </Form.Item>
          <Form.Item name="status" label="Trạng thái">
            <Select disabled={!canEdit}>
              <Option value="pending">{statusConfig['pending'].label}</Option>
              <Option value="in_transit">{statusConfig['in_transit'].label}</Option>
              {editingDelivery && editingDelivery.status === 'delivered' && (
                 <Option value="delivered">{statusConfig['delivered'].label}</Option>
              )}
              {editingDelivery && editingDelivery.status === 'failed' && (
                 <Option value="failed">{statusConfig['failed'].label}</Option>
              )}
            </Select>
          </Form.Item>
          <Row gutter={16}>
            <Col xs={24} md={12}>
              <Form.Item name="shipper_name" label="Người giao hàng (Shipper)">
                <Input disabled={!canEdit} />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item name="shipper_phone" label="SĐT Shipper">
                <Input disabled={!canEdit} />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="shipping_address" label="Địa chỉ giao hàng">
            <Input.TextArea rows={2} disabled={!canEdit} />
          </Form.Item>
          <Row gutter={16}>
            <Col xs={24} md={12}>
              <Form.Item name="expected_date" label="Ngày dự kiến">
                <DatePicker format="DD/MM/YYYY" style={{ width: '100%' }} disabled={!canEdit} />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item name="actual_date" label="Ngày thực tế">
                <DatePicker format="DD/MM/YYYY" style={{ width: '100%' }} disabled={!canEdit} />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="notes" label="Ghi chú">
            <Input.TextArea rows={2} disabled={!canEdit} />
          </Form.Item>
        </Form>
      </Modal>

      {/* ── Drawer View Order Details ──────────────────────────────────── */}
      <Drawer
        title={
          <Space>
            <PrinterOutlined style={{ color: '#10b981' }} />
            <Text strong>Chi tiết Đơn Hàng {viewingOrder?.order_number}</Text>
          </Space>
        }
        width={(() => {
          const et = getEffectiveTemplate(viewingOrder)
          return (et?.layout_config?.paper_orientation === 'landscape' || et?.code === 'production_landscape_a4') ? 1080 : 920
        })()}
        open={drawerVisible}
        onClose={() => setDrawerVisible(false)}
        extra={
          <Button type="primary" icon={<PrinterOutlined />} onClick={handlePrintOrPDF} style={{ background: '#10b981', borderColor: '#10b981' }}>
            In Đơn Hàng
          </Button>
        }
      >
        {viewingOrder && (
          <div>
            <div style={{ marginBottom: 24, border: '1px solid #e2e8f0', borderRadius: 8, padding: 16, background: '#fff', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)' }}>
              <QuotationPrintView
                quotation={viewingOrder}
                type="order"
                effectiveTemplate={getEffectiveTemplate(viewingOrder)}
                isCompanyAdmin={isCompanyAdmin}
                products={[]}
              />
            </div>
            {isPrinting && (
              <style>{`
                @media print {
                  body * { visibility: hidden; }
                  .ant-drawer-body * { visibility: visible; }
                  .ant-drawer-body { 
                    position: absolute; 
                    left: 0; 
                    top: 0; 
                    width: 100%;
                    padding: 0;
                  }
                  .ant-drawer-body > div > div:first-child {
                    border: none !important;
                    box-shadow: none !important;
                    padding: 0 !important;
                    margin: 0 !important;
                  }
                }
              `}</style>
            )}
          </div>
        )}
      </Drawer>

      <Modal
        title="Gán nhân viên giao hàng"
        open={assignModalVisible}
        onCancel={() => setAssignModalVisible(false)}
        onOk={handleAssignShipper}
        confirmLoading={submitting}
      >
        <p>Lệnh giao hàng: <strong>{assigningDelivery?.delivery_code}</strong></p>
        <div style={{ marginBottom: 8 }}>Chọn nhân viên:</div>
        <Select
          style={{ width: '100%' }}
          placeholder="Chọn nhân viên"
          value={selectedShipperId}
          onChange={setSelectedShipperId}
          showSearch
          optionFilterProp="children"
        >
          {shippers.map(u => (
            <Option key={u.id} value={u.id}>{u.full_name} ({u.email})</Option>
          ))}
        </Select>
      </Modal>
    </section>
  )
}
