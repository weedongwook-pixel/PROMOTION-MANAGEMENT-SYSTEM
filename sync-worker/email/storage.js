(function (root) {
  'use strict';
  const api = root.PC_Email;
  const encode = bytes => btoa(String.fromCharCode(...bytes));
  const decode = str => Uint8Array.from(atob(str), c => c.charCodeAt(0));
  async function key(value) {
    const bytes = decode(value);
    if (bytes.length !== 32) throw new Error('email_invalid_key');
    return crypto.subtle.importKey('raw', bytes, 'AES-GCM', false, ['encrypt', 'decrypt']);
  }
  api.encryptSecret = async function (value, secret, aad) {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const cipher = await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:new TextEncoder().encode(aad)},await key(secret),new TextEncoder().encode(value));
    return 'v1.' + encode(iv) + '.' + encode(new Uint8Array(cipher));
  };
  api.decryptSecret = async function (value, secret, aad) {
    const parts = value.split('.');
    if (parts.length !== 3 || parts[0] !== 'v1' || decode(parts[1]).length !== 12) throw new Error('email_invalid_cipher');
    const plain = await crypto.subtle.decrypt({name:'AES-GCM',iv:decode(parts[1]),additionalData:new TextEncoder().encode(aad)},await key(secret),decode(parts[2]));
    return new TextDecoder().decode(plain);
  };
  api.random = () => encode(crypto.getRandomValues(new Uint8Array(32))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
  api.hash = async text => encode(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text)))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
})(globalThis);
