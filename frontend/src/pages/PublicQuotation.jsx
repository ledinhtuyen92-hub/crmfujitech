import { CheckCircleOutlined, FormOutlined } from '@ant-design/icons'
import { Button, Card, Col, Divider, Form, Input, Row, Typography, message, Result, Tag, Table, Space } from 'antd'
import React, { useCallback, useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import api from '../utils/api'
import QuotationPrintView from '../components/QuotationPrintView'
import { getSafeMediaUrl } from '../utils/mediaUtils'

const { Title, Text } = Typography

export default function PublicQuotation() {
  const { token } = useParams()
  const [quotation, setQuotation] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  
  const [signing, setSigning] = useState(false)
  const [customerName, setCustomerName] = useState('')
  
  const canvasRef = useRef(null)
  const [isDrawing, setIsDrawing] = useState(false)

  const fetchQuotation = useCallback(async () => {
    try {
      const res = await api.get(`/sales/public-quotations/${token}/`)
      setQuotation(res.data)
    } catch (err) {
      if (err.response?.status === 403) {
        setError({ status: '403', title: 'Đã Hết Hạn', message: err.response.data?.detail || 'Báo giá này đã hết hạn truy cập (quá 24h). Vui lòng liên hệ lại nhân viên tư vấn để nhận link mới.' })
      } else {
        setError({ status: '404', title: 'Không tìm thấy', message: 'Báo giá không tồn tại hoặc link không hợp lệ.' })
      }
    } finally {
      setLoading(false)
    }
  }, [token])

  useEffect(() => {
    fetchQuotation()
  }, [fetchQuotation])

  // --- Canvas Logic ---
  const startDrawing = ({ nativeEvent }) => {
    const { offsetX, offsetY } = nativeEvent
    const ctx = canvasRef.current.getContext('2d')
    ctx.beginPath()
    ctx.moveTo(offsetX, offsetY)
    setIsDrawing(true)
  }

  const finishDrawing = () => {
    const ctx = canvasRef.current.getContext('2d')
    ctx.closePath()
    setIsDrawing(false)
  }

  const draw = ({ nativeEvent }) => {
    if (!isDrawing) return
    const { offsetX, offsetY } = nativeEvent
    const ctx = canvasRef.current.getContext('2d')
    ctx.lineTo(offsetX, offsetY)
    ctx.stroke()
  }

  const clearCanvas = () => {
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    ctx.clearRect(0, 0, canvas.width, canvas.height)
  }
  // ---------------------

  const handleSign = async () => {
    if (!customerName.trim()) {
      message.error('Vui lòng nhập họ tên người ký.')
      return
    }
    const canvas = canvasRef.current
    // Check if blank (rudimentary)
    const blank = document.createElement('canvas')
    blank.width = canvas.width
    blank.height = canvas.height
    if (canvas.toDataURL() === blank.toDataURL()) {
      message.error('Vui lòng ký xác nhận vào khung.')
      return
    }

    setSigning(true)
    try {
      const signature_image = canvas.toDataURL('image/png')
      await api.post(`/sales/public-quotations/${token}/`, {
        signature_image,
        customer_name_signed: customerName
      })
      message.success('Cảm ơn bạn đã ký duyệt báo giá!')
      fetchQuotation()
    } catch (err) {
      message.error(err.response?.data?.detail || 'Có lỗi xảy ra khi ký duyệt.')
    } finally {
      setSigning(false)
    }
  }

  if (loading) {
    return <div style={{ padding: 50, textAlign: 'center' }}>Đang tải báo giá...</div>
  }

  if (error) {
    return (
      <div style={{ padding: 50 }}>
        <Result status={error.status} title={error.title} subTitle={error.message} />
      </div>
    )
  }

  const isAccepted = quotation.status === 'accepted'

  const columns = [
    { title: 'Sản phẩm', dataIndex: 'product_name', key: 'product_name' },
    { title: 'SL', dataIndex: 'quantity', key: 'quantity', align: 'center' },
    { title: 'Đơn giá', dataIndex: 'unit_price', key: 'unit_price', align: 'right', render: v => Number(v||0).toLocaleString() + ' đ' },
    { title: 'Thành tiền', key: 'total', align: 'right', render: (_, r) => <Text strong>{(Number(r.quantity)*Number(r.unit_price)).toLocaleString()} đ</Text> }
  ]

  return (
    <div style={{ minHeight: '100vh', background: '#f8fafc', padding: '40px 20px' }}>
      <div style={{ maxWidth: 1200, margin: '0 auto', overflowX: 'auto' }}>
        
        {isAccepted && (
          <AlertBox />
        )}

        <div style={{ background: '#fff', overflowX: 'auto' }}>
          <div style={{ minWidth: 700 }}>
          <QuotationPrintView 
            quotation={quotation} 
            effectiveTemplate={quotation?.custom_data?.template_snapshot}
            renderCustomerSignature={() => (
              isAccepted ? (
                <div style={{ height: 145, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', marginTop: 12 }}>
                  <img src={getSafeMediaUrl(quotation.signature_image)} alt="Customer Sign" style={{ height: 100, borderBottom: '1px solid #e2e8f0', objectFit: 'contain' }} />
                  <div style={{ marginTop: 8 }}>
                    <Text strong style={{ fontSize: 16 }}>{quotation.customer_name_signed}</Text>
                  </div>
                  <Tag color="green" style={{ marginTop: 8 }}>Đã ký ngày: {new Date(quotation.signed_at).toLocaleString('vi-VN')}</Tag>
                </div>
              ) : (
                <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                  <div style={{ width: '100%', maxWidth: 350, textAlign: 'left' }}>
                    <div style={{ border: '2px dashed #cbd5e1', borderRadius: 8, background: '#f8fafc', marginBottom: 12, overflow: 'hidden' }}>
                      <canvas 
                        ref={canvasRef}
                        width={346}
                        height={150}
                        style={{ cursor: 'crosshair', display: 'block', background: '#fff' }}
                        onMouseDown={startDrawing}
                        onMouseUp={finishDrawing}
                        onMouseMove={draw}
                        onMouseLeave={finishDrawing}
                        onTouchStart={(e) => startDrawing({ nativeEvent: { offsetX: e.touches[0].clientX - e.target.getBoundingClientRect().left, offsetY: e.touches[0].clientY - e.target.getBoundingClientRect().top } })}
                        onTouchMove={(e) => draw({ nativeEvent: { offsetX: e.touches[0].clientX - e.target.getBoundingClientRect().left, offsetY: e.touches[0].clientY - e.target.getBoundingClientRect().top } })}
                        onTouchEnd={finishDrawing}
                      />
                    </div>
                    
                    <Space style={{ width: '100%', justifyContent: 'space-between', marginBottom: 16 }}>
                      <Button size="small" onClick={clearCanvas}>Ký lại</Button>
                      <Text type="secondary" style={{ fontSize: 12 }}>Ký vào ô trống phía trên</Text>
                    </Space>

                    <Input 
                      placeholder="Họ và tên người ký..." 
                      size="large"
                      value={customerName}
                      onChange={e => setCustomerName(e.target.value)}
                      style={{ marginBottom: 16 }}
                    />
                    
                    <Button 
                      type="primary" 
                      size="large" 
                      block 
                      icon={<FormOutlined />}
                      onClick={handleSign}
                      loading={signing}
                      style={{ background: '#16a34a', fontWeight: 600 }}
                    >
                      Xác nhận Ký & Duyệt Báo Giá
                    </Button>
                  </div>
                </div>
              )
            )}
          />
          </div>
        </div>
      </div>
    </div>
  )
}

function AlertBox() {
  return (
    <div style={{ background: '#dcfce7', border: '1px solid #bbf7d0', padding: 16, borderRadius: 8, marginBottom: 24, display: 'flex', alignItems: 'center' }}>
      <CheckCircleOutlined style={{ color: '#16a34a', fontSize: 24, marginRight: 16 }} />
      <div>
        <Text strong style={{ color: '#166534', fontSize: 16, display: 'block' }}>Báo giá đã được chấp thuận!</Text>
        <Text style={{ color: '#15803d' }}>Báo giá này đã được khách hàng ký duyệt và có hiệu lực thi hành.</Text>
      </div>
    </div>
  )
}
