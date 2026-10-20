const {test}=require('node:test'),assert=require('node:assert/strict');
const {load}=require('./helpers/copro-context.cjs');
test('email content uses promotion source and excludes all CoPromo business details',()=>{
 const a=load(['copro-model','templates']);
 const rows=[{campaign:'Campaign',emailButtonId:'b1',shortName:'Button',detail:'Promotion source detail',condition:'Promotion conditions',stores:['001','002'],typePromotion:'Item Coupon',codePromotion:'IC123',minAmount:100}];
 const records=[{buttonId:'b1',brand:'PRIVATE BRAND',detail:'PRIVATE COPRO DETAIL',billingEntity:'PRIVATE BILLING',remark:'PRIVATE REMARK'}];
 const details=a.coProDetails(rows,records),rendered=a.renderCoProEmail({milestone:'submitted',details});
 assert.match(rendered.text,/Promotion source detail/);assert.match(rendered.text,/Promotion conditions/);assert.doesNotMatch(rendered.text,/001, 002/);assert.match(rendered.text,/IC123/);assert.doesNotMatch(JSON.stringify(details)+rendered.text+rendered.html,/PRIVATE/);
 const old=a.renderCoProEmail({milestone:'it_interface_complete',details:{buttons:[{name:'Button',promotionDetail:'Original',brand:'PRIVATE BRAND',detail:'PRIVATE COPRO DETAIL'}]}});assert.doesNotMatch(old.text,/PRIVATE/);assert.match(old.text,/Original/);
});

test('preview and email present every requested promotion field and original attachment names',()=>{
 const a=load(['copro-model','templates']);
 const details=a.coProDetails([{campaign:'Campaign A',start:'2026-11-01',end:'2027-01-31',stores:'ALL',shortName:'POS name',detail:'Promo detail',mechanic:'Original conditions',codePromotion:'BD176'}]);
 for(const milestone of ['submitted','promotion_edited','it_interface_complete']){
  const mail=a.renderCoProEmail({milestone,details,attachments:[{name:'original.xlsx'}]});
  let lastIndex=-1;for(const text of ['ชื่อแคมเปญ: Campaign A','วันที่เริ่ม - วันที่สิ้นสุด: 2026-11-01 - 2027-01-31','Type Promotion: -','Code Promotion: BD176','ชื่อปุ่ม: POS name','รายละเอียดโปรฯ: Promo detail','เงื่อนไข: Original conditions','ไฟล์แนบ: original.xlsx']){const index=mail.text.indexOf(text);assert.ok(index>lastIndex,text);lastIndex=index;}
  assert.doesNotMatch(mail.text,/Stores:|Sale Mode:|Minimum amount:|Unit price:|Net:|Discount:/);
 }
 const missing=a.renderCoProEmail({milestone:'submitted',details:{buttons:[{}]},attachments:[]});
 for(const label of ['ชื่อปุ่ม: -','รายละเอียดโปรฯ: -','เงื่อนไข: -','Code Promotion: -'])assert.ok(missing.text.includes(label));
});

test('HTML mail bolds headings and field labels while retaining escaped regular values and plain text',()=>{
 const a=load(['templates']);const result=a.renderCoProEmail({milestone:'submitted',details:{campaign:'A <B>',buttons:[{name:'POS',promotionDetail:'Detail: <script>bad</script>',condition:'Terms'}]},attachments:[{name:'original.xlsx'}]});
 assert.match(result.html,/<strong>ชื่อแคมเปญ:<\/strong> A &lt;B&gt;/);
 assert.match(result.html,/<strong>รายละเอียดโปรฯ:<\/strong> Detail: &lt;script&gt;bad&lt;\/script&gt;/);
 assert.match(result.html,/<strong>ไฟล์แนบ:<\/strong> original.xlsx/);
 assert.doesNotMatch(result.text,/<strong>/);assert.doesNotMatch(result.html,/<script>/);
});
