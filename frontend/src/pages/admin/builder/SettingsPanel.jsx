import React from 'react';
import { Form, Input, Select, Switch, InputNumber, Divider, Typography } from 'antd';
import { BLOCK_TYPES } from './constants';
import ColumnManager from './ColumnManager';

const { Option } = Select;
const { TextArea } = Input;
const { Text } = Typography;

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
            <Form.Item name="companyName" label="Tên Công ty Bán (Bên B) mặc định">
              <Input />
            </Form.Item>
            <Form.Item name="columns" label="Số cột hiển thị">
              <Select>
                <Option value={1}>1 Cột</Option>
                <Option value={2}>2 Cột (Trái / Phải)</Option>
              </Select>
            </Form.Item>
            <Form.Item name="themeColor" label="Màu Sắc Chủ Đạo">
              <Input type="color" />
            </Form.Item>
          </>
        );
      case BLOCK_TYPES.PRODUCT_TABLE:
        return (
          <>
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
      case BLOCK_TYPES.TERMS:
        return (
          <>
            <Form.Item name="content" label="Nội dung điều khoản">
              <TextArea rows={6} />
            </Form.Item>
            <Form.Item name="themeColor" label="Màu Sắc Chủ Đạo">
              <Input type="color" />
            </Form.Item>
          </>
        );
      case BLOCK_TYPES.SIGNATURES:
        return (
          <>
            <Form.Item name="columns" label="Số lượng chữ ký">
              <Select>
                <Option value={1}>1 Người ký</Option>
                <Option value={2}>2 Người ký</Option>
                <Option value={3}>3 Người ký</Option>
                <Option value={4}>4 Người ký</Option>
              </Select>
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
