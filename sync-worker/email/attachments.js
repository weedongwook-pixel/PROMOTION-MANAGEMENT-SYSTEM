(function(root){
  'use strict';const api=root.PC_Email;
  api.readEmailAttachments=async function(rows,env,expected){
    const refs=[...new Set(rows.map(r=>String(r.attachment||'').trim()).filter(Boolean))].sort();
    if(refs.some(ref=>ref.startsWith('nofile:')))throw Error('email_attachment_missing');
    if(refs.length>20)throw Error('email_attachment_too_large');
    if(refs.some(ref=>!/^file:[a-zA-Z0-9_-]{1,128}$/.test(ref)))throw Error('email_attachment_unsupported');
    const record=refs.length?await env.DB.prepare("SELECT v,updated_at FROM promo_store WHERE k='pc_promo_files'").first():null;
    const stored=record?JSON.parse(record.v):{},manifest=[],files=[];let total=0;
    for(const ref of refs){
      const id=ref.slice(5),file=stored[id];if(!file)throw Error('email_attachment_missing');
      const name=file.name,mime=file.mime||'application/octet-stream',base64=file.base64;
      if(typeof name!=='string'||!name||name.length>200||/[\r\n\0]/.test(name)||! /^[a-zA-Z0-9!#$&^_.+-]+\/[a-zA-Z0-9!#$&^_.+-]+$/.test(mime))throw Error('email_attachment_invalid');
      if(typeof base64!=='string'||base64.length>16*1024*1024)throw Error('email_attachment_too_large');
      if(base64.length%4!==0||!/^[A-Za-z0-9+/]*={0,2}$/.test(base64)||!base64)throw Error('email_attachment_invalid');
      const size=base64.length/4*3-(base64.endsWith('==')?2:base64.endsWith('=')?1:0);total+=size;
      if(total>12*1024*1024)throw Error('email_attachment_too_large');
      const entry={id,name,mime,size,hash:await api.hash(JSON.stringify({id,name,mime,base64}))};
      manifest.push(entry);files.push({...entry,base64});
    }
    if(expected!==undefined&&JSON.stringify(manifest)!==JSON.stringify(expected))throw Error('email_attachments_changed');
    return {manifest,files,version:record?.updated_at??null};
  };
})(globalThis);
