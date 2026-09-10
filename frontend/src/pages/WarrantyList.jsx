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
  Checkbox,
  Popover,
} from 'antd'
import { SafetyCertificateOutlined, SearchOutlined, EditOutlined, EyeOutlined, PlusOutlined, DeleteOutlined, PrinterOutlined, SettingOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import { useResponsive } from '../hooks/useResponsive'

import api from '../utils/api'
import { useAuth } from '../contexts/AuthContext'
import WarrantyPrintView from '../components/WarrantyPrintView'

const { Title, Text } = Typography
const { Option } = Select

const statusConfig = {
  active: { label: 'Đang hiệu lực', color: 'green' },
  expired: { label: 'Hết hạn', color: 'red' },
  void: { label: 'Đã hủy/Vô hiệu', color: 'default' },
}

export default function WarrantyList() {
  const { checkMaintenance, hasPermission, companySettings } = useAuth()
  const [warranties, setWarranties] = useState([])
  const [loading, setLoading] = useState(false)
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(25)
  const [totalCount, setTotalCount] = useState(0)
  const [searchText, setSearchText] = useState('')
  const [statusFilter, setStatusFilter] = useState(null)

  const DEFAULT_COLUMNS = ['warranty_code', 'order_number', 'customer', 'status', 'dates', 'actions']
  const [visibleColumns, setVisibleColumns] = useState(() => {
    const saved = localStorage.getItem('warrantyListVisibleColumns')
    return saved ? JSON.parse(saved) : DEFAULT_COLUMNS
  })

  useEffect(() => {
    localStorage.setItem('warrantyListVisibleColumns', JSON.stringify(visibleColumns))
  }, [visibleColumns])

  const [modalVisible, setModalVisible] = useState(false)
  const [editingWarranty, setEditingWarranty] = useState(null)
  const [form] = Form.useForm()
  const [submitting, setSubmitting] = useState(false)
  const [availableOrders, setAvailableOrders] = useState([])
  const [availableCustomers, setAvailableCustomers] = useState([])

  const [deleteModalVisible, setDeleteModalVisible] = useState(false)
  const [deletingWarranty, setDeletingWarranty] = useState(null)
  const [deleteConfirmText, setDeleteConfirmText] = useState('')

  const [printDrawerVisible, setPrintDrawerVisible] = useState(false)
  const [printingWarranty, setPrintingWarranty] = useState(null)
  const [companyInfo, setCompanyInfo] = useState(null)

  const [printOrientation, setPrintOrientation] = useState('landscape')

  const canEdit = hasPermission('warranty.edit')
  const canCreate = hasPermission('warranty.create') || hasPermission('warranty.edit')
  const canDelete = hasPermission('warranty.delete')

  const fetchDataForForm = async () => {
    try {
      const resOrders = await api.get('/orders/orders/', { params: { page_size: companySettings?.list_page_size || 1000, status: 'completed', without_warranty: 'true' } })
      setAvailableOrders(Array.isArray(resOrders.data) ? resOrders.data : resOrders.data?.results ?? [])
      
      const resCustomers = await api.get('/crm/customers/', { params: { page_size: companySettings?.list_page_size || 1000 } })
      setAvailableCustomers(Array.isArray(resCustomers.data) ? resCustomers.data : resCustomers.data?.results ?? [])

      const resCompany = await api.get('/users/my-company/')
      setCompanyInfo(resCompany.data)


    } catch {}
  }

  const fetchWarranties = useCallback(async (page = 1) => {
    setLoading(true)
    try {
      const params = {
        page: page,
        page_size: pageSize
      }
      if (statusFilter) params.status = statusFilter
      if (searchText) params.search = searchText
      const res = await api.get('/delivery/warranties/', { params })
      const data = res.data?.results ?? (Array.isArray(res.data) ? res.data : [])
      
      setTotalCount(res.data.count || data.length || 0)
      setWarranties(data)
      setCurrentPage(page)
    } catch {
      message.error('Lỗi khi tải danh sách phiếu bảo hành.')
    } finally {
      setLoading(false)
    }
  }, [statusFilter, searchText, pageSize])

  useEffect(() => {
    fetchWarranties()
  }, [fetchWarranties])

  useEffect(() => {
    fetchDataForForm()
  }, [])

  const openModal = (record = null) => {
    if (checkMaintenance()) return
    setEditingWarranty(record)
    if (record) {
      form.setFieldsValue({
        order: record.order,
        customer: record.customer,
        status: record.status,
        start_date: record.start_date ? dayjs(record.start_date) : null,
        end_date: record.end_date ? dayjs(record.end_date) : null,
        terms: record.terms,
        warranty_content: record.warranty_content || companySettings?.default_warranty_content || '',
        warranty_rules: record.warranty_rules || companySettings?.default_warranty_rules || '',
      })
    } else {
      form.resetFields()
      form.setFieldsValue({ 
        status: 'active',
        start_date: dayjs(),
        end_date: dayjs().add(1, 'year')
      })
    }
    setModalVisible(true)
  }

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields()
      setSubmitting(true)
      const payload = {
        order: values.order,
        customer: values.customer,
        status: values.status,
        start_date: values.start_date ? values.start_date.format('YYYY-MM-DD') : null,
        end_date: values.end_date ? values.end_date.format('YYYY-MM-DD') : null,
        terms: values.terms,
        warranty_content: values.warranty_content,
        warranty_rules: values.warranty_rules,
      }
      if (editingWarranty) {
        await api.patch(`/delivery/warranties/${editingWarranty.id}/`, payload)
        message.success('Cập nhật phiếu bảo hành thành công!')
      } else {
        await api.post(`/delivery/warranties/`, payload)
        message.success('Tạo phiếu bảo hành thành công!')
      }
      setModalVisible(false)
      fetchWarranties()
    } catch (error) {
      message.error(error.response?.data?.order?.[0] || 'Có lỗi xảy ra khi lưu.')
    } finally {
      setSubmitting(false)
    }
  }

  const handleDelete = (record) => {
    if (checkMaintenance()) return
    setDeletingWarranty(record)
    setDeleteConfirmText('')
    setDeleteModalVisible(true)
  }

  const executeDelete = async () => {
    if (!['XÓA', 'XOÁ', 'XOA', 'DELETE'].includes(deleteConfirmText.trim().toUpperCase())) {
      message.error('Vui lòng nhập đúng chữ Xóa (hoặc XÓA / XOA) để xác nhận.')
      return
    }
    setSubmitting(true)
    try {
      await api.delete(`/delivery/warranties/${deletingWarranty.id}/`)
      message.success('Đã xóa phiếu bảo hành!')
      setDeleteModalVisible(false)
      fetchWarranties()
    } catch (err) {
      message.error(err.response?.data?.detail || err.message || 'Lỗi khi xóa phiếu bảo hành.')
    } finally {
      setSubmitting(false)
    }
  }

  const handlePrint = () => {
    if (!printingWarranty) return
    const contentEl = document.querySelector('.warranty-print-container')
    const dNum = printingWarranty.warranty_code || 'Phieu_Bao_Hanh'
    const isLandscape = printOrientation === 'landscape'
    // Read actual scale value set by user in WarrantyPrintView
    const printScale = parseFloat(contentEl?.dataset?.scale || '1')

    if (!contentEl) {
      const oldTitle = document.title
      document.title = dNum
      window.print()
      document.title = oldTitle
      return
    }

    const styleTags = Array.from(document.querySelectorAll('style, link[rel="stylesheet"]'))
      .map((el) => el.outerHTML)
      .join('\n')

    const printWin = window.open('', '_blank', 'width=1180,height=850')
    if (!printWin) {
      const oldTitle = document.title
      document.title = dNum
      window.print()
      document.title = oldTitle
      return
    }

    printWin.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8" />
        <title>${dNum}</title>
        ${styleTags}
        <style>
          * {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
            box-sizing: border-box !important;
          }
          @page {
            size: ${isLandscape ? 'A4 landscape' : 'A4 portrait'};
            margin: ${isLandscape ? '0' : '12mm'};
          }
          html, body {
            margin: 0;
            padding: 0;
            ${isLandscape ? 'width: 297mm; height: 210mm;' : ''}
          }
          .no-print {
            display: none !important;
          }
          .warranty-print-container {
            zoom: ${printScale} !important;
            box-shadow: none !important;
            ${isLandscape ? `
              width: 297mm !important;
              height: 210mm !important;
              padding: 10mm !important;
              overflow: hidden !important;
            ` : `
              width: 100% !important;
              height: auto !important;
              padding: 8mm !important;
            `}
          }
          ${isLandscape ? `
            .warranty-print-container .ant-row {
              flex-wrap: nowrap !important;
            }
            .warranty-print-container .ant-col {
              flex: 0 0 50% !important;
              max-width: 50% !important;
            }
          ` : `
            .warranty-print-container .ant-col {
              flex: 0 0 100% !important;
              max-width: 100% !important;
            }
          `}
        </style>
      </head>
      <body>
        ${contentEl.outerHTML}
      </body>
      </html>
    `)
    printWin.document.close()
    printWin.focus()
    setTimeout(() => {
      printWin.print()
      printWin.close()
    }, 500)
  }

  const renderWarrantyActions = (r) => (
    <Space wrap size={8}>
      <Button
        type="text"
        shape="circle"
        icon={<PrinterOutlined />}
        onClick={() => { setPrintingWarranty(r); setPrintDrawerVisible(true); }}
        title="In Phiếu Bảo Hành"
      />
      <Button
        type="text"
        shape="circle"
        icon={canEdit ? <EditOutlined /> : <EyeOutlined />}
        onClick={() => openModal(r)}
      />
      {canDelete && (
        <Button
          type="text"
          danger
          shape="circle"
          icon={<DeleteOutlined />}
          onClick={() => handleDelete(r)}
        />
      )}
    </Space>
  )

  const columns = [
    {
      title: 'Mã BH',
      dataIndex: 'warranty_code',
      key: 'warranty_code',
      fixed: 'left',
      render: (v, r) => <Text strong style={{ color: '#059669' }}>{v || `BH-${r.id}`}</Text>,
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
      title: 'Trạng thái',
      dataIndex: 'status',
      key: 'status',
      render: (st) => {
        const c = statusConfig[st] || { label: st, color: 'default' }
        return <Tag color={c.color}>{c.label}</Tag>
      },
    },
    {
      title: 'Thời hạn',
      key: 'dates',
      render: (_, r) => (
        <div style={{ fontSize: 12 }}>
          {r.start_date && <div>Từ: {dayjs(r.start_date).format('DD/MM/YYYY')}</div>}
          {r.end_date && <div style={{ color: '#dc2626' }}>Đến: {dayjs(r.end_date).format('DD/MM/YYYY')}</div>}
        </div>
      ),
    },
    {
      title: '',
      key: 'actions',
      align: 'right',
      render: (_, r) => renderWarrantyActions(r),
    },
  ]

  const { isMobile, padding } = useResponsive()

  return (
    <section style={{ width: '100%', minWidth: 0 }}>
      <Row justify="space-between" align="middle" style={{ marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
        <Title level={isMobile ? 4 : 3} style={{ margin: 0 }}>
          <SafetyCertificateOutlined style={{ marginRight: 8, color: '#059669' }} />
          Quản lý Bảo hành
        </Title>
        <Space>
          <Popover 
            placement="bottomRight" 
            title="Tùy chỉnh cột hiển thị" 
            content={
              <Checkbox.Group 
                options={[
                  { label: 'Mã BH', value: 'warranty_code' },
                  { label: 'Đơn hàng', value: 'order_number' },
                  { label: 'Khách hàng', value: 'customer' },
                  { label: 'Trạng thái', value: 'status' },
                  { label: 'Thời hạn', value: 'dates' },
                  { label: 'Hành động', value: 'actions' },
                ]}
                value={visibleColumns}
                onChange={setVisibleColumns}
                style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}
              />
            }
            trigger="click"
          >
            <Button icon={<SettingOutlined />} size={isMobile ? 'middle' : 'large'} style={{ borderRadius: 8 }} />
          </Popover>
          {canCreate && (
            <Button type="primary" icon={<PlusOutlined />} onClick={() => openModal()} size={isMobile ? 'middle' : 'large'} style={{ borderRadius: 8 }}>
              {isMobile ? 'Tạo BH' : 'Tạo Phiếu Bảo Hành'}
            </Button>
          )}
        </Space>
      </Row>

      <Card style={{ marginBottom: 16, borderRadius: 12 }} bodyStyle={{ padding: 16 }}>
        <Row gutter={[16, 16]}>
          <Col xs={24} sm={12} md={8}>
            <Input
              placeholder="Tìm kiếm mã BH, khách hàng, SĐT..."
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
          dataSource={warranties}
          loading={loading}
          pagination={{
            current: currentPage,
            pageSize: pageSize,
            total: totalCount,
            showSizeChanger: false,
            size: 'small',
            showTotal: (total) => `Tổng cộng ${total} phiếu`,
            onChange: (page) => fetchWarranties(page)
          }}
          renderItem={(r) => {
            const c = statusConfig[r.status] || { label: r.status, color: 'default' }
            return (
              <List.Item style={{ padding: '16px', borderBottom: '1px solid #f0f0f0', display: 'block', background: '#fff' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, alignItems: 'center' }}>
                  <Text strong style={{ color: '#2563eb' }}>{r.warranty_code}</Text>
                  <Tag color={c.color} style={{ margin: 0 }}>{c.label}</Tag>
                </div>
                <div style={{ marginBottom: 4 }}>
                  <Text type="secondary" style={{ fontSize: 13 }}>Khách hàng: </Text>
                  <Text strong>{r.customer_name}</Text>
                </div>
                <div style={{ marginBottom: 4 }}>
                  <Text type="secondary" style={{ fontSize: 13 }}>Đơn hàng: </Text>
                  <Text>{r.order_number}</Text>
                </div>
                <div style={{ marginBottom: 12 }}>
                  <Text type="secondary" style={{ fontSize: 13 }}>Thời hạn: </Text>
                  <Text>{r.start_date ? dayjs(r.start_date).format('DD/MM/YY') : '—'} ➔ </Text>
                  <Text style={{ color: '#dc2626' }}>{r.end_date ? dayjs(r.end_date).format('DD/MM/YY') : '—'}</Text>
                </div>
                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                  {renderWarrantyActions(r)}
                </div>
              </List.Item>
            )
          }}
        />
      ) : (
        <Table scroll={{ x: 'max-content' }}
          dataSource={warranties}
          columns={columns.filter(col => visibleColumns.includes(col.key))}
          rowKey="id"
          loading={loading}
          onChange={(pagination) => {
            if (pagination.current !== currentPage) {
              fetchWarranties(pagination.current)
            }
          }}
          pagination={{
            current: currentPage,
            pageSize: pageSize,
            total: totalCount,
            showSizeChanger: false,
            showTotal: (total, range) => `${range[0]}-${range[1]} của ${total} phiếu`,
          }}
        />
      )}

      <Modal
        title={editingWarranty ? (canEdit ? "Cập nhật Phiếu Bảo hành" : "Chi tiết Phiếu Bảo hành") : "Tạo Phiếu Bảo Hành Mới"}
        open={modalVisible}
        onCancel={() => setModalVisible(false)}
        onOk={handleSubmit}
        confirmLoading={submitting}
        okButtonProps={{ disabled: !canEdit }}
      >
        <Form form={form} layout="vertical">
          <Row gutter={16}>
            <Col xs={24} md={24}>
              <Form.Item name="order" label="Đơn hàng" rules={[{ required: !editingWarranty, message: 'Vui lòng chọn đơn hàng' }]}>
                <Select disabled={!!editingWarranty || !canEdit} placeholder="Chọn đơn hàng" showSearch optionFilterProp="children">
                  {editingWarranty && !availableOrders.find(o => o.id === editingWarranty.order) ? (
                    <Option key={editingWarranty.order} value={editingWarranty.order}>
                      {editingWarranty.order_number}
                    </Option>
                  ) : null}
                  {availableOrders.map(o => (
                    <Option key={o.id} value={o.id}>{o.order_number}</Option>
                  ))}
                </Select>
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col xs={24} md={12}>
              <Form.Item name="start_date" label="Ngày bắt đầu">
                <DatePicker format="DD/MM/YYYY" style={{ width: '100%' }} disabled={!canEdit} />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item name="end_date" label="Ngày kết thúc">
                <DatePicker format="DD/MM/YYYY" style={{ width: '100%' }} disabled={!canEdit} />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="terms" label="Điều khoản/Ghi chú ngắn">
            <Input.TextArea rows={2} disabled={!canEdit} />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={<><DeleteOutlined style={{ color: '#ef4444', marginRight: 8 }}/>Xác nhận xóa phiếu bảo hành</>}
        open={deleteModalVisible}
        onCancel={() => setDeleteModalVisible(false)}
        onOk={executeDelete}
        confirmLoading={submitting}
        okText="Xóa"
        okButtonProps={{ danger: true, disabled: !['XÓA', 'XOÁ', 'XOA', 'DELETE'].includes(deleteConfirmText.trim().toUpperCase()) }}
      >
        <div style={{ marginBottom: 16 }}>
          Bạn đang yêu cầu xóa phiếu bảo hành <strong>{deletingWarranty?.warranty_code || 'Chưa rõ'}</strong> của khách hàng <strong>{deletingWarranty?.customer_name}</strong>.
          <br/><br/>
          Hành động này <strong style={{ color: '#ef4444' }}>không thể hoàn tác</strong> và sẽ tự động mở khóa (cho phép chỉnh sửa) Lệnh giao hàng có liên quan.
        </div>
        <p>Vui lòng nhập chữ <strong>Xóa</strong> (hoặc <strong>XÓA</strong> / <strong>XOA</strong>) vào ô bên dưới để xác nhận:</p>
        <Input 
          placeholder="Nhập chữ Xóa..." 
          value={deleteConfirmText}
          onChange={(e) => setDeleteConfirmText(e.target.value)}
          onPressEnter={() => {
            if (['XÓA', 'XOÁ', 'XOA', 'DELETE'].includes(deleteConfirmText.trim().toUpperCase())) executeDelete()
          }}
        />
      </Modal>

      <Drawer
        title={
          <Space>
            <PrinterOutlined style={{ color: '#10b981' }} />
            <Text strong>In Phiếu Bảo Hành: {printingWarranty?.warranty_code}</Text>
          </Space>
        }
        width={1000}
        open={printDrawerVisible}
        onClose={() => setPrintDrawerVisible(false)}
        extra={
          <Button type="primary" icon={<PrinterOutlined />} onClick={handlePrint} style={{ background: '#10b981', borderColor: '#10b981' }}>
            In Phiếu
          </Button>
        }
      >
          <WarrantyPrintView
            warranty={printingWarranty}
            companyInfo={companyInfo}
            companySettings={companySettings}
            onOrientationChange={setPrintOrientation}
          />
      </Drawer>
    </section>
  )
}
