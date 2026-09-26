/* Pure decision rules shared by the real page and the simulated farm. */
globalThis.FarmLightsLogic = (() => {
  function status(label, classes = '') {
    const clean = label.replace(/^(?:view printer log\s*[-–:]|printer status:)\s*/i, '').trim();
    // Parse a current status field, never an entire historical log.
    if (/^(?:printing?\s+error|error|failed|failure)\b/i.test(clean)) return 'error';
    if (/^not connected\b/i.test(clean)) return 'offline';
    const match = clean.match(/^(idle|ready|operational|heating|preheating|preparing|printing|paused|offline|finished|complete|error|disconnected)\b/i);
    let value = match?.[1]?.toLowerCase();
    if (!clean) value = classes.match(/printer-badge__variant--([\w-]+)/)?.[1];
    const map = {ready:'idle', operational:'idle', complete:'finished', disconnected:'offline',preheating:'heating'};
    value = map[value] || value;
    return ['idle','heating','preparing','printing','paused','offline','finished','error'].includes(value) ? value : 'unknown';
  }
  function recommend(rows, material, color, blocked) {
    return rows.filter(r => r.state === 'idle' && !r.ambiguous && !blocked(r)
      && !(r.jobs || []).some(isCurrentJob)
      && matchesFilament(r,material,color))
      .sort((a,b) => a.name.localeCompare(b.name, undefined, {numeric:true}));
  }
  function isCurrentJob(job) {
    return job.current === true || ['in progress','printing','heating','preparing','paused'].includes(String(job.state).toLowerCase());
  }
  function groupJobs(jobs, recentMinutes = 15, now = Date.now()) {
    const current = [], recent = [], older = [];
    for (const job of jobs) {
      const uploaded = Date.parse(job.uploadedAt);
      const age = now - uploaded;
      if (isCurrentJob(job)) current.push(job);
      else if (Number.isFinite(uploaded) && age >= 0 && age <= recentMinutes * 60000) recent.push(job);
      else older.push(job);
    }
    recent.sort((a,b) => Date.parse(b.uploadedAt) - Date.parse(a.uploadedAt));
    return {current,recent,older};
  }
  function materialFamily(value) {
    const s=String(value||'').trim().toUpperCase();
    // Keep filled/composite and specialist materials distinct.
    return s.replace(/\s+(BASIC|MATTE)$/,'');
  }
  function colorName(value) {
    const rgb=String(value).match(/[\d.]+/g)?.slice(0,3).map(Number);
    if(!rgb||rgb.length!==3)return '';
    const [r,g,b]=rgb, max=Math.max(...rgb), min=Math.min(...rgb);
    if(max<65)return 'Black';
    if(min>215)return 'White';
    if(max-min<35)return 'Gray';
    if(r>g*1.5&&r>b*1.5)return 'Red';
    if(r>150&&g>65&&g<160&&b<90)return 'Orange';
    if(r>140&&g>140&&b<110)return 'Yellow';
    if(g>r*1.15&&g>b*1.1)return 'Green';
    if(b>r*1.15&&b>g*1.05)return 'Blue';
    return 'Other';
  }
  function matchesFilament(row,material,color) {
    if(!material&&!color)return true;
    const slots=row.slotsKnown ? row.slots : [{material:row.config.material,color:row.config.color}];
    return slots.some(s=>(!material||materialFamily(s.material)===materialFamily(material))&&(!color||s.color===color));
  }
  function triage(row, now=Date.now()) {
    const make=(kind,label,rank,action,reason)=>({kind,label,rank,priority:rank>=80?'high':rank>=40?'medium':'low',action,reason});
    if(row.config?.broken||row.broken)return make('broken','BROKEN',95,'Inspect and repair before returning to service.','Operator marked this printer broken.');
    if(row.ambiguous)return make('unknown','Identity unclear',50,'Resolve duplicate printer names before assigning work.','Printer identity is ambiguous.');
    const j=row.log, active=(row.jobs||[]).find(isCurrentJob);
    const verified=j&&now-j.observedAt>=0&&now-j.observedAt<300000&&j.currentJobVerified&&active?.name===j.file&&(!j.jobId||String(active.id)===String(j.jobId))&&j.phase===row.state;
    const fault=verified&&!j.faultHistorical?j.fault?.message||'':'';
    // No undocumented error-code lookup or inference from a Resume button.
    if(fault&&['paused','error'].includes(row.state)) {
      if(/\b(?:fatal|unrecoverable|thermal runaway)\b/i.test(fault)&&! /\b(?:not fatal|non[- ]fatal|no fatal)\b/i.test(fault))return make('fatal','Fatal fault reported',100,'Keep this printer out of service; inspect the reported fault before reuse.',fault);
      if(/\b(?:filament (?:has )?run out|out of filament|filament runout)\b/i.test(fault))return make('recoverable','Paused · filament needed',65,'Check and reload filament, then confirm the printer is ready before resuming.',fault);
      return make('fault','Fault · inspect first',90,'Inspect the reported fault before attempting to resume.',fault);
    }
    if(row.state==='error')return make('fault','Error · inspect first',90,'Open the current job log and inspect the error before reuse.','A current error is reported; its cause is not verified.');
    if(row.state==='paused') {
      const last=verified?(j.events||[]).filter(e=>!/status changed/i.test(e.message)).at(-1)?.message||'':'';
      if(/^(?:Print|Printing|Job) (?:was )?paused by (?:the )?user[.!]?$/i.test(last))return make('recoverable','Paused · manual',60,'Check why it was paused; resume only after confirming the printer is ready.',last);
      if(/^(?:Filament (?:has )?run out|Out of filament|Filament runout)[.!]?$/i.test(last))return make('recoverable','Paused · filament needed',65,'Check and reload filament, then confirm readiness before resuming.',last);
      return make('paused','Paused · check cause',70,'Review the current job log and check the printer before resuming.',verified?'The pause reason is not established.':'Current job evidence is missing, stale or mismatched.');
    }
    if(row.state==='offline')return make('offline','Disconnected',55,'Check power and connection; confirm the job state at the printer.','The dashboard cannot confirm the printer state.');
    if(row.state==='unknown')return make('unknown','Status unknown',45,'Check the dashboard connection and printer status.','There is not enough evidence to choose a printer action.');
    if(row.state==='finished')return make('finished','Ready for collection',30,'Collect the print and confirm bed clearance.','The dashboard reports completion.');
    if(row.state==='idle')return make('idle','Idle',0,'Confirm bed clearance before starting a matching job.','No waiting time is added for stored files.');
    return make('working',row.state==='printing'?'Printing':row.state==='heating'?'Heating':'Preparing',0,'No intervention indicated; monitor for changes.','Normal activity reported.');
  }
  function priorities(rows,now=Date.now()){return rows.map(row=>({row,...triage(row,now)})).filter(x=>x.rank>0).sort((a,b)=>b.rank-a.rank||a.row.name.localeCompare(b.row.name));}
  function waitEstimate(row,buffer=5){
    if(row.config?.broken||row.broken||row.ambiguous)return {minutes:null,label:'Wait unknown · needs attention'};
    if(row.state==='idle'&&!(row.jobs||[]).some(isCurrentJob))return {minutes:0,label:'Available now · confirm bed clearance'};
    if(row.state==='printing'&&Number.isFinite(row.minutes)&&row.minutes>=0){const minutes=Math.ceil(row.minutes)+Math.max(0,Number(buffer)||0);return {minutes,label:`Estimated wait: ~${minutes} min`,note:`${Math.ceil(row.minutes)} min reported printing + ${Math.max(0,Number(buffer)||0)} min collection buffer. Not a reservation.`};}
    if(row.state==='finished')return {minutes:null,label:'Waiting for collection · confirm bed clearance'};
    return {minutes:null,label:'Wait unknown',note:'A current remaining-time estimate is unavailable or the printer needs attention.'};
  }
  function nextPrinter(rows,material,color,buffer=5){
    const candidates=rows.filter(r=>!r.ambiguous&&!r.config?.broken&&!r.broken&&matchesFilament(r,material,color));
    const timed=candidates.map(row=>({row,...waitEstimate(row,buffer)})).filter(x=>x.minutes!==null).sort((a,b)=>a.minutes-b.minutes||a.row.name.localeCompare(b.row.name));
    return {next:timed[0]||null,unknown:candidates.filter(r=>waitEstimate(r,buffer).minutes===null).length};
  }
  function updateGroups(events){
    const groups={down:[],paused:[],recovered:[],ready:[],other:[]};
    for(const e of events){const key=e.broken||['error','offline'].includes(e.to)||['fault','fatal','broken'].includes(e.kind)?'down':e.to==='paused'?'paused':['paused','error','offline'].includes(e.from)&&['printing','heating','preparing','idle'].includes(e.to)?'recovered':['idle','finished'].includes(e.to)?'ready':'other';groups[key].push(e);}
    return groups;
  }
  return {status, recommend, isCurrentJob, groupJobs, materialFamily, colorName, matchesFilament,triage,priorities,waitEstimate,nextPrinter,updateGroups};
})();
