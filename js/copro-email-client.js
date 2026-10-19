(function(window){
  'use strict';
  let caps=null;
  const key='pc_copro_email_pilot';
  const active=()=>{try{return sessionStorage.getItem(key)==='on';}catch(_){return false;}};
  async function capabilities(){
    const r=await fetch('/email/capabilities',{cache:'no-store',credentials:'same-origin',signal:AbortSignal.timeout(15000)});
    if(!r.ok)throw Error('ระบบอีเมลยังไม่พร้อม / Email setup incomplete');caps=await r.json();return caps;
  }
  async function request(path,{method='GET',body,interactive=false}={}){
    if(!caps)await capabilities();
    if(!caps.coproEnabled)throw Error('ยังไม่เปิดบริการ Co-Promotion email / Email disabled');
    if(!window.PC_EmailAuth)throw Error('กรุณาเชื่อมบัญชีผู้ส่งที่ตั้งค่าอีเมล / Connect the sender in Email Settings');
    const authHeaders=window.PC_EmailAuth.requestHeaders ? await window.PC_EmailAuth.requestHeaders({caps,interactive}) : {Authorization:'Bearer '+await window.PC_EmailAuth.acquireToken({scope:caps.scope,interactive})};
    const r=await fetch('/email/'+path,{method,credentials:'same-origin',cache:'no-store',headers:{...authHeaders,...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(20000)});
    const result=await r.json();if(!r.ok)throw Error('ยังดำเนินการอีเมลไม่ได้ / Email not completed: '+(result.error||r.status));return result;
  }
  async function list(){return (await request('copro')).items;}
  async function refresh(){if(window.PC_CLOUD?.pull)await window.PC_CLOUD.pull({force:true});}
  const api=window.PC_CoProEmail={
    active,request,capabilities,list,
    async prepareSubmission(){
      if(active())return true;
      try {
        const available=await capabilities();
        if(!available.coproEnabled||!available.sendingEnabled)return false;
        await api.enable();return true;
      } catch (_) { return false; } // Ordinary promotion saving remains available; Co-Promo reports missing email readiness.
    },
    async enable(){await capabilities();await request('copro',{interactive:true});sessionStorage.setItem(key,'on');},
    disable(){sessionStorage.removeItem(key);},
    async registerPrimary(body){if(!active())throw Error('Pilot not selected');const receipt=await request('promo/submissions',{method:'POST',body});return receipt;},
    async saveIT(month,updates){
      const campaigns=await list(),matches=[];
      for(const update of updates){
        const found=campaigns.filter(c=>c.key==='promo::c::'+encodeURIComponent(update.campaign)&&c.month===String(update.month||month)&&c.records&&c.records.length);
        if(found.length>1)throw Error('พบหลายงาน กรุณาตรวจรหัสงาน / Ambiguous campaign');
        if(!found.length){matches.push(null);continue;}
        const campaign=found[0],button=campaign.buttons.find(b=>b.button_id===update.emailButtonId);
        if(!button||update.emailCampaignId!==campaign.id||!update.emailRowId)throw Error('ไม่พบรหัสอ้างอิงปุ่ม กรุณาโหลดงานใหม่ / Reload the task to obtain its protected button identity');
        matches.push({campaign,button,update});
      }
      if(matches.every(x=>!x))return null;
      if(matches.some(x=>!x))throw Error('กรุณาแยกบันทึกงานทดสอบอีเมลกับงานปกติ / Save pilot and ordinary campaigns separately');
      const groups=new Map();
      for(const match of matches){const id=match.campaign.id+'/'+match.button.button_id;if(!groups.has(id))groups.set(id,{...match,updates:[]});groups.get(id).updates.push(match.update);}
      for(const match of groups.values()){
        if(match.updates.some(u=>u.promoCode!==match.update.promoCode||u.itemPromo!==match.update.itemPromo))throw Error('รหัสในปุ่มเดียวกันไม่ตรงกัน / Inconsistent button codes');
        await request('copro/'+match.campaign.id+'/it',{method:'POST',body:{buttonId:match.button.button_id,expectedVersion:match.button.version,codePromotion:match.update.promoCode,codeItemSet:match.update.itemPromo,updates:match.updates}});
      }
      await refresh();return {_emailPersisted:true,value:'SUCCESS'};
    },
    async interfaceRecord(record){
      const result=await request('copro/'+record.emailCampaignId+'/interface',{method:'POST',body:{buttonId:record.emailButtonId,expectedVersion:record.emailVersion}});
      return {status:'success',mailStatus:result.mailStatus,_emailPersisted:true};
    }
  };
  // Keep ordinary bridge functions intact when the user has not opted in.
  const backend=window.PC_API;
  if(backend){
    const originalList=backend.getCoPromotions,originalInterface=backend.confirmErpInterface,originalIT=backend.saveSettlementBatch;
    backend.getCoPromotions=async function(){
      const ordinary=originalList();if(!active())return ordinary;
      const campaigns=await list();return ordinary.concat(campaigns.flatMap(c=>c.records));
    };
    backend.confirmErpInterface=async function(id,by){
      if(!active())return originalInterface(id,by);
      const record=(await list()).flatMap(c=>c.records).find(r=>r.id===id);
      return record?api.interfaceRecord(record):originalInterface(id,by);
    };
    backend.saveSettlementBatch=async function(month,updates){
      if(active()){const result=await api.saveIT(month,updates);if(result)return result;}
      return originalIT(month,updates);
    };
  }
})(window);
