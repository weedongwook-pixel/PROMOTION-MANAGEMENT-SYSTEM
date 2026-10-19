const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');

test('OP new-work badge follows TH → EN → TH and stays translatable after rerender',()=>{
  let success,language='TH',mounted=false;
  const tbody={innerHTML:'',rows:[],closest:()=>({tHead:{rows:[{cells:[]}]}})};
  const window={PC_TrackingStatus:{summarize:()=>({state:'WAIT_IT',owner:'IT',total:1,itDone:0,opDone:0}),compareCampaigns:()=>0}};
  const document={body:null,getElementById:id=>mounted&&id==='optBody'?tbody:null,querySelectorAll:()=>[]};
  const run={withSuccessHandler(fn){success=fn;return this;},withFailureHandler(){return this;},getAllCampaignData(){success([{rowIdx:1,campaign:'Language test',opStatus:'WAITING'}]);}};
  const context=vm.createContext({window,document,google:{script:{run}},localStorage:{getItem:()=>language,setItem:(_,v)=>{language=v;}},console});
  vm.runInContext(fs.readFileSync('js/op-tracking.js','utf8'),context);
  mounted=true;
  window.renderOptSummary=()=>{};window.optSetFocus=()=>{};
  window.loadOpTasks();
  function badge(){
    const markup=tbody.innerHTML.match(/<span\b[^>]*class="life-tag tag-new"[^>]*>([^<]*)<\/span>/)?.[0];
    assert.ok(markup,'new work is still marked');
    const attrs=Object.fromEntries([...markup.matchAll(/([\w-]+)="([^"]*)"/g)].map(m=>[m[1],m[2]]));
    return {textContent:markup.match(/>([^<]*)</)[1],closest:()=>null,getAttribute:k=>attrs[k]??null};
  }
  let label=badge();document.querySelectorAll=()=>[label];
  vm.runInContext(fs.readFileSync('js/i18n.js','utf8'),context);
  window.applyLang();assert.equal(label.textContent,'งานใหม่');
  window.setLang('EN');assert.equal(label.textContent,'New');
  window.renderOpt();label=badge();window.applyLang();assert.equal(label.textContent,'New');
  window.setLang('TH');assert.equal(label.textContent,'งานใหม่');
});
