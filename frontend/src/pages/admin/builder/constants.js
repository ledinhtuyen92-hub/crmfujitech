export const BLOCK_TYPES = {
  TEXT: 'rich_text',
  IMAGE: 'image',
  HEADER_LOGO: 'header_logo',
  TITLE: 'title',
  CUSTOMER_INFO: 'customer_info',
  PRODUCT_TABLE: 'product_table',
  TOTALS: 'totals',
  TERMS: 'terms',
  SIGNATURES: 'signatures',
  PAYMENT_PROGRESS: 'payment_progress',
  DIVIDER: 'divider',
  LAYOUT_ROW: 'layout_row',
  SERVICE_TABLE: 'service_table'
};

export const DEFAULT_BLOCK_PROPS = {
  [BLOCK_TYPES.TEXT]: { content: '<p>Văn bản mới</p>', textAlign: 'left' },
  [BLOCK_TYPES.IMAGE]: { url: '', width: '100px', align: 'center' },
  [BLOCK_TYPES.HEADER_LOGO]: { companyName: '{{company_name}}', phone: '{{company_phone}}', address: '{{company_address}}', taxCode: '{{company_tax_code}}', logoUrl: '{{company_logo}}' },
  [BLOCK_TYPES.TITLE]: { title: 'BẢNG BÁO GIÁ CHI TIẾT', subtitle: 'Kính gửi Quý khách hàng, chúng tôi xin trân trọng gửi bảng báo giá các hạng mục chi tiết dưới đây:', metaText: 'Số: {{quotation_code}} | Ngày: {{current_date}}' },
  [BLOCK_TYPES.CUSTOMER_INFO]: { 
    columns: 2, 
    sellerTitle: 'BÊN BÁN (BÊN B)', companyName: '{{company_name}}', representative: '{{director_name}}', position: '{{director_title}}', taxCode: '{{company_tax_code}}', phone: '{{company_phone}}', address: '{{company_address}}',
    buyerTitle: 'BÊN MUA (BÊN A)', buyerCompany: '{{customer_company}}', buyerName: '{{customer_name}}', buyerTaxCode: '{{customer_tax_code}}', buyerPhone: '{{customer_phone}}', buyerAddress: '{{customer_address}}'
  },
  [BLOCK_TYPES.PRODUCT_TABLE]: { columns: ['stt', 'name', 'unit', 'qty', 'price', 'total'], showHeader: true, tableTitle: '', showBorder: true, useComplexDimensions: true },
  [BLOCK_TYPES.TOTALS]: { showSubtotal: true, showVAT: true, showDiscount: true, showShippingFee: true, showInstallationFee: true, showWords: true, showBorder: true, backgroundColor: '#f8fafc' },
  [BLOCK_TYPES.TERMS]: { content: '1. Báo giá có hiệu lực trong vòng 15 ngày.\n2. Thanh toán: Tạm ứng 50% ngay sau khi xác nhận.' },
  [BLOCK_TYPES.SIGNATURES]: { columns: 2, titles: ['ĐẠI DIỆN KHÁCH HÀNG', 'ĐẠI DIỆN CÔNG TY'], signatures: ['{{customer_signature}}\n\n\n\n\n<b>{{customer_name}}</b>', '{{company_signature}}\n{{company_stamp}}\n\n<b>{{director_name}}</b>'] },
  [BLOCK_TYPES.PAYMENT_PROGRESS]: { title: 'Tiến độ thanh toán:', showPaidAndDebt: true, showDeliveryTime: true, showValidity: true },
  [BLOCK_TYPES.DIVIDER]: { style: 'solid', thickness: 1, color: '#e8e8e8', margin: 16 },
  [BLOCK_TYPES.LAYOUT_ROW]: { columns: 2, ratios: [50, 50], gap: 16 },
  [BLOCK_TYPES.SERVICE_TABLE]: { columns: ['stt', 'name', 'symbol', 'specs', 'qty', 'unit', 'price', 'total'], showHeader: true, tableTitle: 'DỊCH VỤ & CHI PHÍ PHÁT SINH:', showBorder: true }
};
