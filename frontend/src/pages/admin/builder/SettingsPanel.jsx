import React from 'react';
import { Form, Input, Select, Switch, InputNumber, Divider, Typography, Tag, Tooltip, message } from 'antd';
import { BLOCK_TYPES } from './constants';
import ColumnManager from './ColumnManager';
import { TEMPLATE_VARIABLES } from '../../../utils/templateVariables';

const { Option } = Select;
const { TextArea } = Input;
const { Text } = Typography;

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
            <Form.Item name="title" label="Tiêu đề chính">
              <Input />
            </Form.Item>
            <Form.Item name="subtitle" label="Lời chào / Mô tả">
              <TextArea rows={3} />
            </Form.Item>
            <VariableHints />
            <Form.Item name="showDate" label="Hiển thị Số & Ngày" valuePropName="checked">
              <Switch />
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
            <Form.Item name="columns" label="Quản lý cột hiển thị">
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
            <Form.Item name="showDeliveryTime" label="Thời gian giao hàng / thi công" valuePropName="checked">
              <Switch />
            </Form.Item>
            <Form.Item name="showValidity" label="Hiệu lực báo giá" valuePropName="checked">
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
        return (
          <>
            <Form.Item name="columns" label="Số lượng chữ ký (Cột)">
              <Select>
                <Option value={1}>1 Người ký</Option>
                <Option value={2}>2 Người ký</Option>
                <Option value={3}>3 Người ký</Option>
                <Option value={4}>4 Người ký</Option>
              </Select>
            </Form.Item>
            <Form.Item label="Tiêu đề Người ký 1 (Bên trái)">
              <Form.Item name={['titles', 0]} noStyle>
                <Input placeholder="Vd: KHÁCH HÀNG" />
              </Form.Item>
            </Form.Item>
            <Form.Item label="Tiêu đề Người ký 2 (Bên phải)">
              <Form.Item name={['titles', 1]} noStyle>
                <Input placeholder="Vd: ĐẠI DIỆN CÔNG TY" />
              </Form.Item>
            </Form.Item>
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
      case BLOCK_TYPES.SIGNATURES:
        return (
          <>
            <Form.Item name="columns" label="Số lượng chữ ký">
              <Select>
                <Option value={1}>1 Chữ ký</Option>
                <Option value={2}>2 Chữ ký</Option>
                <Option value={3}>3 Chữ ký</Option>
                <Option value={4}>4 Chữ ký</Option>
              </Select>
            </Form.Item>
            <Text type="secondary" style={{ display: 'block', marginBottom: 16 }}>
              Tiêu đề các chữ ký:
            </Text>
            <Form.List name="titles">
              {(fields, { add, remove }) => (
                <>
                  {fields.map((field, index) => (
                    <Form.Item
                      key={field.key}
                      label={`Chữ ký ${index + 1}`}
                      required={false}
                    >
                      <Form.Item
                        {...field}
                        noStyle
                      >
                        <Input placeholder="Người lập biểu / Giám đốc..." />
                      </Form.Item>
                    </Form.Item>
                  ))}
                </>
              )}
            </Form.List>
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
