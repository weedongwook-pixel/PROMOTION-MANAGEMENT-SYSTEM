const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const {webcrypto}=require('node:crypto');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const {database,actor:staffActor,grant}=require('../tests/helpers/copro-context.cjs');
(async()=>{
  const ownerMode=process.argv.includes('--gmail-owner');
  const actor=ownerMode?{tenantId:'00000000-0000-4000-8000-000000000001',objectId:'00000000-0000-4000-8000-000000000002'}:staffActor;
  const mode=process.argv.includes('--production')?'production':'test';
  const subject=mode==='production'?'UOB October campaign':'Test send to email copro UOB';
  const DB=database();if(ownerMode)DB.db.exec(fs.readFileSync('sync-worker/migrations/006_gmail_owner_sessions.sql','utf8'));DB.db.exec('CREATE TABLE promo_store(k TEXT PRIMARY KEY,v TEXT,updated_at INTEGER)');DB.db.exec(fs.readFileSync('sync-worker/migrations/002_submission_receipts.sql','utf8'));
  if(!ownerMode)for(const role of ['manage','submit','it'])grant(DB,actor,role);
  const env={DB,SYNC_TOKEN:'test-cloud-token',EMAIL_AUTH_MODE:ownerMode?'gmail_owner':'microsoft',CLOUD_FIRST_ENABLED:'true',EMAIL_CONNECTION_ENABLED:'true',EMAIL_COPRO_ENABLED:'true',EMAIL_TEST_SEND_ENABLED:mode==='test'?'true':'false',EMAIL_SEND_ENABLED:mode==='production'?'true':'false',EMAIL_TENANT_ID:actor.tenantId,EMAIL_API_AUDIENCE:'22222222-2222-4222-8222-222222222222',EMAIL_API_SCOPE:'api://22222222-2222-4222-8222-222222222222/access_as_user',GMAIL_CLIENT_SECRET:'mock',EMAIL_ENCRYPTION_KEY:Buffer.alloc(32,7).toString('base64')};
  const sent=[];
  const provider=async(url,opts)=>{if(/messages\?/.test(url))return Response.json({messages:[{id:'m1'}]});if(url.includes('messages/send')){sent.push(JSON.parse(opts.body));return Response.json({id:'mock-send-'+sent.length});}return Response.json({id:'m1',threadId:'provider-thread',payload:{headers:[{name:'Subject',value:subject},{name:'Message-ID',value:'<m1@example.com>'},{name:'To',value:'"Test, Partner" <external-test@example.net>'},{name:'Cc',value:'it@rocks-foods.com'}]}});};
  const c={crypto:webcrypto,fetch:provider,URL,URLSearchParams,TextEncoder,TextDecoder,atob,btoa,AbortSignal,Request,Response,Headers,console};
  vm.createContext(c);vm.runInContext(require('../tests/helpers/sync-worker-source.cjs')().replace('export default','globalThis.worker='),c);
  if(!ownerMode)c.PC_Email.verifyEmailActor=async()=>actor;
  if(ownerMode){c.PC_Email.exchangeCode=async()=>({access_token:'mock',refresh_token:'mock',scope:c.PC_Email.readEmailConfig(env).scopes.join(' ')});c.PC_Email.verifySender=async()=> 'it@rocks-foods.com';}c.PC_Email.gmailAccess=async()=> 'mock';
  DB.db.exec("INSERT INTO email_connections VALUES(1,'it@rocks-foods.com','connected','mock','mock','now','now',1)");

  const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
  try{
    const page=await browser.newPage({viewport:{width:1366,height:900}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.route('**/*',async route=>{
      const u=new URL(route.request().url());assert.equal(u.origin,'https://pilot.test');
      if(u.pathname.startsWith('/email/')||u.pathname.startsWith('/promo/')){
        const request=route.request(),headers=new Headers(request.headers());headers.set('Origin','https://white-pine-853e.quiet-surf-dda2.workers.dev');if(u.pathname.startsWith('/promo/'))headers.set('Authorization','Bearer test-cloud-token');
        const response=await c.worker.fetch(new Request('https://sync.test'+u.pathname+u.search,{method:request.method(),headers,body:request.method()==='GET'?undefined:request.postData()}),env);
        return route.fulfill({status:response.status,headers:Object.fromEntries(response.headers),body:await response.text()});
      }
      if(u.pathname==='/')return route.fulfill({contentType:'text/html; charset=utf-8',body:'<!doctype html><meta charset="utf-8"><link rel="stylesheet" href="/vendor/bootstrap/bootstrap.min.css"><link rel="stylesheet" href="/css/workspace.css"><div id="pilot"></div><script src="/vendor/sweetalert2/sweetalert2.all.min.js"></script>'+(ownerMode?'<script src="/js/email-auth.js"></script>':'')+'<script src="/js/copro-email-client.js"></script><script src="/js/copro-email-ui.js"></script>'});
      return route.fulfill({path:path.join(process.cwd(),u.pathname)});
    });
    await page.addInitScript(actor=>{window.PC_LANG='TH';window.PC_EmailAuth={acquireToken:async()=> 'mock'};window.PC_EmailMsalContext=async()=>({identity:actor});},actor);
    await page.goto('https://pilot.test/');
    if(ownerMode)await page.evaluate(async()=>{
      window.PC_EmailMsalContext=async()=>{throw Error('Microsoft must never be called');};
      const start=await fetch('/email/gmail/connect',{method:'POST'}),auth=new URL((await start.json()).authorizationUrl);
      const callback=await fetch('/email/gmail/callback?state='+auth.searchParams.get('state')+'&code=mock');if(!callback.ok)throw Error('mock Gmail callback failed');
      const session=await PC_EmailAuth.ownerSession();if(session.sender!=='it@rocks-foods.com')throw Error('owner missing');
    });
  if(!process.argv.includes('--new-loop'))await c.PC_Email.publishThread(actor,{mode,messageId:'m1',recipients:{to:['external-test@example.net'],cc:[]},audience:[actor]},env);
    await page.evaluate(async()=>{await PC_CoProEmail.enable();PC_CoProEmailUI.mountSettings(document.getElementById('pilot'));});
    const attachment={name:process.env.EMAIL_ATTACHMENT_FIXTURE?path.basename(process.env.EMAIL_ATTACHMENT_FIXTURE):'original.xlsx',mime:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',base64:(process.env.EMAIL_ATTACHMENT_FIXTURE?fs.readFileSync(process.env.EMAIL_ATTACHMENT_FIXTURE):Buffer.from('mock original')).toString('base64')};
    const row={attachment:'file:original',campaign:'Email UOB test',shortName:'Button A',submissionBatchId:'batch-test-1234',month:'2026-10',itemCode:'101001',itemNameEN:'Fries',qty:1,gross:55,netPrice:45,promoType:'Item Coupon',codePromotion:'IC001',start:'2026-10-19',end:'2026-11-01'};
    const receipt=await page.evaluate(async ({row,attachment})=>PC_CoProEmail.registerPrimary({submissionId:'batch-test-1234',actor:'Test staff',expectedButtons:2,writes:[{key:'promo::c::Email%20UOB%20test',expectedUpdatedAt:null,value:JSON.stringify({m:{'2026-10':[row,{...row,shortName:'Button B',codePromotion:'IC002'}]},w:[]})},{key:'pc_promo_files',expectedUpdatedAt:null,value:JSON.stringify({original:attachment})}]}),{row,attachment});
    async function draftScripts(){
      await page.addScriptTag({path:path.join(process.cwd(),'js/co-promo.js')});
      await page.addScriptTag({path:path.join(process.cwd(),'js/copro-drafts.js')});
      await page.evaluate(()=>{
        localStorage.setItem('pc_userName','Test staff');window.loadPage=name=>window.lastNavigation=name;
        window.PC_CLOUD={
          async readCloudKey(key){const r=await fetch('/promo/store/'+encodeURIComponent(key));if(r.status===404)return null;const v=await r.json();if(!r.ok)throw Error(v.error);return {value:v.value,updatedAt:v.updated_at};},
          async readCampaignRows(campaign){const r=await this.readCloudKey('promo::c::'+encodeURIComponent(campaign));return r?Object.values(JSON.parse(r.value).m).flat():[];},
          async saveCoPromoRecords(value,expectedUpdatedAt){const r=await fetch('/promo/store/pc_co_promotions',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({value,expectedUpdatedAt})});if(!r.ok)throw Error('CoPromo save failed');return this.readCloudKey('pc_co_promotions');},
          async saveCoPromoDrafts(owner,value,expectedUpdatedAt){if(window.failDraft)throw Error('Cloud offline');const key='pc_copro_drafts::'+encodeURIComponent(owner);const r=await fetch('/promo/store/'+encodeURIComponent(key),{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({value,expectedUpdatedAt})});if(!r.ok)throw Error('Cloud save failed');const check=await this.readCloudKey(key);if(check.value!==value)throw Error('Readback failed');return check;}
        };
      });
      if(process.argv.includes('--real-cloud')){
        await page.evaluate(()=>{localStorage.setItem('pc_cloud_cfg',JSON.stringify({url:location.origin,token:'test-cloud-token'}));});
        await page.addScriptTag({path:path.join(process.cwd(),'js/cloud-store.js')});
        await page.evaluate(()=>{const save=PC_CLOUD.saveCoPromoDrafts;PC_CLOUD.saveCoPromoDrafts=function(...args){if(window.failDraft)return Promise.reject(Error('Cloud offline'));return save.apply(this,args);};});
      }
    }
    if(process.argv.includes('--form'))await draftScripts();
    let operation;
    if(process.argv.includes('--form')){
      await page.addScriptTag({path:path.join(process.cwd(),'js/co-promo.js')});
      await page.evaluate(()=>{
        const run={withSuccessHandler(fn){this.success=fn;return this;},withFailureHandler(){return this;},getCoPromoContext(){this.success({campaign:'Email UOB test',buttons:[{buttonName:'Button A',codePromotion:'IC001'}]});}};
        window.google={script:{run}};
        window.formDone=PC_CoPromo.openForm('Email UOB test',null,{requireEmail:true});
      });
      await page.locator('#cpBrand').fill('Test partner');
      await page.locator('#cpDesc').fill('Test details <script>not HTML</script>');
      await page.locator('#cpBill').fill('Test billing');await page.locator('#cpSo').fill('SO123');
      await page.locator('#cpCond').fill('30 days');await page.locator('#cpRemark').fill('Internal only');
      if(process.argv.includes('--draft')){
        await page.evaluate(()=>window.failDraft=true);await page.locator('#cpfDraft').click();
        await page.locator('#cpfErr').filter({hasText:'Cloud offline'}).waitFor();assert.equal(await page.locator('#cpBrand').inputValue(),'Test partner');
        await page.evaluate(()=>window.failDraft=false);await page.locator('#cpfDraft').click();
        await page.waitForFunction(()=>!document.getElementById('pcCoproPage'));
        assert.equal(DB.db.prepare('SELECT COUNT(*) n FROM email_outbox').get().n,0,'draft must never queue mail');
        const key='promo::c::Email%20UOB%20test',stored=DB.db.prepare('SELECT v,updated_at FROM promo_store WHERE k=?').get(key),block=JSON.parse(stored.v);
        block.m['2026-10'][0].codePromotion='IC0999';block.m['2026-10'][0].shortName='Renamed Button A';
        DB.db.prepare('UPDATE promo_store SET v=?,updated_at=? WHERE k=?').run(JSON.stringify(block),stored.updated_at+1,key);
        await page.reload();await draftScripts();
        await page.evaluate(async pending=>{const items=await PC_CoPromoDrafts.list();window.formDone=pending?PC_CoPromoDrafts.chooseSend(items[0]):PC_CoPromoDrafts.resume(items[0]);},process.argv.includes('--pending'));
        if(process.argv.includes('--pending'))await page.getByRole('button',{name:'ส่ง',exact:true}).click();
        await page.locator('#cpfSave').waitFor();assert.equal(await page.locator('#cpBrand').inputValue(),'Test partner');
        assert.equal(await page.locator('#cpCodeP').inputValue(),'IC0999');
      }
      if(!process.argv.includes('--pending')){await page.evaluate(()=>PC_CoProEmail.disable());await page.locator('#cpfSave').click();}
      operation=page.evaluate(()=>formDone);operation.catch(()=>{});
    }else{
      operation=page.evaluate(mode=>PC_CoProEmailUI.save({campaign:'Email UOB test',buttonName:'Button A',brand:'Test partner',detail:'Test details <script>not HTML</script>',billingEntity:'Test billing',soNo:'SO123',paymentCondition:'30 days',remark:'Internal only'},{mode}),mode);
    }
    if(process.argv.includes('--new-loop')){
      await page.locator('#coproFindSubject').fill(subject);await page.locator('#coproFind').click();
      await page.locator('#coproFound button').first().click();
      assert.equal(await page.locator('#coproNewTo').inputValue(),'external-test@example.net');
      assert.equal(await page.locator('#coproNewCc').inputValue(),'');
      if(ownerMode&&mode==='production')await page.locator('#coproNewCc').fill('added@example.net');
      await page.getByRole('button',{name:'อนุมัติลูปและทำต่อ',exact:true}).click();
    }
    await page.locator('#coproTestTo').waitFor({timeout:5000});
    assert.equal(await page.locator('#coproTestTo').inputValue(),'external-test@example.net');
    if(process.argv.includes('--new-loop')&&ownerMode&&mode==='production')assert.equal(await page.locator('#coproTestCc').inputValue(),'added@example.net');
    if(ownerMode&&mode==='production')await page.locator('#coproTestCc').fill('edited@example.net');
    await page.locator('#coproAdditionalMessage').fill('Additional message for recipients');
    const emptyBrand=page.locator('textarea[id$="-brand"]').filter({visible:true});
    const brands=await emptyBrand.all();assert.equal(brands.length,2);
    const blank=[];for(const brand of brands)if(!await brand.inputValue())blank.push(brand);assert.equal(blank.length,1,'no silent copying to another button');await blank[0].fill('Partner B');
    await page.getByRole('button',{name:'ตรวจตัวอย่างเมล',exact:true}).click();
    await page.getByRole('button',{name:'ยืนยันบันทึกและเข้าคิวเมล',exact:true}).waitFor();
    assert.ok((await page.locator('.swal2-popup').innerText()).includes(attachment.name));
    assert.ok((await page.locator('.swal2-popup').innerText()).includes('Additional message for recipients'));
    if(ownerMode&&mode==='production')assert.ok((await page.locator('.swal2-popup').innerText()).includes('edited@example.net'));
    await page.locator('.swal2-popup').evaluate(async el=>{await Promise.all(el.getAnimations().map(a=>a.finished));});
    for(const width of [1366,390]){await page.setViewportSize({width,height:900});await page.screenshot({path:'/tmp/copro-email-preview-'+width+'.png',fullPage:true});}
    await page.getByRole('button',{name:'ยืนยันบันทึกและเข้าคิวเมล',exact:true}).click();
    if(process.argv.includes('--draft')){await page.getByRole('button',{name:'ทำงานต่อ',exact:true}).click();}
    await operation;
    if(process.argv.includes('--draft'))assert.equal(await page.evaluate(async()=>(await PC_CoPromoDrafts.list()).length),0);
    assert.equal(DB.db.prepare('SELECT COUNT(*) n FROM email_outbox').get().n,1);
    const records=DB.db.prepare('SELECT record_json FROM email_copro_records').all().map(r=>JSON.parse(r.record_json)),business=records.find(r=>r.brand==='Test partner');assert.equal(business.billingEntity,'Test billing');assert.equal(business.soNo,'SO123');assert.equal(business.paymentCondition,'30 days');assert.equal(business.remark,'Internal only');assert.equal(records.filter(r=>r.brand==='Partner B').length,1);
    await c.PC_Email.dispatchEmail(env,{fetch:provider});assert.equal(sent.length,1);
    const status=await c.PC_Email.coProStatus(actor,receipt.emailCampaigns[0].id,env);
    for(const button of status.buttons)await c.PC_Email.commitIT(actor,{campaignId:status.id,buttonId:button.button_id,expectedVersion:1,codePromotion:JSON.parse(button.source_identity_json).codePromotion},env);await c.PC_Email.dispatchEmail(env,{fetch:provider});assert.equal(sent.length,1);
    for(let i=0;i<status.buttons.length;i++){await c.PC_Email.commitInterface(actor,{campaignId:status.id,buttonId:status.buttons[i].button_id,expectedVersion:1},env);await c.PC_Email.dispatchEmail(env,{fetch:provider});assert.equal(sent.length,i===status.buttons.length-1?2:1);}
    await c.PC_Email.dispatchEmail(env,{fetch:provider});assert.equal(sent.length,2);
    for(const [i,mail] of sent.entries()){const mime=Buffer.from(mail.raw,'base64url').toString('utf8');assert.match(mime,/Content-Disposition: attachment/);fs.writeFileSync('/private/tmp/copro-attachment-'+i+'.eml',mime);}
    assert.equal(sent[0].threadId,'provider-thread');assert.equal(sent[1].threadId,'provider-thread');assert.deepEqual(errors,[]);
    if(process.argv.includes('--revision')){
      const key='promo::c::Email%20UOB%20test',stored=DB.db.prepare('SELECT v,updated_at FROM promo_store WHERE k=?').get(key),block=JSON.parse(stored.v),editId='edit-browser-revision';
      block.m['2026-10'].forEach(r=>{r.editId=editId;r.detail='Updated promotion from saved form';r.codePromotion='IC0900';});
      DB.db.prepare('UPDATE promo_store SET v=?,updated_at=? WHERE k=?').run(JSON.stringify(block),stored.updated_at+1,key);
      DB.db.prepare('INSERT INTO promo_submission_receipts(submission_id,request_hash,response_json,actor,expected_buttons,created_at) VALUES(?,?,?,?,?,?)').run(editId,'test',JSON.stringify({kind:'CAMPAIGN_EDIT',versions:{[key]:stored.updated_at+1}}),'Test staff',2,Date.now());
      const show=()=>page.evaluate(()=>PC_CoProEmailUI.notifyEdit({campaign:'Email UOB test',month:'2026-10'},{editId:'edit-browser-revision'}));
      const no=show();await page.getByRole('button',{name:'ไม่ส่ง',exact:true}).click();assert.equal(await no,false);assert.equal(DB.db.prepare('SELECT COUNT(*) n FROM email_outbox').get().n,2);
      const yes=show();await page.locator('.swal2-textarea').fill('Revision message');await page.getByRole('button',{name:'ส่ง',exact:true}).click();await page.getByRole('button',{name:'ยืนยันส่งเมล',exact:true}).waitFor();
      const text=await page.locator('.swal2-popup').innerText();assert.match(text,/Updated promotion from saved form/);assert.match(text,/IC0900/);assert.match(text,/Revision message/);assert.doesNotMatch(text,/Internal only|Test partner/);
      await page.getByRole('button',{name:'ยืนยันส่งเมล',exact:true}).click();await page.getByText('บันทึกคำขอส่งเมลแล้ว',{exact:true}).waitFor();await page.locator('.swal2-confirm').click();assert.equal(await yes,true);
      await c.PC_Email.dispatchEmail(env,{fetch:provider});await c.PC_Email.dispatchEmail(env,{fetch:provider});assert.equal(sent.length,3);assert.equal(sent[2].threadId,'provider-thread');
    }
    await page.evaluate(()=>PC_CoProEmailUI.mountHistory(document.getElementById('pilot'),[{campaign:'Email UOB test'}]));
    await page.getByRole('cell',{name:'ส่งเรียบร้อย (Gmail รับแล้ว)',exact:true}).first().waitFor();
    assert.equal(await page.getByRole('cell',{name:'ส่งเรียบร้อย (Gmail รับแล้ว)',exact:true}).count(),process.argv.includes('--revision')?3:2);
    env.EMAIL_COPRO_ENABLED='false';
    await page.evaluate(()=>PC_CoProEmailUI.mountSettings(document.getElementById('pilot')));
    await page.getByRole('status').filter({hasText:'ผู้ดูแลยังไม่เปิด'}).waitFor();
    assert.equal(await page.locator('[data-copro-enable]').isDisabled(),false,'a disabled server feature must not trap the tab in pilot mode');
    await page.locator('[data-copro-enable]').click();assert.equal(await page.evaluate(()=>PC_CoProEmail.active()),false);
    console.log((ownerMode?'Gmail owner (no Microsoft): ':'')+'CoPro browser: exact external test recipient, preview, saved announcement, combined completion, same thread and no duplicate — MOCK providers only.');
  }finally{await browser.close();DB.db.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
