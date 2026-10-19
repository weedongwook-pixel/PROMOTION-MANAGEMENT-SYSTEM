const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const XLSX=require('../vendor/sheetjs/xlsx.full.min.js');
function fixture(requests){const downloads=[],x={...XLSX,writeFile(wb,name){downloads.push({wb,name});}},c={XLSX:x,TextDecoder,localStorage:{getItem:()=>JSON.stringify(requests)},document:{},Date};c.window=c;vm.createContext(c);vm.runInContext(fs.readFileSync('js/promo-code-convert.js','utf8'),c);return {api:c.PC_CodeConvert,downloads};}
test('all IT download routes force status by promotion type and ISO text dates without changing source requests',async()=>{
 const reqs=[{fromProposal:true,campaign:'Test',button:'A',kindShort:'coupon',proStatus:'HS',proExpire:'31/12/2026',codes:['000123']},{fromProposal:true,campaign:'Test',button:'B',kindShort:'bill',proStatus:'HS',end:'2026-12-31T00:00:00Z',codes:['BD123']},{fromProposal:true,campaign:'Test',button:'C',kindShort:'voucher',proStatus:'Normal',end:'2026-12-31',codes:['VC123']}];
 const original=JSON.stringify(reqs),{api,downloads}=fixture(reqs);
 await api.downloadBackofficeForCampaign('Test');await api.downloadAllBackofficeForCampaign('Test');await api.downloadBackofficeForButton('Test','A');
 const values=d=>XLSX.utils.sheet_to_json(d.wb.Sheets.Import_ID,{header:1});
 assert.deepEqual(values(downloads[0]),[['ProID','ProStatus','ProExpire'],['000123','Normal','2026-12-31'],['BD123','Normal','2026-12-31'],['VC123','HS','2026-12-31']]);
 for(const d of downloads)for(const row of values(d).slice(1))assert.match(row[2],/^\d{4}-\d{2}-\d{2}$/);
 assert.equal(values(downloads.at(-1))[1][1],'Normal');assert.equal(JSON.stringify(reqs),original);
 const roundtrip=XLSX.read(XLSX.write(downloads[0].wb,{type:'buffer',bookType:'xlsx'}));assert.equal(roundtrip.Sheets.Import_ID.A2.v,'000123');assert.equal(roundtrip.Sheets.Import_ID.C2.t,'s');
});
test('invalid expiry fails download rather than producing an unusable IT file',async()=>{const {api,downloads}=fixture([{fromProposal:true,campaign:'Test',kindShort:'bill',codes:['ABC'],end:'2026-02-31'}]);await assert.rejects(api.downloadBackofficeForCampaign('Test'));assert.equal(downloads.length,0);});
