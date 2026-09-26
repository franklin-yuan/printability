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
  const SpeechRecognition=window.SpeechRecognition||window.webkitSpeechRecognition;
  let assistantEl=null,transcriptEl=null,commandInput=null,micBtn=null,recognition=null,listening=false,activePopup=null;
  const assistantLog=[];
  const host=document.createElement('div');host.id='farm-lights-panel';
  const shadow=host.attachShadow({mode:'open'});document.documentElement.append(host);
  const css=document.createElement('style');css.textContent=`
  :host{all:initial;
    --bg:#f5f8f6;--panel:#ffffff;--ink:#12332b;--muted:#5f7268;--line:#e6ede9;
    --brand:#12463a;--brand-2:#1f7d5a;--ai:#6d5efc;--ai-2:#22b8cf;--ai-soft:#efeaff;
    --radius:16px;--shadow:0 18px 50px rgba(16,50,40,.18);
    font:13.5px/1.5 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Inter,system-ui,sans-serif;
    color:var(--ink);position:fixed;right:18px;top:88px;z-index:2147483000;width:366px;max-width:calc(100vw - 36px)}
  *{box-sizing:border-box}
  .panel{background:var(--panel);border:1px solid var(--line);border-radius:var(--radius);box-shadow:var(--shadow);overflow:hidden}
  header{padding:15px 17px;background:linear-gradient(135deg,#12463a 0%,#1b6250 55%,#1f7d74 100%);color:#fff;display:flex;align-items:center;justify-content:space-between;gap:10px;position:relative}
  header::after{content:'';position:absolute;inset:0;background:radial-gradient(130px 70px at 88% -20%,rgba(109,94,252,.55),transparent 70%);pointer-events:none}
  .brand{display:flex;align-items:center;gap:10px;position:relative;z-index:1;min-width:0}
  .brand .spark{width:28px;height:28px;flex:0 0 28px;border-radius:9px;background:linear-gradient(135deg,var(--ai),var(--ai-2));display:grid;place-items:center;box-shadow:0 4px 14px rgba(109,94,252,.55);font-size:15px}
  .brand .btxt{min-width:0}
  h2{margin:0;font-size:18px;font-weight:700;letter-spacing:-.3px;line-height:1.1}
  .brand .tag{font-size:10.5px;letter-spacing:1px;text-transform:uppercase;color:#cfeee2;opacity:.85}
  h3{font-size:17px;margin:8px 0;font-weight:650;letter-spacing:-.2px}
  h4{margin:15px 0 8px;font-size:12px;text-transform:uppercase;letter-spacing:.7px;color:var(--muted);font-weight:700}
  p{line-height:1.55;margin:8px 0}
  button,select,input{font:inherit}
  button,select,input{border:1px solid var(--line);border-radius:10px;padding:8px 11px;background:#fff;color:var(--ink);transition:background .18s ease,border-color .18s ease,box-shadow .18s ease,transform .1s ease}
  button{cursor:pointer;font-weight:550}
  button:hover{background:#eef4f0;border-color:#cfe0d7}
  button:active{transform:translateY(1px)}
  button:disabled{opacity:.5;cursor:not-allowed}
  input:focus,select:focus,button:focus-visible{outline:none;border-color:var(--ai);box-shadow:0 0 0 3px rgba(109,94,252,.18)}
  header button{background:rgba(255,255,255,.16);border-color:rgba(255,255,255,.28);color:#fff;padding:6px 12px;font-size:12px;position:relative;z-index:1}
  header button:hover{background:rgba(255,255,255,.3)}
  .body{padding:16px;max-height:calc(100vh - 320px);overflow:auto;scroll-behavior:smooth}
  .tabs{display:flex;padding:8px;gap:6px;border-bottom:1px solid var(--line);background:#fbfdfc}
  .tabs button{flex:1;border:0;background:transparent;border-radius:9px;padding:8px 5px;font-size:12.5px;color:var(--muted);font-weight:600}
  .tabs button:hover{background:#eef4f0;color:var(--ink)}
  .tabs button[aria-selected=true]{background:linear-gradient(135deg,rgba(109,94,252,.16),rgba(34,184,207,.16));color:var(--brand);font-weight:750;box-shadow:inset 0 0 0 1px rgba(109,94,252,.22)}
  .muted{font-size:11.5px;color:var(--muted);line-height:1.5}
  .fields{display:flex;gap:9px;margin:12px 0}.fields label{flex:1}
  label{font-size:12px;display:block;margin:9px 0;font-weight:550}
  label select{display:block;width:100%;margin-top:5px}
  .result{background:linear-gradient(160deg,#f3f8f5,#eaf3ee);border:1px solid var(--line);border-radius:14px;padding:14px;margin:14px 0;box-shadow:0 3px 12px rgba(16,50,40,.05)}
  .item{padding:11px 0;border-top:1px solid var(--line)}
  .bad{color:#c0392b}.good{color:#1f7d5a}
  .wide{width:100%;margin:8px 0}
  details{margin:9px 0}summary{cursor:pointer;font-weight:600}
  a{color:var(--brand-2);text-decoration:none;font-weight:600}a:hover{text-decoration:underline}
  .pill{display:inline-block;font-size:11px;background:var(--ai-soft);color:#4b3fd0;border-radius:999px;padding:3px 9px;margin:3px 3px 3px 0}
  input[type=number]{width:70px;margin-left:8px}
  input[type=checkbox]{margin-right:7px;accent-color:var(--ai)}
  .row{display:flex;gap:8px;align-items:center}
  .swatch{width:11px;height:11px;border-radius:50%;display:inline-block;border:1px solid #9aa;margin-right:5px}
  /* Assistant footer */
  .assistant{border-top:1px solid var(--line);background:linear-gradient(180deg,#fbfcff,#f2f6fb);padding:12px 14px 13px}
  .a-head{display:flex;align-items:center;gap:9px;margin-bottom:9px}
  .a-head .dot{width:9px;height:9px;flex:0 0 9px;border-radius:50%;background:linear-gradient(135deg,var(--ai),var(--ai-2));box-shadow:0 0 0 4px rgba(109,94,252,.14)}
  .a-head .a-title{font-weight:750;font-size:12.5px;color:var(--brand)}
  .a-head .a-sub{font-size:10.5px;color:var(--muted);margin-left:auto}
  .transcript{max-height:134px;overflow:auto;display:flex;flex-direction:column;gap:7px;margin-bottom:10px;padding-right:2px}
  .transcript:empty{display:none}
  .msg{padding:8px 11px;border-radius:13px;font-size:12.5px;line-height:1.45;max-width:92%;white-space:pre-wrap;word-break:break-word}
  .msg.user{align-self:flex-end;background:linear-gradient(135deg,#12463a,#1f7d5a);color:#fff;border-bottom-right-radius:4px}
  .msg.bot{align-self:flex-start;background:#fff;border:1px solid var(--line);border-bottom-left-radius:4px;box-shadow:0 2px 6px rgba(16,50,40,.05)}
  .msg.bot.err{border-color:#f2c9c2;background:#fff4f2;color:#a23b2c}
  .a-form{display:flex;gap:8px;align-items:center}
  .a-form input[type=text]{flex:1;border-radius:12px;padding:10px 13px;min-width:0}
  .mic{width:42px;height:42px;flex:0 0 42px;padding:0;border-radius:13px;display:grid;place-items:center;background:linear-gradient(135deg,var(--ai),var(--ai-2));border:0;color:#fff;box-shadow:0 5px 14px rgba(109,94,252,.42)}
  .mic:hover{filter:brightness(1.06);background:linear-gradient(135deg,var(--ai),var(--ai-2))}
  .mic:disabled{background:#c9d2cd;box-shadow:none;filter:none}
  .mic.listening{animation:micpulse 1.15s infinite}
  .mic svg{width:19px;height:19px}
  .send{border-radius:12px;padding:10px 14px;font-weight:650}
  @keyframes micpulse{0%{box-shadow:0 0 0 0 rgba(109,94,252,.55)}70%{box-shadow:0 0 0 11px rgba(109,94,252,0)}100%{box-shadow:0 0 0 0 rgba(109,94,252,0)}}
  /* Modern print popup */
  .printy-modal-overlay{position:fixed;inset:0;background:rgba(9,24,19,.52);backdrop-filter:blur(3px);display:grid;place-items:center;z-index:2147483600;opacity:0;transition:opacity .2s ease;padding:20px}
  .printy-modal-overlay.open{opacity:1}
  .printy-modal{width:408px;max-width:calc(100vw - 40px);max-height:calc(100vh - 60px);overflow:auto;background:var(--panel);border-radius:20px;box-shadow:0 30px 90px rgba(0,0,0,.4);transform:translateY(14px) scale(.98);transition:transform .22s ease;border:1px solid var(--line)}
  .printy-modal-overlay.open .printy-modal{transform:none}
  .m-head{padding:18px 20px;background:linear-gradient(135deg,#12463a,#1f7d74);color:#fff;display:flex;justify-content:space-between;align-items:flex-start;gap:12px;position:relative;overflow:hidden}
  .m-head::after{content:'';position:absolute;inset:0;background:radial-gradient(170px 90px at 92% -20%,rgba(109,94,252,.6),transparent 70%);pointer-events:none}
  .m-head .mt{position:relative;z-index:1;min-width:0}
  .m-head .eyebrow{font-size:10.5px;letter-spacing:1.4px;text-transform:uppercase;opacity:.85;color:#d6f2e7}
  .m-head h3{margin:3px 0 0;font-size:21px;color:#fff;letter-spacing:-.3px}
  .m-head .m-state{font-size:12px;opacity:.92;margin-top:4px;text-transform:capitalize}
  .m-close{position:relative;z-index:1;background:rgba(255,255,255,.18);border:0;color:#fff;width:32px;height:32px;flex:0 0 32px;border-radius:10px;font-size:17px;line-height:1}
  .m-close:hover{background:rgba(255,255,255,.32)}
  .m-body{padding:18px 20px}
  .m-row{display:flex;justify-content:space-between;gap:12px;padding:11px 0;border-bottom:1px solid var(--line)}
  .m-row .k{color:var(--muted);font-size:12px}
  .m-row .v{font-weight:650;text-align:right}
  .m-wait{margin:15px 0;padding:15px;border-radius:15px;background:linear-gradient(160deg,var(--ai-soft),#eafaf3);border:1px solid #e4e0ff}
  .m-wait .lbl{font-size:11px;letter-spacing:.6px;text-transform:uppercase;color:#5a51c9;font-weight:700}
  .m-wait .big{font-size:27px;font-weight:750;letter-spacing:-.5px;margin-top:2px}
  .m-wait .sub{font-size:11.5px;color:var(--muted);margin-top:4px;line-height:1.45}
  .sim-note{margin:14px 0;padding:11px 13px;border-radius:12px;background:#fff8ec;border:1px solid #f3e2bf;color:#8a5a12;font-size:12px;line-height:1.5}
  .m-actions{display:flex;flex-direction:column;gap:11px;margin-top:8px}
  .bed{display:flex;align-items:flex-start;gap:9px;font-size:12.5px;background:#f4f7f5;padding:11px 12px;border-radius:12px;border:1px solid var(--line)}
  .m-start{background:linear-gradient(135deg,var(--ai),var(--ai-2));color:#fff;border:0;padding:13px;border-radius:14px;font-weight:750;font-size:14px;box-shadow:0 8px 22px rgba(109,94,252,.36)}
  .m-start:hover:not(:disabled){filter:brightness(1.05);background:linear-gradient(135deg,var(--ai),var(--ai-2))}
  .m-start:disabled{background:#c9d2cd;box-shadow:none;color:#fff}
  .m-done{margin-top:4px;padding:12px 13px;border-radius:12px;background:#eef9f1;border:1px solid #cdeed6;color:#1f7d5a;font-size:12.5px;line-height:1.5}
  .badge{display:inline-block;padding:4px 11px;border-radius:999px;font-size:11px;font-weight:700}
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
    panel.replaceChildren();const header=el('header');
    const brand=el('div',undefined,'brand');const spark=el('div','✦','spark');spark.setAttribute('aria-hidden','true');const btxt=el('div',undefined,'btxt');btxt.append(el('h2',demo?'Printy · Demo':'Printy'),el('div','AI companion','tag'));brand.append(spark,btxt);
    header.append(brand,button(collapsed?'Open':'Minimize',()=>{collapsed=!collapsed;render();}));panel.append(header);if(collapsed)return;
    const tabs=el('nav',undefined,'tabs');tabs.setAttribute('role','tablist');Object.entries({overview:'Start print',next:'Next steps',updates:'Updates',settings:'Settings'}).forEach(([v,label])=>{const b=button(label,()=>{view=v;render();});b.setAttribute('role','tab');b.setAttribute('aria-selected',String(view===v));tabs.append(b);});panel.append(tabs);
    const body=el('div',undefined,'body');panel.append(body);panel.append(buildAssistant());
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
      const acts=el('div',undefined,'row');acts.style.marginTop='10px';acts.append(button('Show printer',()=>highlightCard(r)),button('Start print',()=>{highlightCard(r);openPrintPopup(r,{mat:material,col:color});}));box.append(acts);
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
  /* ---- Assistant: shared voice + text command parser reusing logic.js rules ---- */
  function escapeRegex(s){return String(s).replace(/[.*+?^${}()|[\]\\]/g,'\\$&');}
  function parseFilament(text){
    const t=' '+text.toLowerCase()+' ';let mat='',col='';
    for(const m of materials)if(m!=='Other'&&new RegExp('\\b'+escapeRegex(m.toLowerCase())+'\\b').test(t))mat=m;
    for(const c of colors)if(c!=='Other'&&new RegExp('\\b'+escapeRegex(c.toLowerCase())+'\\b').test(t))col=c;
    if(!col&&/\bgrey\b/.test(t))col='Gray';
    return {mat,col};
  }
  function parseName(text){
    const t=' '+text.toLowerCase()+' ';
    return rows.find(r=>r.name&&new RegExp('\\b'+escapeRegex(r.name.toLowerCase())+'\\b').test(t))||null;
  }
  function pickByFilament(mat,col){
    const {next}=FarmLightsLogic.nextPrinter(rows,mat,col,settings.collectionMinutes);
    if(next)return next.row;
    const rec=FarmLightsLogic.recommend(rows,mat,col,broken);
    if(rec.length)return rec[0];
    const any=rows.filter(r=>!r.ambiguous&&!broken(r)&&FarmLightsLogic.matchesFilament(r,mat,col)).sort((a,b)=>a.name.localeCompare(b.name,undefined,{numeric:true}));
    return any[0]||null;
  }
  function cardFor(row){return (!demo&&globalThis.PrintyGrid&&PrintyGrid.elementFor(row.id))||row.card||null;}
  function highlightCard(row){
    const card=cardFor(row);if(!card)return;
    card.scrollIntoView({behavior:'smooth',block:'center'});
    try{card.animate([
      {boxShadow:'0 0 0 0 rgba(109,94,252,0)',offset:0},
      {boxShadow:'0 0 0 6px rgba(109,94,252,.5)',offset:.5},
      {boxShadow:'0 0 0 0 rgba(109,94,252,0)',offset:1}
    ],{duration:1200,iterations:2,easing:'ease-out'});}catch{}
  }
  function assistantSay(text,kind){assistantLog.push({text,kind:kind||'bot'});if(assistantLog.length>40)assistantLog.shift();renderTranscript();}
  function renderTranscript(){
    if(!transcriptEl)return;transcriptEl.replaceChildren();
    assistantLog.forEach(m=>transcriptEl.append(el('div',m.text,'msg '+(m.kind==='err'?'bot err':m.kind==='user'?'user':'bot'))));
    transcriptEl.scrollTop=transcriptEl.scrollHeight;
  }
  function handleCommand(raw){
    const text=(raw||'').trim();if(!text)return;
    assistantSay(text,'user');
    if(!rows.length){assistantSay('No printers are loaded yet — open the Printers dashboard, then try again.','err');return;}
    const nameHit=parseName(text);
    const {mat,col}=parseFilament(text);
    if(nameHit){assistantSay(`Showing ${nameHit.name}.`,'bot');highlightCard(nameHit);openPrintPopup(nameHit,{});return;}
    if(mat||col){
      if(mat)material=mat;if(col)color=col;
      const label=[mat,col].filter(Boolean).join(' ')||'that filament';
      const row=pickByFilament(mat,col);
      changed();
      if(!row){assistantSay(`I couldn't find a printer loaded with ${label}. Try different filament, or set a fallback in Settings.`,'err');return;}
      const est=FarmLightsLogic.waitEstimate(row,settings.collectionMinutes);
      assistantSay(`Best match for ${label}: ${row.name} — ${est.label}. Opening the print popup.`,'bot');
      highlightCard(row);openPrintPopup(row,{mat,col});
      return;
    }
    assistantSay('I can find a printer by filament (e.g. \u201Cfind a PLA blue printer\u201D) or by name (e.g. \u201Cshow me Remy\u201D).','bot');
  }
  function micIcon(){
    const ns='http://www.w3.org/2000/svg';const svg=document.createElementNS(ns,'svg');
    for(const [k,v] of Object.entries({viewBox:'0 0 24 24',fill:'none',stroke:'currentColor','stroke-width':'2','stroke-linecap':'round','stroke-linejoin':'round','aria-hidden':'true'}))svg.setAttribute(k,v);
    const mk=(tag,attrs)=>{const n=document.createElementNS(ns,tag);for(const k in attrs)n.setAttribute(k,attrs[k]);return n;};
    svg.append(mk('rect',{x:9,y:2,width:6,height:12,rx:3}),mk('path',{d:'M5 10v1a7 7 0 0 0 14 0v-1'}),mk('line',{x1:12,y1:19,x2:12,y2:22}),mk('line',{x1:8,y1:22,x2:16,y2:22}));
    return svg;
  }
  function toggleListening(){
    if(!SpeechRecognition){assistantSay('Voice input is not available in this browser. Type a command instead.','err');return;}
    if(listening){try{recognition&&recognition.stop();}catch{}return;}
    try{
      recognition=new SpeechRecognition();recognition.lang='en-US';recognition.interimResults=false;recognition.maxAlternatives=1;
      recognition.onstart=()=>{listening=true;micBtn&&micBtn.classList.add('listening');assistantSay('Listening\u2026 say a command like \u201Cfind a PLA blue printer\u201D.','bot');};
      recognition.onresult=e=>{const said=e.results?.[0]?.[0]?.transcript||'';if(commandInput)commandInput.value=said;if(said.trim())handleCommand(said);};
      recognition.onerror=e=>{const err=e?.error;const msg=err==='not-allowed'||err==='service-not-allowed'?'Microphone permission was blocked. Use the text box instead.':err==='no-speech'?'I didn\u2019t catch that \u2014 try again or type your command.':'Voice input error ('+(err||'unknown')+'). Type your command instead.';assistantSay(msg,'err');};
      recognition.onend=()=>{listening=false;micBtn&&micBtn.classList.remove('listening');};
      recognition.start();
    }catch(err){listening=false;micBtn&&micBtn.classList.remove('listening');assistantSay('Could not start voice input. Type your command instead.','err');}
  }
  function buildAssistant(){
    if(assistantEl)return assistantEl;
    const wrap=el('div',undefined,'assistant');
    const head=el('div',undefined,'a-head');
    head.append(el('span',undefined,'dot'),el('span','Assistant','a-title'),el('span',SpeechRecognition?'voice + text':'text mode','a-sub'));
    transcriptEl=el('div',undefined,'transcript');transcriptEl.setAttribute('role','log');transcriptEl.setAttribute('aria-live','polite');
    const form=el('form',undefined,'a-form');form.setAttribute('role','search');
    commandInput=el('input');commandInput.type='text';commandInput.placeholder='Ask: \u201Cfind a PLA blue printer\u201D';commandInput.setAttribute('aria-label','Assistant command');
    micBtn=el('button');micBtn.type='button';micBtn.className='mic';const micLabel=SpeechRecognition?'Speak a command':'Voice input unavailable \u2014 type instead';micBtn.setAttribute('aria-label',micLabel);micBtn.title=micLabel;micBtn.append(micIcon());
    if(!SpeechRecognition)micBtn.disabled=true;else micBtn.onclick=toggleListening;
    const send=el('button','Send','send');send.type='submit';
    form.append(commandInput,micBtn,send);
    form.addEventListener('submit',e=>{e.preventDefault();const v=commandInput.value;commandInput.value='';handleCommand(v);});
    wrap.append(head,transcriptEl,form);
    assistantEl=wrap;renderTranscript();
    return assistantEl;
  }
  /* ---- Modern print popup (redesigned start-print modal, advisory only) ---- */
  function closePopup(){if(activePopup){const o=activePopup;activePopup=null;o.classList.remove('open');setTimeout(()=>o.remove(),200);}}
  function matchedSlotText(row,mat,col){
    if(row.slotsKnown){
      const slot=row.slots.find(s=>(!mat||FarmLightsLogic.materialFamily(s.material)===FarmLightsLogic.materialFamily(mat))&&(!col||s.color===col))||row.slots[0];
      if(!slot)return 'No loaded filament reported';
      return `Slot ${slot.slot}: ${slot.material}${slot.color?' \u00b7 '+slot.color:''}`;
    }
    return [row.config.material,row.config.color].filter(Boolean).join(' \u00b7 ')||'Filament not read yet';
  }
  function openPrintPopup(row,opts={}){
    closePopup();
    const overlay=el('div',undefined,'printy-modal-overlay');overlay.setAttribute('role','dialog');overlay.setAttribute('aria-modal','true');overlay.setAttribute('aria-label',`Start print — ${row.name}`);
    const modal=el('div',undefined,'printy-modal');
    const head=el('div',undefined,'m-head');const mt=el('div',undefined,'mt');
    mt.append(el('div','Start print \u00b7 simulated','eyebrow'),el('h3',row.name),el('div',`Status: ${row.state}`,'m-state'));
    const close=el('button','\u2715','m-close');close.type='button';close.setAttribute('aria-label','Close');close.onclick=closePopup;
    head.append(mt,close);
    const bodyM=el('div',undefined,'m-body');
    const assessment=FarmLightsLogic.triage(row);
    const stateRow=el('div',undefined,'m-row');const badge=el('span',assessment.label,'badge');badge.style.color=tones[assessment.kind];badge.style.background=tones[assessment.kind]+'1e';stateRow.append(el('span','Assessment','k'),badge);bodyM.append(stateRow);
    const slotRow=el('div',undefined,'m-row');slotRow.append(el('span','Matched filament','k'),el('span',matchedSlotText(row,opts.mat,opts.col),'v'));bodyM.append(slotRow);
    const est=FarmLightsLogic.waitEstimate(row,settings.collectionMinutes);
    const wait=el('div',undefined,'m-wait');wait.append(el('div','Wait to start','lbl'),el('div',est.minutes===0?'Ready now':est.minutes!=null?`~${est.minutes} min`:'Unknown','big'),el('div',est.note||est.label,'sub'));
    bodyM.append(wait);
    bodyM.append(el('div','Simulated action only. Printy is advisory and never controls hardware or starts/resumes a print. Start the job in 3DPrinterOS after confirming the printer is ready.','sim-note'));
    const actions=el('div',undefined,'m-actions');
    const bed=el('label',undefined,'bed');const bedChk=el('input');bedChk.type='checkbox';bed.append(bedChk,document.createTextNode('I confirm the print bed is clear and the printer is ready.'));
    const start=el('button','Simulate start print','m-start');start.type='button';start.disabled=true;
    bedChk.onchange=()=>{start.disabled=!bedChk.checked;};
    start.onclick=()=>{actions.replaceChildren(el('div',`Simulated: a print for ${row.name} would be queued here. No command was sent \u2014 start it in 3DPrinterOS.`,'m-done'));assistantSay(`Simulated start for ${row.name} (advisory only \u2014 no hardware was controlled).`,'bot');};
    actions.append(bed,start);bodyM.append(actions);
    modal.append(head,bodyM);overlay.append(modal);
    overlay.addEventListener('click',e=>{if(e.target===overlay)closePopup();});
    overlay.addEventListener('keydown',e=>{if(e.key==='Escape')closePopup();});
    shadow.append(overlay);activePopup=overlay;
    requestAnimationFrame(()=>overlay.classList.add('open'));
    setTimeout(()=>{try{close.focus();}catch{}},30);
  }
  (async()=>{try{const stored=globalThis.chrome?.runtime?.id?(await chrome.runtime.sendMessage({type:'get-settings',key})).value:JSON.parse(localStorage.getItem(key)||'null');if(stored?.printers)settings={...settings,...stored};}catch{}scan();setInterval(scan,1500);window.addEventListener('hashchange',changed);})();
})();
