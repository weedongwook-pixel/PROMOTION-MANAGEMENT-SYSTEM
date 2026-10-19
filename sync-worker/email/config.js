(function (root) {
  'use strict';
  const api = root.PC_Email = root.PC_Email || {};
  const ORIGIN = 'https://white-pine-853e.quiet-surf-dda2.workers.dev';
  api.readEmailConfig = function (env) {
    return Object.freeze({
      enabled: env.EMAIL_CONNECTION_ENABLED === 'true',
      tenantId: env.EMAIL_TENANT_ID || '',
      audience: env.EMAIL_API_AUDIENCE || '',
      scope: env.EMAIL_API_SCOPE || '',
      clientId: '626917153875-bsnv8et0f8eav1nf91u7ttl03gdhaaus.apps.googleusercontent.com',
      clientSecret: env.GMAIL_CLIENT_SECRET || '',
      encryptionKey: env.EMAIL_ENCRYPTION_KEY || '',
      sender: 'it@rocks-foods.com', origin: ORIGIN,
      redirectUri: ORIGIN + '/email/gmail/callback',
      scopes: ['https://www.googleapis.com/auth/gmail.readonly', 'https://www.googleapis.com/auth/gmail.send']
    });
  };
  api.emailReadiness = function (c) {
    const missing = [];
    if (!c.enabled) missing.push('EMAIL_CONNECTION_ENABLED');
    if (!/^[a-f0-9-]{36}$/i.test(c.tenantId)) missing.push('EMAIL_TENANT_ID');
    if (!/^[a-f0-9-]{36}$/i.test(c.audience)) missing.push('EMAIL_API_AUDIENCE');
    if (c.scope !== 'api://' + c.audience + '/access_as_user') missing.push('EMAIL_API_SCOPE');
    if (!c.clientSecret) missing.push('GMAIL_CLIENT_SECRET');
    try { if (atob(c.encryptionKey).length !== 32) throw new Error(); } catch (_) { missing.push('EMAIL_ENCRYPTION_KEY'); }
    return {ready: missing.length === 0, missing};
  };
})(globalThis);
