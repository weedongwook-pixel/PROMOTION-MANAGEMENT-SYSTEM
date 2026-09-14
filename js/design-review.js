/* ============================================================
   Design Review — pixel-perfect overlay / compare / annotate tool
   Plain JS (shared global scope). Persists per-base in localStorage.
   ============================================================ */
(function(){
'use strict';

/* ---------- base page list ---------- */
const PAGES = [
  {g:'แอปหลัก', items:[ ['Potato Corner Promotion System.html','ระบบ (Shell + Login)'] ]},
  {g:'หน้าตั้งค่า / Master', items:[
    ['Login Settings.html','ตั้งค่าหน้า Login'],['System Settings.html','System Settings'],
    ['Master Settings.html','Master Settings'],['Notification Settings.html','Notification Settings'],
    ['Report Settings.html','Report Settings'],['Calendar Reminder Settings.html','Calendar Reminder'],
    ['Code Lock Settings.html','Code Lock Settings'],['Code Management.html','Code Management'],
    ['User Management.html','User Management'],['Member Card Master.html','Member Card Master'],
    ['Brand Manager.html','Brand Manager'],
  ]},
  {g:'Mockup / รายงาน', items:[
    ['Branch Tickets.html','Branch Tickets'],
    ['IT Ticket Queue.html','IT Ticket Queue'],['Team Queue.html','Team Queue'],
    ['Report Buttons.html','Report Buttons'],['Report Problem.html','Report Problem'],
    ['Report Code Problem.html','Report Code Problem'],['Email Template Preview.html','Email Template'],
    ['Database Schema & Flow.html','Database Schema'],
  ]},
  {g:'หน้าในแอป (อาจต้องมี shell)', items:[
    ['pages/Dashboard.html','Dashboard'],['pages/NPD.html','NPD'],['pages/IT_Settlement.html','IT Settlement'],
    ['pages/Op_Tracking.html','Op Tracking'],['pages/Campaign_Tracking.html','Promotions Tracking'],
    ['pages/Proposal.html','Proposal'],['pages/Coupon.html','Coupon'],['pages/VoucherProposal.html','Voucher'],
    ['pages/BillDiscountProposal.html','Bill Discount'],['pages/Memo.html','Memo'],
    ['pages/Permissions.html','Permissions'],['pages/ItemSet.html','Item Set Builder'],['pages/Branch_View.html','Branch View'],
  ]},
];
const CANVASES = [
  ['1440x900','Desktop 1440×900',1440,900],
  ['1280x800','Laptop 1280×800',1280,800],
  ['1024x1366','Tablet 1024×1366',1024,1366],
  ['390x844','Mobile 390×844',390,844],
  ['1920x1080','Full HD 1920×1080',1920,1080],
];
const UPLOAD = '__upload__';

/* ---------- persistence ---------- */
const LIB_KEY = 'pc_dr_lib';
const LAST_KEY = 'pc_dr_last';
const stateKey = b => 'pc_dr_state::' + b;
function jload(k,f){ try{ const v=JSON.parse(localStorage.getItem(k)); return v==null?f:v; }catch(e){ return f; } }
function jsave(k,v){ try{ localStorage.setItem(k, JSON.stringify(v)); }catch(e){ console.warn('save failed',e); } }
const uid = ()=> Date.now().toString(36)+Math.random().toString(36).slice(2,6);

let LIB = jload(LIB_KEY, []);   // [{id,name,data,w,h}]
const DEF_STATE = ()=>({ refId:null, tf:{tx:0,ty:0,s:1,r:0}, opacity:60, compareOn:false, compareX:720,
                         pins:[], measures:[], canvas:'1440x900', baseUpload:null, zoom:1, panX:0, panY:0 });
let DR = DEF_STATE();
let base = jload(LAST_KEY, 'Login Settings.html');

/* ---------- elements ---------- */
const $ = id => document.getElementById(id);
const stage=$('stage'), world=$('world'), baseEl=$('base'), refClip=$('refClip'), refBox=$('refBox'),
      refImg=$('refImg'), refHandles=$('refHandles'), pinLayer=$('pinLayer'), cmpDivider=$('cmpDivider'),
      mSvg=$('measureSvg'), mLabels=$('measureLabels'), hintEl=$('hint');

/* ---------- canvas helpers ---------- */
function canvasDims(){ const c=CANVASES.find(c=>c[0]===DR.canvas)||CANVASES[0]; return {w:c[2],h:c[3]}; }
function stageRect(){ return stage.getBoundingClientRect(); }
function toWorld(cx,cy){ const r=stageRect(); return {x:(cx-r.left-DR.panX)/DR.zoom, y:(cy-r.top-DR.panY)/DR.zoom}; }
function activeRef(){ return DR.refId ? LIB.find(i=>i.id===DR.refId) : null; }

/* ---------- view ---------- */
function applyView(){
  world.style.transform = `translate(${DR.panX}px,${DR.panY}px) scale(${DR.zoom})`;
  world.style.setProperty('--inv', 1/DR.zoom);
  refBox.style.setProperty('--invh', 1/(DR.zoom*(DR.tf.s||1)));
  $('zoomV').textContent = Math.round(DR.zoom*100)+'%';
}
function fitView(){
  const d=canvasDims(), r=stageRect();
  const z=Math.min((r.width-80)/d.w,(r.height-80)/d.h);
  DR.zoom=Math.max(0.05,z);
  DR.panX=(r.width-d.w*DR.zoom)/2;
  DR.panY=(r.height-d.h*DR.zoom)/2;
  applyView();
}
function zoomAt(cx,cy,factor){
  const r=stageRect(), mx=cx-r.left, my=cy-r.top;
  const wx=(mx-DR.panX)/DR.zoom, wy=(my-DR.panY)/DR.zoom;
  const nz=Math.max(0.08,Math.min(8,DR.zoom*factor));
  DR.panX=mx-wx*nz; DR.panY=my-wy*nz; DR.zoom=nz; applyView(); save();
}

/* ---------- base ---------- */
function renderBase(){
  const d=canvasDims();
  [world].forEach(()=>{});
  baseEl.style.width=d.w+'px'; baseEl.style.height=d.h+'px';
  refClip.style.width=d.w+'px'; refClip.style.height=d.h+'px';
  cmpDivider.style.height=d.h+'px';
  mSvg.setAttribute('width',d.w); mSvg.setAttribute('height',d.h);
  mSvg.style.width=d.w+'px'; mSvg.style.height=d.h+'px';
  if(base===UPLOAD){
    baseEl.innerHTML = DR.baseUpload
      ? `<img src="${DR.baseUpload}" alt="base">`
      : `<div class="ph"><i class="fas fa-image"></i>อัปโหลดสกรีนช็อตเป็นพื้นหลัง<br>(ปุ่ม Base บนแถบเครื่องมือ)</div>`;
  } else {
    baseEl.innerHTML = `<iframe src="${base}" title="base"></iframe>`;
  }
}

/* ---------- reference overlay ---------- */
function applyRef(){
  const ref=activeRef();
  if(!ref){ refBox.style.display='none'; renderHandles(); return; }
  refBox.style.display='block';
  if(refImg.getAttribute('src')!==ref.data) refImg.src=ref.data;
  refBox.style.width=ref.w+'px'; refBox.style.height=ref.h+'px';
  refBox.style.transform=`translate(${DR.tf.tx}px,${DR.tf.ty}px) rotate(${DR.tf.r}deg) scale(${DR.tf.s})`;
  refBox.style.opacity=DR.opacity/100;
  refClip.style.clipPath = DR.compareOn ? `inset(0 0 0 ${DR.compareX}px)` : 'none';
  refBox.style.setProperty('--invh', 1/(DR.zoom*(DR.tf.s||1)));
  renderHandles();
}
function renderHandles(){
  const show = activeRef() && DR.tool==='move';
  refHandles.innerHTML = show ? `
    <div class="hbox"></div>
    <div class="handle nw" data-h="scale" style="left:0;top:0"></div>
    <div class="handle ne" data-h="scale" style="left:100%;top:0"></div>
    <div class="handle sw" data-h="scale" style="left:0;top:100%"></div>
    <div class="handle se" data-h="scale" style="left:100%;top:100%"></div>
    <div class="handle rotline" style="left:50%;top:0;height:26px;transform:translate(-50%,-100%) scaleY(var(--invh))"></div>
    <div class="handle rot" data-h="rot" style="left:50%;top:0;margin-top:-26px"></div>
  ` : '';
}
function fitRefToCanvas(ref){
  const d=canvasDims();
  const s=Math.min(d.w/ref.w, d.h/ref.h)*0.9;
  DR.tf={ s, r:0, tx:(d.w-ref.w)/2, ty:(d.h-ref.h)/2 };
}

/* ---------- compare ---------- */
function placeCompare(){
  cmpDivider.style.display = DR.compareOn ? 'block':'none';
  cmpDivider.style.left = DR.compareX+'px';
}

/* ---------- pins ---------- */
function renderPins(){
  pinLayer.innerHTML = DR.pins.map((p,i)=>`
    <div class="pin ${p.done?'done':''} ${p.id===selPin?'sel':''}" data-pin="${p.id}" style="left:${p.x}px;top:${p.y}px">
      <div class="dot"><span>${i+1}</span></div>
    </div>`).join('');
}

/* ---------- measures ---------- */
function renderMeasures(){
  let lines='', labels='';
  DR.measures.forEach(m=>{
    const len=Math.hypot(m.x2-m.x1,m.y2-m.y1);
    const mx=(m.x1+m.x2)/2, my=(m.y1+m.y2)/2;
    const dx=Math.abs(Math.round(m.x2-m.x1)), dy=Math.abs(Math.round(m.y2-m.y1));
    lines += `<line x1="${m.x1}" y1="${m.y1}" x2="${m.x2}" y2="${m.y2}"></line>`
          +  capLine(m.x1,m.y1,m.x2,m.y2)+capLine(m.x2,m.y2,m.x1,m.y1);
    labels += `<div class="mlabel" data-mid="${m.id}" style="left:${mx}px;top:${my}px">${Math.round(len)}px · ${dx}×${dy}</div>`;
  });
  mSvg.innerHTML=lines; mLabels.innerHTML=labels;
}
function capLine(x,y,fromx,fromy){ // small perpendicular end cap
  const a=Math.atan2(y-fromy,x-fromx)+Math.PI/2, L=6;
  return `<line class="cap" x1="${x-Math.cos(a)*L}" y1="${y-Math.sin(a)*L}" x2="${x+Math.cos(a)*L}" y2="${y+Math.sin(a)*L}"></line>`;
}

/* ---------- panel: library ---------- */
function renderLib(){
  $('libCnt').textContent=LIB.length;
  $('libGrid').innerHTML = LIB.map(it=>`
    <div class="libcard ${it.id===DR.refId?'on':''}" data-lib="${it.id}" title="${esc(it.name)}">
      <span class="lon">ใช้อยู่</span>
      <button class="ld" data-libdel="${it.id}"><i class="fas fa-trash"></i></button>
      <span class="lt" style="background-image:url('${it.data}')"></span>
      <div class="ln2">${esc(it.name)}</div>
    </div>`).join('')
    + `<label class="libadd"><i class="fas fa-plus"></i>เพิ่มภาพ
        <input type="file" accept="image/*" multiple hidden onchange="DRaddLib(this.files)"></label>`;
}

/* ---------- panel: comments ---------- */
function renderComments(){
  $('cmtCnt').textContent=DR.pins.length;
  const el=$('cmtList');
  if(!DR.pins.length){ el.innerHTML=`<div class="empty">ยังไม่มีคอมเมนต์<br>เลือกเครื่องมือ <b>ปักหมุด</b> แล้วคลิกบนภาพ</div>`; return; }
  el.innerHTML = DR.pins.map((p,i)=>`
    <div class="cmt ${p.done?'done':''} ${p.id===selPin?'sel':''}" data-cmt="${p.id}">
      <div class="ch">
        <span class="num">${i+1}</span>
        <span style="font-size:.7rem;color:#8b929a">${p.done?'แก้แล้ว':'รอแก้'}</span>
        <span class="ca">
          <button title="${p.done?'กลับเป็นรอแก้':'ทำเครื่องหมายแก้แล้ว'}" onclick="DRtogglePin('${p.id}')"><i class="fas ${p.done?'fa-rotate-left':'fa-check'}"></i></button>
          <button title="ลบ" onclick="DRdelPin('${p.id}')"><i class="fas fa-trash"></i></button>
        </span>
      </div>
      <textarea placeholder="พิมพ์สิ่งที่อยากแก้…" oninput="DRpinText('${p.id}',this.value)" onfocus="DRselectPin('${p.id}')">${esc(p.text)}</textarea>
    </div>`).join('');
}

function esc(s){ return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

/* ---------- selection ---------- */
let selPin=null;
function selectPin(id){ selPin=id; renderPins(); renderComments();
  const c=document.querySelector(`[data-cmt="${id}"] textarea`); if(c) c.focus(); }

/* ---------- full render + save ---------- */
function renderAll(){ renderBase(); applyRef(); placeCompare(); renderPins(); renderMeasures(); renderLib(); renderComments(); applyView(); }
function save(){ const s={...DR}; jsave(stateKey(base), s); }

/* ---------- load a base's state ---------- */
function loadState(b){
  const s=jload(stateKey(b), null);
  DR = Object.assign(DEF_STATE(), s||{});
  if(!DR.tf) DR.tf={tx:0,ty:0,s:1,r:0};
  if(!Array.isArray(DR.pins)) DR.pins=[];
  if(!Array.isArray(DR.measures)) DR.measures=[];
}

/* ============================================================
   TOOLS
   ============================================================ */
let tool='move';
function setTool(t){
  tool=t; DR.tool=t;
  document.querySelectorAll('.tool').forEach(b=>b.classList.toggle('on',b.dataset.tool===t));
  stage.className='stage '+(t==='browse'?'browse':('t-'+t));
  baseEl.style.pointerEvents = (t==='browse')?'auto':'none';
  [refClip,pinLayer,cmpDivider].forEach(l=> l.style.pointerEvents=(t==='browse')?'none':'');
  refBox.classList.toggle('locked', t!=='move' && t!=='compare');
  placeCompare(); cmpDivider.style.display=(DR.compareOn||t==='compare')?'block':'none';
  if(t==='compare'){ DR.compareOn=true; applyRef(); placeCompare(); }
  renderHandles();
  setHint(t);
  save();
}
const HINTS={
  move:'ลากภาพเพื่อย้าย · จับมุมเพื่อย่อ-ขยาย · จับวงกลมบนเพื่อหมุน (Shift = ทีละ 15°)',
  compare:'ลาก <b>เส้นเหลือง</b> ซ้าย-ขวา เพื่อเทียบภาพจริง vs อ้างอิง',
  pan:'ลากเพื่อเลื่อน · เลื่อนล้อเมาส์เพื่อซูม · กด Space ค้างเพื่อเลื่อนได้ทุกโหมด',
  annotate:'คลิกบนภาพเพื่อปักหมุด แล้วพิมพ์คอมเมนต์ในแผงขวา',
  measure:'ลากเพื่อวัดระยะ (px) · Shift = ล็อกแนวตั้ง/นอน · คลิกเส้นเพื่อลบ',
  browse:'โหมดใช้งานจริง — คลิก/พิมพ์ในหน้าเว็บได้ตามปกติ'
};
function setHint(t){ hintEl.innerHTML = HINTS[t]||''; hintEl.style.display = HINTS[t]?'flex':'none'; }

/* ---------- drag helpers ---------- */
let spaceDown=false;
function onDrag(moveFn, endFn){
  const mv=ev=>moveFn(ev);
  const up=ev=>{ window.removeEventListener('pointermove',mv); window.removeEventListener('pointerup',up); if(endFn)endFn(ev); save(); };
  window.addEventListener('pointermove',mv); window.addEventListener('pointerup',up);
}
function startPan(e){ const sx=e.clientX,sy=e.clientY,px=DR.panX,py=DR.panY; stage.style.cursor='grabbing';
  onDrag(ev=>{ DR.panX=px+(ev.clientX-sx); DR.panY=py+(ev.clientY-sy); applyView(); }, ()=>{ stage.style.cursor=''; }); }
function startMoveRef(e){ const sx=e.clientX,sy=e.clientY,tx=DR.tf.tx,ty=DR.tf.ty;
  onDrag(ev=>{ DR.tf.tx=tx+(ev.clientX-sx)/DR.zoom; DR.tf.ty=ty+(ev.clientY-sy)/DR.zoom; applyRef(); }); }
function startTransform(e,mode){
  const r=refBox.getBoundingClientRect(), cx=r.left+r.width/2, cy=r.top+r.height/2;
  const s0=DR.tf.s, r0=DR.tf.r, d0=Math.hypot(e.clientX-cx,e.clientY-cy)||1, a0=Math.atan2(e.clientY-cy,e.clientX-cx)*180/Math.PI;
  onDrag(ev=>{
    if(mode==='rot'){ let a=Math.atan2(ev.clientY-cy,ev.clientX-cx)*180/Math.PI; let nr=r0+(a-a0); if(ev.shiftKey) nr=Math.round(nr/15)*15; DR.tf.r=nr; }
    else { const d=Math.hypot(ev.clientX-cx,ev.clientY-cy); DR.tf.s=Math.max(0.05, s0*(d/d0)); }
    applyRef();
  });
}
function startCompare(e){ onDrag(ev=>{ const w=toWorld(ev.clientX,ev.clientY); const d=canvasDims();
  DR.compareX=Math.max(0,Math.min(d.w,w.x)); applyRef(); placeCompare(); }); }
function startMeasure(e){ const a=toWorld(e.clientX,e.clientY); const m={id:uid(),x1:a.x,y1:a.y,x2:a.x,y2:a.y}; DR.measures.push(m);
  onDrag(ev=>{ const b=toWorld(ev.clientX,ev.clientY); m.x2=b.x; m.y2=b.y;
      if(ev.shiftKey){ if(Math.abs(b.x-m.x1)>Math.abs(b.y-m.y1)) m.y2=m.y1; else m.x2=m.x1; } renderMeasures(); },
    ()=>{ if(Math.hypot(m.x2-m.x1,m.y2-m.y1)<3){ DR.measures=DR.measures.filter(x=>x!==m); renderMeasures(); } }); }
function startMovePin(e,id){ const p=DR.pins.find(x=>x.id===id); if(!p) return; const sx=e.clientX,sy=e.clientY,ox=p.x,oy=p.y; let moved=false;
  onDrag(ev=>{ if(Math.hypot(ev.clientX-sx,ev.clientY-sy)>3) moved=true; p.x=ox+(ev.clientX-sx)/DR.zoom; p.y=oy+(ev.clientY-sy)/DR.zoom; renderPins(); },
    ()=>{ if(!moved) selectPin(id); }); }

/* ---------- stage pointer dispatch ---------- */
stage.addEventListener('pointerdown', e=>{
  if(tool==='browse') return;
  if(spaceDown || e.button===1){ e.preventDefault(); startPan(e); return; }
  if(e.button!==0) return;
  // measure label delete
  const ml=e.target.closest('[data-mid]');
  if(ml && tool==='measure'){ DR.measures=DR.measures.filter(x=>x.id!==ml.dataset.mid); renderMeasures(); save(); return; }
  const pinEl=e.target.closest('[data-pin]');
  if(pinEl){ startMovePin(e,pinEl.dataset.pin); return; }
  if(tool==='compare'){ if(e.target.closest('#cmpDivider')) startCompare(e); else startPan(e); return; }
  if(tool==='move'){
    const h=e.target.closest('[data-h]');
    if(h){ startTransform(e,h.dataset.h); return; }
    if(e.target.closest('#refBox') && activeRef()){ startMoveRef(e); return; }
    startPan(e); return;
  }
  if(tool==='pan'){ startPan(e); return; }
  if(tool==='measure'){ startMeasure(e); return; }
  if(tool==='annotate'){ const w=toWorld(e.clientX,e.clientY); const p={id:uid(),x:w.x,y:w.y,text:'',done:false};
    DR.pins.push(p); renderPins(); renderComments(); save(); selectPin(p.id); return; }
});
stage.addEventListener('wheel', e=>{ if(tool==='browse') return; e.preventDefault();
  zoomAt(e.clientX,e.clientY, Math.exp(-e.deltaY*0.0015)); }, {passive:false});

/* keyboard */
window.addEventListener('keydown', e=>{
  if(/input|textarea|select/i.test(e.target.tagName)) return;
  if(e.code==='Space'){ spaceDown=true; stage.style.cursor='grab'; e.preventDefault(); return; }
  const map={KeyV:'move',KeyC:'compare',KeyH:'pan',KeyA:'annotate',KeyM:'measure',KeyB:'browse'};
  if(map[e.code]){ setTool(map[e.code]); }
  if(e.code==='Digit0'){ fitView(); save(); }
});
window.addEventListener('keyup', e=>{ if(e.code==='Space'){ spaceDown=false; stage.style.cursor=''; } });

/* ============================================================
   LIBRARY + IMAGE PROCESSING
   ============================================================ */
function processImage(file){
  return new Promise(res=>{
    const rd=new FileReader();
    rd.onload=ev=>{ const img=new Image();
      img.onload=()=>{ const max=1800; let w=img.width,h=img.height;
        if(Math.max(w,h)>max){ const k=max/Math.max(w,h); w=Math.round(w*k); h=Math.round(h*k); }
        const cv=document.createElement('canvas'); cv.width=w; cv.height=h;
        cv.getContext('2d').drawImage(img,0,0,w,h);
        let data; try{ data=cv.toDataURL('image/jpeg',0.9); }catch(_){ data=ev.target.result; }
        res({id:uid(), name:file.name.replace(/\.[^.]+$/,''), data, w, h});
      };
      img.onerror=()=>res(null);
      img.src=ev.target.result;
    };
    rd.readAsDataURL(file);
  });
}
window.DRaddLib = async function(files){
  for(const f of files){ const it=await processImage(f); if(it){ LIB.push(it);
    if(!DR.refId){ DR.refId=it.id; fitRefToCanvas(it); } } }
  jsave(LIB_KEY,LIB); renderLib(); applyRef(); renderHandles(); save();
};
window.DRtogglePin=function(id){ const p=DR.pins.find(x=>x.id===id); if(p){ p.done=!p.done; renderPins(); renderComments(); save(); } };
window.DRdelPin=function(id){ DR.pins=DR.pins.filter(x=>x.id!==id); if(selPin===id)selPin=null; renderPins(); renderComments(); save(); };
window.DRpinText=function(id,v){ const p=DR.pins.find(x=>x.id===id); if(p){ p.text=v; save(); } };
window.DRselectPin=function(id){ selPin=id; renderPins(); renderComments(); };

/* library card click (select / delete) */
$('libGrid').addEventListener('click', e=>{
  const del=e.target.closest('[data-libdel]');
  if(del){ e.stopPropagation(); const id=del.dataset.libdel; LIB=LIB.filter(x=>x.id!==id); jsave(LIB_KEY,LIB);
    if(DR.refId===id) DR.refId=null; renderLib(); applyRef(); save(); return; }
  const card=e.target.closest('[data-lib]');
  if(card){ const id=card.dataset.lib; DR.refId=id; const ref=activeRef();
    if(ref && (DR.tf.s===1&&DR.tf.tx===0&&DR.tf.ty===0)) fitRefToCanvas(ref);
    if(tool!=='move'&&tool!=='compare') setTool('move');
    renderLib(); applyRef(); renderHandles(); save(); }
});
/* pin layer click selects (handled by pointerdown move) */

/* ============================================================
   TOOLBAR WIRING
   ============================================================ */
function buildSelects(){
  $('pageSel').innerHTML = PAGES.map(grp=>`<optgroup label="${grp.g}">`+
      grp.items.map(([v,l])=>`<option value="${esc(v)}">${esc(l)}</option>`).join('')+`</optgroup>`).join('')
      + `<optgroup label="อื่น ๆ"><option value="${UPLOAD}">⬆ อัปโหลดสกรีนช็อต…</option></optgroup>`;
  $('pageSel').value = base;
  $('canvasSel').innerHTML = CANVASES.map(c=>`<option value="${c[0]}">${c[1]}</option>`).join('');
}
$('pageSel').addEventListener('change', e=>{ save(); base=e.target.value; jsave(LAST_KEY,base); loadState(base); $('canvasSel').value=DR.canvas; syncToolbar(); renderAll(); fitView(); setTool(tool); });
$('canvasSel').addEventListener('change', e=>{ DR.canvas=e.target.value; renderBase(); applyRef(); placeCompare(); renderMeasures(); fitView(); save(); });
$('opacity').addEventListener('input', e=>{ DR.opacity=+e.target.value; $('opacityV').textContent=e.target.value+'%'; refBox.style.opacity=DR.opacity/100; });
$('opacity').addEventListener('change', save);
$('uploadBaseBtn').addEventListener('click', ()=> $('baseFile').click());
$('baseFile').addEventListener('change', async e=>{ const f=e.target.files[0]; if(!f) return;
  const it=await processImage(f); if(!it) return; save(); base=UPLOAD; jsave(LAST_KEY,base); loadState(base);
  DR.baseUpload=it.data; DR.canvas = pickCanvasFor(it.w,it.h); $('pageSel').value=UPLOAD; $('canvasSel').value=DR.canvas;
  renderAll(); fitView(); save(); });
function pickCanvasFor(w,h){ // choose closest preset by aspect
  let best=CANVASES[0], bd=1e9; CANVASES.forEach(c=>{ const d=Math.abs((c[2]/c[3])-(w/h)); if(d<bd){bd=d;best=c;} }); return best[0]; }
$('fitBtn').addEventListener('click', ()=>{ fitView(); save(); });
$('clearBtn').addEventListener('click', ()=>{ DR.pins=[]; DR.measures=[]; selPin=null; renderPins(); renderMeasures(); renderComments(); save(); });
$('panelBtn').addEventListener('click', ()=> $('panel').classList.toggle('collapsed'));
$('zoomIn').addEventListener('click', ()=>{ const r=stageRect(); zoomAt(r.left+r.width/2,r.top+r.height/2,1.2); });
$('zoomOut').addEventListener('click', ()=>{ const r=stageRect(); zoomAt(r.left+r.width/2,r.top+r.height/2,1/1.2); });
$('tools').addEventListener('click', e=>{ const b=e.target.closest('.tool'); if(b) setTool(b.dataset.tool); });
$('cmtList').addEventListener('click', e=>{ const c=e.target.closest('[data-cmt]'); if(c && !e.target.closest('button')) selectPin(c.dataset.cmt); });
$('libFile')&&0;

function syncToolbar(){ $('opacity').value=DR.opacity; $('opacityV').textContent=DR.opacity+'%'; }

/* ============================================================
   INIT
   ============================================================ */
function init(){
  buildSelects();
  loadState(base);
  $('canvasSel').value=DR.canvas;
  syncToolbar();
  renderAll();
  fitView();
  setTool('move');
  window.addEventListener('resize', ()=>{ /* keep current view */ });
}
init();

})();
