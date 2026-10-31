(function(){
  'use strict';
  const root=document.querySelector('[data-email-staff-settings]');if(!root)return;
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let state={users:[],pending:[]};
  root.innerHTML='<h2>สิทธิ์ใช้บัญชีส่งเมลกลาง</h2><p>พนักงานที่ล็อกอินด้วย Microsoft ของบริษัทส่งเมลได้ทันทีจากทุกเครื่อง เมลออกจากบัญชีส่งเมลกลางเสมอ ผู้ดูแลปิดสิทธิ์ส่งเมลรายคนได้ที่รายการด้านล่าง</p><button type="button" class="btn btn-outline-success" data-staff-load>โหลดรายชื่อพนักงาน</button><button type="button" class="btn btn-outline-secondary ms-2" data-staff-owner>ยืนยันเจ้าของเมลเพื่อจัดการสิทธิ์</button><button type="button" class="btn btn-success ms-2" data-staff-add hidden>เพิ่มบัญชีพนักงาน</button><p role="status" class="my-3" data-staff-note></p><div data-staff-list></div><div data-staff-pending></div>';
  const q=s=>root.querySelector(s),note=s=>{q('[data-staff-note]').textContent=s;};
  async function request(body){
    const auth=await fetch('/email/staff/owner-session',{credentials:'same-origin',cache:'no-store'});
    if(!auth.ok)throw Error('กด “ยืนยันเจ้าของเมลเพื่อจัดการสิทธิ์” ก่อนจัดการพนักงาน · พนักงานทั่วไปไม่ต้องเชื่อมบัญชีผู้ส่ง');
    const {csrf}=await auth.json();
    const r=await fetch('/email/staff/accounts',{method:body?'POST':'GET',credentials:'same-origin',cache:'no-store',headers:{'Content-Type':'application/json','X-PC-Email-CSRF':csrf},...(body?{body:JSON.stringify(body)}:{})});const data=await r.json();
    if(!r.ok)throw Error(data.error==='email_staff_password_length'?'รหัสผ่านต้องมี 12–256 ตัวอักษร':'บันทึกสิทธิ์ไม่ได้ กรุณาตรวจชื่อผู้ใช้ซ้ำหรือโหลดข้อมูลใหม่');return data;
  }
  async function edit(user={},pending){
    const result=await Swal.fire({title:user.id?'แก้ไขสิทธิ์พนักงาน':'เพิ่มบัญชีพนักงาน',width:640,html:'<div style="text-align:left"><label class="form-label" for="staffName">ชื่อพนักงาน</label><input class="form-control mb-3" id="staffName" value="'+esc(user.name||pending?.display_name||'')+'"><label class="form-label" for="staffUsername">Username สำหรับเข้าเว็บ</label><input class="form-control mb-3" id="staffUsername" value="'+esc(user.username||pending?.email_label||'')+'" autocomplete="off"><label class="form-label" for="staffPassword">'+(user.password?'ตั้งรหัสผ่านใหม่ (เว้นว่างเพื่อใช้เดิม)':'รหัสผ่านสำหรับเข้าเว็บ (12 ตัวอักษรขึ้นไป)')+'</label><input class="form-control mb-3" id="staffPassword" type="password" autocomplete="new-password"><label for="staffRole" class="form-label">บทบาทในเว็บ</label><select class="form-select mb-3" id="staffRole">'+['MKT','IT','Admin','Admin HQ','ACC','OP','BD','RD','HQ'].map(r=>'<option '+(r===(user.role||'MKT')?'selected':'')+'>'+r+'</option>').join('')+'</select><label for="staffMicrosoft" class="form-label">ผูกบัญชี Microsoft ที่ยืนยันตัวตนแล้ว</label><select class="form-select mb-3" id="staffMicrosoft"><option value="">'+(user.microsoft?'ใช้บัญชีที่ผูกไว้แล้ว':'ไม่ผูก Microsoft')+'</option>'+state.pending.map(p=>'<option value="'+esc(p.ms_oid)+'" '+(p.ms_oid===pending?.ms_oid?'selected':'')+'>'+esc(p.display_name+' · '+p.email_label)+'</option>').join('')+'</select><p class="small text-muted">Microsoft ไม่ต้องตั้งรหัสผ่านในช่องนี้ หากต้องการใช้ได้ทั้งสองวิธี ให้ตั้งรหัสผ่านและเลือกบัญชี Microsoft ของพนักงานคนเดียวกัน</p>'+[['staffSend','ส่งเมลแจ้งโปรโมชั่น / ค้นหาลูปเมล',user.canSend!==false],['staffIT','ยืนยันงาน IT / Interface',!!user.canIT],['staffEnabled','เปิดใช้งานบัญชี',user.enabled!==false]].map(([id,label,checked])=>'<label class="d-block my-2"><input type="checkbox" id="'+id+'" '+(checked?'checked':'')+'> '+label+'</label>').join('')+'</div>',showCancelButton:true,confirmButtonText:'บันทึกสิทธิ์',cancelButtonText:'ยกเลิก',showLoaderOnConfirm:true,allowOutsideClick:()=>!Swal.isLoading(),preConfirm:async()=>{
      const val=id=>document.getElementById(id).value.trim(),checked=id=>document.getElementById(id).checked;
      const body={...(user.id?{id:user.id}:{}),username:val('staffUsername'),name:val('staffName'),role:val('staffRole'),canSend:checked('staffSend'),canIT:checked('staffIT'),enabled:checked('staffEnabled')};
      const password=document.getElementById('staffPassword').value,ms=val('staffMicrosoft');if(password)body.password=password;if(ms)body.microsoftRequest=ms;
      if(!body.name||!body.username){Swal.showValidationMessage('กรอกชื่อและ Username');return false;}
      if(password&&password.length<12){Swal.showValidationMessage('รหัสผ่านอย่างน้อย 12 ตัวอักษร');return false;}
      try{return await request(body);}catch(e){Swal.showValidationMessage(e.message);return false;}
    }});
    if(result.isConfirmed){await load();note('บันทึกสิทธิ์แล้ว ให้พนักงานเข้าสู่ระบบเว็บใหม่ด้วยบัญชีของตัวเอง');}
  }
  async function load(){
    const b=q('[data-staff-load]');b.disabled=true;note('กำลังตรวจสิทธิ์ผู้ดูแลและโหลดรายชื่อ…');
    try{
      state=await request();q('[data-staff-add]').hidden=false;
      q('[data-staff-list]').innerHTML=state.users.length?'<div class="table-responsive"><table class="table"><thead><tr><th>พนักงาน</th><th>วิธีล็อกอิน</th><th>สิทธิ์</th><th></th></tr></thead><tbody>'+state.users.map((u,i)=>'<tr><td>'+esc(u.name)+'<br><small>'+esc(u.username)+'</small></td><td>'+[u.password?'Username / Password':'',u.microsoft?'Microsoft':''].filter(Boolean).join('<br>')+'</td><td>'+(u.enabled?[u.canSend?'ส่งเมล':'',u.canIT?'IT / Interface':''].filter(Boolean).join(', ')||'ยังไม่มีสิทธิ์':'ปิดใช้งาน')+'</td><td><button type="button" class="btn btn-outline-success btn-sm" data-staff-edit="'+i+'">แก้ไข</button></td></tr>').join('')+'</tbody></table></div>':'<p>ยังไม่มีบัญชีพนักงานที่ได้รับสิทธิ์</p>';
      q('[data-staff-pending]').innerHTML=state.pending.length?'<h3 class="h5 mt-4">Microsoft รออนุมัติ</h3>'+state.pending.map((p,i)=>'<div class="border-bottom py-3"><strong>'+esc(p.display_name)+'</strong><p>'+esc(p.email_label)+'</p><details class="small"><summary>รหัสตัวตนที่ยืนยันแล้ว</summary>'+esc(p.ms_oid)+'</details><button type="button" class="btn btn-success mt-2" data-staff-approve="'+i+'">อนุมัติเป็นบัญชีใหม่</button><p class="small mt-2">มี Username อยู่แล้ว: กดแก้ไขบัญชีด้านบน แล้วเลือก Microsoft ของพนักงานคนนี้</p></div>').join(''):'';
      root.querySelectorAll('[data-staff-edit]').forEach(b=>b.onclick=()=>edit(state.users[Number(b.dataset.staffEdit)]));root.querySelectorAll('[data-staff-approve]').forEach(b=>b.onclick=()=>edit({},state.pending[Number(b.dataset.staffApprove)]));note('สิทธิ์ส่งเมลตรวจจากเซิร์ฟเวอร์ · การปิดบัญชีหรือเปลี่ยนสิทธิ์จะยกเลิก session เดิม');
    }catch(e){note(e.message);}finally{b.disabled=false;}
  }
  q('[data-staff-owner]').onclick=async()=>{try{await window.PC_EmailAuth.connectHere({ownerOnly:true});await load();}catch(e){note(e.message);}};
  q('[data-staff-load]').onclick=load;q('[data-staff-add]').onclick=()=>edit();
})();
