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
  // Simple dashboard status for lights and cards — no log-based fault triage.
  function statusInfo(row) {
    const make=(kind,label,hint)=>({kind,label,hint});
    if(row.config?.broken||row.broken)return make('broken','Unavailable','');
    if(row.ambiguous)return make('unknown','Name unclear','');
    if(row.state==='error')return make('error','Unavailable','');
    if(row.state==='paused')return make('paused','Paused','');
    if(row.state==='offline')return make('offline','Offline','');
    if(row.state==='unknown')return make('unknown','Unknown','');
    if(row.state==='finished')return make('finished','Ready to collect','');
    if(row.state==='idle')return make('idle','Available','');
    if(row.state==='printing')return make('working','Printing','');
    if(row.state==='heating')return make('working','Heating','');
    if(row.state==='preparing')return make('working','Preparing','');
    return make('working',row.state||'Busy','');
  }
  // Back-compat for callers that still expect triage().
  function triage(row){const info=statusInfo(row);return {...info,rank:0,priority:'low',action:info.hint,reason:info.label};}
  function waitEstimate(row,buffer=5){
    if(row.config?.broken||row.broken||row.ambiguous)return {minutes:null,label:'Unavailable'};
    if(row.state==='idle'&&!(row.jobs||[]).some(isCurrentJob))return {minutes:0,label:'Available now'};
    if(['printing','heating','preparing'].includes(row.state)&&Number.isFinite(row.minutes)&&row.minutes>=0){const minutes=Math.ceil(row.minutes);return {minutes,label:minutes===0?'Almost done':`${minutes} min left`};}
    if(row.state==='finished')return {minutes:null,label:'Ready to collect'};
    return {minutes:null,label:'No time left shown'};
  }
  function nextPrinter(rows,material,color,buffer=5){
    const candidates=rows.filter(r=>!r.ambiguous&&!r.config?.broken&&!r.broken&&matchesFilament(r,material,color));
    const timed=candidates.map(row=>({row,...waitEstimate(row,buffer)})).filter(x=>x.minutes!==null).sort((a,b)=>a.minutes-b.minutes||a.row.name.localeCompare(b.row.name));
    return {next:timed[0]||null,unknown:candidates.filter(r=>waitEstimate(r,buffer).minutes===null).length};
  }
  function matchingPrinters(rows,material,color,buffer=5){
    return rows.filter(r=>!r.ambiguous&&matchesFilament(r,material,color))
      .map(row=>({row,...waitEstimate(row,buffer),...statusInfo(row)}))
      .sort((a,b)=>{
        const am=a.minutes,bm=b.minutes;
        if(am!==null&&bm!==null&&am!==bm)return am-bm;
        if(am!==null&&bm===null)return -1;
        if(am===null&&bm!==null)return 1;
        return a.row.name.localeCompare(b.row.name,undefined,{numeric:true});
      });
  }
  function updateGroups(events){
    const groups={down:[],paused:[],recovered:[],ready:[],other:[]};
    for(const e of events){const key=e.broken||['error','offline'].includes(e.to)||e.kind==='broken'?'down':e.to==='paused'?'paused':['paused','error','offline'].includes(e.from)&&['printing','heating','preparing','idle'].includes(e.to)?'recovered':['idle','finished'].includes(e.to)?'ready':'other';groups[key].push(e);}
    return groups;
  }
  function hardwareRow(row,hardware,fresh){
    const id=Number(row.config.light);if(!Number.isInteger(id)||id<1||id>6)return row;
    const module=hardware?.modules?.find(m=>m.id===id),online=!!(fresh&&hardware.connected&&module?.online&&!module.conflict);
    return {...row,physicalBroken:module?.broken===true,hardwareUnknown:!online,config:{...row.config,broken:row.config.broken||module?.broken===true},state:online?row.state:'unknown'};
  }
  function lightCommands(rows,count=6,highlight=''){
    const palette={broken:[255,0,0],error:[255,0,0],paused:[255,120,0],offline:[110,0,180],unknown:[110,0,180],finished:[0,200,40],idle:[0,200,40],working:[0,70,255]};
    return Array.from({length:Math.min(6,count)},(_,index)=>{
      const id=index+1,assigned=rows.filter(r=>Number(r.config.light)===id),r=assigned.length===1?assigned[0]:null;
      const flash=r&&highlight&&String(r.id||r.name)===String(highlight)?1:0;
      return {id,rgb:r?palette[statusInfo(r).kind]:[0,0,0],flash};
    });
  }
  return {status, recommend, isCurrentJob, groupJobs, materialFamily, colorName, matchesFilament,statusInfo,triage,waitEstimate,nextPrinter,matchingPrinters,updateGroups,hardwareRow,lightCommands};
})();
