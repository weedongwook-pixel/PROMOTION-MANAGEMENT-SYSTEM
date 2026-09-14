/* ============================================================================
 *  BILL DISCOUNT — CONFIRMED / ACTIVE
 *  นำเข้าจากไฟล์ "Bill Discount Confirmed.xlsx" (Backoffice) — โค้ด BD ที่ผ่าน
 *  workflow แล้ว (IT COMPLETE · OP CONFIRMED). โหลดใน 'shell' ก่อน mock-backend
 *  → seedBillDiscountConfirmed() inject เข้า store.months (idempotent ตาม code).
 *  ขึ้นทั้งหน้า MKT (Campaign Tracking) และ OP (Op Tracking) เพราะอ่าน data ชุดเดียวกัน.
 *  ========================================================================== */
window.PC_BILL_DISCOUNT_CONFIRMED = [
  { code: "BD167", name: "Whoscall ส่วนลด 30 บาท",        start: "2026-06-23", end: "2026-10-01", unit: "฿", value: 30 },
  { code: "BD165", name: "Amaze ส่วนลด 50 บาท",          start: "2026-05-18", end: "2026-10-15", unit: "฿", value: 50 },
  { code: "BD163", name: "Grab Discount 200 THB",          start: "2026-03-23", end: "2026-12-31", unit: "฿", value: 200 },
  { code: "BD162", name: "Grab Discount 150 THB",          start: "2026-03-23", end: "2026-12-31", unit: "฿", value: 150 },
  { code: "BD161", name: "Grab Discount 70 THB",           start: "2026-03-23", end: "2026-12-31", unit: "฿", value: 70 },
  { code: "BD160", name: "เมืองไทยสไมล์คลับลด 10 บาท",   start: "2026-03-16", end: "2026-07-31", unit: "฿", value: 10 },
  { code: "BD159", name: "Tops Discount 100 THB",          start: "2026-01-08", end: "2026-07-07", unit: "฿", value: 100 },
  { code: "BD158", name: "TTB ลด50% ซื้อ MFF",            start: "2025-12-10", end: "2026-06-24", unit: "%", value: 50 },
  { code: "BD147", name: "True Dtac ดีลลับส่วนลด 50 THB", start: "2025-08-14", end: "2026-08-15", unit: "฿", value: 50 },
  { code: "BD143", name: "AIS ส่วนลด 30THB",              start: "2025-07-01", end: "2026-06-30", unit: "฿", value: 30 },
  { code: "BD105", name: "Samsung ส่วนลดแทนเงินสด 15 บาท", start: "2023-11-01", end: "2026-12-31", unit: "฿", value: 15 },
];
