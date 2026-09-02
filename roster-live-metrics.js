(() => {
  'use strict';

  const FLEX_VALUES = new Set(['', 'Flexível', 'Flexivel', 'Flexível / sem turno fixo', '—']);

  function todayStr(){
    const d = new Date();
    const y=d.getFullYear(), m=String(d.getMonth()+1).padStart(2,'0'), day=String(d.getDate()).padStart(2,'0');
    return `${y}-${m}-${day}`;
  }

  function employeeById(id){
    try { return employees.find(e=>String(e.id)===String(id)) || null; } catch(_) { return null; }
  }

  function shiftById(id){
    try { return shifts.find(s=>String(s.id)===String(id)) || null; } catch(_) { return null; }
  }

  function habitualShiftForEmployee(emp){
    if(!emp || FLEX_VALUES.has(String(emp.schedule||'').trim())) return null;
    const val=String(emp.schedule||'').trim();
    try {
      return shifts.find(s=>{
        const label = typeof shiftLabel==='function' ? shiftLabel(s) : `${s.name} (${s.start}–${s.end})`;
        return label===val || String(s.id)===String(emp.shiftId||emp.shift_id||'');
      }) || null;
    } catch(_) { return null; }
  }

  function scheduledTodayEntries(){
    const ds=todayStr();
    try {
      return (rosterEntries||[]).filter(r=>r && r.date===ds && !r.isDayOff && r.shiftId);
    } catch(_) { return []; }
  }

  function presentNamesByTeam(){
    const map=new Map();
    try {
      for(const p of (punchRecords||[])){
        const actual=String(p.actual??'').trim();
        const isPresent=actual && actual!=='—' && actual!=='-' && actual.toLowerCase()!=='sem entrada';
        if(!isPresent) continue;
        const team=String(p.team||'Sem equipa');
        if(!map.has(team)) map.set(team,new Set());
        map.get(team).add(String(p.name||''));
      }
    } catch(_) {}
    return map;
  }

  function syncDerivedTeamMetrics(){
    const entries=scheduledTodayEntries();
    const presentMap=presentNamesByTeam();
    try {
      for(const team of (teams||[])){
        const empIds=new Set((employees||[]).filter(e=>e.team===team.name).map(e=>String(e.id)));
        team.scheduled=entries.filter(r=>empIds.has(String(r.employeeId))).length;
        team.present=presentMap.get(String(team.name))?.size || 0;
      }
    } catch(_) {}
    return entries;
  }

  function patchTeamTable(){
    const entries=syncDerivedTeamMetrics();
    const tbody=document.getElementById('team-table-body');
    if(!tbody) return;
    const rows=[...tbody.querySelectorAll('tr')];
    rows.forEach((row,i)=>{
      const team=(typeof teams!=='undefined' && teams[i]) ? teams[i] : null;
      if(!team) return;
      const cells=row.querySelectorAll('td');
      if(cells[4]) cells[4].textContent=String(team.scheduled||0);
      if(cells[5]) cells[5].textContent=String(team.present||0);
    });
  }

  function patchShiftTable(){
    const entries=scheduledTodayEntries();
    const table=document.getElementById('shift-table-body')?.closest('table');
    if(table){
      const headers=table.querySelectorAll('thead th');
      if(headers[3]) headers[3].textContent='ESCALADOS HOJE';
    }
    const tbody=document.getElementById('shift-table-body');
    if(!tbody) return;
    [...tbody.querySelectorAll('tr')].forEach((row,i)=>{
      const shift=(typeof shifts!=='undefined' && shifts[i]) ? shifts[i] : null;
      if(!shift) return;
      const count=entries.filter(r=>String(r.shiftId)===String(shift.id)).length;
      const cells=row.querySelectorAll('td');
      if(cells[3]) cells[3].textContent=String(count);
    });
  }

  function refreshDashboardCoverage(){
    syncDerivedTeamMetrics();
    try { if(typeof renderTeamChart==='function') renderTeamChart(); } catch(_) {}
    try { if(typeof renderTeamList==='function') renderTeamList(); } catch(_) {}
  }

  function installRenderWrappers(){
    try {
      if(typeof renderEquipas==='function' && !renderEquipas.__picaLiveWrapped){
        const original=renderEquipas;
        const wrapped=function(...args){ const out=original.apply(this,args); patchTeamTable(); return out; };
        wrapped.__picaLiveWrapped=true;
        renderEquipas=wrapped;
      }
    } catch(_) {}

    try {
      if(typeof renderTurnos==='function' && !renderTurnos.__picaLiveWrapped){
        const original=renderTurnos;
        const wrapped=function(...args){ const out=original.apply(this,args); patchShiftTable(); return out; };
        wrapped.__picaLiveWrapped=true;
        renderTurnos=wrapped;
      }
    } catch(_) {}
  }

  function enforceFixedEmployeesOnProposal(result){
    if(!result || !Array.isArray(result.proposal)) return result;
    const usableIds=new Set((result.usableShifts||[]).map(s=>String(s.id)));
    const warnings=Array.isArray(result.warnings) ? result.warnings : (result.warnings=[]);
    const originalProposal=[...result.proposal];
    const next=[];

    for(const entry of originalProposal){
      if(!entry || entry.isDayOff || !entry.shiftId){ next.push(entry); continue; }
      const emp=employeeById(entry.employeeId);
      const fixedShift=habitualShiftForEmployee(emp);
      if(!fixedShift){ next.push(entry); continue; }

      if(!usableIds.has(String(fixedShift.id))){
        warnings.push(`⚠ ${emp.name}: turno fixo ${fixedShift.name} não foi selecionado no gerador; não foi atribuído outro turno.`);
        continue;
      }

      const candidate={...entry,shiftId:fixedShift.id,notes:'Gerado automaticamente · turno fixo habitual'};
      const withoutCurrent=next.concat(originalProposal.filter(x=>x!==entry && !(String(x.employeeId)===String(entry.employeeId)&&x.date===entry.date)));
      let blocked=[];
      let extraWarnings=[];
      try {
        const validation=rosterValidationForAssignment(emp.id,entry.date,fixedShift.id,withoutCurrent,Number(result.minRest||11));
        blocked=validation?.blocked||[];
        extraWarnings=validation?.warnings||[];
      } catch(_) {}

      if(blocked.length){
        warnings.push(`⚠ ${emp.name} · ${entry.date}: turno fixo ${fixedShift.name} não pôde ser atribuído (${blocked.join(' ')}).`);
        continue;
      }
      if(extraWarnings.length) warnings.push(...extraWarnings.map(w=>`⚠ ${emp.name} · ${entry.date}: ${w}`));
      next.push(candidate);
    }

    result.proposal=next;
    return result;
  }

  function installGeneratorRule(){
    try {
      if(typeof buildRosterProposal==='function' && !buildRosterProposal.__picaFixedWrapped){
        const original=buildRosterProposal;
        const wrapped=function(...args){
          const result=original.apply(this,args);
          return enforceFixedEmployeesOnProposal(result);
        };
        wrapped.__picaFixedWrapped=true;
        buildRosterProposal=wrapped;
      }
    } catch(err){ console.warn('Pica-Aqui: não foi possível ativar regra de turno fixo.',err); }
  }

  function refreshAll(){
    installRenderWrappers();
    installGeneratorRule();
    patchTeamTable();
    patchShiftTable();
    const dashboard=document.getElementById('page-dashboard');
    if(dashboard && !dashboard.hidden) refreshDashboardCoverage();
  }

  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',refreshAll,{once:true});
  else refreshAll();

  document.addEventListener('click',e=>{
    if(e.target.closest('[data-nav="dashboard"],[data-nav="equipas"],[data-nav="turnos"],[data-nav="escalas"]')){
      setTimeout(refreshAll,120);
    }
  });

  // Mantém os indicadores coerentes depois de sincronizações em tempo real/Supabase.
  setInterval(()=>{
    if(document.hidden) return;
    refreshAll();
  },4000);
})();
