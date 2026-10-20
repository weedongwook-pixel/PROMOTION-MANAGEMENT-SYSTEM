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
    const lines=[snapshot.milestone==='promotion_edited'?'แจ้งแก้ไขโปรโมชั่น / Promotion updated':snapshot.milestone==='submitted'?'แจ้งรายละเอียด Co-Promotion / Co-Promotion submitted':'IT ขึ้นปุ่มและ Interface เรียบร้อย / POS setup and Interface completed',
      'ชื่อแคมเปญ / Campaign Name: '+String(d.campaign||'-'), 'วันที่เริ่ม / Start: '+String(d.start||'-'),'วันที่สิ้นสุด / End: '+String(d.end||'-')];
    for(const b of d.buttons||[]){
      lines.push('SHORT NAME (POS): '+String(b.name||'-'));
      if(b.code)lines.push('Code Promotion / Item Set: '+String(b.code));
      const stores=Array.isArray(b.stores)?b.stores.join(', '):String(b.stores||'');
      lines.push('สาขา / Stores: '+(/^ALL$/i.test(stores)?'ทุกสาขา / ALL':stores||'-'));
      lines.push('PROMOTION DETAIL: '+String(b.promotionDetail||'-'));
      lines.push('เงื่อนไข / Conditions: '+String(b.condition||'-'));
      if(b.promoType)lines.push('Type Promotion: '+b.promoType);
      if(b.saleMode)lines.push('Sale Mode: '+b.saleMode);
      if(b.minAmount!==undefined&&b.minAmount!=='')lines.push('Minimum amount: '+b.minAmount);
      for(const item of b.items||[])lines.push([item.code,item.name,'Qty: '+item.qty,'Unit price: '+item.unitPrice].join(' · '));
      if(b.netPrice!==' '&&b.netPrice!==undefined&&b.netPrice!=='')lines.push('Net: '+b.netPrice);if(b.discount!==undefined&&b.discount!=='')lines.push('Discount: '+b.discount);
    }
    if(snapshot.additionalMessage)lines.push('ข้อความเพิ่มเติม / Additional message: '+snapshot.additionalMessage);
    if(snapshot.attachments!==undefined)lines.push('ไฟล์แนบต้นฉบับ / Original attachments: '+(snapshot.attachments.map(file=>file.name).join(', ')||'ไม่มี / None'));
    const text=lines.join('\n');
    const escape=s=>String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    return {text,html:'<!doctype html><meta charset="utf-8"><div>'+lines.map(x=>'<p>'+escape(x)+'</p>').join('')+'</div>'};
  };
})(globalThis);
