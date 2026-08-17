import React from 'react';
import { Typography, Row, Col, Divider } from 'antd';
import { BLOCK_TYPES } from '../pages/admin/builder/constants';
import { parseVariables } from '../utils/templateVariables';

const ChuSo = ["không", "một", "hai", "ba", "bốn", "năm", "sáu", "bảy", "tám", "chín"];
const Tien = ["", " nghìn", " triệu", " tỷ", " nghìn tỷ", " triệu tỷ"];

function docSo(so) {
    if (so === 0) return "Không đồng";
    let str = parseInt(so).toString();
    let result = "";
    let len = str.length;
    let i = 0;
    while (i < len) {
        let n = parseInt(str[i]);
        let p = len - i - 1;
        let t = p % 3;
        if (n === 0) {
            if (t === 0 && p > 0 && (parseInt(str[i-1]) !== 0 || parseInt(str[i-2]) !== 0)) {
                result += Tien[p/3] + " ";
            } else if (t === 1 && parseInt(str[i+1]) !== 0) {
                result += "lẻ ";
            } else if (t === 2 && (parseInt(str[i+1]) !== 0 || parseInt(str[i+2]) !== 0)) {
                result += "không trăm ";
            }
        } else {
            if (t === 1 && n === 1) {
                result += "mười ";
            } else {
                if (n === 5 && t === 0 && i > 0 && parseInt(str[i-1]) !== 0) {
                    result += "lăm ";
                } else if (n === 1 && t === 0 && i > 0 && parseInt(str[i-1]) !== 0 && parseInt(str[i-1]) !== 1) {
                    result += "mốt ";
                } else {
                    result += ChuSo[n] + " ";
                }
                if (t === 2) result += "trăm ";
                if (t === 1 && n !== 1) result += "mươi ";
            }
            if (t === 0) result += Tien[p/3] + " ";
        }
        i++;
    }
    result = result.trim() + " đồng.";
    return result.charAt(0).toUpperCase() + result.slice(1);
}

const { Text } = Typography;

const computeLineTotal = (item) => {
  const qty = Number(item.quantity || 1)
  const price = Number(item.unit_price || 0)
  const discount = Number(item.discount_percent || 0)
  const area = Number(item.area || 0)
  if ((item.unit === 'm²' || item.custom_data?.unit === 'm²' || (area > 0 && item.width > 0 && item.height > 0)) && area > 0) {
    return Number((area * qty * price * (1 - discount / 100)).toFixed(0))
  }
  return Number((qty * price * (1 - discount / 100)).toFixed(0))
};

const computeRowSpan = (data, index, field = 'product') => {
  if (!data || !data[index]) return 1
  if (data[index].item_type === 'service') return 1
  const currentVal = data[index]?.[field]
  if (!currentVal) return 1
  if (index > 0 && data[index - 1]?.[field] === currentVal && data[index - 1].item_type !== 'service') {
    return 0
  }
  let count = 1
  for (let i = index + 1; i < data.length; i++) {
    if (data[i]?.[field] === currentVal) {
      count++
    } else {
      break
    }
  }
  return count
};

const computeProductSTT = (data, index, field = 'product') => {
  if (!data) return 0
  let count = 0
  for (let i = 0; i <= index; i++) {
    if (data[i].item_type === 'service') {
      count++
    } else if (i === 0 || data[i]?.[field] !== data[i - 1]?.[field] || data[i - 1]?.item_type === 'service') {
      count++
    }
  }
  return count
};

/**
 * QuotationRenderer takes the layout_config JSON and actual data (customer, items, totals)
 * and renders the final read-only HTML view.
 */
export default function QuotationRenderer({ layoutConfig, layoutStyle, data }) {
  if (!layoutConfig || !Array.isArray(layoutConfig.blocks)) {
    return <div style={{ padding: 20, textAlign: 'center' }}>Mẫu báo giá chưa được thiết kế.</div>;
  }

  const allBlocks = layoutConfig.blocks;
  const { customer, items, totals, company } = data || {};

  const renderBlock = (block) => {
    const clr = block.props.themeColor || layoutConfig.theme_color || '#1649c9';
    const isNoBorder = layoutConfig.table_style === 'modern_navy';
    const hideAllBorders = block.props.showBorder === false;
    const thStyle = { 
      border: hideAllBorders || isNoBorder ? 'none' : '1px solid #e2e8f0', 
      borderBottom: hideAllBorders ? 'none' : '1px solid #e2e8f0',
      padding: '8px 4px' 
    };
    const tdStyle = { 
      border: hideAllBorders || isNoBorder ? 'none' : '1px solid #e2e8f0',
      borderBottom: hideAllBorders ? 'none' : '1px solid #e2e8f0',
      padding: '8px 4px',
      verticalAlign: 'middle'
    };
    switch (block.type) {
      case BLOCK_TYPES.HEADER_LOGO:
        let finalLogoUrl = block.props.logoUrl;
        if (finalLogoUrl === '{{company_logo}}') finalLogoUrl = company?.logo || data?.company_info?.logo;
        else if (!finalLogoUrl) finalLogoUrl = company?.logo || data?.company_info?.logo;
        
        return (
          <div style={{ padding: '14px 18px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8 }}>
            <Row justify="space-between" align="middle">
              <Col xs={24} md={8} style={{ textAlign: 'left' }}>
                {finalLogoUrl ? (
                  <img
                    src={finalLogoUrl}
                    alt="Logo"
                    style={{ maxHeight: 75, maxWidth: '100%', objectFit: 'contain', borderRadius: 4 }}
                  />
                ) : (
                  <div style={{ width: 56, height: 56, borderRadius: 6, background: '#e0e7ff', color: clr, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 16 }}>
                    LOGO
                  </div>
                )}
              </Col>
              <Col xs={24} md={16} style={{ textAlign: 'right' }}>
                <div style={{ fontWeight: 700, color: clr, fontSize: 16 }}>{parseVariables(block.props.companyName || 'TÊN CÔNG TY', data, company)}</div>
                <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>MST: {parseVariables(block.props.taxCode || '', data, company)} • Hotline: {parseVariables(block.props.phone || '', data, company)}</div>
                <div style={{ fontSize: 12, color: '#64748b' }}>Địa chỉ: {parseVariables(block.props.address || '', data, company)}</div>
              </Col>
            </Row>
          </div>
        );

      case BLOCK_TYPES.TITLE:
        return (
          <div style={{ textAlign: 'center', margin: '18px 0' }}>
            <div style={{ fontSize: 20, fontWeight: 700, color: clr, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              {parseVariables(block.props.title || '', data, company)}
            </div>
            {block.props.showDate && (
              <div style={{ display: 'inline-block', background: '#eff6ff', padding: '2px 12px', borderRadius: 12, border: '1px solid #bfdbfe', fontSize: 12, color: '#1d4ed8', margin: '6px 0' }}>
                Số: <strong>BG-001</strong> | Ngày: <strong>{new Date().toLocaleDateString('vi-VN')}</strong>
              </div>
            )}
            <div style={{ fontSize: 12.5, fontStyle: 'italic', color: '#475569', marginTop: 4 }}>
              {parseVariables(block.props.subtitle || '', data, company)}
            </div>
          </div>
        );

      case BLOCK_TYPES.TEXT:
        let htmlContent = block.props.content || '';
        htmlContent = parseVariables(htmlContent, data, company);
        return <div dangerouslySetInnerHTML={{ __html: htmlContent }} style={{ textAlign: block.props.textAlign }} />;
        
      case BLOCK_TYPES.IMAGE:
        let imgUrl = block.props.url;
        if (imgUrl === '{{company_logo}}') imgUrl = company?.logo || data?.company_info?.logo;
        else if (imgUrl === '{{company_stamp}}') imgUrl = company?.stamp_image || data?.company_info?.stamp_image;
        else if (imgUrl === '{{company_signature}}') imgUrl = company?.director_signature || data?.company_info?.director_signature;

        return imgUrl ? (
          <div style={{ textAlign: block.props.align }}>
            <img src={imgUrl} alt="Image" style={{ width: block.props.width, maxWidth: '100%' }} />
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
              <div style={{ padding: '10px 14px', background: block.props.sellerBackgroundColor || '#f8fafc', border: (block.props.showBorder ?? true) ? `1px solid ${block.props.borderColor || clr + '40'}` : 'none', borderRadius: 6, height: '100%' }}>
                <div style={{ fontWeight: 700, color: clr, fontSize: 13, marginBottom: 4 }}>BÊN BÁN (BÊN B): {parseVariables(block.props.companyName || 'CÔNG TY CỦA BẠN', data, company)}</div>
                <div style={{ fontSize: 12, color: '#334155' }}><strong>Đại diện:</strong> {parseVariables(block.props.representative || 'Nguyễn Anh Tuấn', data, company)} • <strong>Chức vụ:</strong> {parseVariables(block.props.position || 'Giám đốc', data, company)}</div>
                <div style={{ fontSize: 12, color: '#334155' }}><strong>Mã số thuế:</strong> {parseVariables(block.props.taxCode || '', data, company)} • <strong>Điện thoại:</strong> {parseVariables(block.props.phone || '', data, company)}</div>
                <div style={{ fontSize: 12, color: '#334155' }}><strong>Địa chỉ:</strong> {parseVariables(block.props.address || '', data, company)}</div>
              </div>
            </Col>
            <Col xs={24} md={block.props.columns === 1 ? 24 : 12}>
              <div style={{ padding: '10px 14px', background: block.props.buyerBackgroundColor || '#fff', border: (block.props.showBorder ?? true) ? `1px solid ${block.props.borderColor || '#e2e8f0'}` : 'none', borderRadius: 6, height: '100%' }}>
                <div style={{ fontWeight: 700, color: '#0f172a', fontSize: 13, marginBottom: 4 }}>BÊN MUA (BÊN A): CÔNG TY KHÁCH HÀNG</div>
                <div style={{ fontSize: 12, color: '#334155' }}><strong>Khách hàng:</strong> {custName}</div>
                <div style={{ fontSize: 12, color: '#334155' }}><strong>Mã số thuế:</strong> {custTax} • <strong>Điện thoại:</strong> {custPhone}</div>
                <div style={{ fontSize: 12, color: '#334155' }}><strong>Địa chỉ:</strong> {custAddress}</div>
              </div>
            </Col>
          </Row>
        );

      case BLOCK_TYPES.SERVICE_TABLE:
      case BLOCK_TYPES.PRODUCT_TABLE:
        const isService = block.type === BLOCK_TYPES.SERVICE_TABLE;
        const hasServiceBlock = allBlocks.some(b => b.type === BLOCK_TYPES.SERVICE_TABLE);
        
        let tableData = items || [];
        if (isService) {
          tableData = tableData.filter(it => it.item_type === 'service');
        } else if (hasServiceBlock) {
          tableData = tableData.filter(it => it.item_type !== 'service');
        }
        
        const isLandscape = layoutConfig?.paper_orientation === 'landscape';
        const tableTitle = block.props.tableTitle;
        return (
          <div style={{ marginBottom: 16 }}>
            {tableTitle && <div style={{ fontWeight: 600, color: '#0f172a', fontSize: 13, marginBottom: 8, textTransform: 'uppercase' }}>{tableTitle}</div>}
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              {block.props.showHeader !== false && (
                <thead>
                  <tr style={{ background: '#fafafa' }}>
                  {(block.props.columns || []).map(col => {
                    const colId = typeof col === 'object' ? col.id : col;
                    const colTitle = typeof col === 'object' ? col.title : null;
                    if (colId === 'stt') return <th key="stt" style={{ ...thStyle, color: clr, width: 40 }}>STT</th>;
                    if (colId === 'name') return <th key="name" style={{...thStyle, width: 200, textAlign: 'left'}}>{isService ? 'Tên dịch vụ / chi phí' : 'Tên hàng hóa / Dịch vụ'}</th>;
                    if (colId === 'symbol') return <th key="symbol" style={{...thStyle, width: 80}}>Ký hiệu</th>;
                    if (colId === 'specs') return <th key="specs" style={{...thStyle, width: 150, textAlign: 'left'}}>{isService ? 'Ghi chú kỹ thuật' : 'Quy cách kỹ thuật'}</th>;
                    if (colId === 'dimensions') return (
                      <th key="dimensions" style={{...thStyle, padding: 0, width: 180}}>
                        <div style={{ borderBottom: '1px solid #e2e8f0', padding: '4px 6px' }}>Kích thước (mm)</div>
                        <div style={{ display: 'flex' }}>
                          <div style={{ flex: 1, borderRight: '1px solid #e2e8f0', padding: '2px 6px' }}>Cao</div>
                          <div style={{ flex: 1, borderRight: '1px solid #e2e8f0', padding: '2px 6px' }}>Rộng</div>
                          <div style={{ flex: 1, padding: '2px 6px' }}>Dày</div>
                        </div>
                      </th>
                    );
                    if (colId === 'note') return <th key="note" style={{...thStyle, width: 120, textAlign: 'left'}}>Ghi chú</th>;
                    if (colId === 'unit') return <th key="unit" style={{...thStyle, width: 50}}>ĐVT</th>;
                    if (colId === 'qty') return <th key="qty" style={{...thStyle, width: 50}}>SL</th>;
                    if (colId === 'price') return <th key="price" style={{...thStyle, width: 90, textAlign: 'right'}}>Đơn giá</th>;
                    if (colId === 'total') return <th key="total" style={{...thStyle, width: 100, textAlign: 'right'}}>Thành tiền</th>;
                    
                    // Xử lý Custom Column
                    if (colId.startsWith('custom_')) {
                      return <th key={colId} style={{...thStyle, width: 100}}>{colTitle || 'Cột tuỳ chỉnh'}</th>;
                    }
                    if (colId.startsWith('group_')) {
                      const children = col.children || [];
                      return (
                        <th key={colId} style={{...thStyle, padding: 0, width: Math.max(100, children.length * 60)}}>
                          <div style={{ borderBottom: children.length > 0 ? '1px solid #e2e8f0' : 'none', padding: '4px 6px' }}>{colTitle}</div>
                          {children.length > 0 && (
                            <div style={{ display: 'flex' }}>
                              {children.map((child, idx) => (
                                <div key={child.id} style={{ flex: 1, borderRight: idx < children.length - 1 ? '1px solid #e2e8f0' : 'none', padding: '2px 6px' }}>{child.title}</div>
                              ))}
                            </div>
                          )}
                        </th>
                      );
                    }
                    
                    return null;
                  })}
                </tr>
              </thead>
              )}
              <tbody>
                {tableData.length === 0 ? (
                  <tr><td colSpan={10} style={{ ...tdStyle, textAlign: 'center', color: '#888' }}>[Danh sách {isService ? 'dịch vụ' : 'sản phẩm'} trống]</td></tr>
                ) : (
                  tableData.map((item, index) => {
                    const rowSpan = isLandscape ? computeRowSpan(tableData, index, 'product') : 1;
                    const sttNum = isLandscape ? computeProductSTT(tableData, index, 'product') : index + 1;
                    const lineTotal = computeLineTotal(item);

                    return (
                      <tr key={index}>
                        {(block.props.columns || []).map(col => {
                          const colId = typeof col === 'object' ? col.id : col;
                          const showSpecs = typeof block.props.columns?.[0] === 'object' 
                            ? block.props.columns.some(c => c.id === 'specs')
                            : block.props.columns?.includes('specs');
                            
                          if (colId === 'stt') return rowSpan > 0 ? <td key="stt" rowSpan={rowSpan} style={{ ...tdStyle, textAlign: 'center', fontWeight: 600, color: clr, verticalAlign: 'top' }}>{sttNum}</td> : null;
                          if (colId === 'name') return rowSpan > 0 ? (
                            <td key="name" rowSpan={rowSpan} style={{...tdStyle, verticalAlign: 'top'}}>
                              <strong style={{ color: '#1e293b' }}>{item.product_name || item.name}</strong>
                              {!showSpecs && (item.description || item.spec) && <div style={{ fontSize: 11, color: '#64748b', fontStyle: 'italic', whiteSpace: 'pre-wrap', marginTop: 2 }}>{item.description || item.spec}</div>}
                              {item.product_image && <div style={{marginTop: 4}}><img src={item.product_image} alt="" style={{ maxWidth: 80, maxHeight: 80, borderRadius: 4, objectFit: 'contain' }} /></div>}
                            </td>
                          ) : null;
                          if (colId === 'symbol') return (
                            <td key="symbol" style={{ ...tdStyle, textAlign: 'center' }}>
                              <span style={{fontWeight: 600, color: '#2563eb'}}>{item.custom_data?.symbol || item.symbol}</span>
                            </td>
                          );
                          if (colId === 'specs') return (
                            <td key="specs" style={{ ...tdStyle, textAlign: 'left', whiteSpace: 'pre-wrap' }}>
                              <span style={{color: '#475569', fontSize: 11}}>{item.description || item.spec}</span>
                            </td>
                          );
                          if (colId === 'dimensions') return (
                            <td key="dimensions" style={{ ...tdStyle, padding: 0, verticalAlign: 'top' }}>
                              <div style={{ display: 'flex', height: '100%' }}>
                                <div style={{ flex: 1, borderRight: '1px dashed #e2e8f0', padding: '4px 6px', textAlign: 'center' }}>{item.height || ''}</div>
                                <div style={{ flex: 1, borderRight: '1px dashed #e2e8f0', padding: '4px 6px', textAlign: 'center' }}>{item.width || ''}</div>
                                <div style={{ flex: 1, padding: '4px 6px', textAlign: 'center' }}>{item.custom_data?.thickness || item.thickness || ''}</div>
                              </div>
                            </td>
                          );
                          if (colId === 'note') return (
                            <td key="note" style={{ ...tdStyle, textAlign: 'left', whiteSpace: 'pre-wrap' }}>
                              <span style={{color: '#475569', fontSize: 11}}>{item.note || item.custom_data?.note}</span>
                            </td>
                          );
                          if (colId === 'unit') return (
                            <td key="unit" style={{ ...tdStyle, textAlign: 'center' }}>
                              <span style={{fontWeight: 500, color: item.item_type === 'accessory' ? '#64748b' : '#334155'}}>{item.unit || item.custom_data?.unit}</span>
                            </td>
                          );
                          if (colId === 'qty') return (
                            <td key="qty" style={{ ...tdStyle, textAlign: 'center' }}>
                              <span style={{fontWeight: 500, color: item.item_type === 'accessory' ? '#64748b' : '#334155'}}>{item.quantity}</span>
                            </td>
                          );
                          if (colId === 'price') return (
                            <td key="price" style={{ ...tdStyle, textAlign: 'right' }}>
                              <span style={{color: item.item_type === 'accessory' ? '#64748b' : '#334155'}}>{Number(item.unit_price).toLocaleString()} đ</span>
                            </td>
                          );
                          if (colId === 'total') return (
                            <td key="total" style={{ ...tdStyle, textAlign: 'right' }}>
                              <strong style={{ color: item.item_type === 'accessory' ? '#64748b' : clr }}>{lineTotal.toLocaleString()} đ</strong>
                            </td>
                          );
                          
                          // Xử lý Custom Column
                          if (colId.startsWith('custom_')) return (
                            <td key={colId} style={{ ...tdStyle, textAlign: 'center' }}>
                              <span style={{color: '#334155'}}>{item.custom_data?.[colId] || ''}</span>
                            </td>
                          );
                          
                          if (colId.startsWith('group_')) {
                            const children = col.children || [];
                            return (
                              <td key={colId} style={{ ...tdStyle, padding: 0, verticalAlign: 'top' }}>
                                <div style={{ display: 'flex', height: '100%' }}>
                                  {children.length > 0 ? children.map((child, idx) => (
                                    <div key={child.id} style={{ flex: 1, borderRight: idx < children.length - 1 ? '1px dashed #e2e8f0' : 'none', padding: '4px 6px', textAlign: 'center' }}>
                                      <span style={{color: '#334155'}}>{item.custom_data?.[child.id] || ''}</span>
                                    </div>
                                  )) : <div style={{ padding: '4px 6px', flex: 1 }} />}
                                </div>
                              </td>
                            );
                          }
                          
                          return null;
                        })}
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        );

      case BLOCK_TYPES.TOTALS:
        const isNested = !!block.parentId && block.parentId !== 'canvas';
        return (
          <Row justify={isNested ? "center" : "end"} style={{ marginBottom: 16 }}>
            <Col xs={24} md={isNested ? 24 : 11} style={{ textAlign: 'right', padding: '10px 14px', background: block.props.backgroundColor ?? '#f8fafc', borderRadius: 6, border: (block.props.showBorder ?? true) ? `1px solid ${clr}40` : 'none' }}>
              {block.props.showSubtotal && <div style={{ fontSize: 12, color: '#64748b' }}>Cộng tiền hàng: {Number(totals?.subtotal || 0).toLocaleString()} đ</div>}
              {block.props.showDiscount && Number(totals?.discount || 0) > 0 && <div style={{ fontSize: 12, color: '#64748b' }}>Chiết khấu chung: -{Number(totals?.discount || 0).toLocaleString()} đ</div>}
              {block.props.showVAT && Number(totals?.tax || 0) > 0 && <div style={{ fontSize: 12, color: '#64748b' }}>Thuế GTGT ({totals?.tax_percent || 0}%): {Number(totals?.tax || 0).toLocaleString()} đ</div>}
              {block.props.showShippingFee && Number(totals?.shipping_fee || data?.shipping_fee || 0) > 0 && <div style={{ fontSize: 12, color: '#64748b' }}>Phí vận chuyển: {Number(totals?.shipping_fee || data?.shipping_fee || 0).toLocaleString()} đ</div>}
              {block.props.showInstallationFee && Number(totals?.installation_fee || data?.installation_fee || 0) > 0 && <div style={{ fontSize: 12, color: '#64748b' }}>Phí thi công / lắp đặt: {Number(totals?.installation_fee || data?.installation_fee || 0).toLocaleString()} đ</div>}
              <div style={{ fontSize: 15, fontWeight: 700, color: clr, marginTop: 4 }}>
                TỔNG THANH TOÁN: {Number(totals?.total || data?.total_amount || 0).toLocaleString()} đ
              </div>
              {block.props.showWords && <div style={{ fontStyle: 'italic', fontSize: 12, marginTop: 4, color: '#334155' }}>Bằng chữ: {docSo(totals?.total || data?.total_amount || 0)}</div>}
            </Col>
          </Row>
        );

      case BLOCK_TYPES.PAYMENT_PROGRESS:
        const payments = data?.payment_terms_schedule || [];
        const paidAmount = Number(data?.paid_amount || 0);
        const totalAmount = Number(data?.total_amount || totals?.total || 0);
        const debtAmount = totalAmount - paidAmount;
        const progressTitle = block.props.title || 'Tiến độ thanh toán:';
        return (
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontWeight: 600, color: '#0f172a', fontSize: 13, marginBottom: 8, textDecoration: 'underline' }}>{progressTitle}</div>
            {payments.length > 0 ? (
              <ul style={{ paddingLeft: 20, marginBottom: 12, fontSize: 12, color: '#334155' }}>
                {payments.map((p, idx) => (
                  <li key={idx}>{p.title} ({p.percentage}%): <strong style={{ color: clr }}>{Number(totalAmount * (p.percentage / 100)).toLocaleString()} đ</strong></li>
                ))}
              </ul>
            ) : (
              <ul style={{ paddingLeft: 20, marginBottom: 12, fontSize: 12, color: '#334155' }}>
                <li>Thanh toán đợt 1 (100%): <strong style={{ color: clr }}>{totalAmount.toLocaleString()} đ</strong></li>
              </ul>
            )}
            {block.props.showPaidAndDebt !== false && (
              <div style={{ border: '1px dashed #cbd5e1', padding: '10px 14px', borderRadius: 8, background: '#f8fafc', display: 'inline-block', minWidth: 200, marginBottom: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, fontSize: 12 }}>
                  <span style={{ color: '#475569' }}>Đã thanh toán:</span>
                  <strong style={{ color: '#16a34a' }}>{paidAmount.toLocaleString()} đ</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                  <span style={{ color: '#475569' }}>Còn nợ:</span>
                  <strong style={{ color: '#ef4444' }}>{debtAmount.toLocaleString()} đ</strong>
                </div>
              </div>
            )}
            {block.props.showDeliveryTime && (data?.delivery_time || data?.delivery_time === '') && (
              <div style={{ fontSize: 12, color: '#334155', marginBottom: 4 }}>
                Thời gian giao hàng / thi công: <strong>{data.delivery_time || '3-5 ngày làm việc'}</strong>
              </div>
            )}
            {block.props.showValidity && (data?.validity_days || data?.validity_days === 0) && (
              <div style={{ fontSize: 12, color: '#334155' }}>
                Báo giá có giá trị trong vòng: <strong>{data.validity_days || 30} ngày</strong>
              </div>
            )}
          </div>
        );

      case BLOCK_TYPES.TERMS:
        let termContent = block.props.content || '';
        termContent = parseVariables(termContent, data, company);
        return (
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontWeight: 600, color: '#0f172a', fontSize: 13, marginBottom: 6 }}>📝 Ghi chú & Điều khoản thanh toán:</div>
            <div style={{ background: '#f8fafc', padding: '10px 14px', borderRadius: 6, borderLeft: `4px solid ${clr}`, whiteSpace: 'pre-wrap', fontSize: 12, color: '#334155' }}>
              {termContent}
            </div>
          </div>
        );

      case BLOCK_TYPES.SIGNATURES:
        const stImg = data?.company_info?.stamp || data?.company_info?.stamp_image;
        const sigImg = data?.company_info?.signature || data?.company_info?.director_signature;
        const directorName = data?.company_info?.director_name || '';
        const hasCustomerSignature = data?.status === 'accepted' && data?.signature_image;

        return (
          <Row justify="space-around" style={{ marginTop: 24, textAlign: 'center', paddingBottom: 16 }}>
            {Array.from({ length: block.props.columns || 2 }).map((_, idx) => (
              <Col xs={24} md={24 / (block.props.columns || 2)} key={idx}>
                <div style={{ fontWeight: 700, color: clr, fontSize: 13 }}>{block.props.titles?.[idx] || 'CHỮ KÝ'}</div>
                <div style={{ fontSize: 11, color: '#64748b', fontStyle: 'italic', marginBottom: 12 }}>(Ký, đóng dấu & ghi rõ họ tên)</div>
                
                {/* Customer Signature (Left column usually) */}
                {idx === 0 && block.props.columns > 1 ? (
                  hasCustomerSignature ? (
                    <div style={{ height: 115, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                      <img src={data.signature_image} alt="Customer Signature" style={{ height: 90, objectFit: 'contain' }} />
                    </div>
                  ) : (
                    <div style={{ height: 115 }} />
                  )
                ) : (
                  /* Company Signature (Right column usually, or single column) */
                  <div style={{ height: 115, display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
                    {stImg && <img src={stImg} alt="Stamp" style={{ height: 115, maxWidth: 165, position: 'absolute', opacity: 0.88, zIndex: 1, objectFit: 'contain' }} />}
                    {sigImg && <img src={sigImg} alt="Signature" style={{ height: 95, maxWidth: 200, position: 'relative', zIndex: 2, objectFit: 'contain' }} />}
                  </div>
                )}
                
                {idx === 0 && block.props.columns > 1 && hasCustomerSignature && (
                  <div style={{ fontWeight: 600, color: '#0f172a', fontSize: 14 }}>{data.customer_name_signed || customer?.name}</div>
                )}
                {(idx === 1 || block.props.columns === 1) && (
                  <div style={{ fontWeight: 600, color: '#0f172a', fontSize: 14 }}>{directorName}</div>
                )}
              </Col>
            ))}
          </Row>
        );

      case BLOCK_TYPES.DIVIDER:
        return <Divider type="horizontal" style={{ borderTopWidth: block.props.thickness, borderColor: block.props.color, margin: `${block.props.margin}px 0` }} />;
      
      case BLOCK_TYPES.LAYOUT_ROW:
        return (
          <Row gutter={block.props.gap || 16}>
            {Array.from({ length: block.props.columns || 2 }).map((_, idx) => {
              const colId = `${block.id}_col_${idx}`;
              const colBlocks = (allBlocks || []).filter(b => b.parentId === colId);
              return (
                <Col span={24 / (block.props.columns || 2)} key={idx}>
                  {colBlocks.map(childBlock => (
                    <div key={childBlock.id} style={{ marginBottom: 16 }}>
                      {renderBlock(childBlock)}
                    </div>
                  ))}
                </Col>
              );
            })}
          </Row>
        );

      default:
        return null;
    }
  };

  const fontFamily = layoutStyle === 'classic_border' ? '"Times New Roman", Times, serif' : (layoutStyle === 'modern_navy' ? 'Inter, sans-serif' : 'Arial, sans-serif');

  return (
    <div style={{ fontFamily }}>
      {allBlocks.filter(b => !b.parentId || b.parentId === 'canvas').map((block) => (
        <div key={block.id} style={{ marginBottom: 16 }}>
          {renderBlock(block)}
        </div>
      ))}
    </div>
  );
}
