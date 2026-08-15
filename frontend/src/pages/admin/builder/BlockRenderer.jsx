import React from 'react';
import { BLOCK_TYPES } from './constants';
import { Card, Typography, Row, Col, Space, Divider } from 'antd';
import { HolderOutlined, DeleteOutlined } from '@ant-design/icons';
import { useSortable } from '@dnd-kit/sortable';
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

// Basic rendering logic for blocks in the canvas
export default function BlockRenderer({ block, isActive, onSelect, onDelete }) {
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
    marginBottom: 16,
    position: 'relative',
    border: isActive ? '2px solid #1677ff' : '2px solid transparent',
  };

  const renderContent = () => {
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
      case BLOCK_TYPES.CUSTOMER_INFO:
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
                <div style={{ fontSize: 12, color: '#334155' }}><strong>Khách hàng:</strong> Công ty ABC</div>
                <div style={{ fontSize: 12, color: '#334155' }}><strong>Mã số thuế:</strong> 0109999999 • <strong>Điện thoại:</strong> 0912345678</div>
                <div style={{ fontSize: 12, color: '#334155' }}><strong>Địa chỉ:</strong> Tòa nhà văn phòng XYZ</div>
              </div>
            </Col>
          </Row>
        );
      case BLOCK_TYPES.PRODUCT_TABLE:
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
                <tr>
                  {block.props.columns?.includes('stt') && <td style={{ border: '1px solid #e2e8f0', padding: 8, textAlign: 'center', fontWeight: 600, color: clr }}>1</td>}
                  {block.props.columns?.includes('name') && <td style={{ border: '1px solid #e2e8f0', padding: 8 }}><strong style={{ color: '#1e293b' }}>Sản phẩm demo A</strong><br/><span style={{ color: '#64748b', fontSize: 11 }}>Ghi chú sản phẩm</span></td>}
                  {block.props.columns?.includes('unit') && <td style={{ border: '1px solid #e2e8f0', padding: 8, textAlign: 'center' }}>Cái</td>}
                  {block.props.columns?.includes('qty') && <td style={{ border: '1px solid #e2e8f0', padding: 8, textAlign: 'center' }}>2</td>}
                  {block.props.columns?.includes('price') && <td style={{ border: '1px solid #e2e8f0', padding: 8, textAlign: 'right' }}>1,250,000 đ</td>}
                  {block.props.columns?.includes('total') && <td style={{ border: '1px solid #e2e8f0', padding: 8, textAlign: 'right' }}><strong style={{ color: clr }}>2,500,000 đ</strong></td>}
                </tr>
              </tbody>
            </table>
          </div>
        );
      case BLOCK_TYPES.TOTALS:
        return (
          <Row justify="end" style={{ marginBottom: 16 }}>
            <Col xs={24} md={11} style={{ textAlign: 'right', padding: '10px 14px', background: '#f8fafc', borderRadius: 6, border: '1px solid #e2e8f0' }}>
              {block.props.showSubtotal && <div style={{ fontSize: 12, color: '#64748b' }}>Cộng tiền hàng: 2,500,000 đ</div>}
              {block.props.showDiscount && <div style={{ fontSize: 12, color: '#64748b' }}>Chiết khấu chung: -0 đ</div>}
              {block.props.showVAT && <div style={{ fontSize: 12, color: '#64748b' }}>Thuế GTGT (10%): 250,000 đ</div>}
              <div style={{ fontSize: 15, fontWeight: 700, color: clr, marginTop: 4 }}>
                TỔNG THANH TOÁN: 2,750,000 đ
              </div>
              {block.props.showWords && <div style={{ fontStyle: 'italic', fontSize: 12, marginTop: 4, color: '#334155' }}>Bằng chữ: Hai triệu bảy trăm năm mươi nghìn đồng chẵn.</div>}
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
          <Row gutter={block.props.gap || 16}>
            {Array.from({ length: block.props.columns || 2 }).map((_, idx) => (
              <Col span={24 / (block.props.columns || 2)} key={idx}>
                <div style={{ minHeight: 60, border: '1px dashed #d9d9d9', background: '#fafafa', padding: 8 }}>
                  <Text type="secondary" style={{ fontSize: 12 }}>Cột {idx + 1}</Text>
                </div>
              </Col>
            ))}
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
