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
    const first=rows[0]||{},seen=new Set(),key=r=>r.emailButtonId||api.coProButtonIdentity(r);
    return {campaign:String(first.campaign||''),start:String(first.start||''),end:String(first.end||''),buttons:rows.filter(r=>{const k=key(r);if(seen.has(k))return false;seen.add(k);return true;}).map(r=>{
      return {buttonId:String(r.emailButtonId||''),name:String(r.shortName||''),codePromotion:String(r.codePromotion||''),code:[r.codePromotion,r.codeItemSet||r.itemPromotion].filter(Boolean).join(' / '),promoType:r.typePromotion||r.promoType||'',stores:r.stores||'',minAmount:r.minAmount??'',promotionDetail:r.detail||'',saleMode:r.saleMode||'',netPrice:r.netPrice??'',discount:r.discount??'',condition:r.condition||r.mechanic||'',items:rows.filter(item=>key(item)===key(r)).map(item=>({code:item.itemCode||'',name:item.itemNameEN||'',qty:item.qty??'',unitPrice:item.gross??''}))};
    })};
  };
  // Event kinds for history. Ids never contain ':', so the key shape is unambiguous.
  api.emailEventKind=function(key){key=String(key||'');if(key.includes(':revision:'))return 'promotion_edited';const change=key.match(/:change:(extended|reduced|cancelled):[^:]+$/);if(change)return 'promotion_'+change[1];if(/:it_done(?::[\w-]+)?$/.test(key))return 'it_done';return key.endsWith(':it_interface_complete')?'it_interface_complete':'submitted';};
  // Only fields that appear in lifecycle/IT mail. OP confirmation or other bookkeeping never holds a queued mail.
  api.emailMailFingerprint=rows=>api.hash(JSON.stringify(rows.map(r=>[r.emailButtonId||'',r.shortName||'',r.codePromotion||'',r.codeItemSet||r.itemPromotion||'',r.typePromotion||r.promoType||'',r.start||'',r.end||'',String(r.changeStatus||'').toUpperCase(),r.cancelReason||'',r.changeId||'',r.changePreviousEnd||'',r.revisionId||''])));
  api.emailITComplete=rows=>rows.length>0&&rows.every(r=>/^(COMPLETE|DONE)$/i.test(String(r.itStatus||''))&&!r.revisionPending);
  // One IT completion round: the latest extend/shorten/cancel, an approved edit, or the first setup.
  api.emailITRound=async function(rows){
    const changed=rows.filter(r=>/^(EXTENDED|REDUCED|CANCELLED)$/i.test(String(r.changeStatus||'')));
    if(changed.length){
      const ids=[...new Set(changed.map(r=>r.changeId||''))],id=ids.length===1?ids[0]:'',statuses=[...new Set(changed.map(r=>String(r.changeStatus).toUpperCase()))];
      const round=(await api.hash('change:'+(id||JSON.stringify(changed.map(r=>[r.emailButtonId||r.shortName||'',String(r.changeStatus).toUpperCase(),r.end||'',r.changeId||'']))))).slice(0,16);
      return {kind:'change',change:statuses.includes('CANCELLED')?'CANCELLED':statuses.length===1?statuses[0]:'EXTENDED',rows:changed,round};
    }
    const edits=[...new Set(rows.map(r=>r.revisionId||''))];
    if(edits.length===1&&edits[0]&&rows.every(r=>String(r.changeStatus||'').toUpperCase()==='EDITED'))return {kind:'edit',rows,round:(await api.hash('edit:'+edits[0])).slice(0,16)};
    return {kind:'initial',rows,round:''};
  };
  const changeKinds={EXTENDED:'extended',REDUCED:'reduced',CANCELLED:'cancelled'};
  api.emailChangeKind=function(rows){const statuses=rows.map(r=>String(r.changeStatus||'').toUpperCase());if(!rows.length||statuses.some(s=>!changeKinds[s]))return null;return statuses.includes('CANCELLED')?'cancelled':statuses.every(s=>s==='REDUCED')?'reduced':'extended';};
  // Lifecycle mail shows the same public button details as the announcement, never CoPromo accounting records.
  api.emailChangeDetails=function(rows){
    const first=rows[0]||{},seen=new Set(),buttons=[];
    for(const r of rows){const key=r.emailButtonId||r.shortName||'';if(seen.has(key))continue;seen.add(key);buttons.push({buttonId:String(r.emailButtonId||''),name:String(r.shortName||''),promoType:String(r.typePromotion||r.promoType||''),codePromotion:String(r.codePromotion||''),start:String(r.start||''),end:String(r.end||''),previousEnd:String(r.changePreviousEnd||''),changeStatus:String(r.changeStatus||'').toUpperCase(),promotionDetail:String(r.detail||''),condition:String(r.condition||r.mechanic||'')});}
    const previous=[...new Set(buttons.map(b=>b.previousEnd))],ends=[...new Set(buttons.map(b=>b.end))];
    return {campaign:String(first.campaign||''),start:String(first.start||''),end:ends.length===1?ends[0]:'',previousEnd:previous.length===1?previous[0]:'',reason:String(first.cancelReason||first.reason||''),buttons};
  };
  // Re-check a queued lifecycle/IT event against the current Cloud promotion before every send.
  api.verifyEmailEvent=async function(c,block,key,snap){
    const e=snap.event,all=block?.m?.[c.month];if(!e||typeof e!=='object'||!Array.isArray(all)||!all.length)return false;
    let rows;
    if(snap.milestone==='it_done'){
      const round=await api.emailITRound(all);
      if(round.round!==(e.round||'')||key!==c.id+':'+c.month+':it_done'+(round.round?':'+round.round:'')||!api.emailITComplete(round.rows))return false;rows=round.rows;
    }else{
      rows=all.filter(r=>r.changeId===e.id);const kind=api.emailChangeKind(rows);
      if(!kind||snap.milestone!=='promotion_'+kind||key!==c.id+':'+c.month+':change:'+kind+':'+e.id)return false;
    }
    return await api.emailMailFingerprint(rows)===e.fingerprint;
  };
})(globalThis);
