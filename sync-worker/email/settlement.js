(function(root){
  'use strict';const api=root.PC_Email;
  // Stage the same settlement/product/recipe transformation as the browser.
  // Only the verified command may commit these writes and completion evidence.
  api.prepareEmailSettlement=async function(c,s,button,input,env,now){
    const read=key=>env.DB.prepare('SELECT v,updated_at FROM promo_store WHERE k=?').bind(key).first();
    const resourceKeys=['promo::meta','pc_product_promo','pc_itemset_comp','pc_code_counter_v1'];
    const resources={};for(const key of resourceKeys)resources[key]=await read(key);
    const meta=resources['promo::meta']?JSON.parse(resources['promo::meta'].v):{};
    const selected=s.block.m[c.month].filter(r=>api.coProButtonIdentity(r)===button.source_identity_json);
    if(!selected.length||input.updates&&(!Array.isArray(input.updates)||input.updates.length!==selected.length))throw Error('email_invalid_settlement');
    const code=String(input.codePromotion||'').trim(),item=String(input.codeItemSet||'').trim();
    if(!code&&!item||code&&!/^[a-zA-Z0-9-]{1,32}$/.test(code)||item&&!/^[0-9]{6,12}$/.test(item))throw Error('email_invalid_codes');
    const date=new Date(now).toISOString(),day=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Bangkok',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
    const updates=selected.map((row,i)=>{
      const u=input.updates?(row.emailRowId?input.updates.find(u=>u.emailRowId===row.emailRowId):input.updates[i]):{};
      if(!u)throw Error('email_invalid_settlement');
      if(u.emailRowId&&u.emailRowId!==row.emailRowId)throw Error('email_invalid_settlement');
      for(const [field,source] of [['itemCode','itemCode'],['qty','qty'],['price','gross']])if(u[field]!==undefined&&String(u[field])!==String(row[source]??''))throw Error('email_source_changed');
      const out={month:c.month,rowIdx:i+2,campaign:row.campaign,sourceShortName:row.shortName,shortName:u.shortName??row.shortName,kitchenName:u.kitchenName??row.kitchen??'',promoType:u.promoType??row.promoType??row.typePromotion??'',cateRemark:u.cateRemark??row.cateRemark??row.cate??'',promoCode:code,itemPromo:item,itemCode:row.itemCode,itemNameEN:row.itemNameEN,qty:row.qty,price:row.gross,netPrice:row.netPrice??'',revisionId:''};
      for(const field of ['shortName','kitchenName','promoType','cateRemark'])if(typeof out[field]!=='string'||out[field].length>300||/[\r\n\0]/.test(out[field]))throw Error('email_invalid_settlement');
      if(!out.shortName.trim()||row.revisionPending||row.changeStatus)throw Error('email_revision_not_enabled');
      return out;
    });
    if(updates.some(u=>['shortName','kitchenName','promoType','cateRemark'].some(k=>u[k]!==updates[0][k])))throw Error('email_invalid_settlement');
    if((selected.some(r=>/item set/i.test(r.promoType||r.typePromotion||'')||r.codeItemSet)||updates.some(u=>/item set/i.test(u.promoType)))&&!item)throw Error('email_invalid_codes');
    const all=(await env.DB.prepare("SELECT k,v FROM promo_store WHERE k LIKE 'promo::c::%'").all()).results;
    const working=[];
    for(const entry of all){const block=JSON.parse(entry.v);for(const [month,rows]of Object.entries(block.m||{}))for(const row of rows){
      if(entry.k===c.campaign_key&&month===c.month&&api.coProButtonIdentity(row)===button.source_identity_json)continue;
      if((code&&String(row.codePromotion||'').toUpperCase()===code.toUpperCase())||(item&&String(row.codeItemSet||row.itemPromotion||'')===item))throw Error('email_duplicate_code');
      working.push({...row,month});
    }}
    const selectedWorking={...selected[0],month:c.month};
    const values={};for(const key of ['pc_product_promo','pc_itemset_comp'])if(resources[key])values[key]=resources[key].v;
    const catalog=api.settlementCatalog;
    const result=root.PC_Settlement.applySettlement({store:{...meta,months:{[c.month]:selected},working:[selectedWorking,...working]},master:[...catalog.categories,...catalog.codes.map(itemCode=>({itemCode}))],values,now:date,day},c.month,updates);
    if(result.status!=='SUCCESS')throw Error('email_invalid_settlement');
    const nextRows=result.store.months[c.month];let index=0;
    s.block.m[c.month]=s.block.m[c.month].map(row=>api.coProButtonIdentity(row)===button.source_identity_json?{...nextRows[index++],codeItemSet:item,itemPromotion:item}:row);
    // Rebuild the compatibility working view by exact button identity, not name alone.
    const summaries=[],seen=new Set();for(const [month,rows]of Object.entries(s.block.m))for(const row of rows){const id=month+'|'+api.coProButtonIdentity(row);if(!seen.has(id)){seen.add(id);summaries.push({...row,month,itemCode:'',itemNameEN:'',qty:'',gross:''});}}
    s.block.w=summaries;
    const products=(result.store.npdProducts||[]).map(product=>{const old=(meta.npdProducts||[]).find(p=>p.itemCode===product.itemCode);return JSON.stringify(old)===JSON.stringify(product)?product:{...product,updatedAt:date};});
    const writes=[{key:'promo::meta',value:JSON.stringify({...meta,npdProducts:products})}];
    for(const key of ['pc_product_promo','pc_itemset_comp'])if(result.values[key]!==values[key])writes.push({key,value:result.values[key]});
    if(result.confirmations.length){
      const counter=resources.pc_code_counter_v1&&JSON.parse(resources.pc_code_counter_v1.v);if(!counter?.reservations)throw Error('email_counter_unavailable');
      for(const claim of result.confirmations){const entry=counter.reservations[claim.type+'::'+claim.code];if(!entry||entry.status==='RELEASED'||entry.where!==selected[0].campaign)throw Error('email_counter_conflict');entry.status='CONFIRMED';entry.confirmedAt=entry.confirmedAt||date;}
      writes.push({key:'pc_code_counter_v1',value:JSON.stringify(counter)});
    }
    return {rows:api.coProSource(s.block,c.month),identity:api.coProButtonIdentity(s.block.m[c.month].find(r=>r.emailButtonId===button.button_id)||nextRows[0]),writes:writes.map(w=>({...w,expectedUpdatedAt:resources[w.key]?.updated_at??null}))};
  };
})(globalThis);
