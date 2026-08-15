import React from 'react';
import { Row, Col, Divider, Typography } from 'antd';

const { Text } = Typography;

// Constant block types (must match builder)
const BLOCK_TYPES = {
  TEXT: 'rich_text',
  IMAGE: 'image',
  CUSTOMER_INFO: 'customer_info',
  PRODUCT_TABLE: 'product_table',
  TOTALS: 'totals',
  SIGNATURES: 'signatures',
  DIVIDER: 'divider',
  LAYOUT_ROW: 'layout_row'
};

/**
 * QuotationRenderer takes the layout_config JSON and actual data (customer, items, totals)
 * and renders the final read-only HTML view.
 */
export default function QuotationRenderer({ layoutConfig, data }) {
  if (!layoutConfig || !Array.isArray(layoutConfig.blocks)) {
    return <div style={{ padding: 20, textAlign: 'center' }}>Mẫu báo giá chưa được thiết kế.</div>;
  }

  const { customer, items, totals, company } = data || {};

  const renderBlock = (block) => {
    const clr = block.props.themeColor || '#1649c9';
    switch (block.type) {
      case BLOCK_TYPES.HEADER_LOGO:
        return (
          <div style={{ padding: '14px 18px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8 }}>
            <Row justify="space-between" align="middle">
              <Col xs={24} md={8}>
                <div style={{ width: 56, height: 56, borderRadius: 6, background: '#e0e7ff', color: clr, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 16 }}>
                  LOGO
                </div>
              </Col>
              <Col xs={24} md={16} style={{ textAlign: 'right' }}>
                <div style={{ fontWeight: 700, color: clr, fontSize: 16 }}>{block.props.companyName}</div>
                <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>MST: {block.props.taxCode} • Hotline: {block.props.phone}</div>
                <div style={{ fontSize: 12, color: '#64748b' }}>Địa chỉ: {block.props.address}</div>
              </Col>
            </Row>
          </div>
        );

      case BLOCK_TYPES.TITLE:
        return (
          <div style={{ textAlign: 'center', margin: '18px 0' }}>
            <div style={{ fontSize: 20, fontWeight: 700, color: clr, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              {block.props.title}
            </div>
            {block.props.showDate && (
              <div style={{ display: 'inline-block', background: '#eff6ff', padding: '2px 12px', borderRadius: 12, border: '1px solid #bfdbfe', fontSize: 12, color: '#1d4ed8', margin: '6px 0' }}>
                Số: <strong>BG-001</strong> | Ngày: <strong>{new Date().toLocaleDateString('vi-VN')}</strong>
              </div>
            )}
            <div style={{ fontSize: 12.5, fontStyle: 'italic', color: '#475569', marginTop: 4 }}>
              {block.props.subtitle}
            </div>
          </div>
        );

      case BLOCK_TYPES.TEXT:
        let htmlContent = block.props.content || '';
        if (customer) {
          htmlContent = htmlContent.replace('{{customer_name}}', customer.name || '');
        }
        return <div dangerouslySetInnerHTML={{ __html: htmlContent }} style={{ textAlign: block.props.textAlign }} />;
        
      case BLOCK_TYPES.IMAGE:
        return block.props.url ? (
          <div style={{ textAlign: block.props.align }}>
            <img src={block.props.url} alt="Logo" style={{ width: block.props.width, maxWidth: '100%' }} />
          </div>
        ) : null;
        
      case BLOCK_TYPES.CUSTOMER_INFO:
        const custName = customer?.name || '[Tên khách hàng]';
        const custPhone = customer?.phone || '[Số điện thoại]';
        const custAddress = customer?.address || '[Địa chỉ]';
        const custTax = customer?.tax_code || '[Mã số thuế]';
        return (
          <Row gutter={16} style={{ marginBottom: 16 }}>
            <Col xs={24} md={block.props.columns === 1 ? 24 : 12} style={{ marginBottom: block.props.columns === 1 ? 16 : 0 }}>
              <div style={{ padding: '10px 14px', background: '#f8fafc', border: `1px solid ${clr}40`, borderRadius: 6, height: '100%' }}>
                <div style={{ fontWeight: 700, color: clr, fontSize: 13, marginBottom: 4 }}>🔹 BÊN BÁN (BÊN B): {block.props.companyName || 'CÔNG TY CỦA BẠN'}</div>
                <div style={{ fontSize: 12, color: '#334155' }}><strong>Đại diện:</strong> Nguyễn Anh Tuấn • <strong>Chức vụ:</strong> Giám đốc</div>
                <div style={{ fontSize: 12, color: '#334155' }}><strong>Mã số thuế:</strong> 0111100289 • <strong>Điện thoại:</strong> 0961442882</div>
                <div style={{ fontSize: 12, color: '#334155' }}><strong>Địa chỉ:</strong> KĐT Xa La, Hà Đông, TP Hà Nội</div>
              </div>
            </Col>
            <Col xs={24} md={block.props.columns === 1 ? 24 : 12}>
              <div style={{ padding: '10px 14px', background: '#fff', border: '1px solid #e2e8f0', borderRadius: 6, height: '100%' }}>
                <div style={{ fontWeight: 700, color: '#0f172a', fontSize: 13, marginBottom: 4 }}>🔸 BÊN MUA (BÊN A): CÔNG TY KHÁCH HÀNG</div>
                <div style={{ fontSize: 12, color: '#334155' }}><strong>Khách hàng:</strong> {custName}</div>
                <div style={{ fontSize: 12, color: '#334155' }}><strong>Mã số thuế:</strong> {custTax} • <strong>Điện thoại:</strong> {custPhone}</div>
                <div style={{ fontSize: 12, color: '#334155' }}><strong>Địa chỉ:</strong> {custAddress}</div>
              </div>
            </Col>
          </Row>
        );

      case BLOCK_TYPES.PRODUCT_TABLE:
        const tableData = items || [];
        return (
          <div style={{ marginBottom: 16 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ background: '#fafafa' }}>
                  {block.props.columns?.includes('stt') && <th style={{ border: '1px solid #e2e8f0', padding: '8px 4px', color: clr }}>STT</th>}
                  {block.props.columns?.includes('name') && <th style={{ border: '1px solid #e2e8f0', padding: '8px 4px' }}>Tên hàng hóa / Dịch vụ</th>}
                  {block.props.columns?.includes('unit') && <th style={{ border: '1px solid #e2e8f0', padding: '8px 4px' }}>ĐVT</th>}
                  {block.props.columns?.includes('qty') && <th style={{ border: '1px solid #e2e8f0', padding: '8px 4px' }}>SL</th>}
                  {block.props.columns?.includes('price') && <th style={{ border: '1px solid #e2e8f0', padding: '8px 4px' }}>Đơn giá</th>}
                  {block.props.columns?.includes('total') && <th style={{ border: '1px solid #e2e8f0', padding: '8px 4px' }}>Thành tiền</th>}
                </tr>
              </thead>
              <tbody>
                {tableData.length === 0 ? (
                  <tr><td colSpan={6} style={{ border: '1px solid #e2e8f0', padding: 8, textAlign: 'center', color: '#888' }}>[Danh sách sản phẩm trống]</td></tr>
                ) : (
                  tableData.map((item, index) => (
                    <tr key={index}>
                      {block.props.columns?.includes('stt') && <td style={{ border: '1px solid #e2e8f0', padding: 8, textAlign: 'center', fontWeight: 600, color: clr }}>{index + 1}</td>}
                      {block.props.columns?.includes('name') && <td style={{ border: '1px solid #e2e8f0', padding: 8 }}><strong style={{ color: '#1e293b' }}>{item.product_name}</strong></td>}
                      {block.props.columns?.includes('unit') && <td style={{ border: '1px solid #e2e8f0', padding: 8, textAlign: 'center' }}>{item.unit}</td>}
                      {block.props.columns?.includes('qty') && <td style={{ border: '1px solid #e2e8f0', padding: 8, textAlign: 'center' }}>{item.quantity}</td>}
                      {block.props.columns?.includes('price') && <td style={{ border: '1px solid #e2e8f0', padding: 8, textAlign: 'right' }}>{Number(item.unit_price).toLocaleString()} đ</td>}
                      {block.props.columns?.includes('total') && <td style={{ border: '1px solid #e2e8f0', padding: 8, textAlign: 'right' }}><strong style={{ color: clr }}>{Number(item.total_price).toLocaleString()} đ</strong></td>}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        );

      case BLOCK_TYPES.TOTALS:
        const subtotal = totals?.subtotal || 0;
        const discount = totals?.discount || 0;
        const vat = totals?.vat || 0;
        const grandTotal = totals?.grandTotal || 0;
        return (
          <Row justify="end" style={{ marginBottom: 16 }}>
            <Col xs={24} md={11} style={{ textAlign: 'right', padding: '10px 14px', background: '#f8fafc', borderRadius: 6, border: '1px solid #e2e8f0' }}>
              {block.props.showSubtotal && <div style={{ fontSize: 12, color: '#64748b' }}>Cộng tiền hàng: {Number(subtotal).toLocaleString()} đ</div>}
              {block.props.showDiscount && <div style={{ fontSize: 12, color: '#64748b' }}>Chiết khấu chung: {Number(discount).toLocaleString()} đ</div>}
              {block.props.showVAT && <div style={{ fontSize: 12, color: '#64748b' }}>Thuế GTGT (VAT): {Number(vat).toLocaleString()} đ</div>}
              <div style={{ fontSize: 15, fontWeight: 700, color: clr, marginTop: 4 }}>
                TỔNG THANH TOÁN: {Number(grandTotal).toLocaleString()} đ
              </div>
              {block.props.showWords && <div style={{ fontStyle: 'italic', fontSize: 12, marginTop: 4, color: '#334155' }}>Bằng chữ: ...</div>}
            </Col>
          </Row>
        );

      case BLOCK_TYPES.TERMS:
        return (
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontWeight: 600, color: '#0f172a', fontSize: 13, marginBottom: 6 }}>📝 Ghi chú & Điều khoản thanh toán:</div>
            <div style={{ background: '#f8fafc', padding: '10px 14px', borderRadius: 6, borderLeft: `4px solid ${clr}`, whiteSpace: 'pre-wrap', fontSize: 12, color: '#334155' }}>
              {block.props.content}
            </div>
            <div style={{ fontSize: 11, color: '#94a3b8', fontStyle: 'italic', marginTop: 4 }}>
              * Lưu ý: Khi áp dụng, Admin Công ty có thể tùy chỉnh điều khoản và số tài khoản ngân hàng riêng của công ty họ.
            </div>
          </div>
        );

      case BLOCK_TYPES.SIGNATURES:
        return (
          <Row justify="space-around" style={{ marginTop: 24, textAlign: 'center', paddingBottom: 16 }}>
            {Array.from({ length: block.props.columns || 2 }).map((_, idx) => (
              <Col xs={24} md={24 / (block.props.columns || 2)} key={idx}>
                <div style={{ fontWeight: 700, color: clr, fontSize: 13 }}>{block.props.titles?.[idx] || 'CHỮ KÝ'}</div>
                <div style={{ fontSize: 11, color: '#64748b', fontStyle: 'italic' }}>(Ký, đóng dấu & ghi rõ họ tên)</div>
                <div style={{ height: 60 }} />
                {idx === 0 && <div style={{ fontWeight: 600, color: '#334155', fontSize: 12 }}>Người lập báo giá</div>}
              </Col>
            ))}
          </Row>
        );

      case BLOCK_TYPES.DIVIDER:
        return <Divider type="horizontal" style={{ borderTopWidth: block.props.thickness, borderColor: block.props.color, margin: `${block.props.margin}px 0` }} />;
      
      case BLOCK_TYPES.LAYOUT_ROW:
        return (
          <Row gutter={block.props.gap || 16}>
            {Array.from({ length: block.props.columns || 2 }).map((_, idx) => (
              <Col span={24 / (block.props.columns || 2)} key={idx}>
                {/* Normally we would render nested blocks here if supported */}
              </Col>
            ))}
          </Row>
        );

      default:
        return null;
    }
  };

  return (
    <div style={{ fontFamily: 'Arial, sans-serif' }}>
      {layoutConfig.blocks.map((block) => (
        <div key={block.id} style={{ marginBottom: 16 }}>
          {renderBlock(block)}
        </div>
      ))}
    </div>
  );
}
