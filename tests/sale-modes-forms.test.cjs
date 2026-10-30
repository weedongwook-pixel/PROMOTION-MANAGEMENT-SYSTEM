const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
// Promo forms take channels and their store/delivery type from Sale mode settings (js/sale-modes.js).
for(const f of ['Proposal','Coupon','BillDiscountProposal','VoucherProposal']){
  test(f+' links sale-mode checkboxes and delivery rules to Sale mode settings',()=>{
    const html=fs.readFileSync('pages/'+f+'.html','utf8');
    assert.match(html,/window\.pcApplyModeFilter = function\(scope, formKey\)\{ try\{\s*scope=scope\|\|document; var S=window\.PC_SaleModes;/);
    assert.match(html,/S\.master\(\)\.forEach/,'channels added in settings get a checkbox');
    assert.match(html,/var show=cb\.checked \|\|/,'a checked record value stays visible');
    assert.doesNotMatch(html,/const delivery(Modes|Keywords) = \[/,'no hardcoded delivery list');
    assert.doesNotMatch(html,/el\.value === "Take Away"/,'store channels come from settings');
  });
}
