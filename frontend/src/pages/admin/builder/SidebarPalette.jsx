import React, { useState, useEffect } from 'react';
import { Typography, Card, Space, Tabs, message, Button, Popconfirm } from 'antd';
import { 
  DeleteOutlined, IdcardOutlined, FormOutlined, UserOutlined, TableOutlined, 
  ToolOutlined, CalculatorOutlined, LineChartOutlined, ProfileOutlined, 
  HighlightOutlined, AlignLeftOutlined, PictureOutlined, MinusOutlined, 
  AppstoreAddOutlined, StarOutlined
} from '@ant-design/icons';
import { useDraggable } from '@dnd-kit/core';
import { BLOCK_TYPES } from './constants';
import api from '../../../utils/api';

const { Title, Text } = Typography;

const PALETTE_ITEMS = [
  { type: BLOCK_TYPES.HEADER_LOGO, title: 'Khối Header & Logo', icon: <IdcardOutlined style={{ color: '#1677ff' }} /> },
  { type: BLOCK_TYPES.TITLE, title: 'Khối Tiêu đề & Lời chào', icon: <FormOutlined style={{ color: '#1677ff' }} /> },
  { type: BLOCK_TYPES.CUSTOMER_INFO, title: 'Khối Thông tin Khách hàng', icon: <UserOutlined style={{ color: '#1677ff' }} /> },
  { type: BLOCK_TYPES.PRODUCT_TABLE, title: 'Khối Bảng Sản phẩm', icon: <TableOutlined style={{ color: '#1677ff' }} /> },
  { type: BLOCK_TYPES.SERVICE_TABLE, title: 'Khối Dịch vụ & Phát sinh', icon: <ToolOutlined style={{ color: '#1677ff' }} /> },
  { type: BLOCK_TYPES.TOTALS, title: 'Khối Tổng kết Thanh toán', icon: <CalculatorOutlined style={{ color: '#1677ff' }} /> },
  { type: BLOCK_TYPES.PAYMENT_PROGRESS, title: 'Khối Tiến độ thanh toán', icon: <LineChartOutlined style={{ color: '#1677ff' }} /> },
  { type: BLOCK_TYPES.TERMS, title: 'Khối Ghi chú & Điều khoản', icon: <ProfileOutlined style={{ color: '#1677ff' }} /> },
  { type: BLOCK_TYPES.SIGNATURES, title: 'Khối Chữ ký Xác nhận', icon: <HighlightOutlined style={{ color: '#1677ff' }} /> },
  { type: BLOCK_TYPES.TEXT, title: 'Khối Văn bản tự do', icon: <AlignLeftOutlined style={{ color: '#1677ff' }} /> },
  { type: BLOCK_TYPES.IMAGE, title: 'Khối Hình ảnh', icon: <PictureOutlined style={{ color: '#1677ff' }} /> },
  { type: BLOCK_TYPES.DIVIDER, title: 'Phân cách / Khoảng trống', icon: <MinusOutlined style={{ color: '#1677ff' }} /> },
  { type: BLOCK_TYPES.LAYOUT_ROW, title: 'Khối Layout (Cột)', icon: <AppstoreAddOutlined style={{ color: '#1677ff' }} /> }
];

function DraggablePaletteItem({ item, isSaved = false }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: isSaved ? `saved-${item.id}` : `palette-${item.type}`,
    data: {
      type: item.type,
      isNew: true,
      savedProps: item.props || null // For saved blocks, we carry the props
    },
  });

  return (
    <Card
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      size="small"
      style={{
        cursor: isDragging ? 'grabbing' : 'grab',
        opacity: isDragging ? 0.5 : 1,
        borderColor: item.type === BLOCK_TYPES.LAYOUT_ROW ? '#1677ff' : '#f0f0f0',
        background: isSaved ? '#f9f0ff' : '#fff',
        position: 'relative'
      }}
    >
      <Space>
        {item.icon}
        <Text ellipsis style={{ maxWidth: isSaved ? '80%' : '100%' }}>{item.title}</Text>
      </Space>
    </Card>
  );
}

export default function SidebarPalette() {
  const [savedBlocks, setSavedBlocks] = useState([]);

  useEffect(() => {
    fetchSavedBlocks();
  }, []);

  const fetchSavedBlocks = async () => {
    try {
      const res = await api.get('/sales/saved-template-blocks/');
      setSavedBlocks(res.data.results || res.data);
    } catch (err) {
      console.error('Không tải được Block mẫu');
    }
  };

  const deleteSavedBlock = async (id) => {
    try {
      await api.delete(`/sales/saved-template-blocks/${id}/`);
      message.success('Đã xóa block lưu');
      fetchSavedBlocks();
    } catch (err) {
      message.error('Lỗi khi xóa block');
    }
  };

  const basicTab = (
    <Space direction="vertical" style={{ width: '100%' }}>
      {PALETTE_ITEMS.map((item) => (
        <DraggablePaletteItem key={item.type} item={item} />
      ))}
    </Space>
  );

  const savedTab = (
    <Space direction="vertical" style={{ width: '100%' }}>
      {savedBlocks.length === 0 ? (
        <Text type="secondary" style={{ fontSize: 12 }}>Bạn chưa lưu block nào. Chuột phải vào block trên giấy và chọn "Lưu thành Block mẫu".</Text>
      ) : (
        savedBlocks.map((block) => (
          <div key={block.id} style={{ position: 'relative' }}>
            <DraggablePaletteItem 
              item={{ 
                id: block.id, 
                type: block.block_type, 
                title: block.name, 
                icon: <StarOutlined style={{ color: '#faad14' }} />, 
                props: block.props 
              }} 
              isSaved={true} 
            />
            <Popconfirm title="Xóa block này?" onConfirm={() => deleteSavedBlock(block.id)}>
              <Button size="small" type="text" danger icon={<DeleteOutlined />} style={{ position: 'absolute', right: 4, top: 4, zIndex: 10 }} />
            </Popconfirm>
          </div>
        ))
      )}
      <Button type="dashed" size="small" block onClick={fetchSavedBlocks}>Làm mới</Button>
    </Space>
  );

  return (
    <div>
      <Tabs defaultActiveKey="1" items={[
        { key: '1', label: 'Cơ bản', children: basicTab },
        { key: '2', label: 'Của tôi', children: savedTab },
      ]} />
    </div>
  );
}
