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
  if (item.quantity === null || item.quantity === '' || item.quantity === undefined ||
      item.unit_price === null || item.unit_price === '' || item.unit_price === undefined) {
    return null;
  }
  const qty = Number(item.quantity)
  const price = Number(item.unit_price)
  const discount = Number(item.discount_percent || 0)
  
  const unit = (item.unit || item.custom_data?.unit || '').toLowerCase();
  const isAreaUnit = unit === 'm²' || unit === 'm2' || unit === 'mét vuông';
  const area = Number(item.area || 0);

  if (isAreaUnit && area > 0) {
    return Number((area * qty * price * (1 - discount / 100)).toFixed(0));
  }
  
  return Number((qty * price * (1 - discount / 100)).toFixed(0));
};

const computeRowSpan = (data, index, field = 'product') => {
  if (!data || !data[index]) return 1
  if (data[index].item_type === 'service') return 1
  
  const currentItem = data[index];
  const matches = (item1, item2) => {
    if (item1.item_type === 'service' || item2.item_type === 'service') return false;
    if (field === 'product') {
      if (item1.product && item2.product) return item1.product === item2.product;
      if (!item1.product && !item2.product) return item1.product_name === item2.product_name && !!item1.product_name;
      return false;
    }
    return item1[field] === item2[field];
  };

  if (index > 0 && matches(data[index - 1], currentItem)) {
    return 0;
  }
  let count = 1;
  for (let i = index + 1; i < data.length; i++) {
    if (matches(data[i], currentItem)) {
      count++;
    } else {
      break;
    }
  }
  return count;
};

const computeProductSTT = (data, index, field = 'product') => {
  if (!data) return 0
  let count = 0
  const matches = (item1, item2) => {
    if (!item1 || !item2) return false;
    if (item1.item_type === 'service' || item2.item_type === 'service') return false;
    if (field === 'product') {
      if (item1.product && item2.product) return item1.product === item2.product;
      if (!item1.product && !item2.product) return item1.product_name === item2.product_name && !!item1.product_name;
      return false;
    }
    return item1[field] === item2[field];
  };

  for (let i = 0; i <= index; i++) {
    if (data[i].item_type === 'service') {
      count++
    } else if (i === 0 || !matches(data[i], data[i - 1])) {
      count++
    }
  }
  return count
};

/**
 * QuotationRenderer takes the layout_config JSON and actual data (customer, items, totals)
 * and renders the final read-only HTML view.
 */
export default function QuotationRenderer({ layoutConfig, layoutStyle, data, renderCustomerSignature, documentType = 'quotation' }) {
  if (!layoutConfig || !Array.isArray(layoutConfig.blocks)) {
    return <div style={{ padding: 20, textAlign: 'center' }}>Mẫu báo giá chưa được thiết kế.</div>;
  }

  const allBlocks = layoutConfig.blocks;
  const { customer, items, totals, company } = data || {};

  const isPlaceholder = (val) => {
    if (!val) return true;
    const str = String(val).trim();
    const placeholders = [
      '[Tên công ty]', '[Địa chỉ công ty]', '[SĐT công ty]', '[Email công ty]', 
      '[Mã số thuế]', '[Website công ty]', '[Tên giám đốc]'
    ];
    return placeholders.includes(str) || (str.startsWith('{{') && str.endsWith('}}'));
  };

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
        if (finalLogoUrl === '{{company_logo}}' || !finalLogoUrl) finalLogoUrl = company?.logo || data?.company_info?.logo;
        
        const headerCompanyName = company?.name || data?.company_info?.name || parseVariables(block.props.companyName || '[Tên công ty]', data, company);
        const headerTaxCode = company?.tax_code || data?.company_info?.tax_code || parseVariables(block.props.taxCode || '', data, company);
        const headerPhone = company?.phone || data?.company_info?.phone || parseVariables(block.props.phone || '', data, company);
        const headerAddress = company?.address || data?.company_info?.address || parseVariables(block.props.address || '', data, company);
        return (
          <div style={{ padding: '14px 18px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
            <div style={{ textAlign: 'left', flexShrink: 0, maxWidth: '40%' }}>
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
            </div>
            <div style={{ textAlign: 'right', flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 700, color: clr, fontSize: 16, wordWrap: 'break-word' }}>{!isPlaceholder(headerCompanyName) ? headerCompanyName : ''}</div>
              {(!isPlaceholder(headerTaxCode) || !isPlaceholder(headerPhone)) && (
                <div style={{ fontSize: 12, color: '#64748b', marginTop: 2, wordWrap: 'break-word' }}>
                  {!isPlaceholder(headerTaxCode) ? `MST: ${headerTaxCode}` : ''}
                  {!isPlaceholder(headerTaxCode) && !isPlaceholder(headerPhone) ? ' • ' : ''}
                  {!isPlaceholder(headerPhone) ? `Hotline: ${headerPhone}` : ''}
                </div>
              )}
              {!isPlaceholder(headerAddress) && <div style={{ fontSize: 12, color: '#64748b', wordWrap: 'break-word' }}>Địa chỉ: {headerAddress}</div>}
            </div>
          </div>
        );

      case BLOCK_TYPES.TITLE:
        const isOrder = documentType === 'order';
        const displayTitle = isOrder 
          ? (block.props.orderTitle !== undefined ? block.props.orderTitle : 'ĐƠN ĐẶT HÀNG')
          : (block.props.title || '');
        const displaySubtitle = isOrder 
          ? (block.props.orderSubtitle !== undefined ? block.props.orderSubtitle : 'Kính gửi Quý khách hàng, chúng tôi xin gửi thông tin đơn hàng chi tiết dưới đây:')
          : (block.props.subtitle || '');
        
        let parsedMeta = block.props.metaText !== undefined ? block.props.metaText : (block.props.showDate ? 'Số: {{quotation_code}} | Ngày: {{current_date}}' : '');
        parsedMeta = parseVariables(parsedMeta, data, company);
        return (
          <div style={{ textAlign: 'center', margin: '4px 0 8px 0' }}>
            <div style={{ fontSize: 20, fontWeight: 700, color: clr, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              {parseVariables(displayTitle, data, company)}
            </div>
            {(block.props.metaText !== undefined ? block.props.metaText : (block.props.showDate ? 'Số: {{quotation_code}} | Ngày: {{current_date}}' : '')) && (
              <div style={{ display: 'inline-block', background: '#eff6ff', padding: '2px 12px', borderRadius: 12, border: '1px solid #bfdbfe', fontSize: 12, color: '#1d4ed8', margin: '6px 0' }}>
                {(() => {
                  let text = block.props.metaText !== undefined ? block.props.metaText : 'Số: {{quotation_code}} | Ngày: {{current_date}}';
                  if (!text) return null;
                  return <strong>{parseVariables(text, data, company)}</strong>;
                })()}
              </div>
            )}
            <div style={{ fontSize: 12.5, fontStyle: 'italic', color: '#475569', marginTop: 4 }}>
              {parseVariables(displaySubtitle, data, company)}
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
        // Resolve seller info: luôn ưu tiên dữ liệu thực từ company
        const sellerName = company?.name || parseVariables(block.props.companyName || '{{company_name}}', data, company);
        const sellerRep = company?.director_name || parseVariables(block.props.representative || '{{director_name}}', data, company);
        const sellerPos = company?.director_title || parseVariables(block.props.position || '{{director_title}}', data, company);
        const sellerTax = company?.tax_code || parseVariables(block.props.taxCode || '{{company_tax_code}}', data, company);
        const sellerPhone = company?.phone || parseVariables(block.props.phone || '{{company_phone}}', data, company);
        const sellerAddr = company?.address || parseVariables(block.props.address || '{{company_address}}', data, company);
        // Resolve buyer info: luôn ưu tiên dữ liệu thực từ customer
        const rawBuyerCompanyName = data?.customer?.company_name || ''; // chỉ lấy nếu có công ty riêng
        const rawBuyerName = data?.customer?.name || '';
        const buyerName = rawBuyerName || parseVariables(block.props.buyerName || '{{customer_name}}', data, company);
        // Chỉ hiện company trong tiêu đề nếu khách hàng có tên công ty riêng
        const hasCompany = rawBuyerCompanyName && rawBuyerCompanyName !== rawBuyerName;
        const buyerCompany = hasCompany ? rawBuyerCompanyName : (rawBuyerName || parseVariables(block.props.buyerName || '{{customer_name}}', data, company));
        const buyerTax = data?.customer?.tax_code || '';
        const rawBuyerPhone = data?.customer?.phone || '';
        const buyerPhone = rawBuyerPhone || parseVariables(block.props.buyerPhone || '{{customer_phone}}', data, company);
        const rawBuyerAddr = [data?.customer?.address, data?.customer?.city].filter(Boolean).join(' - ') || '';
        const buyerAddr = rawBuyerAddr || parseVariables(block.props.buyerAddress || '{{customer_address}}', data, company);
        return (
          <Row gutter={16} style={{ marginBottom: 0 }}>
            <Col xs={24} md={block.props.columns === 1 ? 24 : 12} style={{ marginBottom: block.props.columns === 1 ? 12 : 0 }}>
              <div style={{ padding: '10px 14px', background: block.props.sellerBackgroundColor || '#f8fafc', border: (block.props.showBorder ?? true) ? `1px solid ${block.props.borderColor || clr + '40'}` : 'none', borderRadius: 6, height: '100%' }}>
                <div style={{ fontWeight: 700, color: clr, fontSize: 13, marginBottom: 4 }}>{parseVariables(block.props.sellerTitle || 'BÊN BÁN (BÊN B)', data, company)}: {!isPlaceholder(sellerName) ? sellerName : ''}</div>
                {(!isPlaceholder(sellerRep) || !isPlaceholder(sellerPos)) && (
                  <div style={{ fontSize: 12, color: '#334155' }}>
                    {!isPlaceholder(sellerRep) ? <span><strong>Đại diện:</strong> {sellerRep}</span> : null}
                    {!isPlaceholder(sellerRep) && !isPlaceholder(sellerPos) ? ' • ' : ''}
                    {!isPlaceholder(sellerPos) ? <span><strong>Chức vụ:</strong> {sellerPos}</span> : null}
                  </div>
                )}
                {(!isPlaceholder(sellerTax) || !isPlaceholder(sellerPhone)) && (
                  <div style={{ fontSize: 12, color: '#334155' }}>
                    {!isPlaceholder(sellerTax) ? <span><strong>Mã số thuế:</strong> {sellerTax}</span> : null}
                    {!isPlaceholder(sellerTax) && !isPlaceholder(sellerPhone) ? ' • ' : ''}
                    {!isPlaceholder(sellerPhone) ? <span><strong>Điện thoại:</strong> {sellerPhone}</span> : null}
                  </div>
                )}
                {!isPlaceholder(sellerAddr) && <div style={{ fontSize: 12, color: '#334155' }}><strong>Địa chỉ:</strong> {sellerAddr}</div>}
              </div>
            </Col>
            <Col xs={24} md={block.props.columns === 1 ? 24 : 12}>
              <div style={{ padding: '10px 14px', background: block.props.buyerBackgroundColor || '#fff', border: (block.props.showBorder ?? true) ? `1px solid ${block.props.borderColor || '#e2e8f0'}` : 'none', borderRadius: 6, height: '100%' }}>
                <div style={{ fontWeight: 700, color: '#0f172a', fontSize: 13, marginBottom: 4 }}>
                  {parseVariables(block.props.buyerTitle || 'BÊN MUA (BÊN A)', data, company)}
                  {hasCompany && !isPlaceholder(buyerCompany) ? `: ${buyerCompany}` : ''}
                </div>
                {!isPlaceholder(buyerName) && <div style={{ fontSize: 12, color: '#334155' }}><strong>{hasCompany ? 'Đại diện' : 'Khách hàng'}:</strong> {buyerName}</div>}
                
                {(!isPlaceholder(buyerTax) || !isPlaceholder(buyerPhone)) && (
                  <div style={{ fontSize: 12, color: '#334155' }}>
                    {!isPlaceholder(buyerTax) ? <span><strong>Mã số thuế:</strong> {buyerTax}</span> : null}
                    {!isPlaceholder(buyerTax) && !isPlaceholder(buyerPhone) ? ' • ' : ''}
                    {!isPlaceholder(buyerPhone) ? <span><strong>Điện thoại:</strong> {buyerPhone}</span> : null}
                  </div>
                )}
                {!isPlaceholder(buyerAddr) && <div style={{ fontSize: 12, color: '#334155' }}><strong>Địa chỉ:</strong> {buyerAddr}</div>}
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
        
        if (isService && tableData.length === 0) {
          return null;
        }
        
        const isLandscape = layoutConfig?.paper_orientation === 'landscape';
        const tableTitle = block.props.tableTitle;
        const enableProductImage = (() => {
          const nameCol = (block.props.columns || []).find(c => (typeof c === 'object' ? c.id : c) === 'name');
          if (nameCol && typeof nameCol === 'object') return nameCol.allowImageUpload === true;
          return block.props.enableProductImage !== false;
        })();
        const enableProductName = block.props.enableProductName !== false;
        const enableProductDescription = block.props.enableProductDescription !== false;
        const enableNoteImage = (() => {
          const noteCol = (block.props.columns || []).find(c => (typeof c === 'object' ? c.id : c) === 'note');
          if (noteCol && typeof noteCol === 'object') return noteCol.allowImageUpload === true;
          return block.props.enableNoteImage !== false;
        })();
        const useComplexDimensions = block.props.useComplexDimensions !== false;
        const dimCol = block.props.columns?.find(c => (typeof c === 'object' ? c.id : c) === 'dimensions');
        const dimensionFieldsRaw = dimCol?.children || [];
        const dimensionFields = dimensionFieldsRaw.length > 0
          ? dimensionFieldsRaw.map(c => ({ id: c.id, label: c.title, width: 85, allowImageUpload: c.allowImageUpload }))
          : [{ id: 'height', label: 'Cao', width: 85 }, { id: 'width', label: 'Rộng', width: 85 }, { id: 'thickness', label: 'Dày', width: 85 }];
        const BUILTIN_DIM = ['height', 'width', 'thickness'];
        const getDimVal = (record, field) => BUILTIN_DIM.includes(field.id) ? record[field.id] : record.custom_data?.[`dim_${field.id}`];

        return (
          <div style={{ marginBottom: 0 }}>
            {tableTitle && <div style={{ fontWeight: 600, color: '#0f172a', fontSize: 13, marginBottom: 8, textTransform: 'uppercase' }}>{tableTitle}</div>}
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              {block.props.showHeader !== false && (
                <thead>
                  <tr style={{ background: '#fafafa' }}>
                  {(block.props.columns || []).map(col => {
                    const colId = typeof col === 'object' ? col.id : col;
                    const colTitle = typeof col === 'object' ? col.title : null;
                    if (colId === 'stt') return <th key="stt" style={{ ...thStyle, color: clr, width: 40 }}>{colTitle || 'STT'}</th>;
                    if (colId === 'name') return <th key="name" style={{...thStyle, width: 200, textAlign: 'left'}}>{colTitle || (isService ? 'Tên dịch vụ / chi phí' : 'Tên hàng hóa / Dịch vụ')}</th>;
                    if (colId === 'symbol') return <th key="symbol" style={{...thStyle, width: 80}}>{colTitle || 'Ký hiệu'}</th>;
                    if (colId === 'specs') return <th key="specs" style={{...thStyle, width: 150, textAlign: 'left'}}>{colTitle || (isService ? 'Ghi chú kỹ thuật' : 'Quy cách kỹ thuật')}</th>;
                    if (colId === 'dimensions') return (
                      <th key="dimensions" style={{...thStyle, padding: 0, width: 180}}>
                        <div style={{ borderBottom: useComplexDimensions ? '1px solid #e2e8f0' : 'none', padding: '4px 6px' }}>{colTitle || 'Kích thước (mm)'}</div>
                        {useComplexDimensions && (
                          <div style={{ display: 'flex' }}>
                            {dimensionFields.map((field, idx) => (
                              <div key={field.id} style={{ flex: 1, borderRight: idx < dimensionFields.length - 1 ? '1px solid #e2e8f0' : 'none', padding: '2px 6px' }}>{field.label}</div>
                            ))}
                          </div>
                        )}
                      </th>
                    );
                    if (colId === 'note') return <th key="note" style={{...thStyle, width: 120, textAlign: 'left'}}>{colTitle || 'Ghi chú'}</th>;
                    if (colId === 'unit') return <th key="unit" style={{...thStyle, width: 50}}>{colTitle || 'ĐVT'}</th>;
                    if (colId === 'qty') return <th key="qty" style={{...thStyle, width: 50}}>{colTitle || 'SL'}</th>;
                    if (colId === 'price') return <th key="price" style={{...thStyle, width: 90, textAlign: 'right'}}>{colTitle || 'Đơn giá'}</th>;
                    if (colId === 'total') return <th key="total" style={{...thStyle, width: 100, textAlign: 'right'}}>{colTitle || 'Thành tiền'}</th>;
                    
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
                            
                          const merges = item.custom_data?.merge_columns;
                          if (merges && Array.isArray(merges) && merges.length > 1) {
                            const idx = merges.indexOf(colId);
                            if (idx > 0) return null;
                            if (idx === 0) {
                              return (
                                <td key={colId} colSpan={merges.length} style={{ ...tdStyle, textAlign: 'left', whiteSpace: 'pre-wrap', verticalAlign: 'middle' }}>
                                  <span style={{color: '#334155'}}>{item.custom_data?.custom_size_text || ''}</span>
                                </td>
                              );
                            }
                          }
                          
                          if (colId === 'stt') return rowSpan > 0 ? <td key="stt" rowSpan={rowSpan} style={{ ...tdStyle, textAlign: 'center', fontWeight: 600, color: clr, verticalAlign: 'middle' }}>{sttNum}</td> : null;
                          if (colId === 'name') return rowSpan > 0 ? (
                            <td key="name" rowSpan={rowSpan} style={{...tdStyle, verticalAlign: 'middle', textAlign: 'left', height: '1px'}}>
                              <div style={{ height: '100%', display: 'flex', flexDirection: 'column', minHeight: 80 }}>
                                {enableProductImage && item.product_image && (
                                  <div style={{ flex: 1, position: 'relative', width: '100%', minHeight: 0, marginBottom: 4 }}>
                                    <img src={item.product_image} alt="" style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', borderRadius: 4, objectFit: 'contain' }} />
                                  </div>
                                )}
                                <div style={{ flexShrink: 0 }}>
                                  {enableProductName && <strong style={{ color: '#1e293b', display: 'block' }}>{item.product_name || item.name}</strong>}
                                  {enableProductDescription && !showSpecs && (item.description || item.spec) && <div style={{ fontSize: 11, color: '#64748b', fontStyle: 'italic', whiteSpace: 'pre-wrap', marginTop: 4, textAlign: 'left', display: 'inline-block', maxWidth: '100%' }}>{item.description || item.spec}</div>}
                                </div>
                              </div>
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
                          if (colId === 'dimensions') {
                            const itemMerges = item.custom_data?.merge_columns;
                            const dimFieldIds = dimensionFields.map(f => f.id);
                            const hasMerges = itemMerges && Array.isArray(itemMerges) && itemMerges.length > 0;
                            const isDimensionMerge = hasMerges && itemMerges.some(m => dimFieldIds.includes(m));
                            const isCustomSize = hasMerges ? isDimensionMerge : item.custom_data?.is_custom_size === true;

                            if (isCustomSize) {
                              return (
                                <td key="dimensions" style={{ ...tdStyle, verticalAlign: 'middle', whiteSpace: 'pre-wrap' }}>
                                  <span style={{color: '#334155'}}>{item.custom_data?.custom_size_text || ''}</span>
                                </td>
                              );
                            }

                            return (
                              <td key="dimensions" style={{ ...tdStyle, padding: 0, verticalAlign: 'middle' }}>
                                {!useComplexDimensions ? (
                                  <div style={{ height: '100%', padding: '4px 6px', display: 'flex', alignItems: 'center', whiteSpace: 'pre-wrap', textAlign: 'center', justifyContent: 'center' }}>
                                    {(() => {
                                      const parts = [];
                                      if (Number(item.height) > 0) parts.push(item.height);
                                      if (Number(item.width) > 0) parts.push(item.width);
                                      if (Number(item.thickness) > 0) parts.push(item.thickness);
                                      return parts.join(' x ');
                                  })()}
                                </div>
                              ) : (
                                <div style={{ display: 'flex', height: '100%' }}>
                                  {dimensionFields.map((field, idx) => {
                                    const canShowChildImg = field.allowImageUpload === true;
                                    const childImgUrl = canShowChildImg ? item.custom_data?.[`img_${field.id}`] : null;
                                    const val = Number(getDimVal(item, field)) === 0 ? '' : getDimVal(item, field);
                                    return (
                                      <div key={field.id} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', borderRight: idx < dimensionFields.length - 1 ? '1px dashed #e2e8f0' : 'none', padding: '4px 6px', textAlign: 'center' }}>
                                        {childImgUrl && (
                                          <div style={{ marginBottom: 4, display: 'flex', justifyContent: 'center' }}>
                                            <img src={childImgUrl} alt="" style={{ maxWidth: '100%', maxHeight: 60, objectFit: 'contain', borderRadius: 4, border: '1px solid #cbd5e1' }} />
                                          </div>
                                        )}
                                        <div>{val}</div>
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                            </td>
                          );
                          }
                          if (colId === 'note') return (
                            <td key="note" style={{ ...tdStyle, textAlign: 'center', whiteSpace: 'pre-wrap' }}>
                              {enableNoteImage && item.custom_data?.note_image && (
                                <div style={{ marginBottom: 4, display: 'flex', justifyContent: 'center' }}>
                                  <img src={item.custom_data.note_image} alt="note" style={{ maxWidth: '100%', maxHeight: 60, objectFit: 'contain', borderRadius: 4, border: '1px solid #cbd5e1' }} />
                                </div>
                              )}
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
                              <strong style={{ color: item.item_type === 'accessory' ? '#64748b' : clr }}>
                                {lineTotal !== null ? `${lineTotal.toLocaleString()} đ` : ''}
                              </strong>
                            </td>
                          );
                          
                          // Xử lý Custom Column
                          if (colId.startsWith('custom_')) {
                            const canShowImg = typeof col === 'object' && col.allowImageUpload === true;
                            const imgUrl = canShowImg ? item.custom_data?.[`img_${colId}`] : null;
                            return (
                              <td key={colId} style={{ ...tdStyle, textAlign: 'center' }}>
                                {imgUrl && <div style={{ marginBottom: 4, display: 'flex', justifyContent: 'center' }}><img src={imgUrl} alt="" style={{ maxWidth: '100%', maxHeight: 60, objectFit: 'contain', borderRadius: 4, border: '1px solid #cbd5e1' }} /></div>}
                                <span style={{color: '#334155'}}>{item.custom_data?.[colId] || ''}</span>
                              </td>
                            );
                          }
                          
                          if (colId.startsWith('group_')) {
                            const children = col.children || [];
                            return (
                              <td key={colId} style={{ ...tdStyle, padding: 0, verticalAlign: 'top' }}>
                                <div style={{ display: 'flex', height: '100%' }}>
                                  {children.length > 0 ? children.map((child, idx) => {
                                    const canShowChildImg = typeof child === 'object' && child.allowImageUpload === true;
                                    const childImgUrl = canShowChildImg ? item.custom_data?.[`img_${child.id}`] : null;
                                    return (
                                      <div key={child.id} style={{ flex: 1, borderRight: idx < children.length - 1 ? '1px dashed #e2e8f0' : 'none', padding: '4px 6px', textAlign: 'center' }}>
                                        {childImgUrl && <div style={{ marginBottom: 4, display: 'flex', justifyContent: 'center' }}><img src={childImgUrl} alt="" style={{ maxWidth: '100%', maxHeight: 60, objectFit: 'contain', borderRadius: 4, border: '1px solid #cbd5e1' }} /></div>}
                                        <span style={{color: '#334155'}}>{item.custom_data?.[child.id] || ''}</span>
                                      </div>
                                    );
                                  }) : <div style={{ padding: '4px 6px', flex: 1 }} />}
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
          <Row justify={isNested ? "center" : "end"} style={{ marginBottom: 0 }}>
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
        const progressTitle = block.props.title || 'Tiến độ thanh toán:';
        const debtAmount = Number(totals?.total || data?.total_amount || 0) - Number(data?.paid_amount || 0);
        return (
          <div style={{ marginBottom: 0 }}>
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
            {block.props.showDate && (
              <div style={{ fontSize: 12, color: '#334155', marginBottom: 4 }}>
                Ngày báo giá: <strong>{data?.quotation_date ? new Date(data.quotation_date).toLocaleDateString('vi-VN') : new Date().toLocaleDateString('vi-VN')}</strong>
              </div>
            )}
            {block.props.showDeliveryTime && (data?.delivery_time || data?.delivery_time === '') && (
              <div style={{ fontSize: 12, color: '#334155', marginBottom: 4 }}>
                Thời gian giao hàng / thi công: <strong>{data.delivery_time || '3-5 ngày làm việc'}</strong>
              </div>
            )}
            {block.props.showInstallationDate && data?.installation_date && (
              <div style={{ fontSize: 12, color: '#334155', marginBottom: 4 }}>
                Ngày giao hàng / lắp đặt dự kiến: <strong>{new Date(data.installation_date).toLocaleDateString('vi-VN')}</strong>
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
          <div style={{ marginBottom: 0 }}>
            <div style={{ fontWeight: 600, color: '#0f172a', fontSize: 13, marginBottom: 6 }}>📝 Ghi chú & Điều khoản thanh toán:</div>
            <div style={{ background: '#f8fafc', padding: '10px 14px', borderRadius: 6, borderLeft: `4px solid ${clr}`, whiteSpace: 'pre-wrap', fontSize: 12, color: '#334155' }}>
              {termContent}
            </div>
          </div>
        );

      case BLOCK_TYPES.SIGNATURES:
        return (
          <Row justify="space-around" style={{ marginTop: 12, textAlign: 'center', paddingBottom: 0, pageBreakInside: 'avoid', breakInside: 'avoid' }}>
            {Array.from({ length: block.props.columns || 2 }).map((_, idx) => (
              <Col xs={24} md={24 / (block.props.columns || 2)} key={idx}>
                <div style={{ fontWeight: 700, color: clr, fontSize: 13 }}>{block.props.titles?.[idx] || 'CHỮ KÝ'}</div>
                <div style={{ fontSize: 11, color: '#64748b', fontStyle: 'italic', marginBottom: 12 }}>(Ký, đóng dấu & ghi rõ họ tên)</div>
                
                <div style={{ minHeight: 140, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-start', paddingTop: 10, position: 'relative' }}>
                  {block.props.signatures?.[idx]?.includes('{{customer_signature}}') && renderCustomerSignature ? (
                    renderCustomerSignature()
                  ) : block.props.signatures?.[idx] ? (
                    <div 
                      dangerouslySetInnerHTML={{ __html: parseVariables(block.props.signatures[idx], data, company).replace(/\n{3,}/g, '\n\n').replace(/\n/g, '<br/>') }} 
                      style={{ display: 'block', textAlign: 'center', whiteSpace: 'pre-wrap', position: 'relative', width: '100%', lineHeight: '1.2' }}
                    />
                  ) : (
                    <div style={{ height: 115 }} />
                  )}
                </div>
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
                    <div key={childBlock.id} style={{ marginBottom: 12 }}>
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
        <div key={block.id} style={{ marginBottom: 12 }}>
          {renderBlock(block)}
        </div>
      ))}
    </div>
  );
}
