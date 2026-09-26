(() => {
  if(window.top!==window)return;
  if(document.getElementById('farm-lights-panel'))return;
  const demo=document.documentElement.dataset.farmLightsDemo==='true';
  const key=`farm-lights:${demo?'demo':'3dprinteros'}:v1`;
  const defaults=['Crane','Link','Tigress','Po'];
  const materials=['PLA','PETG','ABS','ASA','TPU','Other'], colors=['Black','White','Gray','Red','Orange','Yellow','Green','Blue','Other'];
  let settings={printers:{},lightCount:4,recentMinutes:15,collectionMinutes:5,autoNotifications:true,autoAI:false}, rows=[], material='',color='',view='overview',collapsed=false;
  let summaryExpanded=false;
  const updates=[];
  let signature='', ai=null,aiError='',busy=false,collecting=false,collectionNote='',openedJob=null;
  let collectionTask=null,nextCollectionAt=Date.now()+5000,collectionCancelled=false;
  const logCoverage=new Map();
  const changeTracker=new PrintyChanges.Tracker();let nextAutoAt=0,autoBusy=false,toast=null;
  const detailCache=new Map(), logCache=new Map(), mounted=new Map(), settingsOpen=new Set();
  let saveQueue=Promise.resolve();
  const host=document.createElement('div');host.id='farm-lights-panel';
  const shadow=host.attachShadow({mode:'open'});document.documentElement.append(host);
  const css=document.createElement('style');css.textContent=`
  :host{all:initial;font:13px system-ui;color:#193d34;position:fixed;right:18px;top:90px;z-index:2147483000;width:350px;max-width:calc(100vw - 36px)}*{box-sizing:border-box}
  .panel{background:#fbfdfb;border:1px solid #c1d3c8;border-radius:15px;box-shadow:0 12px 40px #17372c22;overflow:hidden}header{padding:14px 16px;background:#153f34;color:white;display:flex;align-items:center;justify-content:space-between}h2{margin:0;font-size:20px}h3{font-size:19px;margin:7px 0}h4{margin:12px 0 8px}p{line-height:1.5;margin:8px 0}button,select,input{font:inherit}button,select,input{border:1px solid #bbcec1;border-radius:7px;padding:7px;background:white;color:#214c3d}button{cursor:pointer}button:hover{background:#eaf3ed}button:disabled{opacity:.5;cursor:wait}.body{padding:15px;max-height:calc(100vh - 205px);overflow:auto}.tabs{display:flex;padding:7px;gap:6px;border-bottom:1px solid #dde8df}.tabs button{flex:1;border:0}.tabs button[aria-selected=true]{background:#dfede4;font-weight:700}.muted{font-size:11px;color:#63766a;line-height:1.5}.fields{display:flex;gap:8px;margin:12px 0}.fields label{flex:1}label{font-size:12px;display:block;margin:9px 0}label select{display:block;width:100%;margin-top:4px}.result{background:#e4f0e8;border-radius:10px;padding:13px;margin:14px 0}.item{padding:10px 0;border-top:1px solid #e0e8e1}.bad{color:#aa3333}.good{color:#24614a}.wide{width:100%;margin:6px 0}details{margin:8px 0}summary{cursor:pointer;font-weight:600}a{color:#196951}.pill{display:inline-block;font-size:11px;background:#e8eee9;border-radius:4px;padding:2px 5px;margin:3px}input[type=number]{width:65px;margin-left:8px}input[type=checkbox]{margin-right:6px}.row{display:flex;gap:7px;align-items:center}.swatch{width:10px;height:10px;border-radius:50%;display:inline-block;border:1px solid #777;margin-right:4px}
  `;shadow.append(css);
  const panel=document.createElement('section');panel.className='panel';shadow.append(panel);
  const openSections=new Set();let savedScroll={overview:0,next:0,updates:0,settings:0},renderedView='overview',pendingRender=false;
  shadow.addEventListener('focusout',()=>{setTimeout(()=>{if(pendingRender)render();},0);});
  function el(tag,text,cls){const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;}
  function button(label,action,cls){const b=el('button',label,cls);b.type='button';b.onclick=action;return b;}
  function select(label,values,value,change,empty='Any'){const l=el('label',label),s=el('select');s.setAttribute('aria-label',label);s.add(new Option(empty,''));values.forEach(v=>s.add(new Option(v,v)));s.value=String(value||'');s.onchange=()=>change(s.value);l.append(s);return l;}
  function save(){const value=JSON.parse(JSON.stringify(settings));saveQueue=saveQueue.then(async()=>{try{if(globalThis.chrome?.runtime?.id){const r=await chrome.runtime.sendMessage({type:'save-settings',key,value});if(!r?.ok)throw Error('Save failed');}else localStorage.setItem(key,JSON.stringify(value));}catch{aiError='Could not save settings. Reload this page after updating the extension.';render();}});}
  function config(name,card){if(!Object.hasOwn(settings.printers,name))Object.defineProperty(settings.printers,name,{enumerable:true,writable:true,configurable:true,value:{material:demo?card?.dataset.demoMaterial||'':'',color:demo?card?.dataset.demoColor||'':'',broken:false,light:defaults.indexOf(name)+1||0}});return settings.printers[name];}
  const broken=r=>r.config.broken===true;
  const changed=()=>{signature='';scan();};
  const fresh=j=>j&&Date.now()-j.observedAt<300000;
  const tones={fatal:'#a51b2b',fault:'#bb3427',broken:'#96304f',paused:'#9a6000',recoverable:'#087c80',offline:'#66578c',unknown:'#637080',finished:'#23753b',idle:'#23753b',working:'#3065a5'};
  function scan(){
    const disconnected=demo&&document.documentElement.dataset.demoDisconnected==='true';
    let found=[];
    if(!demo&&location.hash.startsWith('#/printers')){
      found=PrintySource.printers(document);
      found.forEach(r=>detailCache.set(r.name,{...r,observedAt:Date.now()}));
    }else if(demo||location.hash.startsWith('#/live-wall')){
      found=[...document.querySelectorAll('.live-view-wall-camera')].map(card=>{
        const name=card.querySelector('.live-view-wall-printer-name strong')?.textContent.trim();if(!name)return null;
        const cached=detailCache.get(name),usable=cached&&Date.now()-cached.observedAt<120000;
        let jobs=[];if(demo&&!disconnected){try{jobs=JSON.parse(card.dataset.demoJobs||'[]');}catch{}}
        return {name,id:usable?cached.id:name,card,raw:PrintySource.badge(card),jobs:demo?jobs:usable?cached.jobs:[],slotsKnown:usable?cached.slotsKnown:false,slots:usable?cached.slots:[],minutes:demo?Number(card.dataset.demoMinutes)||null:null};
      }).filter(Boolean);
    }
    rows=found.map(r=>({...r,config:config(r.name,r.card),state:disconnected?'unknown':FarmLightsLogic.status(r.raw)}));
    const counts=new Map();rows.forEach(r=>counts.set(r.name,(counts.get(r.name)||0)+1));rows.forEach(r=>{r.ambiguous=counts.get(r.name)>1;if(r.ambiguous)r.state='unknown';});
    const captured=collecting?null:PrintyJobs.capture(document,rows.map(r=>r.name));
    if(captured){openedJob=captured;logCache.set(captured.printer,captured);}
    rows.forEach(r=>{r.log=logCache.get(r.name);const active=r.jobs.find(FarmLightsLogic.isCurrentJob);if(fresh(r.log)&&r.log.currentJobVerified&&active?.name===r.log.file&&(!r.log.jobId||String(active.id)===r.log.jobId)&&r.state===r.log.phase)r.minutes=r.log.availabilityMinutes;});
    for(const [card,node]of mounted)if(!rows.some(r=>r.card===card)){node.remove();mounted.delete(card);}
    if(!demo&&location.hash.startsWith('#/printers'))PrintyGrid.sync(rows,{recentMinutes:settings.recentMinutes,collectionMinutes:settings.collectionMinutes,fresh});else if(!demo)PrintyGrid.restore();
    checkChanges();
    if(!demo&&!busy&&!autoBusy&&!collecting&&rows.length&&location.hash.startsWith('#/printers')&&Date.now()>=nextCollectionAt){
      nextCollectionAt=Date.now()+300000;void collectLogs();
    }
    const sig=JSON.stringify([settings,material,color,disconnected,rows.map(({card,jobs,log,...r})=>({...r,jobs:jobs.map(({element,...j})=>j),log:log?{...log,observedAt:undefined,stale:!fresh(log)}:null})),openedJob?{...openedJob,observedAt:undefined,stale:!fresh(openedJob)}:null]);
    if(sig===signature)return;
    signature=sig;if(demo||!location.hash.startsWith('#/printers'))rows.forEach(updateCard);render();
  }
  // Compare facts that affect advice, not percentage ticks, read timestamps or light assignments.
  function summaryKey(){
    return JSON.stringify({material,color,printers:rows.map(r=>{
      const j=fresh(r.log)?r.log:null, groups=FarmLightsLogic.groupJobs(r.jobs,settings.recentMinutes);
      return {id:String(r.id||r.name),state:r.state,broken:broken(r),ambiguous:r.ambiguous,
        slots:r.slotsKnown?r.slots:[{material:r.config.material,color:r.config.color}],
        current:groups.current.map(x=>x.name).sort(),recent:groups.recent.map(x=>x.name).sort(),
        log:j?{phase:j.phase,fault:j.fault,latest:j.latest,current:j.currentJobVerified}:null};
    }).sort((a,b)=>a.id.localeCompare(b.id))});
  }
  function slotDescription(r){return r.slotsKnown?(r.slots.length?r.slots.map(s=>`${s.material} · ${s.color||'color unknown'} (slot ${s.slot})`).join('; '):'No loaded filament reported'):[r.config.material,r.config.color].filter(Boolean).join(' · ')||'Filament not read yet';}
  function logEvidence(container,j){
    container.append(el('p',`${j.printer} · ${j.phase} · ${fresh(j)?'read just now':'earlier reading'}`));
    if(j.fault)container.append(el('p',`${j.faultHistorical?'Earlier fault':'Reported fault'}: ${j.fault.message}`,'bad'),el('p',j.fault.timestamp,'muted'));
    if(j.latest)container.append(el('p',j.latest.message,'muted'));
    if(j.timeMinutes!==null)container.append(el('p',`Reported print time remaining: ${j.timeMinutes} min. ${j.phase==='paused'?'Availability unknown while paused.':'Collection and bed clearance are extra.'}`,'muted'));
    container.append(el('p','Log observations apply to the opened job; historical faults do not prove a current failure.','muted'));
  }
  function updateCard(r){
    let node=mounted.get(r.card);if(!node||!node.isConnected){node=el('div');node.dataset.farmLightsOverlay='true';node.attachShadow({mode:'open'});r.card.append(node);mounted.set(r.card,node);}
    const root=node.shadowRoot,expanded=[...root.querySelectorAll('details')].map(d=>d.open);root.replaceChildren();const style=el('style');style.textContent=':host{display:block;flex-basis:100%;font:12px system-ui;color:#315348}.line{padding:8px 12px;background:#f1f6f2;border-top:1px solid #dce8df}.bad{color:#a22f2f}details{margin-top:5px}summary{cursor:pointer}p{margin:5px 0;line-height:1.4}.muted{font-size:11px;color:#69766e}';root.append(style);
    const box=el('div',undefined,'line');root.append(box);
    box.append(el('b',broken(r)?'BROKEN · local override':`Printy · ${r.state}`,broken(r)?'bad':''),el('p',slotDescription(r),'muted'));
    const task=FarmLightsLogic.triage(r);box.style.borderLeft=`5px solid ${tones[task.kind]}`;box.append(el('b',task.label),el('p',task.action));
    if(r.log?.fault&&fresh(r.log))box.append(el('p',`${r.log.faultHistorical?'Earlier fault':'Reported fault'}: ${r.log.fault.message}`,'bad'));
    if(r.minutes&&r.state==='printing')box.append(el('p',`Reported remaining: ${r.minutes} min + collection`,'muted'));
    // Existing source job controls remain untouched; details are collapsed by default.
    const details=el('details');details.append(el('summary',`Files & evidence (${r.jobs.length})`));
    if(r.log)logEvidence(details,r.log);
    const groups=FarmLightsLogic.groupJobs(r.jobs,settings.recentMinutes);
    details.append(el('p',`Current: ${groups.current.map(j=>j.name).join(', ')||'none read'}`));
    details.append(el('p',`Recent (${settings.recentMinutes} min): ${groups.recent.map(j=>j.name).join(', ')||'none read'}`));
    const all=el('details');all.append(el('summary',`All files (${r.jobs.length})`));r.jobs.forEach(j=>all.append(el('p',`${j.name} · ${j.state}`)));details.append(all);
    if(!demo){const a=el('a','Printers page: files, AMS and logs');a.href='#/printers';details.append(a);}
    box.append(details);
    root.querySelectorAll('details').forEach((d,i)=>{if(expanded[i]!==undefined)d.open=expanded[i];});
  }
  function render(){
    const active=shadow.activeElement;
    if(active&&panel.contains(active)&&active.matches('input,select,textarea')){pendingRender=true;return;}
    pendingRender=false;
    const previousBody=panel.querySelector('.body');if(previousBody)savedScroll[renderedView]=previousBody.scrollTop;
    panel.querySelectorAll('details[data-section]').forEach(d=>{if(d.open)openSections.add(d.dataset.section);else openSections.delete(d.dataset.section);});
    renderedView=view;
    panel.replaceChildren();const header=el('header');header.append(el('h2',demo?'Printy · Demo':'Printy'),button(collapsed?'Open':'Minimize',()=>{collapsed=!collapsed;render();}));panel.append(header);if(collapsed)return;
    const tabs=el('nav',undefined,'tabs');tabs.setAttribute('role','tablist');Object.entries({overview:'Start print',next:'Next steps',updates:'Updates',settings:'Settings'}).forEach(([v,label])=>{const b=button(label,()=>{view=v;render();});b.setAttribute('role','tab');b.setAttribute('aria-selected',String(view===v));tabs.append(b);});panel.append(tabs);
    const body=el('div',undefined,'body');panel.append(body);
    if(view==='settings'){renderSettings(body);body.scrollTop=savedScroll[view];return;}
    if(view==='overview'){renderStart(body);body.scrollTop=savedScroll[view];return;}
    if(view==='updates'){renderUpdates(body);body.scrollTop=savedScroll[view];return;}
    const urgent=FarmLightsLogic.priorities(rows);
    body.append(el('h3','What needs attention'));
    if(!urgent.length)body.append(el('p','No intervention indicated by the available status.'));
    urgent.forEach((task,i)=>{const item=el('section',undefined,'result');item.style.borderLeft=`5px solid ${tones[task.kind]}`;item.append(el('b',`${i+1}. ${task.row.name} · ${task.label}`),el('p',task.action),el('p',task.reason,'muted'));body.append(item);});
    body.append(el('h4','AI advice'));
    if(ai){
      const stale=ai.sourceKey!==summaryKey();
      const summary=el('section',undefined,'result');summary.setAttribute('aria-label','AI summary snapshot');
      summary.append(el('div',`Snapshot · ${new Date(ai.at).toLocaleTimeString()}`,'muted'),el('p',ai.summary));
      if(stale)summary.append(el('p','Updated status available. This advice describes an earlier snapshot; check Start print for availability.','muted'));
      const details=el('details');details.open=summaryExpanded;
      const first=[...ai.suggestions].sort((a,b)=>({high:0,medium:1,low:2}[a.priority]??2)-({high:0,medium:1,low:2}[b.priority]??2))[0];
      if(first)summary.append(el('b',`Suggested first: ${first.printerName} · ${first.title}`));
      details.append(el('summary',`Details & next steps (${ai.suggestions.length})`));
      details.addEventListener('toggle',()=>{if(details.isConnected)summaryExpanded=details.open;});
      [...ai.suggestions].sort((a,b)=>({high:0,medium:1,low:2}[a.priority]??2)-({high:0,medium:1,low:2}[b.priority]??2)).forEach(s=>{const n=el('div',undefined,'item');n.style.borderLeft=`4px solid ${s.priority==='high'?'#bb3427':s.priority==='medium'?'#9a6000':'#637080'}`;n.style.paddingLeft='9px';n.append(el('b',`${s.priority||'Review'} · ${s.printerName} · ${s.title}`),el('p',s.reason));details.append(n);});
      ai.limitations.forEach(s=>details.append(el('p',s,'muted')));summary.append(details);body.append(summary);
    }else body.append(el('p','AI ranks what to address first and explains the next action using current job evidence. Connect OpenAI in Settings.','muted'));
    const analyze=button(busy?'Summarizing…':ai?'Refresh summary':'Analyze with OpenAI',analyzeFarm,'wide');analyze.disabled=busy||autoBusy||!rows.length;body.append(analyze);
    if(aiError)body.append(el('p',aiError,'bad'));
    const evidence=el('details');evidence.dataset.section='attention';evidence.open=openSections.has('attention');evidence.append(el('summary',`Attention & logs (${rows.filter(r=>broken(r)||['error','paused','offline','unknown'].includes(r.state)).length})`));
    rows.filter(r=>broken(r)||['error','paused','offline','unknown'].includes(r.state)).forEach(r=>evidence.append(el('p',`${r.name}: ${broken(r)?'BROKEN — inspect before use':r.state}`)));
    if(openedJob)logEvidence(evidence,openedJob);
    if(!demo){const b=button(collecting?'Stop reading logs':'Refresh all printer logs',()=>{if(collecting){collectionCancelled=true;return;}void collectLogs(true);},'wide');evidence.append(b,el('p','Logs are read in an isolated background page. If that page cannot load, missing logs stay unavailable.','muted'));
      rows.forEach(r=>{const c=logCoverage.get(r.name);evidence.append(el('p',`${r.name}: ${c?.status||'pending'}${c?.reason?' — '+c.reason:''}`,'muted'));});}
    evidence.append(el('p',`${rows.filter(r=>fresh(r.log)).length} of ${rows.length} printers have a recently read log. Logs and AMS follow navigation in this browser tab; page readings do not guarantee a fresh device feed.`,'muted'));body.append(evidence);
    body.scrollTop=savedScroll[view];
  }
  function renderStart(body){
    const compact=el('style');compact.textContent='.start-view .fields{margin:5px 0}.start-view label{margin:4px 0}.start-view .result{margin:9px 0;padding:10px}.start-view h3{font-size:17px;margin:4px 0}.start-view p{margin:4px 0}.urgent-item{padding:7px 9px;border-left:4px solid;margin:6px 0;background:#fff8f3}.urgent-item p{font-size:12px;line-height:1.35}';body.append(compact);body.classList.add('start-view');
    body.append(el('h3','Find a printer'));
    const fields=el('div',undefined,'fields');fields.append(select('Material',materials,material,v=>{material=v;changed();}),select('Color',colors,color,v=>{color=v;changed();}));body.append(fields);
    const {next,unknown}=FarmLightsLogic.nextPrinter(rows,material,color,settings.collectionMinutes);
    const box=el('section',undefined,'result');box.setAttribute('aria-label','Next printer wait');box.append(el('div','WAIT TO START','muted'));
    const value=el('div',next?next.minutes===0?'Ready now':`~${next.minutes} min`:'Unknown');value.style.cssText='font-size:36px;font-weight:750;letter-spacing:-1px;margin:4px 0';box.append(value);
    if(next){const r=next.row;box.append(el('h3',r.name),el('p',next.minutes===0?'Confirm the bed is clear before starting.':`Earliest reported finish for a matching printer, including ${settings.collectionMinutes} min for collection.`,'muted'));
      if(unknown&&next.minutes>0)box.append(el('p','Some matching printers have no estimate and could become available earlier.','muted'));
      box.append(button('Show printer',()=>{const card=(!demo&&PrintyGrid.elementFor(r.id))||r.card;card.scrollIntoView({behavior:'smooth',block:'center'});card.animate([{outline:'3px solid #38a873'},{outline:'3px solid transparent'}],{duration:1500});}));
    }else box.append(el('p',rows.length?'No matching printer has a reliable start estimate.':'Open the Printers page to read availability.'));
    body.append(box,el('p',`${rows.length} printers read · ${rows.filter(r=>broken(r)||['error','offline'].includes(r.state)).length} down · ${rows.filter(r=>r.state==='paused'&&!broken(r)).length} paused`,'muted'));
    const urgent=FarmLightsLogic.priorities(rows).filter(task=>task.rank>=40),section=el('section');section.setAttribute('aria-label','Urgent actions');section.append(el('h4','Urgent actions'));
    if(!urgent.length)section.append(el('p',rows.length?'No urgent action indicated.':'Waiting for printer status.','muted'));
    urgent.slice(0,2).forEach(task=>{const item=el('div',undefined,'urgent-item');item.style.borderColor=tones[task.kind];item.append(el('b',`${task.row.name} · ${task.label}`),el('p',task.action));section.append(item);});
    section.append(button(urgent.length>2?`All next steps (${urgent.length} need attention)`:'All next steps',()=>{view='next';render();}));body.append(section);
    if(!demo){const link=el('a','Open Printers dashboard');link.href='https://cloud.3dprinteros.com/#/printers';body.append(link);}
  }
  function appendUpdateGroups(container,events){
    const labels={down:['Now down','#bb3427'],paused:['Paused · check needed','#9a6000'],recovered:['Recovered','#23753b'],ready:['Ready / finished','#23753b'],other:['Other changes','#637080']};
    for(const [key,items]of Object.entries(FarmLightsLogic.updateGroups(events))){if(!items.length)continue;const section=el('section',undefined,'item');section.style.borderLeft=`4px solid ${labels[key][1]}`;section.style.paddingLeft='10px';section.append(el('b',`${labels[key][0]} (${items.length})`));items.forEach(e=>section.append(el('p',e.name),el('p',e.description,'muted')));container.append(section);}
  }
  function renderUpdates(body){
    body.append(el('h3','Printer updates'),el('p','What changed since this page was opened.','muted'));
    if(!settings.autoNotifications)body.append(el('p','Pop-up notifications are off. Enable them in Settings.','muted'));
    if(!updates.length)body.append(el('p','No major changes recorded yet.'));
    updates.forEach(batch=>{const item=el('section',undefined,'result');item.append(el('div',new Date(batch.at).toLocaleTimeString(),'muted'));appendUpdateGroups(item,batch.events);body.append(item);});
  }
  function renderSettings(body){
    body.append(el('h3','Farm settings'));
    body.append(el('h4','Notifications & AI'));
    const autoLabel=el('label'),autoCheck=el('input');autoCheck.type='checkbox';autoCheck.checked=settings.autoNotifications;autoCheck.onchange=()=>{settings.autoNotifications=autoCheck.checked;changeTracker.reset();if(!settings.autoNotifications){toast?.remove();toast=null;}save();changed();};autoLabel.append(autoCheck,document.createTextNode('Automatic major-change notifications'));body.append(autoLabel);
    const aiLabel=el('label'),aiCheck=el('input');aiCheck.type='checkbox';aiCheck.checked=settings.autoAI===true;aiCheck.onchange=()=>{settings.autoAI=aiCheck.checked;save();changed();};aiLabel.append(aiCheck,document.createTextNode('Allow automatic paid AI priorities (off by default)'));body.append(aiLabel);
    body.append(el('p','Local notifications do not use the API. Optional automatic AI is limited to 6 calls/day and 30 minutes apart across tabs. Manual Analyze/Refresh makes an additional paid call. Keep a dashboard tab open.','muted'));

    function number(label,prop,min,max){const l=el('label',label),n=el('input');n.type='number';n.min=min;n.max=max;n.value=settings[prop];n.setAttribute('aria-label',label);n.onchange=()=>{settings[prop]=Math.max(min,Math.min(max,Math.trunc(Number(n.value)||min)));if(prop==='lightCount')Object.values(settings.printers).forEach(c=>{if(c.light>settings.lightCount)c.light=0;});save();changed();};l.append(n);body.append(l);}
    body.append(el('h4','Wait estimates & files'));
    number('Collection buffer in minutes','collectionMinutes',0,60);
    number('Recent upload window in minutes','recentMinutes',1,120);
    body.append(el('h4','Lights & switches'));
    number('Physical light count','lightCount',0,32);
    body.append(el('p','Physical lights and switches are not connected yet.','muted'));
    body.append(el('p','All loaded printers are tracked. Assign only the lights you have. Old queue files never add waiting time.','muted'));
    const connect=button('Open AI connection settings',()=>{if(globalThis.chrome?.runtime?.id)chrome.runtime.sendMessage({type:'open-options'});else{aiError='Install the extension to connect the local OpenAI helper. The standalone demo has no API connection.';view='overview';render();}},'wide');body.append(connect);
    body.append(el('h4','Printer settings'),el('p','AMS data takes priority. Manual material/color are fallbacks when AMS is unavailable. BROKEN is a local prototype override.','muted'));
    rows.forEach(r=>{const d=el('details');d.open=settingsOpen.has(r.name);d.addEventListener('toggle',()=>{if(d.isConnected){if(d.open)settingsOpen.add(r.name);else settingsOpen.delete(r.name);}});d.append(el('summary',r.name),el('p',slotDescription(r),'muted'));function change(k,v){r.config[k]=v;save();changed();}
      d.append(select(`${r.name} fallback material`,materials,r.config.material,v=>change('material',v),'Unknown'),select(`${r.name} fallback color`,colors,r.config.color,v=>change('color',v),'Unknown'));
      d.append(select(`${r.name} assigned light`,Array.from({length:settings.lightCount},(_,i)=>String(i+1)),r.config.light,v=>{const id=Number(v);Object.values(settings.printers).forEach(c=>{if(id&&c.light===id)c.light=0;});change('light',id);},'None'));
      const l=el('label'),c=el('input');c.type='checkbox';c.checked=broken(r);c.disabled=r.ambiguous;c.onchange=()=>change('broken',c.checked);l.append(c,document.createTextNode(`${r.name} marked BROKEN locally`));d.append(l);body.append(d);
    });
    body.append(el('p','Settings persist in this browser by printer name. Recheck assignments when switching accounts or renaming printers.','muted'));
  }
  function buildSnapshot(capturedAt=Date.now()){
    return {source:demo?'simulation':'3dprinteros',capturedAt:new Date(capturedAt).toISOString(),request:{material,color},printers:rows.map(r=>{
        const groups=FarmLightsLogic.groupJobs(r.jobs,settings.recentMinutes),active=groups.current[0];
        const observed=fresh(r.log)?r.log:null;
        const verified=!!(observed?.currentJobVerified&&active?.name===observed.file&&(!observed.jobId||String(active.id)===String(observed.jobId))&&observed.phase===r.state);
        const j=observed?{...observed,currentJobVerified:verified,faultHistorical:observed.faultHistorical||!verified}:null;
        const c=logCoverage.get(r.name);
        const assessment=FarmLightsLogic.triage(r);
        return {id:String(r.id||r.name),name:r.name,state:r.state,broken:broken(r),assessment,eligible:FarmLightsLogic.recommend([r],material,color,broken).length===1,slots:r.slotsKnown?r.slots:[{material:r.config.material,color:r.config.color,source:'manual fallback'}],currentFiles:groups.current.map(x=>x.name),recentFiles:groups.recent.map(x=>x.name),currentEstimatedMinutes:groups.current[0]?.estimatedMinutes??null,remainingMinutes:r.state==='printing'?r.minutes??null:null,logStatus:j?'read':c?.status==='unavailable'?'unavailable':'not read or stale',logReason:c?.reason||'',log:j?{phase:j.phase,currentJobVerified:j.currentJobVerified,fault:j.fault,faultHistorical:j.faultHistorical,latest:j.latest,events:j.events,observedAt:j.observedAt}:null};})};
  }
  function showNotification(events){
    toast?.remove();toast=el('aside');toast.setAttribute('role','status');toast.setAttribute('aria-label','Printy notification');
    toast.style.cssText='position:fixed;left:24px;bottom:24px;width:380px;max-width:calc(100vw - 48px);padding:18px;background:#f7fcf8;color:#193d34;border:1px solid #bbcec1;border-radius:16px;box-shadow:0 8px 40px #1235;z-index:2147483647;font:14px system-ui';
    const groups=FarmLightsLogic.updateGroups(events);toast.style.borderLeft=`6px solid ${groups.down.length?'#bb3427':groups.paused.length?'#9a6000':'#23753b'}`;
    toast.style.maxHeight='65vh';toast.style.overflowY='auto';
    toast.append(el('b','Printer updates'),el('p',new Date().toLocaleTimeString(),'muted'));appendUpdateGroups(toast,events.slice(0,6));
    if(events.length>6)toast.append(el('p',`${events.length-6} more changes in Updates`,'muted'));
    toast.append(button('View updates',()=>{view='updates';collapsed=false;toast?.remove();toast=null;render();}),button('Dismiss',()=>{toast?.remove();toast=null;}));shadow.append(toast);
  }
  function checkChanges(){
    changeTracker.observe(rows);
    if(autoBusy||busy||collecting||Date.now()<nextAutoAt)return;
    const events=changeTracker.take();if(events.length){updates.unshift({at:Date.now(),events});updates.splice(20);if(settings.autoNotifications)void notifyChanges(events);else render();}
  }
  async function notifyChanges(events){
    autoBusy=true;nextAutoAt=Date.now()+300000;
    let capturedAt=Date.now(),requestedKey=summaryKey();
    const ordered=events.map(e=>{const r=rows.find(r=>String(r.id||r.name)===e.id);return {...e,...(r?FarmLightsLogic.triage(r):{})};}).sort((a,b)=>(b.rank||0)-(a.rank||0));
    events=ordered;
    if(updates[0])updates[0].events=ordered;
    showNotification(ordered);
    try{
      if(!globalThis.chrome?.runtime?.id)return;
      if(!demo){await collectLogs();scan();capturedAt=Date.now();requestedKey=summaryKey();}
      const reply=await chrome.runtime.sendMessage({type:'auto-analyze',snapshot:buildSnapshot(capturedAt),events});
      if(!settings.autoNotifications)return;
      if(reply?.result){ai={...reply.result,at:capturedAt,sourceKey:requestedKey};render();}
    }catch{ /* The local factual notification is already visible. */ }
    finally{autoBusy=false;render();}
  }
  async function analyzeFarm(){
    aiError='';if(!globalThis.chrome?.runtime?.id){aiError='Open this demo through the installed extension to use OpenAI.';render();return;}
    if(busy||autoBusy)return;
    busy=true;scan();render();
    try{
      if(!demo){await collectLogs();scan();}
      const requestedKey=summaryKey(),capturedAt=Date.now();
      const snapshot=buildSnapshot(capturedAt);
      const reply=await chrome.runtime.sendMessage({type:'analyze',snapshot});if(!reply?.ok)throw Error(reply?.error||'The helper did not respond.');ai={...reply.result,at:capturedAt,sourceKey:requestedKey};
    }catch(e){aiError=e.message;}finally{busy=false;render();}
  }
  async function collectLogs(force=false){
    if(collectionTask)return collectionTask;
    if(!rows.length)return;
    const targets=rows.filter(r=>{
      const c=logCoverage.get(r.name),job=PrintySource.logJob(r);
      return force||!c||Date.now()-c.checkedAt>=120000||c.state!==r.state||String(c.jobId)!==String(job?.id||null);
    }).sort((a,b)=>Number(!!b.jobs.find(FarmLightsLogic.isCurrentJob))-Number(!!a.jobs.find(FarmLightsLogic.isCurrentJob)));
    if(!targets.length)return;
    collecting=true;collectionCancelled=false;
    collectionTask=(async()=>{
      try{
        collectionNote='Loading background log reader…';render();
        const doc=await PrintyLogReader.backgroundDocument(()=>collectionCancelled);
        const backgroundRows=PrintySource.printers(doc);
        const selected=[];
        for(const target of targets){
          const matches=backgroundRows.filter(r=>r.name===target.name&&(String(r.id)===String(target.id)||String(target.id)===target.name));
          if(matches.length===1)selected.push({...matches[0],state:FarmLightsLogic.status(matches[0].raw)});
          else logCoverage.set(target.name,{status:'unavailable',reason:'Printer could not be matched in the background reader.',state:target.state,checkedAt:Date.now()});
        }
        const result=await PrintyLogReader.read(selected,{
          document:doc,capture:names=>PrintyJobs.capture(doc,names),cancelled:()=>collectionCancelled,
          onProgress:(name,n,total)=>{collectionNote=`Reading in background: ${name} (${n+1}/${total})`;render();},
          onResult:(r,c,j)=>{logCoverage.set(r.name,c);if(j){logCache.set(r.name,j);openedJob=j;}else logCache.delete(r.name);}
        });
        collectionNote=result.blocked?result.reason:`Checked ${result.checked} printers this pass; ${result.read} logs read. Missing logs are listed under Attention & logs.`;
        nextCollectionAt=Date.now()+(result.blocked||collectionCancelled?30000:120000);
      }catch(e){collectionNote=e.message||'Background logs unavailable.';for(const r of targets)logCoverage.set(r.name,{status:'unavailable',reason:collectionNote,state:r.state,checkedAt:Date.now()});nextCollectionAt=Date.now()+120000;}
      finally{collecting=false;PrintyLogReader.dispose();render();}
    })();
    try{await collectionTask;}finally{collectionTask=null;changed();}
  }
  (async()=>{try{const stored=globalThis.chrome?.runtime?.id?(await chrome.runtime.sendMessage({type:'get-settings',key})).value:JSON.parse(localStorage.getItem(key)||'null');if(stored?.printers)settings={...settings,...stored};}catch{}scan();setInterval(scan,1500);window.addEventListener('hashchange',changed);})();
})();
