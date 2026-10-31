(function (window) {
  'use strict';
  window.PC_EmailAuth = {
    async logout(){
      const staff=await fetch('/email/staff/logout',{method:'POST',credentials:'same-origin',cache:'no-store',signal:AbortSignal.timeout(10000)});
      if(!staff.ok&&staff.status!==404)throw Error('ยังออกจากระบบพนักงานไม่ได้ กรุณาลองอีกครั้ง');
      const response=await fetch('/email/auth/logout',{method:'POST',credentials:'same-origin',cache:'no-store',signal:AbortSignal.timeout(10000)});
      if(!response.ok)throw Error('ยังออกจากสิทธิ์อีเมลไม่ได้ กรุณาลองอีกครั้ง');
      if(window.PC_CoProEmail)window.PC_CoProEmail.disable();
    },
    async ownerSession({interactive=false}={}){
      const response=await fetch('/email/auth/session',{credentials:'same-origin',cache:'no-store',signal:AbortSignal.timeout(15000)});
      if(!response.ok){
        if(interactive&&response.status===401){
          const caps=await (await fetch('/email/capabilities',{cache:'no-store',signal:AbortSignal.timeout(10000)})).json();
          return caps.staffEnabled?this.signInStaff():this.connectHere();
        }
        throw Error('กรุณาเข้าสู่ระบบด้วยบัญชีพนักงานที่ได้รับสิทธิ์ส่งเมล');
      }
      const session=await response.json();
      if(!session.csrf||!session.identity)throw Error('email_signin_required');
      return session;
    },
    async staffRequest(path,body){
      const r=await fetch('/email/staff/'+path,{method:body?'POST':'GET',credentials:'same-origin',cache:'no-store',headers:body?{'Content-Type':'application/json'}:{},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(20000)});
      const data=await r.json();if(!r.ok){const messages={email_staff_pending:'ยืนยัน Microsoft แล้ว รอผู้ดูแลอนุมัติสิทธิ์ส่งเมลครั้งแรก',email_staff_signin_required:'ยังเข้าสู่ระบบส่งเมลไม่ได้ หรือบัญชีถูกปิดสิทธิ์ส่งเมล',email_staff_try_later:'ลองเข้าสู่ระบบหลายครั้ง กรุณารอ 10 นาทีแล้วลองใหม่'};const e=Error(messages[data.error]||'ยังยืนยันบัญชีพนักงานไม่ได้ กรุณาลองใหม่');e.code=data.error;throw e;}return data;
    },
    rememberStaff(session){
      if(!session.staff)return;
      localStorage.setItem('pc_session','active');localStorage.setItem('pc_role',session.staff.role);localStorage.setItem('pc_userName',session.staff.name);
      const name=document.getElementById('who-name'),role=document.getElementById('who-role');if(name)name.textContent=session.staff.name;if(role)role.textContent=session.staff.role;
    },
    async signInStaff(){
      // Signed in to the website with Microsoft → renew the mail session in the background, no prompt.
      try{if(window.PC_StaffMicrosoftLogin)return await window.PC_StaffMicrosoftLogin({silent:true});}catch(_){}
      // Microsoft is the only sign-in; mail always leaves from the central Gmail.
      const result=await Swal.fire({title:'เข้าสู่ระบบเพื่อส่งเมล',html:'<p>ยืนยันตัวตนด้วยบัญชี Microsoft ของบริษัท เมลจะส่งออกจาก Potato Promotion Mail (it@rocks-foods.com)</p>',showCancelButton:true,confirmButtonText:'เข้าสู่ระบบด้วย Microsoft',cancelButtonText:'กลับ',showLoaderOnConfirm:true,allowOutsideClick:()=>!Swal.isLoading(),preConfirm:async()=>{
        try{if(!window.PC_StaffMicrosoftLogin)throw Error('ระบบล็อกอิน Microsoft ยังไม่พร้อม กรุณาเปิดเว็บใหม่');return await window.PC_StaffMicrosoftLogin();}catch(e){Swal.showValidationMessage(e.message||'เข้าสู่ระบบไม่สำเร็จ กรุณาลองใหม่');return false;}
      }});
      if(!result.isConfirmed)throw Error('ยังไม่ได้เข้าสู่ระบบพนักงาน');
      return result.value;
    },
    async connectHere({ownerOnly=false}={}){
      const result=await Swal.fire({icon:'info',title:'ยืนยันบัญชีผู้ส่งอีเมล',text:'ยืนยันบัญชีในหน้าต่างที่เปิดขึ้น แล้วระบบจะกลับมาทำรายการนี้ต่อ',confirmButtonText:'ยืนยันบัญชีและทำต่อ',showCancelButton:true,cancelButtonText:'กลับ',showLoaderOnConfirm:true,allowOutsideClick:()=>!Swal.isLoading(),
        preConfirm:async()=>{
          const popup=window.open('about:blank','pc-gmail-consent','popup,width=600,height=760');
          if(!popup){Swal.showValidationMessage('กรุณาอนุญาตหน้าต่างป๊อปอัปของเว็บ');return false;}
          try{
            const response=await fetch('/email/gmail/connect',{method:'POST',credentials:'same-origin',signal:AbortSignal.timeout(15000)}),data=await response.json();
            if(!response.ok)throw Error('ยังเปิดการยืนยันบัญชีไม่ได้ กรุณาลองอีกครั้ง');
            const url=new URL(data.authorizationUrl);if(url.origin!=='https://accounts.google.com')throw Error('ที่อยู่ยืนยันบัญชีไม่ถูกต้อง');
            await new Promise((resolve,reject)=>{
              const clean=()=>{clearTimeout(timer);window.removeEventListener('message',receive);};
              const receive=event=>{if(event.origin!==location.origin||event.source!==popup||event.data?.type!=='pc-email-result')return;clean();event.data.status==='connected'?resolve():reject(Error('ยืนยันบัญชีไม่สำเร็จ'));};
              const timer=setTimeout(()=>{clean();reject(Error('หมดเวลายืนยันบัญชี กรุณาลองใหม่'));},180000);
              window.addEventListener('message',receive);popup.location.href=url.href;
            });
            return ownerOnly?await window.PC_EmailAuth.staffRequest('owner-session'):await window.PC_EmailAuth.ownerSession();
          }catch(e){Swal.showValidationMessage(e.message);return false;}finally{popup.close();}
        }});
      if(!result.isConfirmed)throw Error('ยังไม่ได้ยืนยันบัญชีผู้ส่ง');return result.value;
    },
    async requestHeaders({caps,interactive=false}={}){
      if(caps?.authMode==='gmail_owner')return {'X-PC-Email-CSRF':(await this.ownerSession({interactive})).csrf};
      return {Authorization:'Bearer '+await this.acquireToken({interactive,scope:caps?.scope})};
    },
    async acquireToken({interactive=false,scope}={}) {
      if (!/^api:\/\/[a-f0-9-]{36}\/access_as_user$/i.test(scope || '')) throw new Error('email_configuration_incomplete');
      const {app,email,identity} = await window.PC_EmailMsalContext();
      if (!email || !identity?.tenantId || !identity?.objectId) throw new Error('email_signin_required');
      const sameIdentity = account => account?.idTokenClaims?.tid === identity.tenantId && account?.idTokenClaims?.oid === identity.objectId;
      const matches = app.getAllAccounts().filter(a => a.username?.toLowerCase() === email.toLowerCase() && sameIdentity(a));
      let result;
      if (matches.length === 1) {
        try { result = await app.acquireTokenSilent({scopes:[scope],account:matches[0]}); }
        catch (_) { if (!interactive) throw new Error('email_signin_required'); }
      }
      if (!result) {
        if (!interactive) throw new Error('email_signin_required');
        result = await app.acquireTokenPopup({scopes:[scope],prompt:'select_account',loginHint:email});
      }
      if (result.account?.username?.toLowerCase() !== email.toLowerCase() || !sameIdentity(result.account)) throw new Error('email_wrong_staff_account');
      if (!result.accessToken) throw new Error('email_signin_required');
      return result.accessToken;
    }
  };
})(window);
