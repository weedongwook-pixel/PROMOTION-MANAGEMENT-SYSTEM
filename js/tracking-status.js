/* Read-only workflow projection. Never changes stored status or timestamps. */
(function(root,factory){var api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.PC_TrackingStatus=api;})(typeof window!=='undefined'?window:globalThis,function(){
 'use strict';
 var text=v=>String(v==null?'':v).trim(),upper=v=>text(v).toUpperCase();
 var isIt=r=>/^(COMPLETE|DONE)$/.test(upper(r.itStatus));
 var isOp=r=>/^(CONFIRMED|APPROVED|COMPLETE)$/.test(upper(r.opStatus));
 var cancelled=r=>upper(r.changeStatus)==='CANCELLED'||upper(r.itStatus)==='CANCELLED'||upper(r.opStatus)==='CANCELLED';
 function time(value){
  var v=text(value),m=v.match(/^(\d{2})\/(\d{2})\/(\d{4})(.*)$/);
  if(m){var year=Number(m[3]);if(year>2400)year-=543;v=year+'-'+m[2]+'-'+m[1]+(m[4]||'T00:00:00');}
  return Date.parse(v)||0;
 }
 function summarize(input){
  var rows=Array.isArray(input)?input:[],groups=new Map(),namedCodes=new Set(),hasNamed=rows.some(r=>text(r.shortName)&&text(r.shortName)!=='-');
  rows.forEach(r=>{if(text(r.shortName)&&text(r.shortName)!=='-'){var c=text(r.codePromotion||r.codeItemSet);if(c)namedCodes.add(c);}});
  rows.forEach(r=>{
   var name=text(r.shortName),code=text(r.codePromotion||r.codeItemSet||r.itemPromoCode),named=name&&name!=='-';
   if(!named&&hasNamed&&(!code||namedCodes.has(code)))return;
   var key=named?'name:'+name:'code:'+(code||'unnamed');
   if(!groups.has(key))groups.set(key,{name:named?name:(code||'ไม่ระบุชื่อปุ่ม'),code:code,rows:[]});
   groups.get(key).rows.push(r);
  });
  var buttons=[...groups.values()].map(g=>{
   var active=g.rows.filter(r=>!cancelled(r)),isCancelled=!active.length;
   var needsEdit=active.some(r=>upper(r.opStatus)==='REJECTED'||r.revisionPending||(upper(r.changeStatus)==='EDITED'&&!isIt(r)));
   var itDone=!!active.length&&active.every(isIt)&&!needsEdit;
   var opDone=itDone&&active.every(isOp);
   return {name:g.name,code:g.code,cancelled:isCancelled,itDone:itDone,opDone:opDone,state:isCancelled?'CANCELLED':needsEdit?'NEEDS_EDIT':!itDone?'WAIT_IT':!opDone?'WAIT_OP':'COMPLETE',reason:needsEdit?active.map(r=>text(r.revisionPending?r.revisionReason:r.rejectReason)).filter(Boolean).join(' · '):''};
  });
  var active=buttons.filter(b=>!b.cancelled),total=active.length,itDone=active.filter(b=>b.itDone).length,opDone=active.filter(b=>b.opDone).length;
  var state=!total?'CANCELLED':active.some(b=>b.state==='NEEDS_EDIT')?'NEEDS_EDIT':itDone<total?'WAIT_IT':opDone<total?'WAIT_OP':'COMPLETE';
  if(!buttons.length)state='WAIT_IT';
  var labels={WAIT_IT:'รอ IT ขึ้นปุ่ม',WAIT_OP:'รอ OP ตรวจสอบ',NEEDS_EDIT:'รอ IT แก้ไขปุ่ม',COMPLETE:'OP ตรวจสอบแล้ว',CANCELLED:'ยกเลิก'};
  var updatedAt='',latest=0;
  rows.forEach(r=>['editedAt','revisionRequestedAt','updatedDate','itSettlementSavedAt','itDoneDate','opDoneDate','txnDate','submittedDate','timestamp'].forEach(k=>{var n=time(r[k]);if(n>latest){latest=n;updatedAt=text(r[k]);}}));
  var submittedAt=0,completedAt=0;
  rows.forEach(r=>{['txnDate','submittedDate','editedAt','revisionRequestedAt'].forEach(k=>submittedAt=Math.max(submittedAt,time(r[k])));completedAt=Math.max(completedAt,time(r.opDoneDate));});
  return {state:state,label:labels[state],owner:state==='WAIT_OP'?'OP':state==='WAIT_IT'||state==='NEEDS_EDIT'?'IT':'—',total:total,itDone:itDone,opDone:opDone,cancelled:buttons.length-total,buttons:buttons,updatedAt:updatedAt,submittedAt:submittedAt,completedAt:completedAt,reason:[...new Set(active.map(b=>b.reason).filter(Boolean))].join(' · ')};
 }
 function compareCampaigns(a,b){
  var sa=a._tracking||summarize([a]),sb=b._tracking||summarize([b]);
  var rank=s=>s.state==='CANCELLED'?2:s.state==='COMPLETE'?1:0;
  return rank(sa)-rank(sb)||(sb.state==='COMPLETE'?sb.completedAt:sb.submittedAt)-(sa.state==='COMPLETE'?sa.completedAt:sa.submittedAt)||text(a.campaign).localeCompare(text(b.campaign));
 }
 return {summarize:summarize,compareCampaigns:compareCampaigns};
});
