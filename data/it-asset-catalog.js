/* IT Asset Catalog — จาก CMPOS "IT OPENING STORES & RENOVATION REQUEST" form
 * ใช้กับฟอร์มยืนยันเปิดสาขา/Renovate (ติ๊กเลือกอุปกรณ์ + ราคา + free logic + ค่าเดินทาง) */
window.PC_IT_ASSET_CATALOG = {
  jobTypes: ['Add License Shop', 'Renovate Shop'],
  // free logic: Add License = ฟรีค่าติดตั้ง · Renovate = คิดตามอุปกรณ์ + ติดตั้ง 3,500 (ฟรีถ้าซื้อ core ใหม่)
  service: { installCostOld: 3500, freeIfNewCoreOrFullStd: true },
  travel: [
    { zone: 'กรุงเทพฯ และปริมณฑล', cost: 0 },
    { zone: 'ต่างจังหวัด < 300 km', cost: 3500 },
    { zone: 'ต่างจังหวัด > 300 km', cost: 5500 },
    { zone: 'หมู่เกาะ', cost: 8500 }
  ],
  standard: [
    { id: 'pos',     no: 1,  name: 'Toshiba TCx810 6201-E55', spec: 'i5 CPU, 16GB RAM, 256GB SSD', price: 56000, std: true, core: true, warranty: 'Onsite 1Y', cat: 'POS' },
    { id: 'ups',     no: 2,  name: 'SmartPower UPS ECO II 800', spec: '800VA/360W, Stabilizer', price: 2800, std: true, warranty: '1Y' },
    { id: 'drawer',  no: 3,  name: 'VPOS Cash Drawer VP410', spec: '4 Note / 8 Coin, RJ11', price: 3200, std: true, warranty: '1Y' },
    { id: 'hub',     no: 4,  name: 'D-LINK Switching Hub 8 Port', spec: 'DES-1008C', price: 500, std: true },
    { id: 'scanner', no: 5,  name: 'Newland 2D Scanner HR2081', spec: 'USB Cable + Foldable Stand', price: 4000, std: true, warranty: '1Y' },
    { id: 'wifi',    no: 6,  name: 'TP-LINK Wireless USB Adapter', spec: 'Archer T2U Nano Dual Band', price: 800, std: true },
    { id: 'printer', no: 7,  name: 'Epson TM-T82x-II Printer (แคชเชียร์)', spec: 'USB + RS-232 + Ethernet', price: 8500, std: true, core: true, warranty: '1Y', cat: 'Printer-Cashier' },
    { id: 'kbm',     no: 8,  name: 'Logitech Wireless Combo MK220', spec: 'Keyboard & Mouse', price: 900, std: true, freeWith: ['pos'] },
    { id: 'lan1',    no: 9,  name: 'Lan Cable RJ45 CAT5E (1M)', spec: 'Blue', price: 100, std: true, freeWith: ['printer', 'printerK'] },
    { id: 'lan3',    no: 10, name: 'Lan Cable RJ45 CAT5E (3M)', spec: 'Blue', price: 150, std: true, freeWith: ['pos'] },
    { id: 'wrap',    no: 11, name: 'ไส้ไก่พันสายไฟ (12 มม.)', spec: 'สีดำ', price: 0, std: true, freeWith: ['pos', 'printer'] },
    { id: 'win',     no: 12, name: 'Windows 11 IoT License', spec: 'Digital License Key', price: 4000, std: true, warranty: 'OEM ย้ายเครื่องไม่ได้' },
    { id: 'nod32',   no: 13, name: 'NOD32 Antivirus (1 Box)', spec: '1 Year', price: null, disabled: true, remark: 'ยกเลิก — เปลี่ยนเป็น Antivirus management' }
  ],
  optional: [
    { id: 'rj12',     no: 14, name: 'Cable RJ12 อะไหล่สายลิ้นชัก', spec: 'สายสำรองลิ้นชัก', price: 250 },
    { id: 'printerK', no: 15, name: 'VPos VP-Q300H Printer (ครัว)', spec: 'Ethernet ส่งออเดอร์ครัว', price: 6900, warranty: '1Y', cat: 'Printer-Kitchen' }
  ]
};
