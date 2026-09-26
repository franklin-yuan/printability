(() => {

  if(window.top!==window)return;

  if(document.getElementById('farm-lights-panel'))return;

  const demo=false; // Production dashboard only.

  const key='farm-lights:3dprinteros:v1';

  const defaults=[];

  const materials=['PLA','PETG','ABS','ASA','TPU','Other'], colors=['Black','White','Gray','Red','Orange','Yellow','Green','Blue','Other'];

  let settings={printers:{},lightCount:64,hardwareEnabled:false,recentMinutes:15,collectionMinutes:5,autoNotifications:true}, rows=[], material='',color='',view='overview',collapsed=false;

  let hardware={connected:false,modules:[]},hardwareAt=0,hardwareError='',hardwareBusy=false;

  const hardwareOwner=crypto.randomUUID();

  async function syncHardware(){

    if(!settings.hardwareEnabled||demo||hardwareBusy||!globalThis.chrome?.runtime?.id)return;

    hardwareBusy=true;

    try{const reply=await chrome.runtime.sendMessage({type:'hardware',payload:{owner:hardwareOwner,lights:FarmLightsLogic.lightCommands(rows,hardware.maxLights||6)}});if(!reply?.ok||!reply.hardware)throw Error(reply?.error||'Helper unavailable.');hardware=reply.hardware;hardwareAt=Date.now();hardwareError=hardware.error||'';}

    catch(e){hardwareError=e.message;hardwareAt=0;}

    finally{hardwareBusy=false;changed();}

  }

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

  .panel{background:#fbfdfb;border:1px solid #c1d3c8;border-radius:15px;box-shadow:0 12px 40px #17372c22;overflow:hidden}header{padding:14px 16px;background:#153f34;color:white;display:flex;align-items:center;justify-content:space-between}h2{margin:0;font-size:20px}h3{font-size:19px;margin:7px 0}h4{margin:12px 0 8px}p{line-height:1.5;margin:8px 0}button,select,input{font:inherit}button,select,input{border:1px solid #bbcec1;border-radius:7px;padding:7px;background:white;color:#214c3d}button{cursor:pointer}button:hover{background:#eaf3ed}button:disabled{opacity:.5;cursor:wait}.body{padding:15px;max-height:calc(100vh - 325px);overflow:auto}.tabs{display:flex;padding:7px;gap:6px;border-bottom:1px solid #dde8df}.tabs button{flex:1;border:0}.tabs button[aria-selected=true]{background:#dfede4;font-weight:700}.muted{font-size:11px;color:#63766a;line-height:1.5}.fields{display:flex;gap:8px;margin:12px 0}.fields label{flex:1}label{font-size:12px;display:block;margin:9px 0}label select{display:block;width:100%;margin-top:4px}.result{background:#e4f0e8;border-radius:10px;padding:13px;margin:14px 0}.item{padding:10px 0;border-top:1px solid #e0e8e1}.bad{color:#aa3333}.good{color:#24614a}.wide{width:100%;margin:6px 0}details{margin:8px 0}summary{cursor:pointer;font-weight:600}a{color:#196951}.pill{display:inline-block;font-size:11px;background:#e8eee9;border-radius:4px;padding:2px 5px;margin:3px}input[type=number]{width:65px;margin-left:8px}input[type=checkbox]{margin-right:6px}.row{display:flex;gap:7px;align-items:center}.swatch{width:10px;height:10px;border-radius:50%;display:inline-block;border:1px solid #777;margin-right:4px}


  button{transition:background .18s ease,box-shadow .18s ease,transform .18s ease}button:hover:not(:disabled){transform:translateY(-1px);box-shadow:0 4px 12px #183a3214}button:active:not(:disabled){transform:translateY(0)}button:focus-visible,select:focus-visible{outline:3px solid #a38beb;outline-offset:3px}
  .panel{box-shadow:0 16px 48px #153d3424;border-color:#d4dfd9}.tabs button[aria-selected=true]{box-shadow:0 2px 6px #153d3410}.voice-launch{position:relative;overflow:hidden;background:linear-gradient(110deg,#433779,#7152c0,#946ddd)!important;border:1px solid #ffffff50!important;letter-spacing:.1px}.voice-launch:before{content:'';position:absolute;inset:0;background:linear-gradient(110deg,transparent 25%,#ffffff23 50%,transparent 75%);transform:translateX(-100%);transition:transform .6s ease}.voice-launch:hover:before{transform:translateX(100%)}
  .voice-sheet{width:min(460px,calc(100vw - 36px));height:min(760px,calc(100dvh - 115px));position:absolute;right:0;top:0;display:flex;flex-direction:column;background:#f7f7fb;border:1px solid #d9d1eb;border-radius:18px;overflow:hidden;box-shadow:0 20px 60px #21134630;animation:voice-arrive .22s ease-out}.voice-sheet-bar{display:flex;align-items:center;justify-content:space-between;padding:12px 16px;background:linear-gradient(115deg,#292145,#513d82);color:white;gap:12px}.voice-sheet-bar button{font-size:12px;color:white;background:#ffffff15;border:1px solid #ffffff33}.voice-sheet iframe{border:0;width:100%;flex:1;min-height:0;background:#f7f7fb}@keyframes voice-arrive{from{opacity:0;transform:translateY(8px) scale(.985)}to{opacity:1;transform:none}}
  @media(prefers-reduced-motion:reduce){button,.voice-launch:before{transition:none!important}.voice-sheet{animation:none}}
  `;shadow.append(css);

  const panel=document.createElement('section');panel.className='panel';shadow.append(panel);

  const openSections=new Set();let savedScroll={overview:0,next:0,updates:0,settings:0},renderedView='overview',pendingRender=false;

  shadow.addEventListener('focusout',()=>{setTimeout(()=>{if(pendingRender)render();},0);});

  function el(tag,text,cls){const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;}

  function button(label,action,cls){const b=el('button',label,cls);b.type='button';b.onclick=action;return b;}

  function select(label,values,value,change,empty='Any'){const l=el('label',label),s=el('select');s.setAttribute('aria-label',label);s.add(new Option(empty,''));values.forEach(v=>s.add(new Option(v,v)));s.value=String(value||'');s.onchange=()=>change(s.value);l.append(s);return l;}

  function save(){const value=JSON.parse(JSON.stringify(settings));saveQueue=saveQueue.then(async()=>{try{if(globalThis.chrome?.runtime?.id){const r=await chrome.runtime.sendMessage({type:'save-settings',key,value});if(!r?.ok)throw Error('Save failed');}else localStorage.setItem(key,JSON.stringify(value));}catch{aiError='Could not save settings. Reload this page after updating the extension.';render();}});}

  function config(name,card){if(!Object.hasOwn(settings.printers,name))Object.defineProperty(settings.printers,name,{enumerable:true,writable:true,configurable:true,value:{material:'',color:'',broken:false,light:0}});return settings.printers[name];}

  const broken=r=>r.config.broken===true;

  let selectedPrinter=null,assistantFocus='';
  function highlightPrinter(row){
    selectedPrinter=String(row.id||row.name);assistantFocus=row.name;
    for(const r of rows){const card=PrintyGrid.elementFor(r.id);if(!card)continue;const active=String(r.id||r.name)===selectedPrinter;card.style.outline=active?'4px solid #7857d8':'';card.style.outlineOffset=active?'4px':'';card.setAttribute('aria-label',active?r.name+' · Selected printer':r.name);let label=card.querySelector('.selection-label');if(active&&!label){label=el('div','Selected for your print','selection-label');label.style.cssText='padding:9px 16px;background:#eee8ff;color:#503599;font-weight:700';card.prepend(label);}else if(!active)label?.remove();}
  }
  let voiceSheet=null;
  function openVoice(){
    if(voiceSheet){voiceSheet.querySelector('iframe')?.focus();return;}
    try{
      voiceSheet=el('section',undefined,'voice-sheet');voiceSheet.setAttribute('aria-label','Printability Voice');
      const bar=el('div',undefined,'voice-sheet-bar');bar.append(el('b','Printability Voice'),button('Back to dashboard',()=>{voiceSheet?.remove();voiceSheet=null;panel.hidden=false;shadow.querySelector('.voice-launch')?.focus();}));
      const frame=el('iframe');frame.title='Printability Voice conversation';frame.allow='microphone';frame.src=chrome.runtime.getURL('voice.html?embedded=1');
      voiceSheet.append(bar,frame);shadow.append(voiceSheet);panel.hidden=true;
    }catch(e){voiceSheet?.remove();voiceSheet=null;panel.hidden=false;showPanelError(e);}
  }
  function showPanelError(e){let note=shadow.querySelector('.connection-error');if(!note){note=el('div',undefined,'connection-error');note.style.cssText='background:#fff2df;color:#694011;padding:12px;border-radius:8px';shadow.append(note);}note.replaceChildren(el('p',e?.message||'Reconnect the extension.'),button('Refresh dashboard',()=>location.reload()));}
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

    if(settings.hardwareEnabled&&!demo)rows=rows.map(r=>FarmLightsLogic.hardwareRow(r,hardware,Date.now()-hardwareAt<5000));

    const counts=new Map();rows.forEach(r=>counts.set(r.name,(counts.get(r.name)||0)+1));rows.forEach(r=>{r.ambiguous=counts.get(r.name)>1;if(r.ambiguous)r.state='unknown';});

    const captured=collecting?null:PrintyJobs.capture(document,rows.map(r=>r.name));

    if(captured){openedJob=captured;logCache.set(captured.printer,captured);}

    rows.forEach(r=>{r.log=logCache.get(r.name);const active=r.jobs.find(FarmLightsLogic.isCurrentJob);if(fresh(r.log)&&r.log.currentJobVerified&&active?.name===r.log.file&&(!r.log.jobId||String(active.id)===r.log.jobId)&&r.state===r.log.phase)r.minutes=r.log.availabilityMinutes;});

    for(const [card,node]of mounted)if(!rows.some(r=>r.card===card)){node.remove();mounted.delete(card);}

    if(!demo&&location.hash.startsWith('#/printers'))PrintyGrid.sync(rows,{recentMinutes:settings.recentMinutes,collectionMinutes:settings.collectionMinutes,fresh});else if(!demo)PrintyGrid.restore();
    if(selectedPrinter){const selected=rows.find(r=>String(r.id||r.name)===selectedPrinter);if(selected)highlightPrinter(selected);}

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

    box.append(el('b',broken(r)?'BROKEN · local override':`Printability · ${r.state}`,broken(r)?'bad':''),el('p',slotDescription(r),'muted'));

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

    panel.replaceChildren();const header=el('header');header.append(el('h2',demo?'Printability · Demo':'Printability'),button(collapsed?'Open':'Minimize',()=>{collapsed=!collapsed;render();}));panel.append(header);if(collapsed)return;

    const tabs=el('nav',undefined,'tabs');tabs.setAttribute('role','tablist');Object.entries({overview:'Start print',next:'Next steps',updates:'Updates',settings:'Settings'}).forEach(([v,label])=>{const b=button(label,()=>{view=v;render();});b.setAttribute('role','tab');b.setAttribute('aria-selected',String(view===v));tabs.append(b);});panel.append(tabs);

    const polish=el('style');polish.textContent='.voice-launch{display:block;width:100%;padding:13px 16px;margin:12px 0;background:linear-gradient(120deg,#5541a6,#7956c5);color:white;border:0;border-radius:12px;font-weight:750;box-shadow:0 4px 12px #664cad26}.voice-launch:hover{background:#5d42a7}.tabs button{border-radius:9px;padding:9px 4px}.body>section{border:1px solid #dce7e0}.connection-error p{margin:0 0 8px}';panel.append(polish);
    const voiceBar=el('div');voiceBar.style.cssText='padding:0 15px 8px;background:#f6f3ff';voiceBar.append(button('◉  Talk to Printability Voice',openVoice,'voice-launch'),el('p',assistantFocus?'Showing: '+assistantFocus:'Find a printer · inspect a file · review your setup','muted'));panel.append(voiceBar);
    const body=el('div',undefined,'body');panel.append(body);

    if(view==='settings'){renderSettings(body);body.scrollTop=savedScroll[view];return;}

    if(view==='overview'){renderStart(body);body.scrollTop=savedScroll[view];return;}

    if(view==='updates'){renderUpdates(body);body.scrollTop=savedScroll[view];return;}

    const urgent=FarmLightsLogic.priorities(rows);

    body.append(el('h3','What needs attention'));

    if(!urgent.length)body.append(el('p','No intervention indicated by the available status.'));

    urgent.forEach((task,i)=>{const item=el('section',undefined,'result');item.style.borderLeft=`5px solid ${tones[task.kind]}`;item.append(el('b',`${i+1}. ${task.row.name} · ${task.label}`),el('p',task.action),el('p',task.reason,'muted'));body.append(item);});

    body.append(button('◉  Printability Voice',openVoice,'voice-launch wide'));
    body.append(el('p','Ask your studio mentor for help, printer choices or a print setup.','muted'));
  }

  let waitAnchor=null;
  function tickWait(){
    const timer=shadow.querySelector('[data-wait-timer]');if(!timer||!waitAnchor)return;
    const seconds=Math.max(0,Math.ceil((waitAnchor.end-Date.now())/1000));
    timer.textContent=seconds===0?'Check status':`${String(Math.floor(seconds/3600)).padStart(2,'0')}:${String(Math.floor(seconds/60)%60).padStart(2,'0')}:${String(seconds%60).padStart(2,'0')}`;
  }
  setInterval(tickWait,1000);
  function renderStart(body){

    const compact=el('style');compact.textContent='.start-view .fields{margin:5px 0}.start-view label{margin:4px 0}.start-view .result{margin:9px 0;padding:10px}.start-view h3{font-size:17px;margin:4px 0}.start-view p{margin:4px 0}.urgent-item{padding:7px 9px;border-left:4px solid;margin:6px 0;background:#fff8f3}.urgent-item p{font-size:12px;line-height:1.35}';body.append(compact);body.classList.add('start-view');

    body.append(el('h3','Find a printer'));

    const fields=el('div',undefined,'fields');fields.append(select('Material',materials,material,v=>{material=v;changed();}),select('Color',colors,color,v=>{color=v;changed();}));body.append(fields);

    const {next,unknown}=FarmLightsLogic.nextPrinter(rows,material,color,settings.collectionMinutes);

    const box=el('section',undefined,'result');box.setAttribute('aria-label','Next printer wait');box.style.cssText='background:#153f34;color:white;padding:20px;border-radius:14px';box.append(el('div','YOUR NEXT PRINT · ESTIMATED WAIT'));

    const value=el('div',next?next.minutes===0?'Ready now':'':'Unknown');value.style.cssText='font-size:clamp(32px,4vw,48px);font-weight:900;font-variant-numeric:tabular-nums;letter-spacing:-2px;margin:12px 0;line-height:1.1';box.append(value);

    if(next?.minutes>0){const key=JSON.stringify([next.row.id||next.row.name,next.minutes,material,color,settings.collectionMinutes]);if(waitAnchor?.key!==key)waitAnchor={key,end:Date.now()+next.minutes*60000};value.dataset.waitTimer='true';}else waitAnchor=null;
    const timerStyle=el('style');timerStyle.textContent='[aria-label="Next printer wait"] .muted{color:#d9e9df}';box.append(timerStyle);
    setTimeout(tickWait,0);
    if(next){const r=next.row;box.append(el('h3',r.name),el('p',next.minutes===0?'Confirm the bed is clear before starting.':`Earliest reported finish for a matching printer, including ${settings.collectionMinutes} min for collection.`,'muted'));

      if(unknown&&next.minutes>0)box.append(el('p','Some matching printers have no estimate and could become available earlier.','muted'));

      box.append(button('Show printer',()=>{highlightPrinter(r);const card=(!demo&&PrintyGrid.elementFor(r.id))||r.card;card.scrollIntoView({behavior:'smooth',block:'center'});}));

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
    function appendNumberSetting(label,key,min,max){
      const field=el('label',label),input=el('input');
      input.type='number';input.min=String(min);input.max=String(max);input.step='1';input.value=String(settings[key]);
      input.onchange=()=>{
        const value=input.valueAsNumber;
        if(!Number.isFinite(value)||!Number.isInteger(value)||value<min||value>max){input.value=String(settings[key]);return;}
        settings[key]=value;save();changed();
      };
      field.append(input);body.append(field);
    }

    body.append(el('h3','Farm settings'));

    const lightsJump=button('Set up status lights',()=>{
      body.querySelector('[data-printy-lights]')?.scrollIntoView({behavior:'smooth',block:'start'});
    },'wide');
    body.append(lightsJump,el('p','Add one or more lights, connect the S3 gateway, and assign each light to a printer.','muted'));

    body.append(el('h4','Notifications & voice'));

    const autoLabel=el('label'),autoCheck=el('input');autoCheck.type='checkbox';autoCheck.checked=settings.autoNotifications;autoCheck.onchange=()=>{settings.autoNotifications=autoCheck.checked;changeTracker.reset();if(!settings.autoNotifications){toast?.remove();toast=null;}save();changed();};autoLabel.append(autoCheck,document.createTextNode('Automatic major-change notifications'));body.append(autoLabel);

    body.append(button('◉  Printability Voice',openVoice,'voice-launch wide'));
    body.append(el('p','Printability Voice answers your spoken requests. Printer changes use regular pop-ups. Your xAI key stays in the helper.','muted'));
    body.append(el('h4','Wait estimates & files'));

    appendNumberSetting('Collection buffer in minutes','collectionMinutes',0,60);

    appendNumberSetting('Recent upload window in minutes','recentMinutes',1,120);

    const lightsHeading=el('h4','Your lights');lightsHeading.dataset.printyLights='true';body.append(lightsHeading);
    const enableLabel=el('label'),enable=el('input');enable.type='checkbox';enable.checked=settings.hardwareEnabled;
    enable.onchange=()=>{settings.hardwareEnabled=enable.checked;save();changed();void syncHardware();};enableLabel.append(enable,document.createTextNode('Use status lights'));body.append(enableLabel);
    const connect=button('Connect USB gateway',()=>chrome.runtime.sendMessage({type:'open-options'}));
    if(!hardware.connected)body.append(connect);
    if(hardwareError)body.append(el('p',hardwareError,'bad'));
    if(settings.hardwareEnabled){
      const bindings=Object.entries(hardware.bindings||{}).filter(([,mac])=>mac!=='000000000000').map(([id])=>Number(id)).sort((a,b)=>a-b);
      body.append(el('p',hardware.connected?`${hardware.modules.filter(m=>m.online).length} light(s) connected`:'Connect the S3 in the helper to set up lights.','muted'));
      async function setupModule(id){
        if(hardwareBusy)return;hardwareBusy=true;
        try{const reply=await chrome.runtime.sendMessage({type:'hardware',payload:{owner:hardwareOwner,lights:FarmLightsLogic.lightCommands(rows,hardware.maxLights||6),enroll:id}});if(!reply?.ok||!reply.hardware)throw Error(reply?.error||'Setup failed.');hardware=reply.hardware;hardwareAt=Date.now();hardwareError='';}
        catch(e){hardwareError=e.message;}finally{hardwareBusy=false;changed();}
      }
      if(hardware.setupMessage)body.append(el('p',hardware.setupMessage,'good'));
      if(hardware.enrollment){body.append(el('b',`Flip the switch on light ${hardware.enrollment} now.`),button('Cancel',()=>void setupModule(0)));}
      else {
        const next=Array.from({length:hardware.maxLights||6},(_,i)=>i+1).find(id=>!bindings.includes(id));
        const add=button('Add light',()=>void setupModule(next),'wide');add.disabled=!hardware.connected||hardware.pending||!next;body.append(add);
        if(!bindings.length)body.append(el('p','Add your first light, flip its switch, then choose its printer. Add lights in LED-chain order.','muted'));
      }
      for(const id of bindings){
        const m=hardware.modules.find(m=>m.id===id),row=el('div',undefined,'item');row.append(el('b',`Light ${id}`),el('p',!m?.online?'Offline':m.broken?'BROKEN switch closed':'Connected','muted'));
        const assigned=Object.entries(settings.printers).find(([,cfg])=>Number(cfg.light)===id)?.[0]||'';
        const names=[...new Set([...rows.map(r=>r.name),...(assigned?[assigned]:[])])];
        row.append(select(`Printer for light ${id}`,names,assigned,name=>{for(const cfg of Object.values(settings.printers))if(Number(cfg.light)===id)cfg.light=0;if(name){settings.printers[name]||={};settings.printers[name].light=id;}save();changed();},'Choose a printer'));
        const details=el('details');details.append(el('summary','Change switch'));const replace=button('Pair replacement switch',()=>void setupModule(id));replace.disabled=!hardware.connected||hardware.pending||!!hardware.enrollment;details.append(replace);row.append(details);body.append(row);
      }
    }
    body.append(el('h4','Printer settings'),el('p','AMS data takes priority. Manual material/color are fallbacks when AMS is unavailable. BROKEN is a local prototype override.','muted'));

    rows.forEach(r=>{const d=el('details');d.open=settingsOpen.has(r.name);d.addEventListener('toggle',()=>{if(d.isConnected){if(d.open)settingsOpen.add(r.name);else settingsOpen.delete(r.name);}});d.append(el('summary',r.name),el('p',slotDescription(r),'muted'));function change(k,v){settings.printers[r.name][k]=v;save();changed();}

      d.append(select(`${r.name} fallback material`,materials,r.config.material,v=>change('material',v),'Unknown'),select(`${r.name} fallback color`,colors,r.config.color,v=>change('color',v),'Unknown'));



      const l=el('label'),c=el('input');c.type='checkbox';c.checked=settings.printers[r.name].broken===true;c.disabled=r.ambiguous;c.onchange=()=>change('broken',c.checked);l.append(c,document.createTextNode(`${r.name} marked BROKEN locally`));d.append(l);if(r.physicalBroken)d.append(el('p','Physical switch is BROKEN. Open the switch on the module to clear it.','bad'));if(r.hardwareUnknown)d.append(el('p','Module connection unverified.','muted'));body.append(d);

    });

    body.append(el('p','Settings persist in this browser by printer name. Recheck assignments when switching accounts or renaming printers.','muted'));

  }

  let printProposal=null;
  const fileRequirements=new Map();
  function readFileRequirements(r,j){
    const key=String(r.id)+':'+String(j.id)+':'+j.name;
    const visible=[...document.querySelectorAll('[role="dialog"],dialog,.modal')].filter(n=>n.getClientRects().length&&(n.innerText||'').includes(j.name));
    const labels=[...(j.element?.querySelectorAll('*')||[])].filter(n=>!n.children.length&&!n.closest('.file-details-title')).map(n=>n.textContent.trim());
    const parsed=PrintySource.requirements([j.element?.innerText||'',...labels,...visible.map(n=>n.innerText)].join('\n'));
    const known=fileRequirements.get(key)||{};
    for(const [k,v] of Object.entries(parsed))if(v)known[k]=v;
    fileRequirements.set(key,known);return known;
  }
  function voiceSnapshot(){
    scan();
    const snapshot=buildSnapshot();
    snapshot.printers.forEach(p=>{const r=rows.find(r=>String(r.id||r.name)===p.id);p.model=r?.model;p.slotsKnown=!!r?.slotsKnown;p.hardwareUnknown=!!r?.hardwareUnknown;p.ambiguous=!!r?.ambiguous;p.files=(r?.jobs||[]).map(j=>({id:String(j.id),name:j.name,state:j.state,current:!!j.current,requirements:readFileRequirements(r,j),estimatedMinutes:j.estimatedMinutes,uploadedAt:j.uploadedAt,startAvailable:!!startButton(j)}));});
    return snapshot;
  }
  function startButton(job){const buttons=[...(job?.element?.querySelectorAll('button')||[])].filter(b=>b.textContent.trim()==='Start'&&!b.disabled&&b.getAttribute('aria-disabled')!=='true');return buttons.length===1?buttons[0]:null;}
  function printTarget(printerId,fileId){
    scan();if(demo||!location.hash.startsWith('#/printers'))throw Error('Open the real Printers page first.');
    const matches=rows.filter(r=>String(r.id||r.name)===printerId);if(matches.length!==1)throw Error('Printer missing or ambiguous.');const r=matches[0];
    if(r.ambiguous||broken(r)||r.hardwareUnknown||r.state!=='idle'||r.jobs.some(FarmLightsLogic.isCurrentJob))throw Error('Printer is not verified idle and available.');
    const jobs=r.jobs.filter(j=>String(j.id)===fileId);if(jobs.length!==1||!startButton(jobs[0]))throw Error('No unique permitted Start action for this file.');return {r,j:jobs[0]};
  }
  if(globalThis.chrome?.runtime?.onMessage)chrome.runtime.onMessage.addListener((message,sender,respond)=>{
    if(sender.id!==chrome.runtime.id||!['voice-snapshot','voice-find','voice-prepare','voice-commit','voice-review-read','voice-review-open','voice-file-info','voice-show'].includes(message.type))return;
    try{
      if(message.type==='voice-show'){
        if(message.view&&['overview','next','updates','settings'].includes(message.view)){view=message.view;collapsed=false;render();}
        if(message.material!==undefined)material=String(message.material||'');if(message.color!==undefined)color=String(message.color||'');
        changed();
        const r=rows.find(r=>String(r.id||r.name)===String(message.printerId));
        if(message.printerId&&!r)throw Error('Printer no longer visible. Refresh printer context.');
        if(r){highlightPrinter(r);const card=PrintyGrid.elementFor(r.id)||r.card;card.scrollIntoView({behavior:'smooth',block:'center'});
          if(message.fileId){const j=r.jobs.find(j=>String(j.id)===String(message.fileId));if(!j)throw Error('File not found on this printer.');const details=j.element?.querySelector('.file-details-title');if(!details)throw Error('File details control unavailable.');details.click();collapsed=true;assistantFocus=r.name+' · '+j.name;}
        }
        render();respond({ok:true,showing:assistantFocus||view,message:'Screen navigation only. No printer command issued.'});return;
      }
      if(message.type==='voice-commit'){respond({ok:false,error:'Print execution is disabled. Review only.'});return;}
      if(['voice-review-read','voice-review-open','voice-file-info','voice-show'].includes(message.type)){
        if(!printProposal||message.nonce!==printProposal.nonce)throw Error('Prepare a review for this file first.');
        scan();
        const r=rows.find(row=>String(row.id||row.name)===printProposal.printerId),j=r?.jobs.find(job=>String(job.id)===printProposal.fileId);
        if(!r||!j||j.name!==printProposal.file)throw Error('The reviewed file changed. Prepare a new review.');
        const dialogs=[...document.querySelectorAll('[role="dialog"],dialog,.modal')].filter(n=>n.getClientRects().length&&(n.innerText||'').includes(j.name));
        if(message.type==='voice-review-open'){
          const viewer=dialogs.flatMap(n=>[...n.querySelectorAll('button,a')]).find(n=>/^Open in toolpath viewer$/i.test(n.textContent.trim())&&!n.disabled);
          if(viewer)viewer.click();
          else if(!dialogs.length){const details=j.element?.querySelector('.file-details-title');if(!details)throw Error('File viewer control was not found. Open the file manually.');details.click();}
          collapsed=true;toast?.remove();toast=null;render();
          respond({ok:true,message:viewer?'Toolpath viewer opened. Inspect View layers, Info and Slice Info.':'File details opened. If this is Job Details, click Open model / details again to open the toolpath viewer.'});return;
        }
        const review={...printProposal.review,status:r.state,slots:r.slotsKnown?r.slots:[],filamentKnown:!!r.slotsKnown,printerDetails:r.card.innerText||r.card.textContent||'',fileDetails:j.element?.innerText||j.element?.textContent||'',log:fresh(r.log)?r.log:null,readAt:new Date().toISOString(),viewerText:dialogs.map(n=>n.innerText).join('\n')||'Open this file’s viewer to read its displayed information.'};
        printProposal.review=review;respond({ok:true,review});return;
      }
      if(message.type==='voice-file-info'){
        scan();const r=rows.find(r=>String(r.id||r.name)===String(message.printerId)),j=r?.jobs.find(j=>String(j.id)===String(message.fileId));
        if(!r||!j)throw Error('File not found.');
        const requirements=readFileRequirements(r,j);
        if(message.openDetails===true){j.element?.querySelector('.file-details-title')?.click();collapsed=true;render();}
        respond({ok:true,requirements,file:j.name,fileInfo:j.element?.innerText||j.element?.textContent||'',note:'Read again after file details load. Missing requirements are unverified; never infer from filename.'});return;
      }
      if(message.type==='voice-snapshot'){respond({ok:true,snapshot:voiceSnapshot()});return;}
      if(message.type==='voice-find'){
        const snapshot=voiceSnapshot(),wantedMaterial=String(message.material||'').trim(),rawColor=String(message.color||'').trim(),wantedColor=/^(any|any color)$/i.test(rawColor)?'':rawColor.charAt(0).toUpperCase()+rawColor.slice(1).toLowerCase();
        const candidates=rows.filter(r=>r.slotsKnown&&!r.hardwareUnknown&&!r.ambiguous&&!broken(r));
        const available=FarmLightsLogic.recommend(candidates,wantedMaterial,wantedColor,broken);
        const pick=available[0],wait=FarmLightsLogic.nextPrinter(candidates,wantedMaterial,wantedColor,settings.collectionMinutes).next;
        if(pick){highlightPrinter(pick);(PrintyGrid.elementFor(pick.id)||pick.card).scrollIntoView({behavior:'smooth',block:'center'});}
        respond({ok:true,request:{material:wantedMaterial,color:wantedColor},selected:pick?snapshot.printers.find(p=>p.id===String(pick.id||pick.name)):null,matchingAvailableCount:available.length,nextWait:!pick&&wait?{printer:wait.row.name,minutes:wait.minutes}:null,missingFilamentData:rows.filter(r=>!r.slotsKnown).map(r=>r.name),note:'Only verified loaded filament is used. Ask for a file if not yet specified; do not ask the user to identify matching printers.'});return;
      }
      if(message.type==='voice-prepare'){
        const {r,j}=printTarget(String(message.printerId),String(message.fileId));
        const requirements=readFileRequirements(r,j);
        if(!requirements.material)throw Error('Sliced material is not verified. Use get_file_info to inspect the file details before preparing a review.');
        if(message.material&&FarmLightsLogic.materialFamily(message.material)!==FarmLightsLogic.materialFamily(requirements.material))throw Error('Requested material conflicts with the sliced file material '+requirements.material+'. Choose the correct file or re-slice; do not change the requirement.');
        const required=requirements.material;
        if(!r.slotsKnown||!FarmLightsLogic.matchesFilament(r,required,message.color||'')){
          const alternatives=FarmLightsLogic.recommend(rows.filter(x=>x.slotsKnown&&!x.hardwareUnknown),required,message.color||'',broken);
          respond({ok:false,error:'This file requires '+required+'. Review blocked: selected printer has no verified matching filament.',requiredMaterial:required,alternative:alternatives[0]?{id:String(alternatives[0].id),name:alternatives[0].name}:null});return;
        }
        message.material=required;
        printProposal={material:message.material||'',color:message.color||'',nonce:crypto.randomUUID(),printerId:String(r.id||r.name),fileId:String(j.id),printer:r.name,file:j.name,expires:Date.now()+60000};
        printProposal.review={requirements,printer:r.name,model:r.model||'Not reported',status:r.state,file:j.name,estimatedMinutes:j.estimatedMinutes??null,requestedMaterial:message.material||'Not specified',requestedColor:message.color||'Any',slots:r.slotsKnown?r.slots:[],filamentKnown:!!r.slotsKnown,fileDetails:j.element?.innerText||j.element?.textContent||'',log:fresh(r.log)?r.log:null,readAt:new Date().toISOString(),unavailable:['Native Start dialog options have not been read.','Slicing profile, plate selection, calibration options and AMS mapping require verification in 3DPrinterOS.'],executionEnabled:false};
        highlightPrinter(r);
        respond({ok:true,proposal:printProposal});return;
      }
    }catch(e){respond({ok:false,error:e.message});}
  });
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

    toast?.remove();toast=el('aside');toast.setAttribute('role','status');toast.setAttribute('aria-label','Printability notification');

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

    const events=changeTracker.take();if(events.length){updates.unshift({at:Date.now(),events});updates.splice(20);void notifyChanges(events);}

  }

  async function notifyChanges(events){

    autoBusy=true;nextAutoAt=Date.now()+15000;

    let capturedAt=Date.now(),requestedKey=summaryKey();

    const ordered=events.map(e=>{const r=rows.find(r=>String(r.id||r.name)===e.id);return {...e,...(r?FarmLightsLogic.triage(r):{})};}).sort((a,b)=>(b.rank||0)-(a.rank||0));

    events=ordered;

    if(updates[0])updates[0].events=ordered;

    if(settings.autoNotifications)showNotification(ordered);

    try{

      if(!globalThis.chrome?.runtime?.id)return;

      if(!demo){await collectLogs();scan();capturedAt=Date.now();requestedKey=summaryKey();}

      const reply=await chrome.runtime.sendMessage({type:'notify-updates',showNotification:settings.autoNotifications,events});

      if(!settings.autoNotifications)return;

      

    }catch{ /* The local factual notification is already visible. */ }

    finally{autoBusy=false;render();}

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

  (async()=>{try{const stored=globalThis.chrome?.runtime?.id?(await chrome.runtime.sendMessage({type:'get-settings',key})).value:JSON.parse(localStorage.getItem(key)||'null');if(stored?.printers)settings={...settings,...stored};}catch{}scan();void syncHardware();const scanTimer=setInterval(()=>{if(!chrome.runtime?.id){clearInterval(scanTimer);clearInterval(hardwareTimer);showPanelError(Error('Printability was updated. Refresh this dashboard to reconnect.'));return;}try{scan();}catch(e){showPanelError(e);}},1500);const hardwareTimer=setInterval(syncHardware,2000);window.addEventListener('hashchange',changed);})().catch(showPanelError);

})();

