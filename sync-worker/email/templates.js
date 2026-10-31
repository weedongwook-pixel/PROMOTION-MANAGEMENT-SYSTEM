(function(root){
  'use strict';
  const api=root.PC_Email;
  api.emailHeader=function(value){if(typeof value!=='string'||!value||value.length>998||/[\r\n\0]/.test(value))throw Error('email_invalid_header');return value;};
  api.emailRecipients=function(input){
    const result={to:[],cc:[]},seen=new Set();
    for(const field of ['to','cc']){
      if(!Array.isArray(input?.[field])||input[field].length>50)throw Error('email_invalid_recipients');
      for(const raw of input[field]){
        const address=api.emailHeader(raw).trim().toLowerCase();
        if(!/^[a-z0-9.!#$%&'*+\/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?\.[a-z]{2,}$/i.test(address)||address.length>254)throw Error('email_invalid_recipients');
        if(address==='it@rocks-foods.com'||seen.has(address))continue;
        seen.add(address);result[field].push(address);
      }
    }
    if(!seen.size)throw Error('email_invalid_recipients');
    return result;
  };
  const lifecycle={promotion_extended:'แจ้งขยายระยะเวลาโปรโมชั่น',promotion_reduced:'แจ้งลดระยะเวลาโปรโมชั่น',promotion_cancelled:'แจ้งยกเลิกโปรโมชั่น'};
  api.renderCoProEmail=function(snapshot){
    if(!['submitted','it_interface_complete','promotion_edited','it_done',...Object.keys(lifecycle)].includes(snapshot.milestone))throw Error('email_invalid_milestone');
    const d=snapshot.details||{},event=snapshot.event||{};
    if(lifecycle[snapshot.milestone]||snapshot.milestone==='it_done'){
      const change=snapshot.milestone==='it_done'?(event.kind==='change'?event.change:''):snapshot.milestone.slice(10).toUpperCase();
      const lines=[lifecycle[snapshot.milestone]||(change==='CANCELLED'?'แจ้งสถานะ IT ปิดปุ่มโปรโมชั่นที่ยกเลิกเรียบร้อย':change?'แจ้งสถานะ IT ปรับวันที่โปรโมชั่นในระบบเรียบร้อย':'แจ้งสถานะ IT ขึ้นปุ่มเรียบร้อย'),'ชื่อแคมเปญ: '+String(d.campaign||'-')];
      if(change==='CANCELLED'){lines.push('สถานะ: ยกเลิกโปรโมชั่น');if(snapshot.milestone!=='it_done')lines.push('เหตุผลการยกเลิก: '+String(d.reason||'-'));}
      else{if(change&&d.previousEnd&&d.end)lines.push('วันที่สิ้นสุดเดิม → ใหม่: '+d.previousEnd+' → '+d.end);lines.push('วันที่เริ่ม - วันที่สิ้นสุด: '+String(d.start||'-')+' - '+String(d.end||'-'));}
      for(const b of d.buttons||[]){
        lines.push('Type Promotion: '+String(b.promoType||'-'));
        lines.push('Code Promotion: '+String((b.codePromotion??(b.code||'').split(' / ')[0])||'-'));
        const review=b.codeReview;
        if(snapshot.milestone==='it_done'&&!change&&review&&review.status!=='unchanged')lines.push('ผลตรวจสอบโค้ด: '+(review.status==='changed'?'Code Promotion มีการเปลี่ยนแปลงแก้ไข จาก '+review.previous+' เป็น '+review.current+' · กรุณาใช้รหัส '+review.current:'ยืนยันรหัสล่าสุด '+String(b.codePromotion||'-')+' · ไม่มีข้อมูลเพียงพอสำหรับเปรียบเทียบกับเมลครั้งแรก'));
        lines.push('ชื่อปุ่ม: '+String(b.name||'-'));
        if(change&&change!=='CANCELLED'&&!d.previousEnd&&b.previousEnd)lines.push('วันที่สิ้นสุดเดิม → ใหม่: '+b.previousEnd+' → '+String(b.end||'-'));
        // Extend / shorten / cancel repeat the announcement's details so the mail stands on its own.
        if(lifecycle[snapshot.milestone]){lines.push('รายละเอียดโปรฯ: '+String(b.promotionDetail||'-'));lines.push('เงื่อนไข: '+String(b.condition||'-'));}
      }
      if(snapshot.additionalMessage)lines.push('ข้อความเพิ่มเติม / Additional message: '+snapshot.additionalMessage);
      if(lifecycle[snapshot.milestone]&&snapshot.attachments!==undefined)lines.push('ไฟล์แนบ: '+(snapshot.attachments.map(file=>file.name).join(', ')||'ไม่มี'));
      requester(lines,snapshot);
      return html(lines);
    }
    const lines=[snapshot.milestone==='promotion_edited'?'แจ้งแก้ไขโปรโมชั่น / Promotion updated':snapshot.milestone==='submitted'?(snapshot.notificationOnly?'แจ้งรายละเอียดโปรโมชั่น':'แจ้งรายละเอียดขึ้นปุ่ม Co-Promotion'):'แจ้งสถานะขึ้นปุ่ม และ Interface เรียบร้อย',
      'ชื่อแคมเปญ: '+String(d.campaign||'-'), 'วันที่เริ่ม - วันที่สิ้นสุด: '+String(d.start||'-')+' - '+String(d.end||'-')];
    for(const b of d.buttons||[]){
      lines.push('Type Promotion: '+String(b.promoType||'-'));
      lines.push('Code Promotion: '+String((b.codePromotion??(b.code||'').split(' / ')[0])||'-'));
      if(snapshot.milestone==='submitted'&&!snapshot.notificationOnly)lines.push('หมายเหตุ: รหัสนี้จองจากระบบ สามารถนำไปใช้งานต่อได้ ฝ่าย IT จะแจ้งยืนยันรหัสล่าสุดและผลตรวจสอบการเปลี่ยนแปลงทางอีเมลอีกครั้ง เมื่อบันทึกขึ้นปุ่มและทำ Interface ครบ');
      if(snapshot.milestone==='it_interface_complete'){
        const review=b.codeReview;
        if(review?.status!=='unchanged')lines.push('ผลตรวจสอบโค้ด: '+(review?.status==='changed'?'Code Promotion มีการเปลี่ยนแปลงแก้ไข จาก '+review.previous+' เป็น '+review.current+' · กรุณาใช้รหัส '+review.current:review?.status==='unchanged'?'ใช้รหัสเดิม '+review.current:'ยืนยันรหัสล่าสุด '+String(b.codePromotion||'-')+' · ไม่มีข้อมูลเพียงพอสำหรับเปรียบเทียบกับเมลครั้งแรก'));
      }
      lines.push('ชื่อปุ่ม: '+String(b.name||'-'));
      lines.push('รายละเอียดโปรฯ: '+String(b.promotionDetail||'-'));
      lines.push('เงื่อนไข: '+String(b.condition||'-'));
    }
    if(snapshot.additionalMessage)lines.push('ข้อความเพิ่มเติม / Additional message: '+snapshot.additionalMessage);
    lines.push('ไฟล์แนบ: '+((snapshot.attachments||[]).map(file=>file.name).join(', ')||'ไม่มี'));
    requester(lines,snapshot);
    return html(lines);
  };
  // Mail always leaves from the central it@rocks-foods.com (never a staff mailbox); name who entered the job.
  const FOOTER='เมลนี้ส่งจากระบบ Promotion Management ผ่าน it@rocks-foods.com แทนผู้ทำรายการ';
  function requester(lines,snapshot){
    const by=snapshot.requestedBy;if(!by?.staffName)return;
    lines.push((['it_done','it_interface_complete'].includes(snapshot.milestone)?'ดำเนินการโดย (IT): ':'แจ้งโดย: ')+by.staffName+(by.staffEmail?' ('+by.staffEmail+')':''));
    lines.push('',FOOTER);
  }
  function html(lines){
    const text=lines.join('\n');
    const escape=s=>String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    const label=/^(ชื่อแคมเปญ|วันที่เริ่ม - วันที่สิ้นสุด|วันที่สิ้นสุดเดิม → ใหม่|สถานะ|เหตุผลการยกเลิก|Type Promotion|Code Promotion|ผลตรวจสอบโค้ด|หมายเหตุ|ชื่อปุ่ม|รายละเอียดโปรฯ|เงื่อนไข|ข้อความเพิ่มเติม \/ Additional message|ไฟล์แนบ|แจ้งโดย|ดำเนินการโดย \(IT\)):/;
    return {text,html:'<!doctype html><meta charset="utf-8"><div>'+lines.map((x,i)=>{
      const match=x.match(label);
      const content=i===0?'<strong>'+escape(x)+'</strong>':match?'<strong>'+escape(match[0])+'</strong>'+escape(x.slice(match[0].length)):escape(x);
      return '<p style="white-space:pre-wrap'+(x.startsWith(FOOTER)?';color:#6b7280;font-size:12px':'')+'">'+content+'</p>';
    }).join('')+'</div>'};
  }
})(globalThis);
