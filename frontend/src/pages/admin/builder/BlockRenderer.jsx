import React from 'react';
import { BLOCK_TYPES } from './constants';
import { Card, Typography, Row, Col, Space, Divider } from 'antd';
import { HolderOutlined, DeleteOutlined } from '@ant-design/icons';
import { useSortable, SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { useDroppable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';

const { Text } = Typography;

function PlaceholderBlock({ title, description, icon }) {
  return (
    <div style={{ background: '#fafafa', border: '1px dashed #d9d9d9', padding: '16px', textAlign: 'center', color: '#888' }}>
      <div style={{ fontSize: 24, marginBottom: 8 }}>{icon}</div>
      <Text strong>{title}</Text>
      {description && <div><Text type="secondary" style={{ fontSize: 12 }}>{description}</Text></div>}
    </div>
  );
}

function DroppableColumn({ id, colBlocks, allBlocks, isActive, onSelect, onDelete, globalThemeColor, globalTableStyle, globalLayoutStyle }) {
  const { isOver, setNodeRef } = useDroppable({ id });
  return (
    <div 
      ref={setNodeRef} 
      style={{ 
        minHeight: 80, 
        border: isOver ? '2px dashed #1677ff' : '1px dashed #d9d9d9', 
        background: isOver ? '#e6f4ff' : 'transparent', 
        padding: 8,
        transition: 'all 0.2s',
        height: '100%'
      }}
    >
      <SortableContext items={colBlocks.map(b => b.id)} strategy={verticalListSortingStrategy}>
        {colBlocks.length === 0 ? (
          <Text type="secondary" style={{ fontSize: 12, display: 'block', textAlign: 'center', margin: '20px 0' }}>Thả nội dung vào cột này</Text>
        ) : (
          colBlocks.map(b => (
            <BlockRenderer 
              key={b.id} 
              block={b} 
              allBlocks={allBlocks}
              isActive={isActive} 
              onSelect={onSelect} 
              onDelete={onDelete} 
              globalThemeColor={globalThemeColor} 
              globalTableStyle={globalTableStyle} 
              globalLayoutStyle={globalLayoutStyle} 
            />
          ))
        )}
      </SortableContext>
    </div>
  );
}

// Basic rendering logic for blocks in the canvas
export default function BlockRenderer({ block, allBlocks, isActive, onSelect, onDelete, globalThemeColor, globalTableStyle, globalLayoutStyle }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: block.id, data: { type: 'block', block } });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
    marginBottom: 12,
    position: 'relative',
    border: isActive ? '2px solid #1677ff' : '2px solid transparent',
    fontFamily: globalLayoutStyle === 'classic_border' ? '"Times New Roman", Times, serif' : (globalLayoutStyle === 'modern_navy' ? 'Inter, sans-serif' : 'Arial, sans-serif'),
  };

  const renderContent = () => {
    const clr = block.props.themeColor || globalThemeColor || '#1649c9';
    const isNoBorder = globalTableStyle === 'modern_navy';
    const hideAllBorders = block.props.showBorder === false;
    const thStyle = {
      border: hideAllBorders || isNoBorder ? 'none' : '1px solid #e2e8f0',
      borderBottom: hideAllBorders ? 'none' : '1px solid #e2e8f0',
      padding: '8px 4px',
      textAlign: 'center',
      verticalAlign: 'middle',
    };
    const tdStyle = { 
      border: hideAllBorders || isNoBorder ? 'none' : '1px solid #e2e8f0',
      borderBottom: hideAllBorders ? 'none' : '1px solid #e2e8f0',
      padding: '8px 4px',
      verticalAlign: 'middle'
    };
    switch (block.type) {
      case BLOCK_TYPES.HEADER_LOGO:
        const hasLogoUrl = block.props.logoUrl && !block.props.logoUrl.includes('{{');
        return (
          <div style={{ padding: '14px 18px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
            <div style={{ textAlign: 'left', flexShrink: 0, maxWidth: '40%' }}>
              {hasLogoUrl ? (
                <img
                  src={block.props.logoUrl}
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
              <div style={{ fontWeight: 700, color: clr, fontSize: 16, wordWrap: 'break-word' }}>{block.props.companyName || 'TÊN CÔNG TY'}</div>
              <div style={{ fontSize: 12, color: '#64748b', marginTop: 2, wordWrap: 'break-word' }}>MST: {block.props.taxCode || '0101234567'} • Hotline: {block.props.phone || '0912345678'}</div>
              <div style={{ fontSize: 12, color: '#64748b', wordWrap: 'break-word' }}>Địa chỉ: {block.props.address || 'Hà Nội'}</div>
            </div>
          </div>
        );
      case BLOCK_TYPES.TITLE:
        return (
          <div style={{ textAlign: 'center', margin: '4px 0 8px 0' }}>
            <div style={{ fontSize: 20, fontWeight: 700, color: clr, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              {block.props.title || 'BẢNG BÁO GIÁ CHI TIẾT'} 
              {block.props.orderTitle ? <span style={{ color: '#94a3b8', fontSize: 16 }}> / {block.props.orderTitle}</span> : null}
            </div>
            {(block.props.metaText !== undefined ? block.props.metaText : (block.props.showDate ? 'Số: {{quotation_code}} | Ngày: {{current_date}}' : '')) && (
              <div style={{ display: 'inline-block', background: '#eff6ff', padding: '2px 12px', borderRadius: 12, border: '1px solid #bfdbfe', fontSize: 12, color: '#1d4ed8', margin: '6px 0' }}>
                {(() => {
                  let text = block.props.metaText !== undefined ? block.props.metaText : 'Số: {{quotation_code}} | Ngày: {{current_date}}';
                  if (!text) return null;
                  return <strong>{text}</strong>;
                })()}
              </div>
            )}
            <div style={{ fontSize: 12.5, fontStyle: 'italic', color: '#475569', marginTop: 4 }}>
              {block.props.subtitle || 'Kính gửi Quý khách hàng...'}
            </div>
          </div>
        );
      case BLOCK_TYPES.CUSTOMER_INFO:
        return (
          <Row gutter={16} style={{ marginBottom: 0 }}>
            <Col xs={24} md={block.props.columns === 1 ? 24 : 12} style={{ marginBottom: block.props.columns === 1 ? 12 : 0 }}>
              <div style={{ padding: '10px 14px', background: block.props.sellerBackgroundColor || '#f8fafc', border: (block.props.showBorder ?? true) ? `1px solid ${block.props.borderColor || clr + '40'}` : 'none', borderRadius: 6, height: '100%' }}>
                <div style={{ fontWeight: 700, color: clr, fontSize: 13, marginBottom: 4 }}>{block.props.sellerTitle || 'BÊN BÁN (BÊN B)'}: {block.props.companyName || '{{company_name}}'}</div>
                <div style={{ fontSize: 12, color: '#334155' }}><strong>Đại diện:</strong> {block.props.representative || '{{director_name}}'} • <strong>Chức vụ:</strong> {block.props.position || '{{director_title}}'}</div>
                <div style={{ fontSize: 12, color: '#334155' }}><strong>Mã số thuế:</strong> {block.props.taxCode || '{{company_tax_code}}'} • <strong>Điện thoại:</strong> {block.props.phone || '{{company_phone}}'}</div>
                <div style={{ fontSize: 12, color: '#334155' }}><strong>Địa chỉ:</strong> {block.props.address || '{{company_address}}'}</div>
              </div>
            </Col>
            <Col xs={24} md={block.props.columns === 1 ? 24 : 12}>
              <div style={{ padding: '10px 14px', background: block.props.buyerBackgroundColor || '#fff', border: (block.props.showBorder ?? true) ? `1px solid ${block.props.borderColor || '#e2e8f0'}` : 'none', borderRadius: 6, height: '100%' }}>
                <div style={{ fontWeight: 700, color: '#0f172a', fontSize: 13, marginBottom: 4 }}>{block.props.buyerTitle || 'BÊN MUA (BÊN A)'}: {block.props.buyerCompany || '{{customer_company}}'}</div>
                <div style={{ fontSize: 12, color: '#334155' }}><strong>Khách hàng:</strong> {block.props.buyerName || '{{customer_name}}'}</div>
                <div style={{ fontSize: 12, color: '#334155' }}><strong>Mã số thuế:</strong> {block.props.buyerTaxCode || '{{customer_tax_code}}'} • <strong>Điện thoại:</strong> {block.props.buyerPhone || '{{customer_phone}}'}</div>
                <div style={{ fontSize: 12, color: '#334155' }}><strong>Địa chỉ:</strong> {block.props.buyerAddress || '{{customer_address}}'}</div>
              </div>
            </Col>
          </Row>
        );
      case BLOCK_TYPES.SERVICE_TABLE:
      case BLOCK_TYPES.PRODUCT_TABLE:
        const isService = block.type === BLOCK_TYPES.SERVICE_TABLE;
        const tableTitle = block.props.tableTitle;
        const enableProductName = block.props.enableProductName !== false;
        const enableProductDescription = block.props.enableProductDescription !== false;
        const useComplexDimensions = block.props.useComplexDimensions !== false;
        const dimCol = block.props.columns?.find(c => (typeof c === 'object' ? c.id : c) === 'dimensions');
        const dimensionFieldsRaw = dimCol?.children || [];
        const dimensionFields = dimensionFieldsRaw.length > 0
          ? dimensionFieldsRaw.map(c => ({ ...c, id: c.id, label: c.title, width: 85 }))
          : [{ id: 'height', label: 'Cao', width: 85 }, { id: 'width', label: 'Rộng', width: 85 }, { id: 'thickness', label: 'Dày', width: 85 }];
        return (
          <div style={{ marginBottom: 0 }}>
            {tableTitle && <div style={{ fontWeight: 600, color: '#0f172a', fontSize: 13, marginBottom: 8 }}>{tableTitle}</div>}
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              {block.props.showHeader !== false && (
                <thead>
                  <tr style={{ background: '#fafafa' }}>
                  {(block.props.columns || []).map(col => {
                    const colId = typeof col === 'object' ? col.id : col;
                    const colTitle = typeof col === 'object' ? col.title : null;
                    if (colId === 'stt') return <th key="stt" style={{ ...thStyle, color: clr, width: 40 }}>{colTitle || 'STT'}</th>;
                    if (colId === 'name') return <th key="name" style={{...thStyle, width: 200}}>{colTitle || (isService ? 'Tên dịch vụ / chi phí' : 'Tên hàng hóa / Dịch vụ')}</th>;
                    if (colId === 'symbol') return <th key="symbol" style={{...thStyle, width: 80}}>{colTitle || 'Ký hiệu'}</th>;
                    if (colId === 'specs') return <th key="specs" style={{...thStyle, width: 150}}>{colTitle || (isService ? 'Ghi chú kỹ thuật' : 'Quy cách kỹ thuật')}</th>;
                    if (colId === 'dimensions') return (
                      <th key="dimensions" style={{...thStyle, padding: 0, width: dimensionFields.reduce((s, f) => s + (f.width || 85), 0)}}>
                        <div style={{ borderBottom: useComplexDimensions ? '1px solid #e2e8f0' : 'none', padding: '4px 6px' }}>{colTitle || 'Kích thước (mm)'}</div>
                        {useComplexDimensions && (
                          <div style={{ display: 'flex' }}>
                            {dimensionFields.map((f, fi) => (
                              <div key={f.id} style={{ flex: 1, borderRight: fi < dimensionFields.length - 1 ? '1px solid #e2e8f0' : 'none', padding: '2px 6px' }}>{f.label}</div>
                            ))}
                          </div>
                        )}
                      </th>
                    );
                    if (colId === 'note') return <th key="note" style={{...thStyle, width: 120}}>{colTitle || 'Ghi chú'}</th>;
                    if (colId === 'unit') return <th key="unit" style={{...thStyle, width: 50}}>{colTitle || 'ĐVT'}</th>;
                    if (colId === 'qty') return <th key="qty" style={{...thStyle, width: 50}}>{colTitle || 'SL'}</th>;
                    if (colId === 'price') return <th key="price" style={{...thStyle, width: 90}}>{colTitle || 'Đơn giá'}</th>;
                    if (colId === 'total') return <th key="total" style={{...thStyle, width: 100}}>{colTitle || 'Thành tiền'}</th>;
                    
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
                <tr>
                  {(block.props.columns || []).map(col => {
                    const colId = typeof col === 'object' ? col.id : col;
                    const showSpecs = typeof block.props.columns?.[0] === 'object' 
                      ? block.props.columns.some(c => c.id === 'specs')
                      : block.props.columns?.includes('specs');

                    if (colId === 'stt') return <td key="stt" style={{ ...tdStyle, textAlign: 'center', fontWeight: 600, color: clr }}>1</td>;
                    if (colId === 'name') {
                      const showImg = typeof col === 'object' && col.allowImageUpload;
                      return (
                        <td key="name" style={{ ...tdStyle, textAlign: 'center' }}>
                          {showImg && (
                            <div style={{ width: 40, height: 40, background: '#e2e8f0', borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', fontSize: 10, marginBottom: 4, marginLeft: 'auto', marginRight: 'auto' }}>Ảnh</div>
                          )}
                          <div>
                            {enableProductName && <strong style={{ color: '#1e293b' }}>{isService ? 'Dịch vụ demo' : 'Sản phẩm demo A'}</strong>}
                            {enableProductName && enableProductDescription && !showSpecs && <br/>}
                            {enableProductDescription && !showSpecs && <span style={{ color: '#64748b', fontSize: 11 }}>Mô tả sản phẩm demo</span>}
                          </div>
                        </td>
                      );
                    }
                    if (colId === 'symbol') {
                      const showImg = typeof col === 'object' && col.allowImageUpload;
                      return (
                        <td key="symbol" style={{ ...tdStyle, textAlign: 'center' }}>
                          {showImg && (
                            <div style={{ width: 40, height: 40, background: '#e2e8f0', borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', fontSize: 10, marginBottom: 4, marginLeft: 'auto', marginRight: 'auto' }}>Ảnh</div>
                          )}
                          <div><span style={{ fontWeight: 600, color: '#2563eb' }}>{isService ? 'SV1' : 'D1'}</span></div>
                        </td>
                      );
                    }
                    if (colId === 'specs') {
                      const showImg = typeof col === 'object' && col.allowImageUpload;
                      return (
                        <td key="specs" style={{ ...tdStyle, textAlign: 'center' }}>
                          {showImg && (
                            <div style={{ width: 40, height: 40, background: '#e2e8f0', borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', fontSize: 10, marginBottom: 4, marginLeft: 'auto', marginRight: 'auto' }}>Ảnh</div>
                          )}
                          <div><span style={{ color: '#475569', fontSize: 11 }}>{isService ? 'Ghi chú dịch vụ demo' : 'Mô tả sản phẩm demo'}</span></div>
                        </td>
                      );
                    }
                    if (colId === 'dimensions') {
                      const showImgParent = typeof col === 'object' && col.allowImageUpload;
                      return (
                        <td key="dimensions" style={{ ...tdStyle, padding: 0, verticalAlign: 'top' }}>
                          {!useComplexDimensions ? (
                            <div style={{ padding: '4px 6px', textAlign: 'center' }}>
                              {showImgParent && (
                                <div style={{ width: 40, height: 40, background: '#e2e8f0', borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', fontSize: 10, marginBottom: 4, marginLeft: 'auto', marginRight: 'auto' }}>Ảnh</div>
                              )}
                              <div>2200 x 900 x 45</div>
                            </div>
                          ) : (
                            <div style={{ display: 'flex', height: '100%' }}>
                              {dimensionFields.map((f, fi) => {
                                const showImgChild = typeof f === 'object' && f.allowImageUpload;
                                return (
                                  <div key={f.id} style={{ flex: 1, borderRight: fi < dimensionFields.length - 1 ? '1px dashed #e2e8f0' : 'none', padding: '4px 6px', textAlign: 'center' }}>
                                    {showImgChild && (
                                      <div style={{ width: 40, height: 40, background: '#e2e8f0', borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', fontSize: 10, marginBottom: 4, marginLeft: 'auto', marginRight: 'auto' }}>Ảnh</div>
                                    )}
                                    <div>{f.id === 'height' ? '2200' : f.id === 'width' ? '900' : f.id === 'thickness' ? '45' : '—'}</div>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </td>
                      );
                    }
                    if (colId === 'note') {
                      const showImg = typeof col === 'object' && col.allowImageUpload;
                      return (
                        <td key="note" style={{ ...tdStyle, color: '#475569', fontSize: 11, textAlign: 'center' }}>
                          {showImg && (
                            <div style={{ width: 40, height: 40, background: '#e2e8f0', borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', fontSize: 10, marginBottom: 4, marginLeft: 'auto', marginRight: 'auto' }}>Ảnh</div>
                          )}
                          <div>Khung ngoại 45x110</div>
                        </td>
                      );
                    }
                    if (colId === 'unit') {
                      const showImg = typeof col === 'object' && col.allowImageUpload;
                      return (
                        <td key="unit" style={{ ...tdStyle, textAlign: 'center' }}>
                          {showImg && (
                            <div style={{ width: 40, height: 40, background: '#e2e8f0', borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', fontSize: 10, marginBottom: 4, marginLeft: 'auto', marginRight: 'auto' }}>Ảnh</div>
                          )}
                          <div>{isService ? 'Lần' : 'Bộ'}</div>
                        </td>
                      );
                    }
                    if (colId === 'qty') {
                      const showImg = typeof col === 'object' && col.allowImageUpload;
                      return (
                        <td key="qty" style={{ ...tdStyle, textAlign: 'center' }}>
                          {showImg && (
                            <div style={{ width: 40, height: 40, background: '#e2e8f0', borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', fontSize: 10, marginBottom: 4, marginLeft: 'auto', marginRight: 'auto' }}>Ảnh</div>
                          )}
                          <div>{isService ? '1' : '2'}</div>
                        </td>
                      );
                    }
                    if (colId === 'price') {
                      const showImg = typeof col === 'object' && col.allowImageUpload;
                      return (
                        <td key="price" style={{ ...tdStyle, textAlign: 'center' }}>
                          {showImg && (
                            <div style={{ width: 40, height: 40, background: '#e2e8f0', borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', fontSize: 10, marginBottom: 4, marginLeft: 'auto', marginRight: 'auto' }}>Ảnh</div>
                          )}
                          <div>{isService ? '500,000 đ' : '1,250,000 đ'}</div>
                        </td>
                      );
                    }
                    if (colId === 'total') {
                      const showImg = typeof col === 'object' && col.allowImageUpload;
                      return (
                        <td key="total" style={{ ...tdStyle, textAlign: 'center' }}>
                          {showImg && (
                            <div style={{ width: 40, height: 40, background: '#e2e8f0', borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', fontSize: 10, marginBottom: 4, marginLeft: 'auto', marginRight: 'auto' }}>Ảnh</div>
                          )}
                          <div><strong style={{ color: clr }}>{isService ? '500,000 đ' : '2,500,000 đ'}</strong></div>
                        </td>
                      );
                    }
                    
                    if (colId.startsWith('custom_')) {
                      const showImg = typeof col === 'object' && col.allowImageUpload;
                      return (
                        <td key={colId} style={{ ...tdStyle, textAlign: 'center', color: '#64748b', fontSize: 11, fontStyle: 'italic' }}>
                          {showImg && (
                            <div style={{ width: 40, height: 40, background: '#e2e8f0', borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', fontSize: 10, marginBottom: 4, marginLeft: 'auto', marginRight: 'auto' }}>Ảnh</div>
                          )}
                          <div>Dữ liệu mẫu</div>
                        </td>
                      );
                    }
                    
                    if (colId.startsWith('group_')) {
                      const showImgParent = typeof col === 'object' && col.allowImageUpload;
                      const children = col.children || [];
                      return (
                        <td key={colId} style={{ ...tdStyle, padding: 0, verticalAlign: 'top' }}>
                          {showImgParent && (
                            <div style={{ padding: '4px 0', textAlign: 'center' }}>
                              <div style={{ width: 40, height: 40, background: '#e2e8f0', borderRadius: 4, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', fontSize: 10 }}>Ảnh</div>
                            </div>
                          )}
                          <div style={{ display: 'flex', height: '100%' }}>
                            {children.length > 0 ? children.map((child, idx) => {
                              const showImgChild = typeof child === 'object' && child.allowImageUpload;
                              return (
                                <div key={child.id} style={{ flex: 1, borderRight: idx < children.length - 1 ? '1px dashed #e2e8f0' : 'none', padding: '4px 6px', textAlign: 'center', color: '#64748b', fontSize: 11, fontStyle: 'italic' }}>
                                  {showImgChild && (
                                    <div style={{ width: 40, height: 40, background: '#e2e8f0', borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', fontSize: 10, marginBottom: 4, marginLeft: 'auto', marginRight: 'auto' }}>Ảnh</div>
                                  )}
                                  <div>Mẫu</div>
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
                {block.props.actionButtons && block.props.actionButtons.length > 0 && (
                  <tr style={{ background: '#f8fafc' }}>
                    <td colSpan={100} style={{ padding: '8px 12px', borderBottom: '1px solid #e2e8f0', textAlign: 'left' }}>
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                        <span style={{ fontSize: 11, color: '#64748b', fontStyle: 'italic', marginRight: 4 }}>Mô phỏng Nút hành động:</span>
                        {block.props.actionButtons.map((btn, idx) => (
                          <div key={idx} style={{ padding: '4px 10px', background: '#fff', border: '1px dashed #cbd5e1', borderRadius: 4, color: '#3b82f6', fontSize: 11, cursor: 'default', display: 'flex', alignItems: 'center', gap: 4 }}>
                            <span style={{ fontSize: 14 }}>+</span> {btn.label || `Nút hành động ${idx + 1}`}
                          </div>
                        ))}
                      </div>
                    </td>
                  </tr>
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
              {block.props.showSubtotal && <div style={{ fontSize: 12, color: '#64748b' }}>Cộng tiền hàng: 2,500,000 đ</div>}
              {block.props.showDiscount && <div style={{ fontSize: 12, color: '#64748b' }}>Chiết khấu chung: -50,000 đ</div>}
              {block.props.showVAT && <div style={{ fontSize: 12, color: '#64748b' }}>Thuế GTGT (10%): 250,000 đ</div>}
              {block.props.showShippingFee && <div style={{ fontSize: 12, color: '#64748b' }}>Phí vận chuyển: 50,000 đ</div>}
              {block.props.showInstallationFee && <div style={{ fontSize: 12, color: '#64748b' }}>Phí thi công / lắp đặt: 100,000 đ</div>}
              <div style={{ fontSize: 15, fontWeight: 700, color: clr, marginTop: 4 }}>
                TỔNG THANH TOÁN: 2,850,000 đ
              </div>
              {block.props.showWords && <div style={{ fontStyle: 'italic', fontSize: 12, marginTop: 4, color: '#334155' }}>Bằng chữ: Hai triệu tám trăm năm mươi nghìn đồng.</div>}
            </Col>
          </Row>
        );
      case BLOCK_TYPES.PAYMENT_PROGRESS:
        const progressTitle = block.props.title || 'Tiến độ thanh toán:';
        return (
          <div style={{ marginBottom: 0 }}>
            <div style={{ fontWeight: 600, color: '#0f172a', fontSize: 13, marginBottom: 8, textDecoration: 'underline' }}>{progressTitle}</div>
            <ul style={{ paddingLeft: 20, marginBottom: 12, fontSize: 12, color: '#334155' }}>
              <li>Thanh toán đợt 1 (100%): <strong style={{ color: clr }}>2,750,000 đ</strong></li>
            </ul>
            {block.props.showPaidAndDebt !== false && (
              <div style={{ border: '1px dashed #cbd5e1', padding: '10px 14px', borderRadius: 8, background: '#f8fafc', display: 'inline-block', minWidth: 200, marginBottom: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, fontSize: 12 }}>
                  <span style={{ color: '#475569' }}>Đã thanh toán:</span>
                  <strong style={{ color: '#16a34a' }}>0 đ</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                  <span style={{ color: '#475569' }}>Còn nợ:</span>
                  <strong style={{ color: '#ef4444' }}>2,750,000 đ</strong>
                </div>
              </div>
            )}
            {block.props.showDate && (
              <div style={{ fontSize: 12, color: '#334155', marginBottom: 4 }}>
                Ngày báo giá: <strong>{new Date().toLocaleDateString('vi-VN')}</strong>
              </div>
            )}
            {block.props.showDeliveryTime && (
              <div style={{ fontSize: 12, color: '#334155', marginBottom: 4 }}>
                Thời gian giao hàng / thi công: <strong>3-5 ngày làm việc</strong>
              </div>
            )}
            {block.props.showValidity && (
              <div style={{ fontSize: 12, color: '#334155' }}>
                Báo giá có giá trị trong vòng: <strong>30 ngày</strong>
              </div>
            )}
          </div>
        );
      case BLOCK_TYPES.TERMS:
        return (
          <div style={{ marginBottom: 0 }}>
            <div style={{ fontWeight: 600, color: '#0f172a', fontSize: 13, marginBottom: 6 }}>📝 Ghi chú & Điều khoản thanh toán:</div>
            <div style={{ background: '#f8fafc', padding: '10px 14px', borderRadius: 6, borderLeft: `4px solid ${clr}`, whiteSpace: 'pre-wrap', fontSize: 12, color: '#334155' }}>
              {block.props.content}
            </div>
          </div>
        );
      case BLOCK_TYPES.SIGNATURES:
        return (
          <Row justify="space-around" style={{ marginTop: 12, textAlign: 'center', paddingBottom: 0 }}>
            {Array.from({ length: block.props.columns || 2 }).map((_, idx) => (
              <Col xs={24} md={24 / (block.props.columns || 2)} key={idx}>
                <div style={{ fontWeight: 700, color: clr, fontSize: 13 }}>{block.props.titles?.[idx] || 'CHỮ KÝ'}</div>
                <div style={{ fontSize: 11, color: '#64748b', fontStyle: 'italic', marginBottom: 12 }}>(Ký, đóng dấu & ghi rõ họ tên)</div>
                <div style={{ height: 115, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {block.props.signatures?.[idx] ? (
                    <div style={{ padding: 8, border: '1px dashed #cbd5e1', borderRadius: 4, background: '#f8fafc', color: '#64748b', fontSize: 11, whiteSpace: 'pre-wrap', textAlign: 'center' }}>
                      {block.props.signatures[idx]}
                    </div>
                  ) : idx === 0 && block.props.columns > 1 ? (
                    <div style={{ width: 100, height: 60, border: '1px dashed #cbd5e1', borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', fontSize: 11 }}>Chữ ký khách hàng</div>
                  ) : (
                    <div style={{ position: 'relative', width: 140, height: 100 }}>
                      <div style={{ width: 100, height: 100, border: '1px dashed #ef4444', borderRadius: '50%', position: 'absolute', right: 0, opacity: 0.3, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#ef4444', fontSize: 11 }}>Dấu c.ty</div>
                      <div style={{ width: 120, height: 60, border: '1px dashed #cbd5e1', borderRadius: 4, position: 'absolute', bottom: 10, left: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', fontSize: 11 }}>Chữ ký ĐD</div>
                    </div>
                  )}
                </div>
              </Col>
            ))}
          </Row>
        );
      case BLOCK_TYPES.TEXT:
        return <div dangerouslySetInnerHTML={{ __html: block.props.content || '<p>Văn bản trống</p>' }} style={{ textAlign: block.props.textAlign }} />;
      case BLOCK_TYPES.IMAGE:
        return block.props.url ? (
          <div style={{ textAlign: block.props.align }}>
            <img src={block.props.url} alt="Block" style={{ width: block.props.width, maxWidth: '100%' }} />
          </div>
        ) : (
          <PlaceholderBlock title="Hình ảnh / Logo" description="Cấu hình đường dẫn ảnh ở cột phải" icon="🖼️" />
        );
      case BLOCK_TYPES.DIVIDER:
        return <Divider type="horizontal" style={{ borderTopWidth: block.props.thickness, borderColor: block.props.color, margin: `${block.props.margin}px 0` }} />;
      case BLOCK_TYPES.LAYOUT_ROW:
        return (
          <Row gutter={block.props.gap || 16} style={{ minHeight: 100 }}>
            {Array.from({ length: block.props.columns || 2 }).map((_, idx) => {
              const colId = `${block.id}_col_${idx}`;
              const colBlocks = (allBlocks || []).filter(b => b.parentId === colId);
              return (
                <Col span={24 / (block.props.columns || 2)} key={idx}>
                  <DroppableColumn 
                    id={colId}
                    colBlocks={colBlocks}
                    allBlocks={allBlocks}
                    isActive={isActive}
                    onSelect={onSelect}
                    onDelete={onDelete}
                    globalThemeColor={globalThemeColor}
                    globalTableStyle={globalTableStyle}
                    globalLayoutStyle={globalLayoutStyle}
                  />
                </Col>
              );
            })}
          </Row>
        );
      default:
        return <Text>Unknown Block: {block.type}</Text>;
    }
  };

  return (
    <div ref={setNodeRef} style={style} onClick={(e) => { e.stopPropagation(); onSelect(block.id); }}>
      {/* Drag Handle & Delete overlay, visible on hover or active */}
      <div 
        className="block-controls"
        style={{
          position: 'absolute',
          top: -12,
          right: 8,
          display: isActive ? 'flex' : 'none',
          background: '#fff',
          boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
          borderRadius: 4,
          zIndex: 10,
          padding: 4,
          gap: 4
        }}
      >
        <div {...attributes} {...listeners} style={{ cursor: 'grab', padding: '0 4px', color: '#888' }}>
          <HolderOutlined />
        </div>
        <div style={{ cursor: 'pointer', padding: '0 4px', color: '#ff4d4f' }} onClick={(e) => { e.stopPropagation(); onDelete(block.id); }}>
          <DeleteOutlined />
        </div>
      </div>

      <div style={{ padding: block.type === BLOCK_TYPES.LAYOUT_ROW ? 0 : 8 }}>
        {renderContent()}
      </div>
    </div>
  );
}
