const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
test('mail selection shows provider preview and reuses separate saved button records without CoPromo inputs',async()=>{
 const nodes=Object.fromEntries(['coproCampaign','coproLoop','coproApproved','coproTestTo','coproTestCc','coproAdditionalMessage','coproMailDetails'].map(id=>[id,{value:'',isConnected:true,addEventListener(){}}]));nodes.coproCampaign.value='c';nodes.coproLoop.value='p';
 const buttons=['A','B'].map(name=>({button_id:name,source_identity_json:JSON.stringify({shortName:name,codePromotion:'IC'+name})}));
 let calls=0,body;
 const context={document:{getElementById:id=>nodes[id]},PC_CLOUD:{readCloudKey:async()=>({value:JSON.stringify([{campaign:'Test',emailButtonId:'B',brand:'Partner B',remark:'private B'}])})},PC_CoProEmail:{list:async()=>[{id:'c',key:'promo::c::Test',month:'2026-10',version:1,buttons}],request:async(path,options)=>{
 if(path==='threads')return {items:[{id:'p',version:1,subject:'Loop',recipients:{to:['a@example.com'],cc:[]}}]};
 assert.equal(path,'copro/preview');body=options.body;return {text:'ชื่อแคมเปญ: Test\nรายละเอียดโปรฯ: Original\nไฟล์แนบ: original.xlsx',subject:'Loop',recipients:body.recipients};
 }},Swal:{fire:async config=>{
 calls++;
 if(calls===1){assert.doesNotMatch(config.html,/fieldset|coproRecord-/);config.didOpen();await new Promise(r=>setImmediate(r));assert.match(nodes.coproMailDetails.textContent,/original.xlsx/);return {isConfirmed:true,value:await config.preConfirm()};}
 assert.match(config.html,/Original/);assert.doesNotMatch(config.html,/private B/);return {isConfirmed:false};
 }}};context.window=context;
 vm.runInNewContext(fs.readFileSync('js/copro-email-ui.js','utf8'),context);
 await context.PC_CoProEmailUI.save({campaign:'Test',emailButtonId:'A',brand:'Partner A',remark:'private A'});
 assert.equal(body.records[0].brand,'Partner A');assert.equal(body.records[1].brand,'Partner B');assert.equal(body.records[1].remark,'private B');
});
