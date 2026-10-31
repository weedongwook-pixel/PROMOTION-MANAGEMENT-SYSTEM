(function(root){
  'use strict';const api=root.PC_Email;
  api.routeCoProEmail=async function(request,env){
    const url=new URL(request.url),path=url.pathname;
    if(!/^\/email\/(?:threads(?:\/|$)|copro(?:\/|$)|promo\/submissions$)/.test(path))return null;
    const headers={'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'},json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers});
    if(env.EMAIL_COPRO_ENABLED!=='true')return json({error:'email_pilot_disabled'},503);
    try{
      if(request.method!=='GET'&&request.headers.get('Origin')!==api.readEmailConfig(env).origin)return json({error:'email_origin_denied'},403);
      const actor=await api.verifyEmailActor(request,env);
      let body;
      if(request.method==='POST'){
        if(Number(request.headers.get('Content-Length')||0)>1048576)return json({error:'email_request_too_large'},413);
        const text=await request.text();if(new TextEncoder().encode(text).length>1048576)return json({error:'email_request_too_large'},413);
        body=JSON.parse(text);
      }
      if(path==='/email/threads/search'&&request.method==='GET')return json(await api.searchThreads(actor,url.searchParams.get('q')||'',env,{},url.searchParams.get('pageToken')||'',url.searchParams.get('mode')||'test'));
      if(path==='/email/threads'&&request.method==='POST')return json(await api.publishThread(actor,body,env));
      if(path==='/email/threads'&&request.method==='GET'){
        try{await api.requireEmailPermission(actor,'submit',env);}catch(_){await api.requireEmailPermission(actor,'manage',env);}
        return json({items:await api.listApprovedThreads(actor,env)});
      }
      if(path==='/email/promo/submissions'&&request.method==='POST')return json(await api.registerPilotSubmission(actor,body,env));
      if(path==='/email/copro/adopt'&&request.method==='POST')return json(await api.adoptCoProCampaign(actor,body,env));
      if(path==='/email/copro/revision/preview'&&request.method==='POST')return json(await api.previewPromotionRevision(actor,body,env));
      if(path==='/email/copro/revision'&&request.method==='POST')return json(await api.commitPromotionRevision(actor,body,env));
      if(path==='/email/copro/change/preview'&&request.method==='POST')return json(await api.previewPromotionChange(actor,body,env));
      if(path==='/email/copro/change'&&request.method==='POST')return json(await api.commitPromotionChange(actor,body,env));
      if(path==='/email/copro/it-done'&&request.method==='POST')return json(await api.commitITDone(actor,body,env));
      if(path==='/email/copro/mail-history'&&request.method==='GET')return json(await api.mailHistory(actor,env));
      if(path==='/email/copro/preview'&&request.method==='POST')return json(await api.previewCoPromo(actor,body,env));
      if(path==='/email/copro'&&request.method==='POST')return json(await api.commitCoPromo(actor,body,env));
      if(path==='/email/copro'&&request.method==='GET')return json(await api.listCoProCampaigns(actor,env));
      let match=path.match(/^\/email\/threads\/([a-f0-9-]{36})\/revoke$/);
      if(match&&request.method==='POST')return json(await api.revokeThread(actor,match[1],env));
      match=path.match(/^\/email\/copro\/([a-f0-9-]{36})\/(status|history|it|interface)$/);
      if(match){
        if(request.method==='GET'&&['status','history'].includes(match[2]))return json(await api.coProStatus(actor,match[1],env));
        if(request.method==='POST'&&['it','interface'].includes(match[2]))return json(await api[match[2]==='it'?'commitIT':'commitInterface'](actor,{...body,campaignId:match[1]},env));
      }
      return json({error:'email_not_found'},404);
    }catch(error){
      const safe=['email_revision_loop_missing','email_campaign_unregistered','email_attachment_missing','email_attachment_unsupported','email_attachment_invalid','email_attachment_too_large','email_attachments_changed','email_admin_required','email_campaign_denied','email_policy_changed','email_unapproved_recipients','email_confirmation_required','email_version_conflict','email_new_campaign_required','email_source_changed','email_invalid_record','email_incomplete_records','email_revision_not_enabled','email_reconnect_required'];
      const code=safe.includes(error.message)?error.message:'email_request_failed';
      return json({error:code},code==='email_admin_required'||code==='email_campaign_denied'?403:409);
    }
  };
})(globalThis);
