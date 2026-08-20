import React from 'react';
import { Form, Input, Select, Switch, InputNumber, Divider, Typography, Tag, Tooltip, message, Button } from 'antd';
import { SwapOutlined, DeleteOutlined, PlusOutlined, HolderOutlined } from '@ant-design/icons';
import { BLOCK_TYPES } from './constants';
import ColumnManager from './ColumnManager';
import { TEMPLATE_VARIABLES } from '../../../utils/templateVariables';

const { Option } = Select;
const { TextArea } = Input;
const { Text } = Typography;

// ── DimensionFieldsManager ─────────────────────────────────────────────────
const DEFAULT_DIM_FIELDS = [
  { id: 'height', label: 'Cao', width: 85 },
  { id: 'width', label: 'Rộng', width: 85 },
  { id: 'thickness', label: 'Dày', width: 85 },
];

const DimensionFieldsManager = ({ value, onChange }) => {
  const fields = (value && value.length > 0) ? value : DEFAULT_DIM_FIELDS;
  const BUILTIN = ['height', 'width', 'thickness'];

  const handleLabelChange = (idx, newLabel) => {
    const next = fields.map((f, i) => i === idx ? { ...f, label: newLabel } : f);
    onChange(next);
  };

  const handleRemove = (idx) => {
    if (fields.length <= 1) { message.warning('Phải giữ ít nhất 1 trường kích thước!'); return; }
    onChange(fields.filter((_, i) => i !== idx));
  };

  const handleAdd = () => {
    const newId = `dim_${Date.now()}`;
    onChange([...fields, { id: newId, label: 'Trường mới', width: 85 }]);
  };

  const handleMoveUp = (idx) => {
    if (idx === 0) return;
    const next = [...fields];
    [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]];
    onChange(next);
  };

  const handleMoveDown = (idx) => {
    if (idx === fields.length - 1) return;
    const next = [...fields];
    [next[idx], next[idx + 1]] = [next[idx + 1], next[idx]];
    onChange(next);
  };

  return (
    <div style={{ border: '1px solid #e2e8f0', borderRadius: 6, padding: '10px 8px', background: '#f8fafc' }}>
      {fields.map((field, idx) => (
        <div key={field.id} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <Button type="text" size="small" icon={<HolderOutlined style={{ fontSize: 10 }} />}
              onClick={() => handleMoveUp(idx)} disabled={idx === 0}
              style={{ padding: '0 4px', height: 16, lineHeight: 1, color: '#94a3b8' }} />
            <Button type="text" size="small" icon={<HolderOutlined style={{ fontSize: 10, transform: 'rotate(180deg)' }} />}
              onClick={() => handleMoveDown(idx)} disabled={idx === fields.length - 1}
              style={{ padding: '0 4px', height: 16, lineHeight: 1, color: '#94a3b8' }} />
          </div>
          <Input
            size="small"
            value={field.label}
            onChange={(e) => handleLabelChange(idx, e.target.value)}
            style={{ flex: 1 }}
            placeholder="Tên hiển thị"
          />
          {!BUILTIN.includes(field.id) && (
            <Tag color="blue" style={{ fontSize: 10, margin: 0 }}>tuỳ chỉnh</Tag>
          )}
          <Tooltip title={BUILTIN.includes(field.id) ? 'Không thể xoá trường gốc (chỉ đổi tên)' : 'Xoá trường này'}>
            <Button
              type="text" danger size="small" icon={<DeleteOutlined />}
              disabled={BUILTIN.includes(field.id)}
              onClick={() => handleRemove(idx)}
            />
          </Tooltip>
        </div>
      ))}
      <Button type="dashed" icon={<PlusOutlined />} size="small" onClick={handleAdd}
        style={{ width: '100%', marginTop: 4 }}>
        Thêm trường kích thước
      </Button>
      <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 6 }}>
        💡 Trường gốc (Cao/Rộng/Dày) chỉ có thể đổi tên, không xoá được. Trường tuỳ chỉnh mới thêm có thể xoá.
      </div>
    </div>
  );
};

const VariableHints = () => {
  const grouped = TEMPLATE_VARIABLES.reduce((acc, v) => {
    if (!acc[v.type]) acc[v.type] = [];
    acc[v.type].push(v);
    return acc;
  }, {});

  const typeLabels = {
    company: '🏢 Thông tin Công ty',
    customer: '👤 Thông tin Khách hàng',
    quotation: '📄 Đơn hàng / Báo giá'
  };

  return (
    <div style={{ marginTop: 8, padding: '12px 12px 4px', background: '#f8fafc', borderRadius: 6, border: '1px dashed #cbd5e1' }}>
      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 12, color: '#334155' }}>💡 Biến tự động (Click để copy rồi dán vào ô nhập):</div>
      {Object.entries(grouped).map(([type, vars]) => (
        <div key={type} style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#64748b', marginBottom: 8 }}>{typeLabels[type]}</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px 16px' }}>
            {vars.map(v => (
              <div key={v.tag} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5 }}>
                <Tag 
                  color="blue" 
                  style={{ cursor: 'pointer', margin: 0, fontSize: 11, fontFamily: 'monospace' }}
                  onClick={() => {
                    navigator.clipboard.writeText(v.tag);
                    message.success(`Đã copy: ${v.tag}`);
                  }}
                >
                  {v.tag}
                </Tag>
                <span style={{ color: '#475569' }}>- {v.label}</span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
};

const ActionButtonsManager = ({ value = [], onChange, blockColumns = [] }) => {
  const handleAdd = () => {
    onChange([...value, { id: `btn_${Date.now()}`, label: 'Nút mới', mergeColumns: [] }]);
  };

  const handleRemove = (id) => {
    onChange(value.filter(b => b.id !== id));
  };

  const handleChange = (id, key, val) => {
    onChange(value.map(b => b.id === id ? { ...b, [key]: val } : b));
  };

  const allCols = [];
  (blockColumns || []).forEach(c => {
    if (c.children) {
      c.children.forEach(child => allCols.push(child));
    } else {
      allCols.push(c);
    }
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {value.map((btn, idx) => (
        <div key={btn.id} style={{ background: '#f1f5f9', padding: 12, borderRadius: 6, position: 'relative' }}>
          <Button 
            type="text" 
            danger 
            icon={<DeleteOutlined />} 
            size="small" 
            style={{ position: 'absolute', top: 4, right: 4 }} 
            onClick={() => handleRemove(btn.id)} 
          />
          <div style={{ marginBottom: 8, fontWeight: 500, fontSize: 12 }}>Nút hành động {idx + 1}</div>
          <Input 
            size="small" 
            placeholder="Tên nút hiển thị" 
            value={btn.label} 
            onChange={(e) => handleChange(btn.id, 'label', e.target.value)} 
            style={{ marginBottom: 8 }}
          />
          <Select
            mode="multiple"
            size="small"
            style={{ width: '100%' }}
            placeholder="Chọn các cột sẽ gộp với nhau"
            value={btn.mergeColumns || []}
            onChange={(val) => handleChange(btn.id, 'mergeColumns', val)}
          >
            {allCols.map(c => (
              <Option key={c.id} value={c.id}>{c.title || c.id}</Option>
            ))}
          </Select>
        </div>
      ))}
      <Button type="dashed" icon={<PlusOutlined />} onClick={handleAdd} size="small">Thêm nút</Button>
    </div>
  );
};

export default function SettingsPanel({ block, onChange }) {
  const [form] = Form.useForm();

  // Update form fields when block changes
  React.useEffect(() => {
    if (block) {
      form.setFieldsValue(block.props);
    }
  }, [block, form]);

  if (!block) return null;

  const handleValuesChange = (changedValues, allValues) => {
    onChange(block.id, allValues);
  };

  const renderFields = () => {
    switch (block.type) {
      case BLOCK_TYPES.TEXT:
        return (
          <>
            <Form.Item name="content" label="Nội dung">
              <TextArea rows={4} />
            </Form.Item>
            <VariableHints />
            <Form.Item name="textAlign" label="Căn lề">
              <Select>
                <Option value="left">Trái</Option>
                <Option value="center">Giữa</Option>
                <Option value="right">Phải</Option>
                <Option value="justify">Đều hai bên</Option>
              </Select>
            </Form.Item>
          </>
        );
      case BLOCK_TYPES.IMAGE:
        return (
          <>
            <Form.Item name="url" label="Đường dẫn ảnh (URL)">
              <Input placeholder="https://..." />
            </Form.Item>
            <Form.Item name="width" label="Độ rộng">
              <Input placeholder="100px, 50%, ..." />
            </Form.Item>
            <Form.Item name="align" label="Căn lề">
              <Select>
                <Option value="left">Trái</Option>
                <Option value="center">Giữa</Option>
                <Option value="right">Phải</Option>
              </Select>
            </Form.Item>
          </>
        );
      case BLOCK_TYPES.HEADER_LOGO:
        return (
          <>
            <Form.Item name="logoUrl" label="Đường dẫn Ảnh Logo (URL)">
              <Input placeholder="Để trống để dùng logo công ty mặc định..." />
            </Form.Item>
            <Form.Item name="companyName" label="Tên Công Ty">
              <Input />
            </Form.Item>
            <Form.Item name="phone" label="Số Điện Thoại / Hotline">
              <Input />
            </Form.Item>
            <Form.Item name="taxCode" label="Mã Số Thuế">
              <Input />
            </Form.Item>
            <Form.Item name="address" label="Địa Chỉ">
              <TextArea rows={2} />
            </Form.Item>
            <VariableHints />
            <Form.Item name="themeColor" label="Màu Sắc Chủ Đạo">
              <Input type="color" />
            </Form.Item>
          </>
        );
      case BLOCK_TYPES.TITLE:
        return (
          <>
            <div style={{ fontWeight: 600, color: '#334155', marginBottom: 8, paddingBottom: 4, borderBottom: '1px solid #e2e8f0' }}>Cấu hình cho Báo giá</div>
            <Form.Item name="title" label="Tiêu đề Báo giá">
              <Input placeholder="VD: BẢNG BÁO GIÁ CHI TIẾT" />
            </Form.Item>
            <Form.Item name="subtitle" label="Lời chào (Báo giá)">
              <TextArea rows={3} placeholder="VD: Kính gửi Quý khách, chúng tôi xin gửi báo giá..." />
            </Form.Item>
            
            <div style={{ fontWeight: 600, color: '#334155', marginTop: 16, marginBottom: 8, paddingBottom: 4, borderBottom: '1px solid #e2e8f0' }}>Cấu hình cho Đơn hàng</div>
            <Form.Item name="orderTitle" label="Tiêu đề Đơn hàng">
              <Input placeholder="VD: ĐƠN ĐẶT HÀNG" />
            </Form.Item>
            <Form.Item name="orderSubtitle" label="Lời chào (Đơn hàng)">
              <TextArea rows={3} placeholder="VD: Kính gửi Quý khách, chúng tôi xin gửi thông tin đơn hàng..." />
            </Form.Item>

            <VariableHints />
            <Form.Item name="metaText" label="Dòng thông tin phụ (Số / Ngày tháng)" extra="Mẹo: Dùng biến {{quotation_code}} và {{current_date}}">
              <Input placeholder="Số: {{quotation_code}} | Ngày: {{current_date}}" />
            </Form.Item>
            <Form.Item name="themeColor" label="Màu Sắc Chủ Đạo">
              <Input type="color" />
            </Form.Item>
          </>
        );
      case BLOCK_TYPES.CUSTOMER_INFO:
        return (
          <>
            <div style={{ fontWeight: 600, color: '#334155', marginBottom: 8, paddingBottom: 4, borderBottom: '1px solid #e2e8f0' }}>Thông tin Bên Bán (Bên B)</div>
            <Form.Item name="sellerTitle" label="Tiêu đề khối">
              <Input placeholder="VD: BÊN BÁN (BÊN B)" />
            </Form.Item>
            <Form.Item name="companyName" label="Tên Công ty">
              <Input placeholder="Dùng biến {{company_name}} hoặc nhập tay..." />
            </Form.Item>
            <Form.Item name="representative" label="Người đại diện">
              <Input placeholder="Dùng biến {{director_name}} hoặc nhập tay..." />
            </Form.Item>
            <Form.Item name="position" label="Chức vụ">
              <Input placeholder="Dùng biến {{director_title}} hoặc nhập tay..." />
            </Form.Item>
            <Form.Item name="taxCode" label="Mã số thuế">
              <Input placeholder="Dùng biến {{company_tax_code}} hoặc nhập tay..." />
            </Form.Item>
            <Form.Item name="phone" label="Số điện thoại">
              <Input placeholder="Dùng biến {{company_phone}} hoặc nhập tay..." />
            </Form.Item>
            <Form.Item name="address" label="Địa chỉ">
              <TextArea rows={2} placeholder="Dùng biến {{company_address}} hoặc nhập tay..." />
            </Form.Item>

            <Divider style={{ margin: '12px 0' }} />
            <div style={{ fontWeight: 600, color: '#334155', marginBottom: 8, paddingBottom: 4, borderBottom: '1px solid #e2e8f0' }}>Thông tin Bên Mua (Bên A)</div>
            <Form.Item name="buyerTitle" label="Tiêu đề khối">
              <Input placeholder="VD: BÊN MUA (BÊN A)" />
            </Form.Item>
            <Form.Item name="buyerCompany" label="Tên công ty khách hàng">
              <Input placeholder="Dùng biến {{customer_company}} hoặc nhập tay..." />
            </Form.Item>
            <Form.Item name="buyerName" label="Khách hàng / Người đại diện">
              <Input placeholder="Dùng biến {{customer_name}} hoặc nhập tay..." />
            </Form.Item>
            <Form.Item name="buyerTaxCode" label="Mã số thuế">
              <Input placeholder="Dùng biến {{customer_tax_code}} hoặc nhập tay..." />
            </Form.Item>
            <Form.Item name="buyerPhone" label="Số điện thoại">
              <Input placeholder="Dùng biến {{customer_phone}} hoặc nhập tay..." />
            </Form.Item>
            <Form.Item name="buyerAddress" label="Địa chỉ">
              <TextArea rows={2} placeholder="Dùng biến {{customer_address}} hoặc nhập tay..." />
            </Form.Item>

            <VariableHints />

            <Divider style={{ margin: '12px 0' }} />
            <div style={{ fontWeight: 600, color: '#334155', marginBottom: 8, paddingBottom: 4, borderBottom: '1px solid #e2e8f0' }}>Tùy chỉnh giao diện hiển thị</div>

            <Form.Item name="columns" label="Số cột hiển thị">
              <Select>
                <Option value={1}>1 Cột (Trên / Dưới)</Option>
                <Option value={2}>2 Cột (Trái / Phải)</Option>
              </Select>
            </Form.Item>
            <Form.Item name="showBorder" label="Hiển thị khung viền khối" valuePropName="checked">
              <Switch />
            </Form.Item>
            <Form.Item name="sellerBackgroundColor" label="Màu nền khối Bên Bán">
              <Input type="color" />
            </Form.Item>
            <Form.Item name="buyerBackgroundColor" label="Màu nền khối Bên Mua">
              <Input type="color" />
            </Form.Item>
            <Form.Item name="borderColor" label="Màu sắc khung viền">
              <Input type="color" />
            </Form.Item>
            <Form.Item name="themeColor" label="Màu Sắc Tiêu Đề">
              <Input type="color" />
            </Form.Item>
          </>
        );
      case BLOCK_TYPES.SERVICE_TABLE:
      case BLOCK_TYPES.PRODUCT_TABLE:
        return (
          <>
            <Form.Item name="tableTitle" label="Tiêu đề bảng (để trống sẽ ẩn)">
              <Input placeholder="VD: SẢN PHẨM / DỊCH VỤ:" />
            </Form.Item>
            <VariableHints />
            <Form.Item name="showHeader" label="Hiển thị hàng tiêu đề (Tên cột)" valuePropName="checked" initialValue={true}>
              <Switch />
            </Form.Item>
            <Form.Item name="showBorder" label="Hiển thị khung viền bảng" valuePropName="checked" initialValue={true}>
              <Switch />
            </Form.Item>
            
            <Divider style={{ margin: '12px 0' }} />
            <div style={{ fontWeight: 600, color: '#334155', marginBottom: 8, paddingBottom: 4, borderBottom: '1px solid #e2e8f0' }}>Cài đặt tính năng nâng cao</div>
            <Form.Item name="enableProductImage" label="Hiển thị ảnh Mẫu cửa/Sản phẩm" valuePropName="checked" initialValue={true}>
              <Switch />
            </Form.Item>
            <Form.Item name="enableProductName" label="Hiển thị Tiêu đề sản phẩm" valuePropName="checked" initialValue={true}>
              <Switch />
            </Form.Item>
            {block.type === BLOCK_TYPES.PRODUCT_TABLE && (
              <Form.Item name="enableProductDescription" label="Hiển thị Mô tả sản phẩm" valuePropName="checked" initialValue={true}>
                <Switch />
              </Form.Item>
            )}

            {block.type === BLOCK_TYPES.PRODUCT_TABLE && (
              <Form.Item name="useComplexDimensions" label="Sử dụng cột Kích thước chia ngách" valuePropName="checked" initialValue={true} tooltip="Nếu tắt, cột Kích thước sẽ chỉ là 1 ô nhập chữ thông thường">
                <Switch />
              </Form.Item>
            )}
            
            <Divider style={{ margin: '12px 0' }} />
            <div style={{ fontWeight: 600, color: '#334155', marginBottom: 8, paddingBottom: 4, borderBottom: '1px solid #e2e8f0' }}>Quản lý Nút Hành động (Hàng con)</div>
            <Form.Item name="actionButtons">
              <ActionButtonsManager blockColumns={form.getFieldValue('columns')} />
            </Form.Item>

            <Divider style={{ margin: '12px 0' }} />
            <div style={{ fontWeight: 600, color: '#334155', marginBottom: 8, paddingBottom: 4, borderBottom: '1px solid #e2e8f0' }}>Quản lý Cột & Giao diện</div>
            <Form.Item name="columns" label="Danh sách cột hiển thị">
              <ColumnManager />
            </Form.Item>
            <Form.Item name="themeColor" label="Màu Sắc Chủ Đạo">
              <Input type="color" />
            </Form.Item>
          </>
        );
      case BLOCK_TYPES.TOTALS:
        return (
          <>
            <Form.Item name="showSubtotal" label="Cộng tiền hàng" valuePropName="checked">
              <Switch />
            </Form.Item>
            <Form.Item name="showDiscount" label="Chiết khấu" valuePropName="checked">
              <Switch />
            </Form.Item>
            <Form.Item name="showVAT" label="Thuế GTGT (VAT)" valuePropName="checked">
              <Switch />
            </Form.Item>
            <Form.Item name="showShippingFee" label="Phí vận chuyển" valuePropName="checked">
              <Switch />
            </Form.Item>
            <Form.Item name="showInstallationFee" label="Phí thi công/lắp đặt" valuePropName="checked">
              <Switch />
            </Form.Item>
            <Form.Item name="showWords" label="Viết bằng chữ" valuePropName="checked">
              <Switch />
            </Form.Item>
            <Form.Item name="showBorder" label="Hiển thị khung viền" valuePropName="checked">
              <Switch />
            </Form.Item>
            <Form.Item name="backgroundColor" label="Màu nền khối">
              <Input type="color" />
            </Form.Item>
            <Form.Item name="themeColor" label="Màu Sắc Chủ Đạo">
              <Input type="color" />
            </Form.Item>
          </>
        );
      case BLOCK_TYPES.PAYMENT_PROGRESS:
        return (
          <>
            <Form.Item name="title" label="Tiêu đề khối">
              <Input placeholder="Tiến độ thanh toán:" />
            </Form.Item>
            <Form.Item name="subtitle" label="Tiêu đề phụ">
              <Input placeholder="Kính gửi Quý khách hàng..." />
            </Form.Item>
            <VariableHints />
            <Form.Item name="showDate" label="Hiển thị ngày báo giá" valuePropName="checked">
              <Switch />
            </Form.Item>
            <Form.Item name="showDeliveryTime" label="Hiển thị thời gian giao hàng" valuePropName="checked">
              <Switch />
            </Form.Item>
            <Form.Item name="showValidity" label="Hiển thị hiệu lực báo giá" valuePropName="checked">
              <Switch />
            </Form.Item>
            <Form.Item name="showPaidAndDebt" label="Hiển thị Đã thanh toán / Còn nợ" valuePropName="checked">
              <Switch />
            </Form.Item>
            <Form.Item name="showInstallationDate" label="Ngày giao hàng / lắp đặt dự kiến" valuePropName="checked">
              <Switch />
            </Form.Item>
          </>
        );
      case BLOCK_TYPES.TERMS:
        return (
          <>
            <Form.Item name="content" label="Nội dung điều khoản">
              <TextArea rows={6} />
            </Form.Item>
            <VariableHints />
            <Form.Item name="themeColor" label="Màu Sắc Chủ Đạo">
              <Input type="color" />
            </Form.Item>
          </>
        );
      case BLOCK_TYPES.SIGNATURES:
        const sigCols = form.getFieldValue('columns') || 2;
        return (
          <>
            <Form.Item name="columns" label="Số lượng chữ ký (Cột)">
              <Select onChange={() => form.setFieldsValue({ columns: form.getFieldValue('columns') })}>
                <Option value={1}>1 Người ký</Option>
                <Option value={2}>2 Người ký</Option>
                <Option value={3}>3 Người ký</Option>
                <Option value={4}>4 Người ký</Option>
              </Select>
            </Form.Item>
            
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, paddingBottom: 4, borderBottom: '1px solid #e2e8f0' }}>
              <span style={{ fontWeight: 600, color: '#334155' }}>Tiêu đề và chữ ký</span>
              {sigCols >= 2 && (
                <Button 
                  type="text" 
                  size="small" 
                  icon={<SwapOutlined />} 
                  onClick={() => {
                    const titles = form.getFieldValue('titles') || [];
                    const signatures = form.getFieldValue('signatures') || [];
                    
                    const newTitles = [...titles];
                    const newSignatures = [...signatures];
                    
                    if (newTitles.length >= 2) {
                      const temp = newTitles[0];
                      newTitles[0] = newTitles[1];
                      newTitles[1] = temp;
                    }
                    if (newSignatures.length >= 2) {
                      const temp = newSignatures[0];
                      newSignatures[0] = newSignatures[1];
                      newSignatures[1] = temp;
                    }
                    
                    form.setFieldsValue({ titles: newTitles, signatures: newSignatures });
                    
                    // Trigger onChange
                    const currentValues = form.getFieldsValue();
                    onValuesChange(null, currentValues);
                  }}
                  style={{ fontSize: 12, color: '#1677ff' }}
                >
                  Đổi vị trí (1 ↔ 2)
                </Button>
              )}
            </div>
            
            {Array.from({ length: sigCols }).map((_, index) => (
              <div key={index} style={{ marginBottom: 12, border: '1px solid #e2e8f0', padding: '10px 8px', borderRadius: 6, background: '#f8fafc' }}>
                <Form.Item label={`Tiêu đề Người ký ${index + 1}`} style={{ marginBottom: 10 }}>
                  <Form.Item name={['titles', index]} noStyle>
                    <Input placeholder={`Vd: ĐẠI DIỆN ${index + 1}`} />
                  </Form.Item>
                </Form.Item>
                <Form.Item label={`Biến chữ ký / dấu ${index + 1}`} style={{ marginBottom: 0 }}>
                  <Form.Item name={['signatures', index]} noStyle>
                    <Input placeholder="Vd: {{company_signature}} {{company_stamp}}" />
                  </Form.Item>
                </Form.Item>
              </div>
            ))}

            <VariableHints />

            <Form.Item name="themeColor" label="Màu Sắc Chủ Đạo">
              <Input type="color" />
            </Form.Item>
          </>
        );
      case BLOCK_TYPES.DIVIDER:
        return (
          <>
            <Form.Item name="thickness" label="Độ dày (px)">
              <InputNumber min={1} max={10} style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item name="margin" label="Khoảng cách trên/dưới (px)">
              <InputNumber min={0} max={100} style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item name="color" label="Mã màu (HEX)">
              <Input type="color" />
            </Form.Item>
          </>
        );
      case BLOCK_TYPES.LAYOUT_ROW:
        return (
          <>
            <Form.Item name="columns" label="Số cột">
              <Select>
                <Option value={1}>1 Cột</Option>
                <Option value={2}>2 Cột</Option>
                <Option value={3}>3 Cột</Option>
                <Option value={4}>4 Cột</Option>
              </Select>
            </Form.Item>
            <Form.Item name="gap" label="Khoảng cách giữa các cột (px)">
              <InputNumber min={0} max={100} style={{ width: '100%' }} />
            </Form.Item>
            <Text type="secondary" style={{ display: 'block', marginTop: 8 }}>
              Tỷ lệ cột sẽ tự động chia đều. Ví dụ 2 cột là 50/50. Tính năng tùy chỉnh tỷ lệ phức tạp sẽ được cập nhật sau.
            </Text>
          </>
        );

      default:
        return <Text type="secondary">Chưa có cài đặt chi tiết cho loại khối này.</Text>;
    }
  };

  return (
    <Form
      form={form}
      layout="vertical"
      onValuesChange={handleValuesChange}
    >
      {renderFields()}
    </Form>
  );
}
