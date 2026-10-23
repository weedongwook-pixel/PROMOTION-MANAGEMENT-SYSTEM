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
  api.renderCoProEmail=function(snapshot){
    if(!['submitted','it_interface_complete','promotion_edited'].includes(snapshot.milestone))throw Error('email_invalid_milestone');
    const d=snapshot.details||{};
    const lines=[snapshot.milestone==='promotion_edited'?'แจ้งแก้ไขโปรโมชั่น / Promotion updated':snapshot.milestone==='submitted'?(snapshot.notificationOnly?'แจ้งรายละเอียดโปรโมชั่น':'แจ้งรายละเอียดขึ้นปุ่ม Co-Promotion'):'แจ้งสถานะขึ้นปุ่ม และ Interface เรียบร้อย',
      'ชื่อแคมเปญ: '+String(d.campaign||'-'), 'วันที่เริ่ม - วันที่สิ้นสุด: '+String(d.start||'-')+' - '+String(d.end||'-')];
    for(const b of d.buttons||[]){
      lines.push('Type Promotion: '+String(b.promoType||'-'));
      lines.push('Code Promotion: '+String((b.codePromotion??(b.code||'').split(' / ')[0])||'-'));
      if(snapshot.milestone==='submitted'&&!snapshot.notificationOnly)lines.push('หมายเหตุ: สามารถนำรหัสโปรโมชั่นนี้ไปใช้งานต่อได้ หากมีการเปลี่ยนแปลงรหัส ฝ่าย IT จะแจ้งรหัสล่าสุดทางอีเมลอีกครั้ง เมื่อบันทึกขึ้นปุ่มและทำ Interface ครบ');
      lines.push('ชื่อปุ่ม: '+String(b.name||'-'));
      lines.push('รายละเอียดโปรฯ: '+String(b.promotionDetail||'-'));
      lines.push('เงื่อนไข: '+String(b.condition||'-'));
    }
    if(snapshot.additionalMessage)lines.push('ข้อความเพิ่มเติม / Additional message: '+snapshot.additionalMessage);
    lines.push('ไฟล์แนบ: '+((snapshot.attachments||[]).map(file=>file.name).join(', ')||'ไม่มี'));
    const text=lines.join('\n');
    const escape=s=>String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    const label=/^(ชื่อแคมเปญ|วันที่เริ่ม - วันที่สิ้นสุด|Type Promotion|Code Promotion|หมายเหตุ|ชื่อปุ่ม|รายละเอียดโปรฯ|เงื่อนไข|ข้อความเพิ่มเติม \/ Additional message|ไฟล์แนบ):/;
    return {text,html:'<!doctype html><meta charset="utf-8"><div>'+lines.map((x,i)=>{
      const match=x.match(label);
      const content=i===0?'<strong>'+escape(x)+'</strong>':match?'<strong>'+escape(match[0])+'</strong>'+escape(x.slice(match[0].length)):escape(x);
      return '<p style="white-space:pre-wrap">'+content+'</p>';
    }).join('')+'</div>'};
  };
})(globalThis);
