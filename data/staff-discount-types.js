/* ========================================================================
 * STAFF DISCOUNT / CARD-LINK / OTHER TYPE MASTER — Potato Corner
 * ที่มา: uploads/ข้อมูลType promo แยกตารางผูกบัตร ส่วนลดพนักงาน อื่นๆ (68a010a3.xlsx)
 *
 * แยกเป็น 3 ตารางตามชื่อไฟล์ (ไม่ปนกับตารางโปรโมชัน pc_mock_store_v28):
 *   PC_STAFF_TYPES   — ประเภทส่วนลดพนักงาน / เจ้าของ (Staff / Owner / Student)
 *   PC_CARD_TYPES    — สิทธิ์ผูกบัตรสมาชิก (VIP redeem)
 *   PC_OTHER_TYPES   — อื่น ๆ ที่เกี่ยวกับระบบ (เช่น QR สำรวจลูกค้า)
 *
 * ฟิลด์: code · nameEN · nameTH · from · to · typePromotion · status
 *        staffType (FRC | COCO | '')  ·  usedFor
 * ===================================================================== */
window.PC_STAFF_TYPES = [
 { code:"SB0001", nameEN:"Staff Benefits Redeem - Mega Fries", nameTH:"Staff Benefits Redeem - Mega Fries", from:"2026-05-13", to:"2050-12-31", typePromotion:"Item Coupon Online", status:"Active", staffType:"", usedFor:"Staff Discount" },
 { code:"BD099", nameEN:"Staff Discount 50% (Siam Oil)", nameTH:"Staff Discount 50% (Siam Oil)", from:"2023-11-07", to:"2030-12-31", typePromotion:"Bill Discount Online", status:"Active", staffType:"FRC", usedFor:"Staff Discount" },
 { code:"BD097", nameEN:"Staff Discount 50% (HaadThip)", nameTH:"Staff Discount 50% (HaadThip)", from:"2018-03-22", to:"2030-12-31", typePromotion:"Bill Discount Online", status:"Active", staffType:"FRC", usedFor:"Staff Discount" },
 { code:"BD096", nameEN:"Staff - Phithan Food (DODO)", nameTH:"Staff - Phithan Food (DODO)", from:"2018-03-22", to:"2030-12-31", typePromotion:"Bill Discount Online", status:"Active", staffType:"FRC", usedFor:"Staff Discount" },
 { code:"BD125", nameEN:"Owner Discount 20% (ANSAN)", nameTH:"Owner Discount 20% (ANSAN)", from:"2018-03-22", to:"2030-12-31", typePromotion:"Bill Discount Online", status:"Active", staffType:"FRC", usedFor:"Owner Discount" },
 { code:"BD121", nameEN:"Staff Discount 50% (B.P.BOONCHANOK)", nameTH:"Staff Discount 50% (B.P.BOONCHANOK)", from:"2018-03-22", to:"2050-12-31", typePromotion:"Bill Discount Online", status:"Active", staffType:"FRC", usedFor:"Staff Discount" },
 { code:"BD133", nameEN:"Staff Discount 20% (ANSAN)", nameTH:"Staff Discount 20% (ANSAN)", from:"2024-12-01", to:"2030-12-25", typePromotion:"Bill Discount Online", status:"Active", staffType:"FRC", usedFor:"Staff Discount" },
 { code:"BD164", nameEN:"Student Card Discount 5%", nameTH:"Student Card Discount 5%", from:"2026-04-01", to:"2026-12-01", typePromotion:"Bill Discount Online", status:"Active", staffType:"FRC", usedFor:"Student Card" },
 { code:"BD144", nameEN:"Staff Discount 50% (MINDLAB)", nameTH:"Staff Discount 50% (MINDLAB)", from:"2018-03-22", to:"2050-12-31", typePromotion:"Bill Discount Online", status:"Active", staffType:"FRC", usedFor:"Staff Discount" },
 { code:"BD157", nameEN:"Staff Discount 50%[KSI]", nameTH:"Staff Discount 50%[KSI]", from:"2025-12-01", to:"2050-12-31", typePromotion:"Bill Discount Online", status:"Active", staffType:"COCO", usedFor:"Staff Discount" },
 { code:"BD156", nameEN:"Staff Discount 50%[UNO]", nameTH:"Staff Discount 50%[UNO]", from:"2025-12-01", to:"2050-12-31", typePromotion:"Bill Discount Online", status:"Active", staffType:"COCO", usedFor:"Staff Discount" },
 { code:"BD155", nameEN:"Staff Discount 50%[PCTH]", nameTH:"Staff Discount 50%[PCTH]", from:"2025-12-01", to:"2050-12-31", typePromotion:"Bill Discount Online", status:"Active", staffType:"COCO", usedFor:"Staff Discount" }
];

window.PC_CARD_TYPES = [
 { code:"BC0000", nameEN:"Black Card Redeem - GIGA FRIES", nameTH:"Black Card Redeem - GIGA FRIES", from:"2022-01-01", to:"2050-12-31", typePromotion:"Item Coupon Online", status:"Active", staffType:"", usedFor:"VIP05 - Black Card" },
 { code:"BC0001", nameEN:"Black Card Redeem - GIGA Chicken Pop", nameTH:"Black Card Redeem - GIGA Chicken Pop", from:"2022-01-01", to:"2050-12-31", typePromotion:"Item Coupon Online", status:"Active", staffType:"", usedFor:"VIP05 - Black Card" },
 { code:"GC0000", nameEN:"Gold Card Redeem - GIGA FRIES", nameTH:"Gold Card Redeem - GIGA FRIES", from:"2021-01-16", to:"2050-12-31", typePromotion:"Item Coupon Online", status:"Active", staffType:"", usedFor:"VIP03 - Gold Card" },
 { code:"GC0002", nameEN:"Gold Card Redeem - LARGE Chicken Nugget", nameTH:"Gold Card Redeem - LARGE Chicken Nugget", from:"2021-01-16", to:"2050-12-31", typePromotion:"Item Coupon Online", status:"Active", staffType:"", usedFor:"VIP03 - Gold Card" },
 { code:"GN0001", nameEN:"Green Card - GIGA FRIES", nameTH:"Green Card - GIGA FRIES", from:"2025-01-01", to:"2050-12-31", typePromotion:"Item Coupon Online", status:"Active", staffType:"", usedFor:"VIP08 - Green Card" },
 { code:"PC0000", nameEN:"Platinum Card Redeem - GIGA FRIES", nameTH:"Platinum Card Redeem - GIGA FRIES", from:"2021-01-16", to:"2050-12-31", typePromotion:"Item Coupon Online", status:"Active", staffType:"", usedFor:"VIP04 - Platinum Card" },
 { code:"PC0001", nameEN:"Platinum Card Redeem - GIGA Chicken Pop", nameTH:"Platinum Card Redeem - GIGA Chicken Pop", from:"2021-01-16", to:"2050-12-31", typePromotion:"Item Coupon Online", status:"Active", staffType:"", usedFor:"VIP04 - Platinum Card" }
];

window.PC_OTHER_TYPES = [
 { code:"IC0529", nameEN:"Customer Survey", nameTH:"แบบสำรวจลูกค้า (QR)", from:"2026-01-05", to:"2026-12-31", typePromotion:"Item Coupon Online", status:"Active", staffType:"", usedFor:"Generator QR Customer Survey" }
];
