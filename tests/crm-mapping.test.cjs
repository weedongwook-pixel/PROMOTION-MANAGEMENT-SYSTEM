const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function setup(){const host={innerHTML:'',getAttribute(){return true;}},c={document:{getElementById:id=>id==='pcCustomerGroup'?host:null,readyState:'complete',documentElement:{}},localStorage:{getItem:()=> 'MKT'}};c.window=c;vm.createContext(c);vm.runInContext(fs.readFileSync('js/customer-group.js','utf8'),c);return {api:c.PC_CustomerGroup,host};}
test('CRM yes requires code and mapping fields are not submitted for ordinary customers',()=>{
 const {api,host}=setup();api._set('crm');assert.equal(api.validate().ok,false);
 api._mappingRequired('yes');assert.equal(api.validate().ok,false);api._mappingCode(' VD-123 ');api._mappingDetail('Value Design 50');assert.equal(api.validate().ok,true);assert.equal(api.value().crmMappingCode,'VD-123');assert.match(host.innerHTML,/crmMappingCode/);
 api._set('normal');assert.equal(api.value().crmMappingCode,'');assert.equal(api.validate().ok,true);
});
test('saved mapping restores and IT markup escapes code and instructions',()=>{
 const {api}=setup();api.restore({customerGroup:'crm',crmMappingRequired:'yes',crmMappingCode:'<img src=x>',crmMappingDetail:'A & B'});
 assert.equal(api.value().crmMappingCode,'<img src=x>');const html=api.mappingHTML(api.value());assert.match(html,/&lt;img/);assert.doesNotMatch(html,/<img/);assert.match(html,/A &amp; B/);
 api.restore({customerGroup:'crm'});assert.equal(api.value().crmMappingRequired,'no');
});
test('IT mapping list pairs each coupon name with its code without repeating item rows',()=>{
 const {api}=setup(),base={customerGroup:'crm',crmMappingRequired:'yes'};
 const html=api.mappingListHTML([{...base,shortName:'Coupon <A>',crmMappingCode:'VD-A'},{...base,shortName:'Coupon <A>',crmMappingCode:'VD-A'},{...base,shortName:'Coupon B',crmMappingCode:'VD-B'}]);
 assert.equal((html.match(/class="crm-mapping-it/g)||[]).length,2);assert.match(html,/Coupon &lt;A&gt;[\s\S]*?VD-A/);assert.match(html,/Coupon B[\s\S]*?VD-B/);
});
test('per-button mapping exposes only code while setup instructions remain shared',()=>{
 const {api,host}=setup();host.getAttribute=()=> 'proposal';api._set('crm');api._mappingRequired('yes');api._mappingDetail('Shared instructions');
 const html=api.couponHTML('button-one');assert.match(html,/btn-crm-code/);assert.doesNotMatch(html,/textarea|btn-crm-detail/);assert.equal((host.innerHTML.match(/id="crmMappingDetail"/g)||[]).length,1);
 const block={querySelector:selector=>selector==='.btn-promo-type'?{value:'Item Coupon'}:selector==='.btn-crm-code'?{value:'CRM-ONE'}:null};
 assert.equal(api.couponValue(block).crmMappingCode,'CRM-ONE');assert.equal(api.couponValue(block).crmMappingDetail,'Shared instructions');
});
