const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
test('mail selection shows provider preview and reuses separate saved button records without CoPromo inputs',async()=>{
 const nodes=Object.fromEntries(['coproCampaign','coproSearchLoop','coproLoop','coproApproved','coproTestTo','coproTestCc','coproAdditionalMessage','coproMailDetails'].map(id=>[id,{value:'',isConnected:true,addEventListener(event,handler){this[event]=handler;}}]));nodes.coproCampaign.value='c';nodes.coproLoop.value='p';
 const buttons=['A','B'].map(name=>({button_id:name,source_identity_json:JSON.stringify({shortName:name,codePromotion:'IC'+name})}));
 let calls=0,body,sends=0;
 const context={document:{getElementById:id=>nodes[id]},PC_CLOUD:{readCloudKey:async()=>({value:JSON.stringify([{campaign:'Test',emailButtonId:'B',brand:'Partner B',remark:'private B'}])})},PC_CoProEmail:{list:async()=>[{id:'c',key:'promo::c::Test',month:'2026-10',version:1,buttons}],request:async(path,options)=>{
 if(path==='threads')return {items:[{id:'p',version:1,subject:'Loop',recipients:{to:['a@example.com'],cc:[]}}]};
 if(path==='copro'){sends++;assert.equal(options.body.additionalMessage,'Updated message');return {mailStatus:'queued'};}
 assert.equal(path,'copro/preview');body=options.body;return {text:'ชื่อแคมเปญ: Test\nรายละเอียดโปรฯ: Original\nไฟล์แนบ: original.xlsx',subject:'Loop',recipients:body.recipients};
 }},Swal:{close(){},fire:async config=>{
 calls++;
 if(calls===1){assert.match(config.html,/coproSearchLoop/);config.didOpen();nodes.coproAdditionalMessage.value='Keep while searching';nodes.coproSearchLoop.click();return {isConfirmed:false};}
 if(calls===2){assert.equal(config.title,'ค้นหาลูปเมลของโปรฯ');return {isConfirmed:true,value:{id:'p2',version:1,subject:'Another conversation',recipients:{to:['new@example.com'],cc:[]}}};}
 if(calls===3||calls===5){assert.doesNotMatch(config.html,/fieldset|coproRecord-/);config.didOpen();if(calls===3){assert.equal(nodes.coproAdditionalMessage.value,'Keep while searching');assert.equal(nodes.coproLoop.value,'p2');assert.equal(nodes.coproTestTo.value,'new@example.com');}if(calls===5){assert.equal(nodes.coproAdditionalMessage.value,'Original message');assert.equal(nodes.coproTestTo.value,'new@example.com');assert.equal(sends,0);}nodes.coproAdditionalMessage.value=calls===3?'Original message':'Updated message';await new Promise(r=>setImmediate(r));assert.match(nodes.coproMailDetails.innerHTML,/<strong>ไฟล์แนบ:<\/strong> original.xlsx/);return {isConfirmed:true,value:await config.preConfirm()};}
 assert.match(config.html,/<strong>รายละเอียดโปรฯ:<\/strong> Original/);assert.doesNotMatch(config.html,/private B/);assert.doesNotMatch(config.html,/ฉบับแรก|ฉบับที่สอง/);assert.equal(config.cancelButtonText,'กลับไปแก้ไข');assert.equal(config.confirmButtonText,'ยืนยันส่งเมล');return calls===4?{isConfirmed:false,dismiss:'cancel'}:{isConfirmed:true};
 }}};context.window=context;
 vm.runInNewContext(fs.readFileSync('js/copro-email-ui.js','utf8'),context);
 await context.PC_CoProEmailUI.save({campaign:'Test',emailButtonId:'A',brand:'Partner A',remark:'private A'});
 assert.equal(sends,1);assert.equal(calls,6);assert.equal(body.records[0].brand,'Partner A');assert.equal(body.records[1].brand,'Partner B');assert.equal(body.records[1].remark,'private B');
});
