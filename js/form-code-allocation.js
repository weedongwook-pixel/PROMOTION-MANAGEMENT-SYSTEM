(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;root.PC_FormCodeAllocation=api;})(typeof window!=='undefined'?window:globalThis,function(){
 'use strict';
 function reserveFormCode(state,opts){
  const {type,tag,campaign,shortName,actor,at}=opts;
  if(!state||!state.types||!state.reservations)throw Error('ทะเบียนจองรหัสบน Cloud ไม่ถูกต้อง');
  const field=opts.fieldId||tag+'|'+String(campaign||'')+'|'+String(shortName||'');
  const found=Object.values(state.reservations).find(e=>e&&e.type===type&&e.status==='RESERVED'&&String(e.where||'')===String(campaign||'')&&String(e.field||'')===field);
  const manual=opts.manualCode==null?null:String(opts.manualCode).trim().toUpperCase();
  if(found){if(manual!==null&&manual!==found.code)throw Error('รหัสที่จองไว้เปลี่ยนไป กรุณาเปิดงานใหม่');return {code:found.code,changed:false};}
  const t=state.types[type],format={coupon:['IC',4],bill:['BD',3],voucher:['VC',4],promo:['P',0],itemset:['107',3]}[type];
  if(!format||!t||!t.seeded||!Number.isSafeInteger(Number(t.cursor))||Number(t.cursor)<0)throw Error('ทะเบียนรหัส '+type+' ยังไม่พร้อมบน Cloud');
  const occupied=code=>!!state.reservations[type+'::'+code]||Object.values(state.reservations).some(e=>e&&String(e.code).trim().toUpperCase()===code)||!!opts.usedCodes?.has(code);
  let n=Number(t.cursor),code;
  if(manual!==null){
   const match=new RegExp('^'+format[0]+'(\\d{'+Math.max(1,format[1])+',10})$').exec(manual);
   if(!match||!Number.isSafeInteger(Number(match[1]))||Number(match[1])<=0)throw Error('รูปแบบรหัสไม่ถูกต้อง: '+format[0]+' ตามด้วยตัวเลข');
   code=manual;n=Number(match[1]);if(occupied(code))throw Error('รหัส '+code+' ซ้ำหรือถูกจองแล้ว กรุณาใช้รหัสอื่น');
  }else{
   do{n++;if(!Number.isSafeInteger(n))throw Error('เลขรหัสเกินขอบเขต กรุณาติดต่อ IT');code=format[0]+String(n).padStart(format[1],'0');}while(occupied(code));
  }
  t.cursor=Math.max(Number(t.cursor),n);
  state.reservations[type+'::'+code.toUpperCase()]={code,type,num:n,status:'RESERVED',where:campaign,field,by:actor,at,confirmedAt:'',releasedAt:''};
  state.log=state.log||[];state.log.unshift({t:at,act:'RESERVE',type,code,where:campaign,by:actor});if(state.log.length>400)state.log.length=400;
  return {code,changed:true};
 }
 return {reserveFormCode};
});
