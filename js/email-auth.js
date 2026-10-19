(function (window) {
  'use strict';
  window.PC_EmailAuth = {
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
