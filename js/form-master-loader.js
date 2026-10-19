/* Form-only catalog read. Never writes, flushes Cloud or resets entered data. */
(function (window) {
  'use strict';
  if (window.PC_FormMaster) return;
  window.PC_FormMaster = {
    run: function () {
      var success, failure;
      var runner = {
        withSuccessHandler: function (fn) { success=fn; return runner; },
        withFailureHandler: function (fn) { failure=fn; return runner; },
        getMasterDataExtended: function () {
          var host=document.getElementById('loadingStatus');
          var generation=window.__pageGen || 0, requestId=0, timer=null;
          function active() {
            return generation===(window.__pageGen || 0) &&
              (!host || host===document.getElementById('loadingStatus'));
          }
          function label(node, th, en) {
            node.setAttribute('data-th',th);node.setAttribute('data-en',en);
            node.textContent=window.PC_LANG==='EN'?en:th;
          }
          function fail(error, id) {
            if(id!==requestId || !active()) return;
            requestId++;clearTimeout(timer);
            if(host) {
              host.style.display='block';host.setAttribute('role','alert');
              var message=document.createElement('p');
              label(message,'โหลดข้อมูลสินค้า/สาขาไม่สำเร็จ','Could not load products and branches.');
              var hint=document.createElement('p');
              label(hint,'ตรวจสอบการเชื่อมต่อ แล้วกดลองใหม่ ข้อมูลที่กรอกจะไม่ถูกล้าง','Check your connection and try again. Entered data will not be cleared.');
              var button=document.createElement('button');
              button.type='button';button.className='btn btn-outline-success';
              label(button,'ลองโหลดข้อมูลอีกครั้ง','Retry loading');
              button.addEventListener('click',start);
              host.replaceChildren(message,hint,button);
            }
            if(failure) {try {failure(error);}catch(_) {}}
          }
          function start() {
            if(!active()) return;
            var id=++requestId;
            clearTimeout(timer);
            if(host) {
              host.style.display='block';host.setAttribute('role','status');
              var text=document.createElement('p');
              label(text,'กำลังโหลดข้อมูลสินค้าและสาขา…','Loading products and branches…');
              host.replaceChildren(text);
            }
            timer=setTimeout(function(){fail(new Error('master_data_timeout'),id);},12000);
            try {
              window.google.script.run.withSuccessHandler(function(data){
                if(id!==requestId || !active()) return;
                if(!data || !Array.isArray(data.items) || !data.items.length || !Array.isArray(data.branches)) {
                  fail(new Error('master_data_invalid'),id);return;
                }
                clearTimeout(timer);
                try {if(success)success(data);requestId++;}
                catch(error){fail(error,id);}
              }).withFailureHandler(function(error){fail(error,id);}).getMasterDataExtended();
            } catch(error) {fail(error,id);}
          }
          start();return runner;
        }
      };
      return runner;
    }
  };
})(window);
