/* =====================================================================
 * Tender master — ช่องทางรับชำระ (Tender) ที่เปิดบนเครื่อง POS หลัก
 * ใช้ร่วม: pages/Tender.html (สาขาแจ้งเปิด-ปิด) + pages/TenderSettings.html (ตั้งค่า)
 *
 *  kind: 'standard' = เปิดเป็นมาตรฐานบนเครื่อง POS หลักให้ใช้งานอยู่แล้ว
 *        'manual'   = ช่องทางสำรอง/กรณีพิเศษ ที่สาขาต้องแจ้งขอเปิดเอง
 *  iface: true = เป็นเครื่อง EDC/รูดบัตรที่ interface กับ POS
 *  ผู้ใช้แก้ได้ที่หน้า "ตั้งค่า Tender" → บันทึกลง localStorage 'pc_tender_master'
 * ===================================================================== */
window.PC_TENDER_MASTER = [
  /* ---- Sale mode: Take Away (มาตรฐาน) ---- */
  { code:'CSH',     name:'Cash',                saleMode:'Take Away', kind:'standard', iface:false, icon:'fa-money-bill-wave', note:'เงินสด' },
  { code:'T006',    name:'PROMPTPAY|KPLUS',     saleMode:'Take Away', kind:'standard', iface:true,  icon:'fa-credit-card',    note:'EDC รูดบัตร — interface กับ POS' },
  { code:'CCDFT',   name:'Credit Card (DFT)',    saleMode:'Take Away', kind:'standard', iface:true,  icon:'fa-credit-card',    note:'EDC KBank · Link POS · บัตรเครดิต (DFT)' },
  { code:'6WCP',    name:'Wechat Pay',          saleMode:'Take Away', kind:'standard', iface:false, icon:'fa-wallet',         note:'' },
  { code:'2ALI',    name:'Alipay',              saleMode:'Take Away', kind:'standard', iface:false, icon:'fa-wallet',         note:'' },
  { code:'1TRM',    name:'TrueMoney Wallet',    saleMode:'Take Away', kind:'standard', iface:false, icon:'fa-wallet',         note:'' },
  { code:'4APY',    name:'ShopeePay',           saleMode:'Take Away', kind:'standard', iface:false, icon:'fa-wallet',         note:'e-payment' },
  { code:'EPLM',    name:'LINE Pay',            saleMode:'Delivery',  kind:'standard', iface:false, icon:'fa-wallet',         note:'e-payment' },

  /* ---- Sale mode: Delivery (มาตรฐาน) ---- */
  { code:'RBH',     name:'Robinhood',           saleMode:'Delivery',  kind:'standard', iface:false, icon:'fa-motorcycle',     note:'' },
  { code:'GOK',     name:'Gokoo',               saleMode:'Delivery',  kind:'standard', iface:false, icon:'fa-motorcycle',     note:'' },
  { code:'GRP',     name:'GrabPay',             saleMode:'Delivery',  kind:'standard', iface:false, icon:'fa-motorcycle',     note:'' },
  { code:'SPF',     name:'ShopeeFood',          saleMode:'Delivery',  kind:'standard', iface:false, icon:'fa-motorcycle',     note:'' },

  /* ---- Manual / สำรอง — สาขาขอเปิดเอง ---- */
  { code:'T007',    name:'M-EDC',               saleMode:'Take Away', kind:'manual',   iface:true,  icon:'fa-credit-card',    note:'รับชำระผ่านเครื่อง TID — กรณีสาขาติดตั้งเครื่อง EDC ไม่ทัน' },
  { code:'PPR',     name:'QR PromptPay Manual', saleMode:'Take Away', kind:'manual',   iface:false, icon:'fa-qrcode',         note:'รับชำระผ่าน QR Code (พร้อมเพย์)' },
  { code:'CodeALI', name:'EDC Manual',          saleMode:'Take Away', kind:'manual',   iface:false, icon:'fa-building',       note:'สาขาในห้าง — รับเงินฝากผ่านทางห้าง' },
];

/* helper ใช้ร่วม: คืน master ปัจจุบัน (localStorage override → fallback default) */
window.PC_getTenderMaster = function () {
  try { var m = JSON.parse(localStorage.getItem('pc_tender_master')); if (Array.isArray(m) && m.length) return m; } catch (e) {}
  return (window.PC_TENDER_MASTER || []).slice();
};
