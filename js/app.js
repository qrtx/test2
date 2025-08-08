(function(){
  const $=(s,c=document)=>c.querySelector(s);
  const $$=(s,c=document)=>Array.from(c.querySelectorAll(s));

  // Animated tab transitions
  const tabs=$$('.tabbar button'), pages=$$('.page');
  function show(page){
    pages.forEach(p=>{
      const active = (p.id === 'page-'+page);
      p.classList.toggle('active', active);
      p.classList.toggle('hidden-soft', !active);
    });
    tabs.forEach(b=>b.classList.toggle('active', b.dataset.page===page));
    localStorage.setItem('activePage', page);
  }
  tabs.forEach(b=>b.addEventListener('click', ()=>show(b.dataset.page)));
  show(localStorage.getItem('activePage')||'checkin');

  // Populate selects
  async function refreshEmployees(){
    const list = await DB.getEmployees();
    const empSel = $('#employee'); const bankEmp = $('#bankEmployee');
    empSel.innerHTML = '<option value="">Сотрудник</option>';
    bankEmp.innerHTML = '<option value="">Сотрудник</option>';
    list.forEach(n => { empSel.append(new Option(n,n)); bankEmp.append(new Option(n,n)); });
  }
  async function refreshPoints(){
    const list = await DB.getPoints();
    const sel = $('#point'); sel.innerHTML = '<option value="">ПВЗ</option>';
    list.forEach(p => sel.append(new Option(p,p)));
  }

  // Check-in
  $('#btn-checkin').addEventListener('click', async () => {
    const name=$('#employee').value, point=$('#point').value;
    if(!name||!point) return alert('Выбери сотрудника и ПВЗ');
    await DB.markShift({name, point, date: new Date()});
    $('#checkinStatus').textContent = `Отмечено: ${name} @ ${point} • ${new Date().toLocaleString('ru-RU')}`;
    renderCalendar(currentYear, currentMonth);
    refreshPayroll();
  });

  // Calendar
  const monthTitle=$('#monthTitle'), cal=$('#calendar');
  let today=new Date(); let currentYear=today.getFullYear(), currentMonth=today.getMonth();
  function monthName(y,m){ return new Date(y,m,1).toLocaleDateString('ru-RU',{month:'long',year:'numeric'}); }
  function monthDays(y,m){
    const first=new Date(y,m,1), start=new Date(y,m,1-((first.getDay()+6)%7));
    const cells=[]; for(let i=0;i<42;i++){ const d=new Date(start); d.setDate(start.getDate()+i); cells.push(d); } return cells;
  }
  async function renderCalendar(y,m){
    monthTitle.textContent = monthName(y,m);
    const shifts = await DB.getShiftsByMonth(y,m);
    cal.innerHTML = '';
    monthDays(y,m).forEach(d=>{
      const iso=d.toISOString().slice(0,10);
      const cell=document.createElement('div');
      cell.className='cell'; cell.style.opacity=(d.getMonth()===m)?'1':'.45';
      cell.innerHTML = `<div class="text-xs mb-1">${d.getDate()}</div>`;
      const daily=shifts[iso]||[];
      if(daily.length){
        const ul=document.createElement('ul'); ul.style.fontSize='11px'; ul.style.lineHeight='1.2';
        daily.forEach(s=>{ const li=document.createElement('li'); li.textContent=`${s.name} — ${s.point}`; ul.appendChild(li); });
        cell.appendChild(ul);
      }
      if(iso === new Date().toISOString().slice(0,10)) cell.classList.add('active');
      cal.appendChild(cell);
    });
  }
  $('#prevMonth').addEventListener('click', ()=>{ currentMonth--; if(currentMonth<0){currentMonth=11; currentYear--; } renderCalendar(currentYear,currentMonth); refreshPayroll(); });
  $('#nextMonth').addEventListener('click', ()=>{ currentMonth++; if(currentMonth>11){currentMonth=0; currentYear++; } renderCalendar(currentYear,currentMonth); refreshPayroll(); });

  // Payroll with per-point rates
  async function refreshPayroll(){
    const rates = await DB.getPointsWithRates(); // {point: rate}
    const byDay = await DB.getShiftsByMonth(currentYear, currentMonth);
    const totals = {}; const counts = {};
    Object.values(byDay).forEach(list=>list.forEach(s=>{
      counts[s.name]=(counts[s.name]||0)+1;
      const rate = Number(rates[s.point]||0);
      totals[s.name]=(totals[s.name]||0)+rate;
    }));
    $('#shiftsCount').textContent = Object.values(counts).reduce((a,b)=>a+b,0) || 0;
    $('#total').textContent = (Object.values(totals).reduce((a,b)=>a+b,0) || 0) + ' ₽';
    const body=$('#payrollBody'); body.innerHTML='';
    Object.keys({...counts,...totals}).sort().forEach(name=>{
      const tr=document.createElement('tr');
      const cnt=counts[name]||0, sum=totals[name]||0;
      tr.innerHTML = `<td class="py-2 px-3">${name}</td><td class="py-2 px-3">${cnt}</td><td class="py-2 px-3">${sum} ₽</td>`;
      body.appendChild(tr);
    });
  }

  // Requisites
  async function refreshReqs(){
    const req = await DB.getRequisites();
    const body = $('#reqBody'); body.innerHTML='';
    Object.entries(req).forEach(([name, {phone, bank}])=>{
      const tr=document.createElement('tr');
      tr.innerHTML = `<td class="py-2 px-3">${name}</td><td class="py-2 px-3">${phone||''} — ${bank||''}</td>
      <td class="py-2 px-3"><button class="glass-ink px-2 py-1 rounded-lg text-xs" data-del="${name}">Удалить</button></td>`;
      body.appendChild(tr);
    });
  }
  $('#saveReqBtn').addEventListener('click', async ()=>{
    const name=$('#bankEmployee').value, phone=$('#bankPhone').value, bank=$('#bankName').value;
    if(!name||!phone||!bank) return alert('Заполни все поля');
    await DB.saveRequisite(name, phone, bank); await refreshReqs();
  });
  $('#reqBody').addEventListener('click', async (e)=>{
    const btn=e.target.closest('button[data-del]'); if(!btn) return;
    await DB.deleteRequisite(btn.dataset.del); await refreshReqs();
  });
  $('#clearReqBtn').addEventListener('click', ()=>{ $('#bankPhone').value=''; $('#bankName').value=''; });

  // Rules & Admins
  async function loadRules(){ $('#rulesContent').innerHTML = await DB.getRules(); }
  async function loadAdmins(){ const ul=$('#adminsList'); ul.innerHTML=''; (await DB.getAdmins()).forEach(a=>{ const li=document.createElement('li'); li.className='glass-ink rounded-xl p-3'; li.innerHTML=`<div class="text-sm font-semibold">${a.name||''}</div><div class="text-xs text-gray-600">${a.handle||''} ${a.phone||''}</div>`; ul.appendChild(li); }); }

  // Auth (stub)
  $('#btn-login').addEventListener('click', async ()=>{ await DB.authLogin(); applyAuth(); });
  $('#btn-logout').addEventListener('click', async ()=>{ await DB.authLogout(); applyAuth(); });
  function applyAuth(){ const admin=DB.isAdmin(); $('#btn-login').classList.toggle('hidden',admin); $('#btn-logout').classList.toggle('hidden',!admin); $('#page-admin').classList.toggle('hidden',!admin); }

  // Admin actions
  $('#addEmp').addEventListener('click', async ()=>{ const v=$('#newEmp').value.trim(); if(!v) return; await DB.addEmployee(v); $('#newEmp').value=''; await refreshEmployees(); });
  $('#delEmp').addEventListener('click', async ()=>{ const v=$('#employee').value; if(!v) return; await DB.deleteEmployee(v); await refreshEmployees(); });
  $('#addPoint').addEventListener('click', async ()=>{ const v=$('#newPoint').value.trim(); if(!v) return; await DB.addPoint(v); $('#newPoint').value=''; await refreshPoints(); });
  $('#delPoint').addEventListener('click', async ()=>{ const v=$('#point').value; if(!v) return; await DB.deletePoint(v); await refreshPoints(); });
  $('#setRate').addEventListener('click', async ()=>{ const v=$('#newRate').value; await DB.setRate(v); await refreshPayroll(); });

  // Init
  (async function init(){
    applyAuth();
    await refreshEmployees(); await refreshPoints();
    await renderCalendar(currentYear, currentMonth);
    await refreshPayroll();
    await refreshReqs();
    await loadRules(); await loadAdmins();
  })();
})();