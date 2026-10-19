const {webcrypto}=require('node:crypto');
const tenant='11111111-1111-4111-8111-111111111111',audience='22222222-2222-4222-8222-222222222222',oid='33333333-3333-4333-8333-333333333333';
let promise;
exports.fixture=async()=>{
  if(!promise)promise=webcrypto.subtle.generateKey({name:'RSASSA-PKCS1-v1_5',modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},true,['sign','verify']);
  const pair=await promise,jwk={...await webcrypto.subtle.exportKey('jwk',pair.publicKey),kid:'fixture',alg:'RS256',use:'sig'};
  const env={EMAIL_TENANT_ID:tenant,EMAIL_API_AUDIENCE:audience,EMAIL_API_SCOPE:`api://${audience}/access_as_user`};
  async function request(changes={}){const now=Math.floor(Date.now()/1000),enc=x=>Buffer.from(JSON.stringify(x)).toString('base64url');const data=enc({alg:'RS256',kid:'fixture'})+'.'+enc({ver:'2.0',tid:tenant,oid,aud:audience,iss:`https://login.microsoftonline.com/${tenant}/v2.0`,scp:'access_as_user',exp:now+300,nbf:now-1,...changes});const token=data+'.'+Buffer.from(await webcrypto.subtle.sign('RSASSA-PKCS1-v1_5',pair.privateKey,Buffer.from(data))).toString('base64url');return new Request('https://example.test/email/threads',{headers:{Authorization:'Bearer '+token}});}
  return {env,actor:{tenantId:tenant,objectId:oid},request,deps:{fetch:async()=>Response.json({keys:[jwk]})}};
};
