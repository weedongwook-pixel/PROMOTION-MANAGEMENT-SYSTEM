(function (window) {
  'use strict';
  window.PC_EmailAuth = {
    async logout(){
      const response=await fetch('/email/auth/logout',{method:'POST',credentials:'same-origin',cache:'no-store',signal:AbortSignal.timeout(10000)});
      if(!response.ok)throw Error('ยังออกจากสิทธิ์อีเมลไม่ได้ กรุณาลองอีกครั้ง');
      if(window.PC_CoProEmail)window.PC_CoProEmail.disable();
    },
    async ownerSession(){
      const response=await fetch('/email/auth/session',{credentials:'same-origin',cache:'no-store',signal:AbortSignal.timeout(15000)});
      if(!response.ok)throw Error('กรุณาเปิดตั้งค่าอีเมล แล้วเชื่อม Gmail ผู้ส่งอีกครั้ง');
      const session=await response.json();
      if(!session.csrf||!session.identity)throw Error('email_signin_required');
      return session;
    },
    async requestHeaders({caps,interactive=false}={}){
      if(caps?.authMode==='gmail_owner')return {'X-PC-Email-CSRF':(await this.ownerSession()).csrf};
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
