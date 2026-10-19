(function(root){
  'use strict';const api=root.PC_Email;
  const fields=['campaign','shortName','promoType','typePromotion','start','end','saleMode','stores','itemCode','itemNameEN','qty','gross','netPrice','discount','detail','condition','mechanic','minAmount','cate','isSubset','chooseMin','chooseMax','codePromotion','codeItemSet','itemPromotion','submissionBatchId','changeStatus','cancelReason','revisionId','revisionPending','emailCampaignId','emailButtonId','emailRowId'];
  api.coProSource=function(block,month){
    const rows=block?.m?.[month];
    if(!/^\d{4}-\d{2}$/.test(month)||!Array.isArray(rows)||!rows.length||rows.length>1000)throw Error('email_invalid_campaign');
    return rows.map(row=>Object.fromEntries(fields.filter(k=>row[k]!==undefined).map(k=>[k,row[k]])));
  };
  api.coProButtonIdentity=row=>JSON.stringify({shortName:String(row.shortName||''),codePromotion:String(row.codePromotion||''),codeItemSet:String(row.codeItemSet||row.itemPromotion||'')});
  api.coProDetails=function(rows,records=[]){
    const first=rows[0]||{},seen=new Set();
    return {campaign:String(first.campaign||''),start:String(first.start||''),end:String(first.end||''),buttons:rows.filter(r=>{const k=api.coProButtonIdentity(r);if(seen.has(k))return false;seen.add(k);return true;}).map(r=>{
      const record=records.find(v=>v.buttonId===r.emailButtonId)||{};
      return {name:String(r.shortName||''),code:[r.codePromotion,r.codeItemSet||r.itemPromotion].filter(Boolean).join(' / '),brand:record.brand||'',detail:record.detail||'',saleMode:r.saleMode||'',netPrice:r.netPrice??'',discount:r.discount??'',condition:r.condition||r.mechanic||'',items:rows.filter(item=>api.coProButtonIdentity(item)===api.coProButtonIdentity(r)).map(item=>({code:item.itemCode||'',name:item.itemNameEN||'',qty:item.qty??'',unitPrice:item.gross??''}))};
    })};
  };
})(globalThis);
