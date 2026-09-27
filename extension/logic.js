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
  // Newest upload/edit first. Prefer absolute dateTitle, then uploadedAt, then relative dateLabel.
  function jobTimeMs(job, now = Date.now()) {
    const title = Date.parse(job?.dateTitle);
    if (Number.isFinite(title)) return title;
    const uploaded = Date.parse(job?.uploadedAt);
    if (Number.isFinite(uploaded)) return uploaded;
    const label = String(job?.dateLabel || '').trim();
    if (/^(just now|a few seconds ago|moments ago)$/i.test(label)) return now;
    const relative = label.match(/^(\d+)\s*(s|sec|seconds?|m|min|mins|minutes?|h|hr|hours?|d|days?)\s+ago$/i);
    if (relative) {
      const n = Number(relative[1]);
      const u = relative[2].toLowerCase();
      const unit = /^s/.test(u) ? 1000 : /^m/.test(u) ? 60000 : /^h/.test(u) ? 3600000 : 86400000;
      return now - n * unit;
    }
    return 0;
  }
  function sortJobsNewestFirst(jobs, now = Date.now()) {
    return [...(jobs || [])].sort((a, b) => jobTimeMs(b, now) - jobTimeMs(a, now) || String(a.name || '').localeCompare(String(b.name || '')));
  }
  // Prefer a real per-row DOM id. If candidates collide or are missing, derive a stable row key.
  function assignUniqueJobIds(jobs) {
    const list = (jobs || []).map(job => ({ ...job, id: String(job?.id || '').trim() }));
    const counts = new Map();
    list.forEach(job => counts.set(job.id, (counts.get(job.id) || 0) + 1));
    const used = new Set();
    return list.map(job => {
      let id = job.id && counts.get(job.id) === 1 ? job.id : '';
      if (!id) {
        const derived = ['job', job.name, job.dateTitle || job.dateLabel, job.state]
          .map(part => String(part || '').trim()).filter(Boolean).join('|');
        id = derived || job.id || 'job';
      }
      if (used.has(id)) {
        let n = 2;
        while (used.has(id + '#' + n)) n++;
        id = id + '#' + n;
      }
      used.add(id);
      return { ...job, id };
    });
  }
  function groupJobs(jobs, recentMinutes = 15, now = Date.now()) {
    const current = [], recent = [], older = [];
    for (const job of jobs) {
      const uploaded = jobTimeMs(job, now);
      const age = now - uploaded;
      if (isCurrentJob(job)) current.push(job);
      else if (uploaded > 0 && age >= 0 && age <= recentMinutes * 60000) recent.push(job);
      else older.push(job);
    }
    recent.sort((a,b) => jobTimeMs(b, now) - jobTimeMs(a, now));
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
  function parseGcodeHeader(text) {
    const src = String(text || '').replace(/^\uFEFF/, '');
    const field = (names) => {
      for (const name of names) {
        const match = src.match(new RegExp('(?:^|\\n);\\s*' + name + '\\s*[=:]\\s*([^\\n]+)', 'i'));
        if (match) return match[1].trim();
      }
      return '';
    };
    const materialRaw = field(['filament_type', 'filament_type_0', 'material_type']) || (src.match(/MATERIAL\.0\.TYPE:([^\n]+)/i)?.[1] || '').trim() || (src.match(/"filament_type"\s*:\s*\[\s*"([^"]+)"/i)?.[1] || '').trim();
    const colorRaw = field(['filament_colour', 'filament_color', 'default_filament_colour', 'extruder_colour']) || (src.match(/MATERIAL\.0\.COLOR:([^\n]+)/i)?.[1] || '').trim() || (src.match(/"filament_colou?r"\s*:\s*\[\s*"([^"]+)"/i)?.[1] || '').trim();
    const material = materialRaw.split(/[;,]/)[0].trim();
    const colorToken = colorRaw.split(/[;,]/)[0].trim();
    const hex = colorToken.match(/#?([0-9a-f]{6})/i);
    let color = '';
    if (hex) {
      const n = parseInt(hex[1], 16);
      color = colorName('rgb(' + ((n >> 16) & 255) + ', ' + ((n >> 8) & 255) + ', ' + (n & 255) + ')');
    } else if (/^(black|white|gr[ae]y|red|orange|yellow|green|blue)$/i.test(colorToken)) {
      color = colorToken.toLowerCase() === 'grey' ? 'Gray' : colorToken.charAt(0).toUpperCase() + colorToken.slice(1).toLowerCase();
    }
    return { material, color, colorHex: hex ? '#' + hex[1].toUpperCase() : '', source: material || color ? 'gcode header' : '' };
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
  function printPercent(row){
    const shown=Number(row?.percent);
    if(row?.percent!=null&&row.percent!==''&&Number.isFinite(shown))return Math.max(0,Math.min(100,shown));
    const job=(row?.jobs||[]).find(isCurrentJob);
    const total=Number(job?.estimatedMinutes);
    const left=row?.minutes;
    const leftN=Number(left);
    // Number(null) is 0. A missing time left must not become "finished".
    if(left!=null&&left!==''&&Number.isFinite(total)&&total>0&&Number.isFinite(leftN)&&leftN>=0&&leftN<=total)return Math.max(0,Math.min(100,(total-leftN)/total*100));
    return null;
  }
  // Eight LEDs. A running print always lights at least one, and fills more as it finishes.
  function progressLeds(percent,count=8){
    const p=Number.isFinite(percent)?Math.max(0,Math.min(100,percent)):0;
    return Math.max(1,Math.min(count,Math.ceil(p/100*count)));
  }
  // mode: 0 steady, 1 pulse (flash bit; older modules blink), 2 chase, 3 rainbow, 4 sparkle.
  function lightCommands(rows,count=5,highlight='',effect=1,lightId=0){
    const palette={broken:[255,0,0],error:[255,0,0],paused:[255,120,0],offline:[110,0,180],unknown:[110,0,180],finished:[0,200,40],idle:[0,200,40],working:[0,70,255]};
    const fx=[0,1,2,3,4].includes(effect)?effect:1;
    const n=Math.max(0,Math.min(5,count));
    let target=Number(lightId);
    if(!(target>=1&&target<=n)&&highlight){
      const picked=rows.find(r=>String(r.id||r.name)===String(highlight));
      target=Number(picked?.config?.light)||0;
      if(!(target>=1&&target<=n))target=0;
    }
    return Array.from({length:n},(_,index)=>{
      const id=index+1,assigned=rows.filter(r=>Number(r.config?.light)===id),r=assigned.length===1?assigned[0]:null;
      const mode=target===id?fx:0;
      const info=r?statusInfo(r):null;
      const printing=info&&r.state==='printing'&&info.kind==='working';
      const lit=printing&&mode<2?progressLeds(printPercent(r)):0;
      return {id,rgb:r?palette[info.kind]:[0,0,0],lit,flash:mode===1?1:0,effect:mode>=2?mode:0,mode};
    });
  }
  return {status, recommend, isCurrentJob, jobTimeMs, sortJobsNewestFirst, assignUniqueJobIds, groupJobs, materialFamily, colorName, parseGcodeHeader, matchesFilament,statusInfo,triage,waitEstimate,nextPrinter,matchingPrinters,updateGroups,hardwareRow,lightCommands};
})();
