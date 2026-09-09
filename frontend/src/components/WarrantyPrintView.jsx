import React, { useState, useEffect, useRef } from 'react'
import { Row, Col, Typography, Slider, Switch, Radio } from 'antd'
import { ColumnWidthOutlined, ColumnHeightOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'

const { Title, Text } = Typography

// A4 printable height in px at 96dpi (minus typical 12mm top+bottom margins)
const A4_PORTRAIT_HEIGHT  = 1032  // 297mm − 24mm margins ≈ 273mm × 3.78px/mm
const A4_LANDSCAPE_HEIGHT = 703   // 210mm − 24mm margins ≈ 186mm × 3.78px/mm

export default function WarrantyPrintView({
  warranty,
  companyInfo,
  companySettings,
  onOrientationChange,
}) {
  const [scale, setScale] = useState(1)
  const [showPageBreaks, setShowPageBreaks] = useState(false)
  const [zoomedHeight, setZoomedHeight] = useState(0)
  const [orientation, setOrientation] = useState('landscape') // 'landscape' | 'portrait'
  const contentRef = useRef(null)

  const isLandscape = orientation === 'landscape'
  const A4_PRINTABLE_HEIGHT = isLandscape ? A4_LANDSCAPE_HEIGHT : A4_PORTRAIT_HEIGHT

  useEffect(() => {
    if (!contentRef.current) return
    const observer = new ResizeObserver(() => {
      if (contentRef.current)
        setZoomedHeight(contentRef.current.getBoundingClientRect().height)
    })
    observer.observe(contentRef.current)
    setZoomedHeight(contentRef.current.getBoundingClientRect().height)
    return () => observer.disconnect()
  }, [scale, orientation])

  const estimatedPages = Math.max(1, Math.ceil(zoomedHeight / A4_PRINTABLE_HEIGHT))

  const handleOrientationChange = (val) => {
    setOrientation(val)
    onOrientationChange?.(val)
  }

  if (!warranty) return null

  const displayContent = warranty.warranty_content || companySettings?.default_warranty_content || ''
  const displayRules   = warranty.warranty_rules   || companySettings?.default_warranty_rules   || ''

  const renderLines = (text) => {
    if (!text) return null
    return text.split('\n').map((line, i) => (
      <span key={i}>{line}<br /></span>
    ))
  }

  // Col span: landscape → 2 cột cố định 50/50; portrait → 1 cột (xuống dòng)
  const colProps = isLandscape ? { span: 12 } : { span: 24 }

  return (
    <div>
      {/* ── Toolbar (No Print) ──────────────────────────────────── */}
      <div
        className="no-print"
        style={{
          marginBottom: 16,
          display: 'flex',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 12,
          background: '#f8fafc',
          padding: '8px 16px',
          borderRadius: 8,
          border: '1px solid #e2e8f0',
        }}
      >
        {/* Orientation */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontWeight: 600, color: '#334155' }}>Khổ giấy:</span>
          <Radio.Group
            value={orientation}
            onChange={(e) => handleOrientationChange(e.target.value)}
            optionType="button"
            buttonStyle="solid"
            size="small"
          >
            <Radio.Button value="landscape">
              <ColumnWidthOutlined /> Ngang (A4)
            </Radio.Button>
            <Radio.Button value="portrait">
              <ColumnHeightOutlined /> Dọc (A4)
            </Radio.Button>
          </Radio.Group>
        </div>

        <div style={{ borderLeft: '1px solid #cbd5e1', paddingLeft: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontWeight: 600, color: '#334155' }}>Thu phóng:</span>
          <Slider
            min={0.5}
            max={1.5}
            step={0.05}
            value={scale}
            onChange={setScale}
            style={{ width: 130, margin: 0 }}
            tooltip={{ formatter: (v) => `${Math.round(v * 100)}%` }}
          />
          <span style={{ minWidth: 42, fontWeight: 600, color: '#1649c9' }}>
            {Math.round(scale * 100)}%
          </span>
        </div>

        <div style={{ borderLeft: '1px solid #cbd5e1', paddingLeft: 12, fontWeight: 600, color: '#0f172a' }}>
          Dự kiến in: <span style={{ color: '#16a34a' }}>{estimatedPages} trang A4</span>
        </div>

        <div style={{ borderLeft: '1px solid #cbd5e1', paddingLeft: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontWeight: 600, color: '#334155' }}>Xem trước cắt trang:</span>
          <Switch size="small" checked={showPageBreaks} onChange={setShowPageBreaks} />
        </div>
      </div>

      {/* ── Printable Content ─────────────────────────────────── */}
      {/* Paper preview wrapper - visual only, no-print */}
      <div
        className="no-print"
        style={{
          background: '#e2e8f0',
          padding: '16px',
          borderRadius: 8,
          display: 'flex',
          justifyContent: 'center',
          overflowX: 'auto',
          // Paper frame: portrait tall, landscape wide
          minHeight: isLandscape ? undefined : 600,
        }}
      >
      <div
        ref={contentRef}
        className="warranty-print-container"
        data-orientation={orientation}
        data-scale={scale}
        style={{
          background: '#fff',
          fontFamily: "'Inter', sans-serif",
          zoom: scale,
          position: 'relative',
          padding: isLandscape ? '16px 24px' : '24px 32px',
          width: isLandscape ? '940px' : '660px',
          boxShadow: '0 4px 16px rgba(0,0,0,0.15)',
          flexShrink: 0,
        }}
      >
        {/* Page-break guides */}
        {showPageBreaks && zoomedHeight > 0 &&
          Array.from({ length: estimatedPages - 1 }).map((_, i) => (
            <div
              key={i}
              className="no-print"
              style={{
                position: 'absolute',
                top: ((i + 1) * A4_PRINTABLE_HEIGHT) / scale,
                left: -20,
                right: -20,
                borderTop: '2px dashed #ef4444',
                zIndex: 999,
                opacity: 0.7,
                pointerEvents: 'none',
              }}
            />
          ))}

        {/* ── Header ───────────── */}
        <div
          style={{
            background: '#1e3a8a',
            color: '#fff',
            padding: isLandscape ? '16px 24px' : '20px 28px',
            borderRadius: 8,
            marginBottom: isLandscape ? 16 : 24,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
          }}
        >
          <div style={{ flex: 1, paddingRight: 20 }}>
            {companyInfo?.logo ? (
              <img
                src={companyInfo.logo}
                alt="Logo"
                style={{ maxHeight: isLandscape ? 50 : 60, marginBottom: 8, background: '#fff', padding: 3, borderRadius: 4 }}
              />
            ) : (
              <Title level={4} style={{ color: '#fff', margin: 0, marginBottom: 6, textTransform: 'uppercase' }}>
                {companyInfo?.name || 'CÔNG TY TNHH ABC'}
              </Title>
            )}
            <div style={{ fontSize: isLandscape ? 11 : 12, lineHeight: 1.5, opacity: 0.9 }}>
              <div>{companyInfo?.address}</div>
              <div>Hotline: {companyInfo?.phone}</div>
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <Title level={1} style={{ color: '#fff', margin: 0, fontWeight: 800, fontSize: isLandscape ? 28 : 32, letterSpacing: 1 }}>
              PHIẾU BẢO HÀNH
            </Title>
            <Text style={{ color: '#bfdbfe', fontSize: isLandscape ? 12 : 14 }}>
              Mã BH: {warranty.warranty_code || '---'}
            </Text>
          </div>
        </div>

        {/* ── Body ───────────── */}
        <Row gutter={isLandscape ? 24 : 32}>
          {/* Cột trái: Thông tin khách hàng + Nội dung */}
          <Col {...colProps}>
            <Title level={4} style={{ textAlign: 'center', marginBottom: 10, color: '#1e3a8a', fontWeight: 800, fontSize: isLandscape ? 13 : 16 }}>
              THÔNG TIN
            </Title>

            <div style={{ background: '#1e3a8a', color: '#fff', padding: '3px 10px', borderRadius: 4, display: 'inline-block', fontWeight: 'bold', marginBottom: 8, fontSize: isLandscape ? 11 : 13 }}>
              KHÁCH HÀNG
            </div>

            <table style={{ width: '100%', marginBottom: 12, borderCollapse: 'collapse', fontSize: isLandscape ? 11 : 13, lineHeight: isLandscape ? 1.5 : 1.7 }}>
              <tbody>
                <tr>
                  <td style={{ width: 100, fontWeight: 600 }}>Họ và tên:</td>
                  <td style={{ borderBottom: '1px dotted #ccc' }}>{warranty.customer_name}</td>
                </tr>
                <tr>
                  <td style={{ fontWeight: 600 }}>SĐT:</td>
                  <td style={{ borderBottom: '1px dotted #ccc' }}>{warranty.customer_phone || '.........................'}</td>
                </tr>
                <tr>
                  <td style={{ fontWeight: 600, verticalAlign: 'top' }}>Địa chỉ:</td>
                  <td style={{ borderBottom: '1px dotted #ccc' }}>{warranty.customer?.address || '........................................................'}</td>
                </tr>
                <tr>
                  <td style={{ fontWeight: 600 }}>Mã Đơn hàng:</td>
                  <td style={{ borderBottom: '1px dotted #ccc' }}>{warranty.order_number || '.........................'}</td>
                </tr>
                <tr>
                  <td style={{ fontWeight: 600, color: '#ef4444' }}>Ngày bàn giao:</td>
                  <td style={{ borderBottom: '1px dotted #ccc', color: '#ef4444', fontWeight: 600 }}>
                    {warranty.start_date ? dayjs(warranty.start_date).format('DD/MM/YYYY') : '.........................'}
                  </td>
                </tr>
                <tr>
                  <td style={{ fontWeight: 600, color: '#ef4444' }}>Hạn bảo hành:</td>
                  <td style={{ borderBottom: '1px dotted #ccc', color: '#ef4444', fontWeight: 600 }}>
                    {warranty.end_date ? dayjs(warranty.end_date).format('DD/MM/YYYY') : '.........................'}
                  </td>
                </tr>
              </tbody>
            </table>

            <div style={{ background: '#1e3a8a', color: '#fff', padding: '3px 10px', borderRadius: 4, display: 'inline-block', fontWeight: 'bold', marginBottom: 8, fontSize: isLandscape ? 11 : 13 }}>
              NỘI DUNG BẢO HÀNH
            </div>
            <div style={{ fontSize: isLandscape ? 10 : 12, lineHeight: 1.4, textAlign: 'justify', border: '1px solid #e2e8f0', padding: '6px 8px', borderRadius: 6, background: '#f8fafc' }}>
              {renderLines(displayContent)}
            </div>
          </Col>

          {/* Cột phải: Quy định + Chữ ký */}
          <Col {...colProps}>
            <Title level={4} style={{ textAlign: 'center', marginBottom: 8, color: '#1e3a8a', fontWeight: 800, fontSize: isLandscape ? 13 : 16 }}>
              QUY ĐỊNH BẢO HÀNH
            </Title>
            <div style={{ fontSize: isLandscape ? 10 : 12, lineHeight: 1.4, textAlign: 'justify', border: '1px solid #e2e8f0', padding: '6px 8px', borderRadius: 6, background: '#fff' }}>
              {renderLines(displayRules)}
            </div>

            {/* Chữ ký */}
            <div style={{ marginTop: isLandscape ? 16 : 24, textAlign: 'center', pageBreakInside: 'avoid' }}>
              <Text strong style={{ fontSize: isLandscape ? 13 : 16, display: 'block', color: '#1e3a8a' }}>
                {companyInfo?.director_title || 'ĐẠI DIỆN CÔNG TY'}
              </Text>
              <Text type="secondary" style={{ fontSize: 12, fontStyle: 'italic' }}>(Ký, đóng dấu)</Text>
              <div style={{ height: isLandscape ? 90 : 120, display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', marginTop: 6 }}>
                {companyInfo?.stamp_image && (
                  <img
                    src={companyInfo.stamp_image}
                    alt="Stamp"
                    style={{ height: isLandscape ? 80 : 110, maxWidth: 140, position: 'absolute', top: 5, left: '50%', transform: 'translateX(-50%)', opacity: 0.88, zIndex: 1, objectFit: 'contain' }}
                  />
                )}
                {companyInfo?.director_signature && (
                  <img
                    src={companyInfo.director_signature}
                    alt="Signature"
                    style={{ height: isLandscape ? 70 : 90, maxWidth: 160, position: 'relative', zIndex: 2, objectFit: 'contain' }}
                  />
                )}
              </div>
              <Text strong style={{ fontSize: isLandscape ? 13 : 15, display: 'block', marginTop: 6, color: '#1e3a8a' }}>
                {companyInfo?.director_name || ''}
              </Text>
            </div>
          </Col>
        </Row>
      </div>
      </div> {/* end paper preview wrapper */}
    </div>
  )
}