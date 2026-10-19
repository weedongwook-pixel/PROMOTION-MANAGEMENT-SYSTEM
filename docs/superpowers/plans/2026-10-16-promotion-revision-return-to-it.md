# Promotion Revision Return-to-IT Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ให้ผู้ส่งแก้งานที่ IT เคยทำแล้วโดยระบุเหตุผล ส่งกลับ IT และ OP ตรวจซ้ำ โดยไม่เปลี่ยนรหัสเดิมหรือทำประวัติหาย

**Architecture:** ขยาย model และ endpoint campaign-edits เดิม ให้ Cloud ตรวจสถานะและเปลี่ยน workflow พร้อมเก็บประวัติใน transaction เดียว ใช้ฟอร์มเดิมและคิว EDITED เดิม ไม่สร้างระบบจองรหัสใหม่

**Tech Stack:** Vanilla JavaScript, HTML, Cloudflare Worker/D1, node:test, Playwright

**Spec:** `docs/superpowers/specs/2026-10-16-promotion-revision-return-to-it-design.md`

## Global Constraints

- เฉพาะผู้ส่งเดิมและบัญชีทดสอบ `MKT Team`; ไม่ขยายสิทธิ์ให้ MKT ทุกคน
- ห้ามแก้งานที่ถูกลบหรือยกเลิกผ่านเส้นทางนี้
- คงรหัส ผู้ส่ง วันที่ส่ง และโครงสร้างปุ่มตามข้อจำกัดเดิม
- แก้เฉพาะเดือนที่เลือก ไม่กระทบเดือนอื่น
- Cloud-confirmed save, version guard และ idempotency ต้องคงอยู่
- ไม่เขียนข้อมูลแคมเปญจริงเพื่อทดสอบ และไม่กู้ไฟล์เก่าทับฐาน
- รักษา worktree ที่มีงานเดิม ไม่ commit หรือ reset งานอื่น

## Review Focus

- IT ปิดงานขณะผู้ส่งเปิดฟอร์ม: ปฏิเสธเวอร์ชันเก่า ไม่ข้ามเหตุผลบังคับ
- แคมเปญหลายเดือน: ไม่รีเซ็ต IT/OP ของเดือนที่ไม่ได้แก้
- รหัสเคยใช้งาน: คิว EDITED ไม่จองรหัสใหม่และไม่คืนรหัสเดิม
- OP เก็บผลรายปุ่ม: ผลเก่าต้องไม่ยืนยัน revision ใหม่ก่อน IT ทำเสร็จ
- ส่งซ้ำ/คำตอบ Cloud หาย: ได้ receipt เดิม ประวัติและคิวไม่ซ้ำ

---

### Task 1: Cloud policy, revision and atomic history

**Files:** `js/promotion-edit-model.js`, `sync-worker/worker.js`, `tests/promotion-edit-model.test.cjs`, `tests/sync-worker-promotion-edit.test.cjs`

**Interfaces:**
- `policy(block,actor,month)` คืน `allowed`, `reason`, `requiresReason` แยกสิทธิ์เจ้าของจากสถานะเคยผ่าน IT
- เพิ่ม `form.editReason` สำหรับเหตุผล ไม่ให้ client กำหนด workflow เอง
- revision rows เพิ่ม `revisionPending`, `revisionReason`, `revisionRequestedBy`, `revisionRequestedAt`, `revisionId` และ `revisionChanges`
- activity `EDITED` เก็บเหตุผล จุดเปลี่ยน และ rows ก่อนแก้เดือนที่เลือกพร้อม metadata ผู้ทำรายการ

- [ ] เขียนและรัน RED: COMPLETE/OP-confirmed เปิดแก้ได้; ไม่มีเหตุผลบันทึกไม่ได้; ผู้ใช้อื่น/ยกเลิก/ถูกลบถูกปฏิเสธ
- [ ] ปรับ model ให้บันทึกรหัสเดิมและสร้าง revision เฉพาะเดือนที่เลือก ตั้ง IT PENDING, OP WAITING, changeStatus EDITED; เก็บหลักฐานก่อนรีเซ็ตวันที่/ผลตรวจปัจจุบัน
- [ ] ปรับ Worker ให้บันทึก revision และประวัติใน transaction เดิม โดยคืน receipt ที่ตรวจสอบได้
- [ ] ทดสอบ CAS race, replay, network uncertainty, ประวัติเดิม และเดือนอื่นไม่เปลี่ยน
- [ ] Run `node --test tests/promotion-edit-model.test.cjs tests/sync-worker-promotion-edit.test.cjs tests/promotion-edit-cloud.test.cjs`

### Task 2: User form and Tracking

**Files:** `js/promotion-edit.js`, `js/campaign-tracking.js`, `scripts/test-promotion-edit-browser.cjs`

**Interfaces:** ฟอร์มใช้ `policy.requiresReason`; collect ส่ง `editReason`; Tracking เปิดฟอร์มเดิมด้วย campaign/month

- [ ] เพิ่ม browser RED สำหรับงาน COMPLETE ทั้งสี่ฟอร์ม: เห็นช่องเหตุผล บันทึกว่างไม่ได้
- [ ] เพิ่ม label “เหตุผลและรายละเอียดที่แก้ไข” และข้อความส่งกลับ IT/OP; ไม่บังคับเหตุผลสำหรับงานที่ไม่เคยผ่าน IT
- [ ] ปรับข้อความยืนยันบันทึก/ปุ่ม Tracking ไม่ให้บอกว่าต้องติดต่อ IT เมื่อเปิดแก้ได้แล้ว
- [ ] ให้เหตุผลเข้าระบบตรวจ dirty; เปิดเฉย ๆ ออกได้ทันที กรอกเหตุผลหรือเปลี่ยนข้อมูลแล้วจึงเตือน
- [ ] ทดสอบ `--shell` ทั้งบัญชีผู้ส่งและ `--test-mkt`; ยืนยันข้อมูลผู้ส่งและรหัสเดิมยังอยู่

### Task 3: IT revision queue and OP recheck

**Files:** `js/mock-backend.js`, `pages/IT_Settlement.html`, `js/op-tracking.js`, `tests/promotion-revision-workflow.test.cjs` (new)

**Interfaces:** `getITTasks` ส่ง revision fields; IT tab จัด revision เป็น EDITED; หลังปิดงานกำหนด `revisionPending=false` และวันที่รอบใหม่ ส่วนประวัติ/เหตุผลไม่ถูกลบ

- [ ] เพิ่ม workflow RED: หลังแก้ งานปรากฏคิว IT พร้อมเหตุผลและรหัสเดิม; OP ยืนยันก่อน IT ปิดไม่ได้
- [ ] ส่ง revision metadata จาก backend และแสดงหมายเหตุผู้แก้ไข/เวลา/เหตุผล/จุดเปลี่ยนแบบ escaped text บนการ์ด IT
- [ ] กัน autorun/reserve รหัสของงาน revision; ปิดงานด้วยรหัสเดิมได้แม้เป็นรหัสเคยใช้งาน
- [ ] ปรับการปิด IT ให้ลงวันที่รอบใหม่ ปลด revision pending และส่ง OP WAITING โดยไม่ลบประวัติเดิม
- [ ] รีเซ็ตผลรายปุ่มของ OP สำหรับ revision ใหม่ และตรวจ IT COMPLETE ก่อนยืนยันทั้ง UI และ backend
- [ ] ทดสอบวงจร COMPLETE → user revision → IT COMPLETE → OP CONFIRMED, งานหลายเดือน และการแก้รอบสอง

### Task 4: Verification and handoff

**Files:** tests/scripts ที่เกี่ยวข้อง; deployment configuration เดิม ไม่มี schema ใหม่ที่จำเป็นตามแบบปัจจุบัน

- [ ] Run `node --test tests/*.test.cjs` และ browser ทั้งสี่ฟอร์ม; ตรวจ desktop/mobile แบบรวมหนึ่งรอบ
- [ ] Dry-run Worker bundle ตรวจ shared model import
- [ ] ตรวจ diff เฉพาะงานนี้และทบทวนความเสี่ยง transaction, รหัสซ้ำ, OP stale state
- [ ] รายงานผลทดสอบและข้อจำกัดตามจริง; deploy เมื่อผู้ใช้อนุมัติ โดยสำรอง D1 ปัจจุบันก่อน
- [ ] หลัง deploy ตรวจไฟล์จริงและ Cloud แบบไม่เขียนแคมเปญจริง ไม่ใช้แค่ HTTP 400 ของคำขอว่างเป็นหลักฐานว่าบันทึกทำงาน

## สถานะแผน

Implementation เสร็จและผ่าน full node suite 146/146, browser วงจรเต็มทั้งสี่ฟอร์ม และ Worker dry-run แล้ว มี independent final review และแก้ findings พร้อม regression tests; ยังไม่ deploy และไม่เปลี่ยนแคมเปญจริง ดูบันทึกที่ `.superpowers/sdd/2026-10-16-promotion-revision-return-to-it/progress.md`
