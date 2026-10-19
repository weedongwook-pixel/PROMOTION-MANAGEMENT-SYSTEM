(function (root) {
  'use strict';
  const api = root.PC_Email;
  async function token(params, deps) {
    try {
      const response = await (deps.fetch || fetch)('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams(params).toString(),signal:AbortSignal.timeout(10000),redirect:'error'});
      if (!response.ok) {
        if (response.status === 400) {
          const failure = await response.json();
          if (failure.error === 'invalid_grant') throw new Error('email_reconnect_required');
        }
        throw new Error();
      }
      const data = await response.json();
      if (typeof data.access_token !== 'string' || !data.access_token) throw new Error();
      return data;
    } catch (error) { throw new Error(error.message === 'email_reconnect_required' ? 'email_reconnect_required' : 'email_provider_error'); }
  }
  api.exchangeCode = async function (code, verifier, c, deps = {}) {
    const result = await token({client_id:c.clientId,client_secret:c.clientSecret,code,code_verifier:verifier,grant_type:'authorization_code',redirect_uri:c.redirectUri},deps);
    if (typeof result.scope !== 'string' || !c.scopes.every(scope => result.scope.split(' ').includes(scope))) throw new Error('email_missing_scopes');
    if (typeof result.refresh_token !== 'string' || !result.refresh_token) throw new Error('email_refresh_required');
    return result;
  };
  api.refreshAccessToken = async function (connection, c, deps = {}) {
    const result = await token({client_id:c.clientId,client_secret:c.clientSecret,refresh_token:connection.refresh_token,grant_type:'refresh_token'},deps);
    return {...result,refresh_token:result.refresh_token || connection.refresh_token};
  };
  api.verifySender = async function (accessToken, c, deps = {}) {
    let data;
    try {
      const response = await (deps.fetch || fetch)('https://gmail.googleapis.com/gmail/v1/users/me/profile',{headers:{Authorization:'Bearer '+accessToken},signal:AbortSignal.timeout(10000),redirect:'error'});
      if (!response.ok) throw new Error();
      data = await response.json();
    } catch (_) { throw new Error('email_provider_error'); }
    if (typeof data.emailAddress !== 'string' || data.emailAddress.toLowerCase() !== c.sender) throw new Error('email_wrong_mailbox');
    return c.sender;
  };
})(globalThis);
