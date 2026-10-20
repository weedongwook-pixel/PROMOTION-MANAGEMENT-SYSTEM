const {test}=require('node:test'),assert=require('node:assert/strict');
const {load}=require('./helpers/copro-context.cjs');
test('email content uses promotion source and excludes all CoPromo business details',()=>{
 const a=load(['copro-model','templates']);
 const rows=[{campaign:'Campaign',emailButtonId:'b1',shortName:'Button',detail:'Promotion source detail',condition:'Promotion conditions',stores:['001','002'],typePromotion:'Item Coupon',codePromotion:'IC123',minAmount:100}];
 const records=[{buttonId:'b1',brand:'PRIVATE BRAND',detail:'PRIVATE COPRO DETAIL',billingEntity:'PRIVATE BILLING',remark:'PRIVATE REMARK'}];
 const details=a.coProDetails(rows,records),rendered=a.renderCoProEmail({milestone:'submitted',details});
 assert.match(rendered.text,/Promotion source detail/);assert.match(rendered.text,/Promotion conditions/);assert.match(rendered.text,/001, 002/);assert.match(rendered.text,/IC123/);assert.doesNotMatch(JSON.stringify(details)+rendered.text+rendered.html,/PRIVATE/);
 const old=a.renderCoProEmail({milestone:'it_interface_complete',details:{buttons:[{name:'Button',promotionDetail:'Original',brand:'PRIVATE BRAND',detail:'PRIVATE COPRO DETAIL'}]}});assert.doesNotMatch(old.text,/PRIVATE/);assert.match(old.text,/Original/);
});
