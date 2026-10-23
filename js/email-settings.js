(function (window) {
  'use strict';
  const copy = {
    configuration_incomplete:['ยังตั้งค่าไม่ครบ กรุณาให้ผู้ดูแลตั้งค่ารายการด้านล่าง','Setup incomplete. Ask an administrator to configure the items below.'],
    signin:['กรุณายืนยันสิทธิ์ผู้ดูแลด้วย Microsoft ก่อนเชื่อม Gmail','Verify administrator access with Microsoft before connecting Gmail.'],
    not_connected:['ยังไม่ได้เชื่อมต่อ Gmail','Gmail is not connected.'],
    authorizing:['กรุณายืนยันในหน้าต่าง Google แล้วกลับมาหน้านี้','Complete authorization in the Google window, then return here.'],
    connected:['เชื่อมต่อแล้ว: ','Connected: '],
    disconnected:['ยกเลิกการเชื่อมต่อในระบบแล้ว กรุณาถอนสิทธิ์ที่บัญชี Google ด้วย','Local connection removed. Also revoke access in your Google account.'],
    error:['เชื่อมต่อไม่สำเร็จ ลองตรวจสอบอีกครั้ง หรือติดต่อผู้ดูแล','Connection unsuccessful. Check again or contact your administrator.'],
    denied:['บัญชีนี้ไม่มีสิทธิ์ตั้งค่าอีเมล กรุณาติดต่อผู้ดูแล','This account cannot manage email. Contact your administrator.'],
    blocked:['เปิดหน้าต่าง Google ไม่ได้ กรุณาอนุญาตป๊อปอัปแล้วลองใหม่','Google window blocked. Allow popups and try again.'],
    reconnect_required:['ต้องเชื่อม Gmail อีกครั้ง','Reconnect Gmail.']
  };
  let cleanup;
  window.PC_EmailSettings = {mount(root) {
    if (cleanup) cleanup();
    const get = name => root.querySelector('[data-email-'+name+']');
    const connect=get('connect'), verify=get('verify'), disconnect=get('disconnect'), refresh=get('refresh');
    let caps, busy=false, popup=null, timer=null, disposed=false, state='signin',sender='';
    const en = () => String(window.PC_LANG || 'TH').toUpperCase()==='EN';
    function render(next, value='') {
      state=next;sender=value;
      const text=copy[next] || copy.error;
      get('status').setAttribute('data-th',text[0]+(next==='connected'?value:''));
      get('status').setAttribute('data-en',text[1]+(next==='connected'?value:''));
      get('status').textContent=text[en()?1:0]+(next==='connected'?value:'');
      connect.disabled=busy || !caps?.enabled || !['not_connected','disconnected','reconnect_required','error','blocked'].includes(next);
      verify.hidden= caps?.authMode==='gmail_owner' || !caps?.enabled || !['signin','denied'].includes(next);
      disconnect.hidden=next!=='connected';
      for(const b of [verify,disconnect,refresh])b.disabled=busy;
      root.querySelectorAll('[data-th][data-en]').forEach(el=>{el.textContent=el.getAttribute(en()?'data-en':'data-th');});
    }
    async function call(path,{method='GET',interactive=false,publicRequest=false}={}) {
      let headers={};
      const ownerPublic=caps?.authMode==='gmail_owner'&&['status','gmail/connect'].includes(path);
      if(caps?.staffEnabled&&path==='gmail/disconnect'){const owner=await window.PC_EmailAuth.staffRequest('owner-session');headers={'X-PC-Email-CSRF':owner.csrf};}
      else if (!publicRequest&&!ownerPublic) headers=window.PC_EmailAuth.requestHeaders ? await window.PC_EmailAuth.requestHeaders({caps,interactive}) : {Authorization:'Bearer '+await window.PC_EmailAuth.acquireToken({interactive,scope:caps.scope})};
      const response=await fetch('/email/'+path,{method,headers,credentials:'same-origin',cache:'no-store',signal:AbortSignal.timeout(15000)});
      const data=await response.json();
      if(!response.ok){if(data.state==='configuration_incomplete')return data;throw new Error(response.status===403?'email_denied':'email_error');}
      return data;
    }
    async function check(interactive=false) {
      if(busy)return;
      busy=true;render(state,sender);
      try {
        caps=await call('capabilities',{publicRequest:true});
        const status=await call('status',{interactive,publicRequest:!caps.enabled});
        if(disposed || !root.isConnected)return;
        get('missing').replaceChildren();
        for(const name of status.missing || []) {const item=document.createElement('li');item.textContent=name;get('missing').append(item);}
        render(status.state,status.sender || '');
      } catch(error) {if(!disposed)render(error.message==='email_denied'?'denied':error.message==='email_signin_required'?'signin':'error');}
      finally {busy=false;if(!disposed)render(state,sender);}
    }
    function stopPopup() {if(timer)clearInterval(timer);timer=null;popup=null;}
    async function message(event) {
      if(disposed || !root.isConnected || event.origin!==location.origin || event.source!==popup || !popup || event.data?.type!=='pc-email-result')return;
      if(!['connected','error'].includes(event.data.status))return;
      const success=event.data.status==='connected';
      stopPopup();busy=false;
      if(success)await check();else render('error');
    }
    async function begin() {
      if(busy || connect.disabled)return;
      popup=window.open('about:blank','pc-gmail-consent','popup,width=600,height=760');
      if(!popup){render('blocked');return;}
      busy=true;render('authorizing');
      try {
        const data=await call('gmail/connect',{method:'POST'});
        const url=new URL(data.authorizationUrl);
        if(url.origin!=='https://accounts.google.com' || url.pathname!=='/o/oauth2/v2/auth')throw new Error();
        popup.location.replace(url.href);
        const started=Date.now();
        timer=setInterval(()=>{if(disposed || !root.isConnected || !popup || popup.closed || Date.now()-started>600000){stopPopup();busy=false;if(!disposed&&root.isConnected){render('not_connected');check();}}},500);
      }catch(_){if(popup)popup.close();stopPopup();busy=false;render('error');}
    }
    async function remove() {
      if(busy || !window.confirm(en()?'Remove the Gmail connection? Google access must be revoked separately.':'ยกเลิกการเชื่อม Gmail ในระบบหรือไม่? ต้องถอนสิทธิ์ Google แยกต่างหาก'))return;
      busy=true;render(state,sender);
      try {await call('gmail/disconnect',{method:'POST'});render('disconnected');}catch(_){render('error');}
      finally{busy=false;render(state,sender);}
    }
    const onRefresh=()=>check(),onVerify=()=>check(true);
    connect.addEventListener('click',begin);disconnect.addEventListener('click',remove);refresh.addEventListener('click',onRefresh);verify.addEventListener('click',onVerify);
    window.addEventListener('message',message);
    cleanup=()=>{disposed=true;stopPopup();window.removeEventListener('message',message);connect.removeEventListener('click',begin);disconnect.removeEventListener('click',remove);refresh.removeEventListener('click',onRefresh);verify.removeEventListener('click',onVerify);};
    check();
    if(window.PC_CoProEmailUI)window.PC_CoProEmailUI.mountSettings(root.querySelector('[data-copro-settings]'));
  }};
  window.initEmail_Settings=()=>window.PC_EmailSettings.mount(document.getElementById('pc-email-settings'));
})(window);
