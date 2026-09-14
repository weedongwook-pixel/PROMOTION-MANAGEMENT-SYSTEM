/* =====================================================================
 * Branch setup reminder — เตือนสาขาใหม่ให้อัปเดตข้อมูลผ่านกระดิ่ง
 *   ถ้าสาขา (เครื่องที่ล็อก pc_bv_branch) ยังไม่มี: เครื่อง EDC / เวลาทำการ / เบอร์มือถือ
 *   → ยิงแจ้งเตือนเข้ากระดิ่ง 1 ครั้ง/วัน "กรุณาอัปเดต ..."
 * โหลดหลัง js/notify.js + seeder
 * ===================================================================== */
(function(){
  function J(k){ try{ return JSON.parse(localStorage.getItem(k))||{}; }catch(e){ return {}; } }
  function run(){
    try{
      var bv=(localStorage.getItem('pc_bv_branch')||'').trim();
      if(!bv || bv.toUpperCase()==='ALL') return;                 // เฉพาะเครื่องสาขา
      var bs=(window.PC_BRANCH_MASTER||[]);
      var hit=bs.filter(function(b){ return b.id===bv || bv.indexOf(b.id)>-1 || b.name===bv; })[0];
      var id=hit?hit.id:bv; if(!id) return;
      var be=(J('pc_branch_edc')[id])||{}, hrs=(J('pc_branch_hours')[id]), az=(J('pc_area_zones')[id])||{};
      var miss=[];
      if(!be.edc) miss.push('ข้อมูลเครื่อง EDC');
      if(!hrs) miss.push('เวลาทำการร้าน');
      if(!(be.mobile||az.mobile)) miss.push('เบอร์มือถือสาขา');
      if(!miss.length) return;
      var gk='pc_edc_reminder_'+id, today=new Date().toISOString().slice(0,10);
      if(localStorage.getItem(gk)===today) return;               // เตือนวันละครั้ง
      try{ localStorage.setItem(gk, today); }catch(e){}
      var N=window.PC_notify||(window.top&&window.top.PC_notify);
      if(N) N('branch_setup_reminder',{ text:'สาขา '+id+' กรุณาอัปเดตข้อมูล: '+miss.join(' · ') });
    }catch(e){}
  }
  function boot(){ setTimeout(run, 1800); }               // ให้ notify + seeder โหลดก่อน
  if(document.readyState!=='loading') boot(); else document.addEventListener('DOMContentLoaded', boot);
})();
