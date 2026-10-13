import React from 'react'
import { Typography } from 'antd'
import dayjs from 'dayjs'
import 'dayjs/locale/vi'
import { getSafeMediaUrl } from '../utils/mediaUtils'

dayjs.locale('vi')

const { Title, Text } = Typography

const ReceiptPrintView = React.forwardRef(({ receipt, company, order }, ref) => {
  if (!receipt || !company) return null

  return (
    <div
      ref={ref}
      style={{
        padding: '40px',
        background: '#fff',
        color: '#000',
        fontFamily: '"Times New Roman", Times, serif',
        lineHeight: '1.6',
        margin: '0 auto',
      }}
      className="printable-receipt-content"
    >
      {/* HEADER */}
      {/* HEADER */}
      <div style={{ display: 'flex', alignItems: 'flex-start', marginBottom: 32 }}>
        <div style={{ display: 'flex', gap: '16px', alignItems: 'flex-start' }}>
          {company.logo && (
            <img
              src={getSafeMediaUrl(company.logo)}
              alt="Logo"
              style={{ width: 80, height: 80, objectFit: 'contain' }}
            />
          )}
          <div>
            <Text strong style={{ fontSize: 16, textTransform: 'uppercase', display: 'block' }}>
              {company.name}
            </Text>
            <Text style={{ fontSize: 14, display: 'block' }}>
              Địa chỉ: {company.address || '...................................................'}
            </Text>
            <Text style={{ fontSize: 14, display: 'block' }}>
              Điện thoại: {company.phone || '......................'} - MST: {company.tax_code || '......................'}
            </Text>
          </div>
        </div>
      </div>

      {/* TITLE */}
      <div style={{ textAlign: 'center', marginBottom: 32 }}>
        <Title level={2} style={{ margin: 0, textTransform: 'uppercase', fontFamily: '"Times New Roman", Times, serif', letterSpacing: '1px' }}>
          PHIẾU THU
        </Title>
        <Text style={{ fontSize: 15, fontStyle: 'italic' }}>
          Ngày {dayjs(receipt.payment_date).format('DD')} tháng {dayjs(receipt.payment_date).format('MM')} năm {dayjs(receipt.payment_date).format('YYYY')}
        </Text>
        <div style={{ marginTop: 8 }}>
          <Text style={{ fontSize: 14 }}>Số: <Text strong>{receipt.receipt_code}</Text></Text>
        </div>
      </div>

      {/* BODY */}
      <div style={{ fontSize: 16, marginBottom: 40 }}>
        <div style={{ marginBottom: 8 }}>
          Họ và tên người nộp tiền: <Text strong>{order?.customer_name || '..................................................................................'}</Text>
        </div>
        <div style={{ marginBottom: 8 }}>
          Địa chỉ / Số điện thoại: {order?.customer_phone || '.........................................................................................'}
        </div>
        <div style={{ marginBottom: 8 }}>
          Lý do nộp: {receipt.note || `Thanh toán cho đơn hàng ${order?.order_number || ''}`}
        </div>
        <div style={{ marginBottom: 8 }}>
          Số tiền: <Text strong style={{ fontSize: 18 }}>{Number(receipt.amount).toLocaleString('vi-VN')} VNĐ</Text>
        </div>
        <div style={{ marginBottom: 8 }}>
          Hình thức: {receipt.payment_method === 'cash' ? 'Tiền mặt' : receipt.payment_method === 'transfer' ? 'Chuyển khoản' : 'Thẻ / POS'}
          {receipt.reference_code && ` (Mã GD: ${receipt.reference_code})`}
        </div>
      </div>

      {/* SIGNATURES */}
      <table style={{ width: '100%', marginTop: 30, textAlign: 'center', fontSize: 15, borderCollapse: 'collapse' }}>
        <tbody>
          <tr>
            <td style={{ width: '25%', verticalAlign: 'top' }}>
              <Text strong style={{ display: 'block' }}>{company?.director_title || 'Giám đốc'}</Text>
              <Text style={{ fontStyle: 'italic' }}>(Ký, họ tên, đóng dấu)</Text>
              <div style={{ position: 'relative', height: 120, marginTop: 10, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                {company?.stamp_image && (
                  <img src={getSafeMediaUrl(company.stamp_image)} alt="Stamp" style={{ position: 'absolute', maxWidth: 120, maxHeight: 120, opacity: 0.8, zIndex: 1 }} />
                )}
                {company?.director_signature && (
                  <img src={getSafeMediaUrl(company.director_signature)} alt="Signature" style={{ position: 'absolute', maxWidth: 100, maxHeight: 80, zIndex: 2 }} />
                )}
              </div>
              {company?.director_name && <Text strong>{company.director_name}</Text>}
            </td>
            <td style={{ width: '25%', verticalAlign: 'top' }}>
              <Text strong style={{ display: 'block' }}>Kế toán trưởng</Text>
              <Text style={{ fontStyle: 'italic' }}>(Ký, họ tên)</Text>
              <div style={{ height: 100, marginTop: 10 }}></div>
            </td>
            <td style={{ width: '25%', verticalAlign: 'top' }}>
              <Text strong style={{ display: 'block' }}>Người nộp tiền</Text>
              <Text style={{ fontStyle: 'italic' }}>(Ký, họ tên)</Text>
              <div style={{ height: 100, marginTop: 10 }}></div>
              <Text strong>{order?.customer_name}</Text>
            </td>
            <td style={{ width: '25%', verticalAlign: 'top' }}>
              <Text strong style={{ display: 'block' }}>Người lập phiếu</Text>
              <Text style={{ fontStyle: 'italic' }}>(Ký, họ tên)</Text>
              <div style={{ height: 100, marginTop: 10 }}></div>
              <Text strong>{receipt.created_by_name}</Text>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  )
})

export default ReceiptPrintView
