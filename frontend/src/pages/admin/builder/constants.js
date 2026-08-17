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
  LAYOUT_ROW: 'layout_row'
};

export const DEFAULT_BLOCK_PROPS = {
  [BLOCK_TYPES.TEXT]: { content: '<p>Văn bản mới</p>', textAlign: 'left' },
  [BLOCK_TYPES.IMAGE]: { url: '', width: '100px', align: 'center' },
  [BLOCK_TYPES.HEADER_LOGO]: { companyName: 'TÊN CÔNG TY CỦA BẠN', phone: '1900 xxxx', address: 'Tòa nhà SaaS, TP. Hà Nội', taxCode: '0101234567' },
  [BLOCK_TYPES.TITLE]: { title: 'BẢNG BÁO GIÁ CHI TIẾT', subtitle: 'Kính gửi Quý khách hàng, chúng tôi xin trân trọng gửi bảng báo giá các hạng mục chi tiết dưới đây:', showDate: true },
  [BLOCK_TYPES.CUSTOMER_INFO]: { columns: 2 },
  [BLOCK_TYPES.PRODUCT_TABLE]: { columns: ['stt', 'name', 'unit', 'qty', 'price', 'total'] },
  [BLOCK_TYPES.TOTALS]: { showSubtotal: true, showVAT: true, showDiscount: true, showShippingFee: true, showInstallationFee: true, showWords: true, showBorder: true, backgroundColor: '#f8fafc' },
  [BLOCK_TYPES.TERMS]: { content: '1. Báo giá có hiệu lực trong vòng 15 ngày.\n2. Thanh toán: Tạm ứng 50% ngay sau khi xác nhận.' },
  [BLOCK_TYPES.SIGNATURES]: { columns: 2, titles: ['ĐẠI DIỆN CÔNG TY', 'ĐẠI DIỆN KHÁCH HÀNG'] },
  [BLOCK_TYPES.PAYMENT_PROGRESS]: { showDeliveryTime: true, showValidity: true },
  [BLOCK_TYPES.DIVIDER]: { style: 'solid', thickness: 1, color: '#e8e8e8', margin: 16 },
  [BLOCK_TYPES.LAYOUT_ROW]: { columns: 2, ratios: [50, 50], gap: 16 }
};
