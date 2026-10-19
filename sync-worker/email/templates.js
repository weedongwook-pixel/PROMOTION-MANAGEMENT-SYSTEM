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
    if(!['submitted','it_interface_complete'].includes(snapshot.milestone))throw Error('email_invalid_milestone');
    const d=snapshot.details||{};
    const lines=[snapshot.milestone==='submitted'?'แจ้งรายละเอียด Co-Promotion / Co-Promotion submitted':'IT ขึ้นปุ่มและ Interface เรียบร้อย / POS setup and Interface completed',
      'แคมเปญ / Campaign: '+String(d.campaign||''), 'เริ่ม / Start: '+String(d.start||''),'สิ้นสุด / End: '+String(d.end||'')];
    if(d.detail)lines.push('รายละเอียด / Details: '+String(d.detail));
    for(const b of d.buttons||[]){
      lines.push(String(b.name||'')+' — '+String(b.code||''));
      if(b.brand)lines.push('Partner: '+b.brand);if(b.detail)lines.push('Details: '+b.detail);if(b.saleMode)lines.push('Sale Mode: '+b.saleMode);
      for(const item of b.items||[])lines.push([item.code,item.name,'Qty: '+item.qty,'Unit price: '+item.unitPrice].join(' · '));
      if(b.netPrice!==' '&&b.netPrice!==undefined&&b.netPrice!=='')lines.push('Net: '+b.netPrice);if(b.discount!==undefined&&b.discount!=='')lines.push('Discount: '+b.discount);if(b.condition)lines.push('Conditions: '+b.condition);
    }
    const text=lines.join('\n');
    const escape=s=>String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    return {text,html:'<!doctype html><meta charset="utf-8"><div>'+lines.map(x=>'<p>'+escape(x)+'</p>').join('')+'</div>'};
  };
})(globalThis);
