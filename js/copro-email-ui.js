(function(window){
  'use strict';
  const en=()=>window.PC_LANG==='EN',word=(th,english)=>en()?english:th;
  const esc=value=>String(value??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
  const addresses=value=>String(value||'').split(/[,;\n]/).map(x=>x.trim()).filter(Boolean);
  function conversationRecipients(item){
    const seen=new Set(['it@rocks-foods.com']),result={to:[],cc:[]};
    for(const field of ['to','cc'])for(const match of String(item[field]||'').matchAll(/[a-z0-9.!#$%&'*+\/=?^_`{|}~-]+@[a-z0-9.-]+\.[a-z]{2,}/ig)){
      const address=match[0].toLowerCase();
      if(!seen.has(address)){seen.add(address);result[field].push(address);}
    }
    return result;
  }
  const client=()=>window.PC_CoProEmail;
  function error(error){return Swal.fire({icon:'error',title:word('ยังดำเนินการอีเมลไม่ได้','Email not completed'),text:String(error?.message||error)});}
  async function approveConversation(mode){
    let selected=null, generation=0;
    const result=await Swal.fire({title:'ค้นหาลูปเมลของโปรฯ',width:680,
      html:'<div style="text-align:left"><label for="coproFindSubject">Subject / หัวข้อเมลเดิม</label><input id="coproFindSubject" class="form-control" maxlength="200"><button type="button" id="coproFind" class="btn btn-outline-success my-2">ค้นหาใน Gmail</button><div id="coproFound" role="status"></div><p id="coproSelected"></p><label for="coproNewTo">To — ผู้รับที่ต้องการส่ง</label><textarea id="coproNewTo" class="form-control"></textarea><label for="coproNewCc">CC — เว้นว่างได้</label><textarea id="coproNewCc" class="form-control"></textarea><p class="small">เลือกเมลจริงและยืนยันผู้รับ ขั้นตอนนี้ยังไม่ส่งเมล</p></div>',
      showCancelButton:true,confirmButtonText:'อนุมัติลูปและทำต่อ',cancelButtonText:'กลับไปแก้ข้อมูล',showLoaderOnConfirm:true,
      didOpen(){
        document.getElementById('coproFind').addEventListener('click',async()=>{
          const query=document.getElementById('coproFindSubject').value.trim(),results=document.getElementById('coproFound'),n=++generation;
          selected=null;document.getElementById('coproSelected').textContent='';results.replaceChildren();
          if(!query){results.textContent='กรุณากรอกหัวข้อเมล';return;}
          results.textContent='กำลังค้นหา…';
          try{
            const found=await client().request('threads/search?q='+encodeURIComponent(query)+'&mode='+encodeURIComponent(mode),{interactive:true});
            if(n!==generation||!results.isConnected)return;results.replaceChildren();
            for(const item of found.items){
              const button=document.createElement('button');button.type='button';button.className='btn btn-outline-success d-block my-2';button.textContent=[item.subject,item.from,item.date,'To: '+item.to,'CC: '+item.cc].filter(Boolean).join(' · ');
              button.addEventListener('click',()=>{
                selected=item;document.getElementById('coproSelected').textContent='เลือกลูป: '+item.subject;
                const recipients=conversationRecipients(item);
                document.getElementById('coproNewTo').value=recipients.to.join(', ');
                document.getElementById('coproNewCc').value=recipients.cc.join(', ');
              });results.append(button);
            }
            if(!found.items.length)results.textContent='ไม่พบเมล กรุณาตรวจหัวข้อและบัญชีผู้ส่ง';
          }catch(e){if(n===generation&&results.isConnected)results.textContent=String(e.message||e);}
        });
      },
      async preConfirm(){
        try{
          if(!selected)throw Error('กรุณาค้นหาและเลือกเมลในลูปเดิม');
          const recipients={to:addresses(document.getElementById('coproNewTo').value),cc:addresses(document.getElementById('coproNewCc').value)};
          if(!recipients.to.length)throw Error('กรุณาระบุผู้รับ To');
          const caps=await client().capabilities(),context=caps.authMode==='gmail_owner'?await window.PC_EmailAuth.ownerSession():await window.PC_EmailMsalContext();
          if(!context.identity?.tenantId||!context.identity?.objectId)throw Error('กรุณาเชื่อมบัญชีผู้ส่งอีกครั้ง');
          return await client().request('threads',{method:'POST',body:{mode,messageId:selected.messageId,recipients,audience:[context.identity]},interactive:true});
        }catch(e){Swal.showValidationMessage(String(e.message||e));return false;}
      }
    });
    generation++;return result.isConfirmed?result.value:null;
  }
  window.PC_CoProEmailUI={
    async notifyEdit(context,receipt){
      const answer=await Swal.fire({icon:'question',title:'ต้องการส่งเมลแจ้งการแก้ไขหรือไม่?',text:context.campaign,input:'textarea',inputLabel:'ข้อความเพิ่มเติมถึงผู้รับ (เว้นว่างได้)',inputAttributes:{maxlength:4000},showCancelButton:true,confirmButtonText:'ส่ง',cancelButtonText:'ไม่ส่ง',allowOutsideClick:false});
      if(!answer.isConfirmed)return false;
      try{
        const body={campaignKey:'promo::c::'+encodeURIComponent(context.campaign),month:context.month,editId:receipt.editId,additionalMessage:answer.value||''};
        Swal.fire({title:'กำลังเตรียมเมลจากข้อมูลล่าสุด…',allowOutsideClick:false,didOpen:()=>Swal.showLoading()});
        const preview=await client().request('copro/revision/preview',{method:'POST',body,interactive:true});
        const text=['หัวข้อ: '+preview.subject,'To: '+preview.recipients.to.join(', '),'CC: '+preview.recipients.cc.join(', '),preview.text].join('\n\n');
        const confirm=await Swal.fire({title:'ตรวจเมลแจ้งแก้ไขโปรโมชั่น',html:'<pre style="text-align:left;white-space:pre-wrap;max-height:55vh;overflow:auto">'+esc(text)+'</pre>',showCancelButton:true,confirmButtonText:'ยืนยันส่งเมล',cancelButtonText:'ไม่ส่ง',width:740});
        if(!confirm.isConfirmed)return false;
        Swal.fire({title:'กำลังบันทึกคำขอส่งเมล…',allowOutsideClick:false,didOpen:()=>Swal.showLoading()});
        const result=await client().request('copro/revision',{method:'POST',body:{...body,previewHash:preview.previewHash,confirmed:true}});
        await Swal.fire({icon:'success',title:result.mailStatus==='accepted'?'Gmail รับเมลแล้ว':'บันทึกคำขอส่งเมลแล้ว',text:'รายการแจ้งแก้ไขนี้ไม่ถูกส่งซ้ำ'});
        return true;
      }catch(e){
        await Swal.fire({icon:'error',title:'บันทึกโปรฯ แล้ว แต่ยังส่งเมลไม่ได้',text:String(e.message||e)});
        return false;
      }
    },
    async save(record,options={}){
      if(record.id)throw Error(word('รุ่นทดสอบยังไม่ส่งเมลแก้ไขงานเดิม','Revision emails are not enabled in this pilot'));
      let campaigns=(await client().list()).filter(c=>c.key==='promo::c::'+encodeURIComponent(record.campaign));
      if(!campaigns.length){
        const caps=await client().capabilities();
        if(caps.authMode!=='gmail_owner'||!window.PC_CLOUD?.readCloudKey)throw Error(word('ยังผูกงานกับบัญชีผู้ส่งไม่ได้ กรุณาเชื่อม Gmail ผู้ส่ง','Connect the sending Gmail account to link this job'));
        const key='promo::c::'+encodeURIComponent(record.campaign),source=await window.PC_CLOUD.readCloudKey(key);
        if(!source)throw Error('ไม่พบงานต้นฉบับบน Cloud');
        const block=JSON.parse(source.value),months=Object.keys(block.m||{}).filter(m=>block.m[m]?.length);
        if(!months.length)throw Error('ไม่พบปุ่มโปรฯ ต้นฉบับบน Cloud');
        const choice=await Swal.fire({icon:'question',title:'ผูกงานเดิมกับบัญชีผู้ส่ง',
          text:record.campaign+' — ใช้ข้อมูลล่าสุดที่บันทึกบน Cloud งาน IT ไม่ถูกสร้างซ้ำ ขั้นตอนนี้ยังไม่ส่งเมล',
          input:'select',inputOptions:Object.fromEntries(months.map(m=>[m,m])),showCancelButton:true,
          confirmButtonText:'ผูกงานและเลือกลูป',cancelButtonText:'กลับไปแก้ข้อมูล',confirmButtonColor:'#1b5e20'});
        if(!choice.isConfirmed)return null;
        await client().request('copro/adopt',{method:'POST',body:{campaignKey:key,month:choice.value,expectedSourceVersion:source.updatedAt,confirmed:true}});
        campaigns=(await client().list()).filter(c=>c.key===key);
        if(!campaigns.length)throw Error('ยังตรวจยืนยันการผูกงานไม่ได้ กรุณาเปิดงานเดิมอีกครั้ง ไม่ต้องส่งโปรฯ ซ้ำ');
      }
      let policies=(await client().request('threads')).items.filter(p=>!options.mode||p.mode===options.mode);
      if(!policies.length){
        if(!await approveConversation(options.mode||'production'))return null;
        policies=(await client().request('threads')).items.filter(p=>!options.mode||p.mode===options.mode);
        if(!policies.length)throw Error('ยังตรวจยืนยันลูปที่อนุมัติไม่ได้ กรุณาลองอีกครั้ง');
      }
      const fields=[['brand','พาร์ทเนอร์ / Brand'],['detail','รายละเอียด CoPromo (ไม่ส่งเมล) / Internal CoPromo details'],['billingEntity','บริษัทเรียกเก็บ / Billing entity'],['paymentType','ประเภทชำระ / Payment type'],['soNo','SO number'],['quota','Quota'],['priceIncVat','ราคารวม VAT / Price incl. VAT'],['paymentCondition','เงื่อนไขชำระ / Payment condition'],['remark','หมายเหตุภายใน (ไม่ส่งเมล) / Internal remark'],['periodText','ช่วงเวลา / Period'],['promoType','ประเภทโปรฯ / Promotion type']];
      const recordForms=campaigns.map(c=>{
        const matches=c.buttons.filter(b=>{const identity=JSON.parse(b.source_identity_json);return record.emailButtonId ? b.button_id===record.emailButtonId : (record.cmposName||record.buttonName)?identity.shortName===(record.cmposName||record.buttonName)&&(!record.codePromotion||identity.codePromotion===record.codePromotion):c.buttons.length===1;});
        return '<section data-copro-records="'+esc(c.id)+'"'+(c.id!==campaigns[0].id?' hidden':'')+'>'+c.buttons.map((b,i)=>{
          const identity=JSON.parse(b.source_identity_json),prefill=matches.length===1&&matches[0].button_id===b.button_id?record:{};
          return '<fieldset class="border rounded p-3 my-3"><legend class="float-none w-auto fs-6 px-2">'+esc(identity.shortName+' · '+[identity.codePromotion,identity.codeItemSet].filter(Boolean).join(' / '))+'</legend>'+fields.map(([key,label])=>'<label class="d-block mb-1" for="coproRecord-'+c.id+'-'+i+'-'+key+'">'+esc(label)+(key==='brand'?' *':'')+'</label><textarea class="form-control mb-2" id="coproRecord-'+c.id+'-'+i+'-'+key+'" rows="'+(['detail','remark','paymentCondition'].includes(key)?2:1)+'" maxlength="8000">'+esc(prefill[key]||'')+'</textarea>').join('')+'</fieldset>';
        }).join('')+'</section>';
      }).join('');
      const choose=await Swal.fire({
        title:word('เลือกลูปอีเมล Co-Promotion','Choose a Co-Promotion conversation'),
        html:'<div style="text-align:left"><p>'+esc(word('เมลใช้รายละเอียดจากหน้าแจ้งโปรโมชั่นและไฟล์แนบต้นฉบับ ข้อมูล CoPromo ด้านล่างเก็บภายในระบบเท่านั้น','Email uses the promotion submission and original attachments. CoPromo fields below are stored internally only.'))+'</p>'+
          '<label for="coproCampaign">'+esc(word('แคมเปญ / เดือน','Campaign / month'))+'</label><select id="coproCampaign" class="form-select mb-3">'+campaigns.map(c=>'<option value="'+esc(c.id)+'">'+esc(record.campaign+' / '+c.month)+'</option>').join('')+'</select>'+
          '<label for="coproLoop">'+esc(word('ลูปที่อนุมัติ','Approved conversation'))+'</label><select id="coproLoop" class="form-select mb-3">'+policies.map(p=>'<option value="'+esc(p.id)+'">'+esc(p.subject)+'</option>').join('')+'</select>'+
          '<p id="coproApproved" class="small"></p><label for="coproTestTo">To — '+esc(word('ผู้รับ','Recipients'))+'</label><textarea id="coproTestTo" class="form-control mb-3" rows="2" autocomplete="off"></textarea>'+
          '<label for="coproTestCc">CC — '+esc(word('เว้นว่างได้','Optional'))+'</label><textarea id="coproTestCc" class="form-control" rows="2" autocomplete="off"></textarea><label for="coproAdditionalMessage" class="mt-3">ข้อความเพิ่มเติมถึงผู้รับ (เว้นว่างได้)</label><textarea id="coproAdditionalMessage" class="form-control" rows="3" maxlength="4000"></textarea>'+recordForms+'</div>',
        showCancelButton:true,confirmButtonText:word('ตรวจตัวอย่างเมล','Preview email'),cancelButtonText:word('กลับไปแก้ข้อมูล','Back to form'),confirmButtonColor:'#1b5e20',width:680,
        didOpen(){
          const field=document.getElementById('coproLoop'),describe=()=>{const p=policies.find(x=>x.id===field.value);document.getElementById('coproApproved').textContent=word('รายชื่อที่ผู้ดูแลอนุมัติ: ','Administrator-approved recipients: ')+[...p.recipients.to,...p.recipients.cc].join(', ');document.getElementById('coproTestTo').value=p.recipients.to.join(', ');document.getElementById('coproTestCc').value=p.recipients.cc.join(', ');};field.addEventListener('change',describe);describe();
          document.getElementById('coproCampaign').addEventListener('change',event=>document.querySelectorAll('[data-copro-records]').forEach(section=>{section.hidden=section.dataset.coproRecords!==event.target.value;}));
        },
        showLoaderOnConfirm:true,
        async preConfirm(){
          const campaign=campaigns.find(c=>c.id===document.getElementById('coproCampaign').value),policy=policies.find(p=>p.id===document.getElementById('coproLoop').value),to=addresses(document.getElementById('coproTestTo').value),cc=addresses(document.getElementById('coproTestCc').value);
          if(!to.length){Swal.showValidationMessage(word('กรุณาระบุผู้รับ To','Enter at least one To recipient'));return false;}
          const records=campaign.buttons.map((b,i)=>{const identity=JSON.parse(b.source_identity_json),saved={buttonId:b.button_id,cmposName:identity.shortName,buttonName:identity.shortName};for(const [key]of fields)saved[key]=document.getElementById('coproRecord-'+campaign.id+'-'+i+'-'+key).value.trim();return saved;});
          const invalid=records.findIndex(r=>!r.brand);if(invalid!==-1){const field=document.getElementById('coproRecord-'+campaign.id+'-'+invalid+'-brand');field.classList.add('is-invalid');field.focus();field.scrollIntoView({block:'center'});Swal.showValidationMessage(word('กรุณาระบุพาร์ทเนอร์ให้ครบทุกปุ่ม','Enter a partner for every button'));return false;}
          let selectedPolicy=policy;
          if(JSON.stringify({to,cc})!==JSON.stringify(policy.recipients)){
            try{
              const caps=await client().capabilities(),context=caps.authMode==='gmail_owner'?await window.PC_EmailAuth.ownerSession():await window.PC_EmailMsalContext();
              selectedPolicy=await client().request('threads',{method:'POST',body:{mode:policy.mode,policyId:policy.id,recipients:{to,cc},audience:[context.identity]},interactive:true});
            }catch(e){Swal.showValidationMessage(String(e.message||e));return false;}
          }
          return {campaignId:campaign.id,expectedVersion:campaign.version,policyId:selectedPolicy.id,policyVersion:selectedPolicy.version,recipients:selectedPolicy.recipients,records,additionalMessage:document.getElementById('coproAdditionalMessage').value.trim()};
        }
      });
      if(!choose.isConfirmed)return null;
      const draft=choose.value,preview=await client().request('copro/preview',{method:'POST',body:draft});
      const rendered=[word('หัวข้อ: ','Subject: ')+preview.subject,'To: '+preview.recipients.to.join(', '),'CC: '+preview.recipients.cc.join(', '),preview.text,word('ฉบับแรก: เมื่อบันทึก Co-Promotion สำเร็จ\nฉบับที่สอง: เมื่อขึ้นปุ่มและ Interface ครบ','First: after Co-Promotion save\nSecond: after POS setup and Interface are both complete')].join('\n\n');
      const confirm=await Swal.fire({title:word('ตรวจเนื้อหาและผู้รับก่อนบันทึก','Review content and recipients'),html:'<pre style="text-align:left;white-space:pre-wrap;overflow-wrap:anywhere;max-height:55vh;overflow:auto;font:inherit">'+esc(rendered)+'</pre>',showCancelButton:true,confirmButtonText:word('ยืนยันบันทึกและเข้าคิวเมล','Confirm save and queue email'),cancelButtonText:word('ยกเลิก','Cancel'),confirmButtonColor:'#1b5e20',width:740});
      if(!confirm.isConfirmed)return null;
      const result=await client().request('copro',{method:'POST',body:{...draft,previewHash:preview.previewHash,confirmed:true}});
      return {status:'success',...result};
    },
    mountSettings(root){
      if(!root)return;
      root.innerHTML='<h2 data-th="อีเมล Co-Promotion" data-en="Co-Promotion email">อีเมล Co-Promotion</h2>'+
        '<p data-th="เลือกเธรดงานจริงให้ตรงกับโปรฯ และยืนยันผู้รับก่อนส่ง การเชื่อมต่อไม่ส่งเมลทันที" data-en="Choose the real conversation for each promotion and confirm recipients. Connecting does not send email.">เลือกเธรดงานจริงให้ตรงกับโปรฯ และยืนยันผู้รับก่อนส่ง การเชื่อมต่อไม่ส่งเมลทันที</p>'+
        '<p data-copro-note role="status" aria-live="polite"></p><button type="button" class="btn btn-outline-success mb-3" data-copro-enable>เปิดใช้อีเมลในแท็บนี้</button>'+
        '<details><summary data-th="ผู้ดูแล: อนุมัติลูปอีเมลและผู้รับ" data-en="Administrator: approve conversation and recipients">ผู้ดูแล: อนุมัติลูปอีเมลและผู้รับ</summary>'+
        '<label class="d-block mt-3" for="coproMode">ประเภทลูป / Conversation type</label><select id="coproMode" class="form-select"><option value="production">งานจริง / Production</option><option value="test">ทดสอบ / Test</option></select><label class="d-block mt-3" for="coproSearch">Subject / หัวข้อเมล</label><input id="coproSearch" class="form-control" placeholder="หัวข้อเมลของโปรฯ" maxlength="200"><button type="button" class="btn btn-outline-success my-3" data-copro-search>ค้นหาใน Gmail / Search Gmail</button><div data-copro-results></div>'+
        '<label class="d-block" for="coproPublishTo">To — ผู้รับ / Recipients</label><textarea id="coproPublishTo" class="form-control mb-3" rows="2"></textarea><label for="coproPublishCc">CC</label><textarea id="coproPublishCc" class="form-control mb-3" rows="2"></textarea>'+
        '<label for="coproAudience">Microsoft Object ID — ผู้แจ้งที่เห็นลูปนี้ (ว่าง = บัญชีนี้) / Allowed submitters (blank = this account)</label><textarea id="coproAudience" class="form-control mb-3" rows="2"></textarea>'+
        '<button type="button" class="btn btn-success" data-copro-publish disabled>อนุมัติลูปและผู้รับ / Approve conversation and recipients</button></details>'+
        '<button type="button" class="btn btn-outline-success my-3" data-copro-history>ตรวจคิวเมลของงาน / Check campaign mail status</button><div data-copro-history-list></div>';
      const get=name=>root.querySelector('[data-copro-'+name+']'),note=text=>{get('note').textContent=text;};let selected=null;
      root.querySelector('#coproMode').addEventListener('change',()=>{selected=null;get('publish').disabled=true;get('results').replaceChildren();});
      const toggleLabel=()=>{get('enable').textContent=client().active()?word('ปิดใช้อีเมลในแท็บนี้','Disable email in this tab'):word('เปิดใช้อีเมลในแท็บนี้','Enable email in this tab');};toggleLabel();
      const action=(button,fn)=>button.addEventListener('click',async()=>{button.disabled=true;try{await fn();}catch(e){note(String(e.message||e));}finally{button.disabled=false;}});
      action(get('enable'),async()=>{
        if(client().active()){client().disable();toggleLabel();note(word('ปิดใช้อีเมลในแท็บนี้แล้ว','Pilot disabled in this tab'));return;}
        await client().enable();toggleLabel();note(word('เปิดใช้อีเมลแล้ว ให้สร้างโปรฯ ใหม่ แล้วกรอก Co-Promotion ต่อเพื่อเลือกลูปและผู้รับ','Pilot enabled. Submit a new promotion, then complete its Co-Promotion form to choose a conversation and recipients.'));
      });
      action(get('search'),async()=>{
        selected=null;get('publish').disabled=true;
        const result=await client().request('threads/search?q='+encodeURIComponent(root.querySelector('#coproSearch').value)+'&mode='+root.querySelector('#coproMode').value,{interactive:true});get('results').replaceChildren();
        for(const item of result.items){const b=document.createElement('button');b.type='button';b.className='btn btn-outline-success d-block mb-2';b.textContent=[item.subject,item.from,item.date,item.to,item.cc].join(' · ');b.style.whiteSpace='normal';b.addEventListener('click',()=>{selected={...item,mode:root.querySelector('#coproMode').value};get('publish').disabled=false;note(word('เลือกลูปแล้ว กรุณากรอก To/CC ที่ต้องการอนุมัติ','Conversation selected. Enter the To/CC to approve.'));});get('results').append(b);}
        if(!result.items.length)note(word('ไม่พบลูปอีเมลใน Gmail นี้','No matching conversation found'));
      });
      action(get('publish'),async()=>{
        if(!selected)throw Error('Select a conversation');
        const caps=await client().capabilities();
        const context=caps.authMode==='gmail_owner'?await window.PC_EmailAuth.ownerSession():await window.PC_EmailMsalContext(),identity=context.identity;
        if(!identity?.tenantId||!identity?.objectId)throw Error('กรุณาเชื่อมบัญชีผู้ส่งอีกครั้ง / Verify email access again');
        const recipients={to:addresses(root.querySelector('#coproPublishTo').value),cc:addresses(root.querySelector('#coproPublishCc').value)},audienceInput=caps.authMode==='gmail_owner'?[]:addresses(root.querySelector('#coproAudience').value);
        const audience=audienceInput.length?audienceInput.map(objectId=>({tenantId:identity.tenantId,objectId})):[identity];
        if(!window.confirm(word('อนุมัติผู้รับเหล่านี้หรือไม่?\n','Approve these recipients?\n')+selected.subject+'\n'+selected.mode+'\n'+JSON.stringify(recipients)))return;
        await client().request('threads',{method:'POST',body:{mode:selected.mode,messageId:selected.messageId,recipients,audience},interactive:true});note(word('อนุมัติลูปแล้ว ยังไม่มีการส่งเมล','Conversation approved. No email has been sent.'));
      });
      action(get('history'),async()=>{
        const campaigns=await client().list();get('history-list').replaceChildren();
        for(const c of campaigns){const p=document.createElement('p');p.textContent=c.key.replace('promo::c::','')+' / '+c.month+' — '+c.history.map(h=>h.event_key.split(':').at(-1)+': '+h.status).join(' · ');get('history-list').append(p);}
        if(!campaigns.length)note(word('ยังไม่มีงานใหม่ในโหมดทดสอบ','No new pilot campaigns'));
      });
      client().capabilities().then(c=>{if(c.authMode==='gmail_owner'){root.querySelector('#coproAudience').hidden=true;root.querySelector('label[for="coproAudience"]').hidden=true;}get('enable').disabled=!c.coproEnabled&&!client().active();note(c.coproEnabled?(c.sendingEnabled?word('ส่งเข้าลูปงานจริงหลังเชื่อม Gmail และยืนยันผู้รับ','Production email requires connected Gmail and confirmed recipients'):c.testSendingEnabled?word('ผู้ดูแลเปิดส่งทดสอบแล้ว','Test dispatch enabled by administrator'):word('สร้างคิวได้ แต่ผู้ดูแลยังปิดการส่งจริง','Queueing available; actual test dispatch is disabled')):word('ผู้ดูแลยังไม่เปิด Co-Promotion email หรือการตั้งค่ายังไม่ครบ','Co-Promotion email is disabled or setup is incomplete'));}).catch(e=>note(String(e.message||e)));
    }
  };
})(window);
