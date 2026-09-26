(() => {

  if(window.top!==window)return;

  if(document.getElementById('farm-lights-panel'))return;

  const demo=false; // Production dashboard only.

  const key='farm-lights:3dprinteros:v1';

  const materials=['PLA','PETG','ABS','ASA','TPU','Other'], colors=['Black','White','Gray','Red','Orange','Yellow','Green','Blue','Other'];

  let settings={printers:{},lightCount:6,hardwareEnabled:false,recentMinutes:15,collectionMinutes:5}, rows=[], material='',color='',view='overview',collapsed=false;

  let hardware={connected:false,modules:[]},hardwareAt=0,hardwareError='',hardwareBusy=false;

  const hardwareOwner=crypto.randomUUID();

  async function syncHardware(){

    if(!settings.hardwareEnabled||demo||hardwareBusy||!globalThis.chrome?.runtime?.id)return;

    hardwareBusy=true;

    try{const reply=await chrome.runtime.sendMessage({type:'hardware',payload:{owner:hardwareOwner,lights:FarmLightsLogic.lightCommands(rows,hardware.maxLights||6,selectedPrinter||'')}});if(!reply?.ok||!reply.hardware)throw Error(reply?.error||'Helper unavailable.');hardware=reply.hardware;hardwareAt=Date.now();hardwareError=hardware.error||'';}

    catch(e){hardwareError=e.message;hardwareAt=0;}

    finally{hardwareBusy=false;changed();}

  }

  let signature='', openedJob=null;

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

  const openSections=new Set();let savedScroll={overview:0,match:0,settings:0},renderedView='overview',pendingRender=false;

  shadow.addEventListener('focusout',()=>{setTimeout(()=>{if(pendingRender)render();},0);});

  function el(tag,text,cls){const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;}

  function button(label,action,cls){const b=el('button',label,cls);b.type='button';b.onclick=action;return b;}

  function select(label,values,value,change,empty='Any'){const l=el('label',label),s=el('select');s.setAttribute('aria-label',label);s.add(new Option(empty,''));values.forEach(v=>s.add(new Option(v,v)));s.value=String(value||'');s.onchange=()=>change(s.value);l.append(s);return l;}

  function save(){const value=JSON.parse(JSON.stringify(settings));saveQueue=saveQueue.then(async()=>{try{if(globalThis.chrome?.runtime?.id){const r=await chrome.runtime.sendMessage({type:'save-settings',key,value});if(!r?.ok)throw Error('Save failed');}else localStorage.setItem(key,JSON.stringify(value));}catch{render();}});}

  function config(name){if(!Object.hasOwn(settings.printers,name))Object.defineProperty(settings.printers,name,{enumerable:true,writable:true,configurable:true,value:{material:'',color:'',broken:false,light:0}});return settings.printers[name];}

  const broken=r=>r.config.broken===true;

  let selectedPrinter=null,assistantFocus='';
  function highlightPrinter(row){
    selectedPrinter=String(row.id||row.name);assistantFocus=row.name;
    for(const r of rows){const card=PrintyGrid.elementFor(r.id);if(!card)continue;const active=String(r.id||r.name)===selectedPrinter;card.style.outline=active?'4px solid #7857d8':'';card.style.outlineOffset=active?'4px':'';card.setAttribute('aria-label',active?r.name+' · Selected printer':r.name);let label=card.querySelector('.selection-label');if(active&&!label){label=el('div','Selected for your print','selection-label');label.style.cssText='padding:9px 16px;background:#eee8ff;color:#503599;font-weight:700';card.prepend(label);}else if(!active)label?.remove();}
    void syncHardware();
  }
  let voiceOpening=false;
  async function openVoice(){
    if(voiceOpening)return;
    voiceOpening=true;
    try{
      // Open from this click's user gesture; a site iframe can be blocked by the host page.
      const result=await chrome.runtime.sendMessage({type:'open-voice'});
      if(!result?.ok)throw Error(result?.error||'Could not open Printability Voice. Reload the extension and refresh this page.');
      shadow.querySelector('.connection-error')?.remove();
    }catch(e){showPanelError(e);}finally{voiceOpening=false;}
  }
  function showPanelError(e){let note=shadow.querySelector('.connection-error');if(!note){note=el('div',undefined,'connection-error');note.style.cssText='background:#fff2df;color:#694011;padding:12px;border-radius:8px';shadow.append(note);}note.replaceChildren(el('p',e?.message||'Reconnect the extension.'),button('Refresh dashboard',()=>location.reload()));}
  const changed=()=>{signature='';scan();};

  const fresh=j=>j&&Date.now()-j.observedAt<300000;

  const tones={broken:'#96304f',error:'#bb3427',paused:'#9a6000',offline:'#66578c',unknown:'#637080',finished:'#23753b',idle:'#23753b',working:'#3065a5'};

  function remainingMinutes(r){
    const active=r.jobs.find(FarmLightsLogic.isCurrentJob);
    const j=fresh(r.log)?r.log:null;
    if(j&&j.currentJobVerified&&active?.name===j.file&&(!j.jobId||String(active.id)===String(j.jobId))&&r.state===j.phase&&Number.isFinite(j.availabilityMinutes))return j.availabilityMinutes;
    if(r.state==='printing'&&Number.isFinite(active?.estimatedMinutes))return active.estimatedMinutes;
    return null;
  }

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

    rows=found.map(r=>({...r,config:config(r.name),state:disconnected?'unknown':FarmLightsLogic.status(r.raw)}));

    if(settings.hardwareEnabled&&!demo)rows=rows.map(r=>FarmLightsLogic.hardwareRow(r,hardware,Date.now()-hardwareAt<5000));

    const counts=new Map();rows.forEach(r=>counts.set(r.name,(counts.get(r.name)||0)+1));rows.forEach(r=>{r.ambiguous=counts.get(r.name)>1;if(r.ambiguous)r.state='unknown';});

    // If Job Details is already open, read remaining time only — no background log sweep.
    const captured=PrintyJobs.capture(document,rows.map(r=>r.name));

    if(captured){openedJob=captured;logCache.set(captured.printer,captured);}

    rows.forEach(r=>{r.log=logCache.get(r.name);r.minutes=remainingMinutes(r);});

    for(const [card,node]of mounted)if(!rows.some(r=>r.card===card)){node.remove();mounted.delete(card);}

    if(!demo&&location.hash.startsWith('#/printers'))PrintyGrid.sync(rows,{recentMinutes:settings.recentMinutes,collectionMinutes:settings.collectionMinutes,fresh});else if(!demo)PrintyGrid.restore();
    if(selectedPrinter){const selected=rows.find(r=>String(r.id||r.name)===selectedPrinter);if(selected)highlightPrinter(selected);}

    const sig=JSON.stringify([settings,material,color,disconnected,rows.map(({card,jobs,log,...r})=>({...r,jobs:jobs.map(({element,...j})=>j),log:log?{phase:log.phase,availabilityMinutes:log.availabilityMinutes,stale:!fresh(log)}:null})),openedJob?{printer:openedJob.printer,phase:openedJob.phase,stale:!fresh(openedJob)}:null]);

    if(sig===signature)return;

    signature=sig;if(demo||!location.hash.startsWith('#/printers'))rows.forEach(updateCard);render();

  }

  function slotDescription(r){return r.slotsKnown?(r.slots.length?r.slots.map(s=>`${s.material} · ${s.color||'color unknown'} (slot ${s.slot})`).join('; '):'No loaded filament reported'):[r.config.material,r.config.color].filter(Boolean).join(' · ')||'Filament not read yet';}

  function updateCard(r){

    let node=mounted.get(r.card);if(!node||!node.isConnected){node=el('div');node.dataset.farmLightsOverlay='true';node.attachShadow({mode:'open'});r.card.append(node);mounted.set(r.card,node);}

    const root=node.shadowRoot,expanded=[...root.querySelectorAll('details')].map(d=>d.open);root.replaceChildren();const style=el('style');style.textContent=':host{display:block;flex-basis:100%;font:12px system-ui;color:#315348}.line{padding:8px 12px;background:#f1f6f2;border-top:1px solid #dce8df}.bad{color:#a22f2f}details{margin-top:5px}summary{cursor:pointer}p{margin:5px 0;line-height:1.4}.muted{font-size:11px;color:#69766e}';root.append(style);

    const box=el('div',undefined,'line');root.append(box);

    const info=FarmLightsLogic.statusInfo(r);
    box.append(el('b',broken(r)?'Out of service':`Printability · ${info.label}`,broken(r)?'bad':''),el('p',slotDescription(r),'muted'));
    box.style.borderLeft=`5px solid ${tones[info.kind]}`;
    box.append(el('p',info.hint,'muted'));

    if(r.minutes!=null&&r.state==='printing')box.append(el('p',`About ${r.minutes} min left + collection`,'muted'));

    const details=el('details');details.append(el('summary',`Files (${r.jobs.length})`));

    const groups=FarmLightsLogic.groupJobs(r.jobs,settings.recentMinutes);

    details.append(el('p',`Current: ${groups.current.map(j=>j.name).join(', ')||'none'}`));

    details.append(el('p',`Recent (${settings.recentMinutes} min): ${groups.recent.map(j=>j.name).join(', ')||'none'}`));

    if(!demo){const a=el('a','Open Printers page');a.href='#/printers';details.append(a);}

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

    const tabs=el('nav',undefined,'tabs');tabs.setAttribute('role','tablist');Object.entries({overview:'Find a printer',match:'Matching',settings:'Settings'}).forEach(([v,label])=>{const b=button(label,()=>{view=v;render();});b.setAttribute('role','tab');b.setAttribute('aria-selected',String(view===v));tabs.append(b);});panel.append(tabs);

    const polish=el('style');polish.textContent='.voice-launch{display:block;width:100%;padding:13px 16px;margin:12px 0;background:linear-gradient(120deg,#5541a6,#7956c5);color:white;border:0;border-radius:12px;font-weight:750;box-shadow:0 4px 12px #664cad26}.voice-launch:hover{background:#5d42a7}.tabs button{border-radius:9px;padding:9px 4px}.body>section{border:1px solid #dce7e0}.connection-error p{margin:0 0 8px}.match-item{padding:10px 12px;border-left:4px solid;margin:8px 0;background:#f7faf8;border-radius:0 8px 8px 0}';panel.append(polish);
    const voiceBar=el('div');voiceBar.style.cssText='padding:0 15px 8px;background:#f6f3ff';voiceBar.append(button('◉  Talk to Printability Voice',openVoice,'voice-launch'));if(assistantFocus)voiceBar.append(el('p','Showing: '+assistantFocus,'muted'));panel.append(voiceBar);
    const body=el('div',undefined,'body');panel.append(body);

    if(view==='settings'){renderSettings(body);body.scrollTop=savedScroll[view]||0;return;}

    if(view==='match'){renderMatch(body);body.scrollTop=savedScroll[view]||0;return;}

    renderStart(body);body.scrollTop=savedScroll[view]||0;

  }

  let waitAnchor=null;
  function tickWait(){
    const timer=shadow.querySelector('[data-wait-timer]');if(!timer||!waitAnchor)return;
    const seconds=Math.max(0,Math.ceil((waitAnchor.end-Date.now())/1000));
    timer.textContent=seconds===0?'Check status':`${String(Math.floor(seconds/3600)).padStart(2,'0')}:${String(Math.floor(seconds/60)%60).padStart(2,'0')}:${String(seconds%60).padStart(2,'0')}`;
  }
  setInterval(tickWait,1000);

  function showPrinter(r){
    highlightPrinter(r);
    const card=(!demo&&PrintyGrid.elementFor(r.id))||r.card;
    card?.scrollIntoView({behavior:'smooth',block:'center'});
  }

  function renderStart(body){

    const compact=el('style');compact.textContent='.start-view .fields{margin:5px 0}.start-view label{margin:4px 0}.start-view .result{margin:9px 0;padding:10px}.start-view h3{font-size:17px;margin:4px 0}.start-view p{margin:4px 0}';body.append(compact);body.classList.add('start-view');

    body.append(el('h3','What do you want to print with?'));

    const fields=el('div',undefined,'fields');fields.append(select('Material',materials,material,v=>{material=v;changed();}),select('Color',colors,color,v=>{color=v;changed();}));body.append(fields);

    const {next,unknown}=FarmLightsLogic.nextPrinter(rows,material,color,settings.collectionMinutes);

    const box=el('section',undefined,'result');box.setAttribute('aria-label','Next printer wait');box.style.cssText='background:#153f34;color:white;padding:20px;border-radius:14px';box.append(el('div','YOUR NEXT OPENING'));

    const value=el('div',next?next.minutes===0?'Ready now':'':'Unknown');value.style.cssText='font-size:clamp(32px,4vw,48px);font-weight:900;font-variant-numeric:tabular-nums;letter-spacing:-2px;margin:12px 0;line-height:1.1';box.append(value);

    if(next?.minutes>0){const key=JSON.stringify([next.row.id||next.row.name,next.minutes,material,color,settings.collectionMinutes]);if(waitAnchor?.key!==key)waitAnchor={key,end:Date.now()+next.minutes*60000};value.dataset.waitTimer='true';}else waitAnchor=null;
    const timerStyle=el('style');timerStyle.textContent='[aria-label="Next printer wait"] .muted{color:#d9e9df}';box.append(timerStyle);
    setTimeout(tickWait,0);
    if(next){const r=next.row;box.append(el('h3',r.name),el('p',next.minutes===0?'Confirm the bed is clear, then start on this printer.':`Soonest matching printer, including ${settings.collectionMinutes} min to collect the finished print.`,'muted'));

      if(unknown&&next.minutes>0)box.append(el('p','Some matching printers have no time estimate and might free up sooner.','muted'));

      box.append(button('Show me this printer',()=>showPrinter(r)));

    }else box.append(el('p',rows.length?'No matching printer has a reliable wait yet. Try Matching, or ask Voice.':'Open the Printers page to see availability.'));

    body.append(box);

    const available=rows.filter(r=>!broken(r)&&r.state==='idle'&&!r.ambiguous).length;
    const out=rows.filter(r=>broken(r)||['error','offline'].includes(r.state)).length;
    body.append(el('p',`${rows.length} printers · ${available} free · ${out} out of service`,'muted'));

    const matchCount=FarmLightsLogic.matchingPrinters(rows,material,color,settings.collectionMinutes).length;
    body.append(button(matchCount?`See ${matchCount} matching printer${matchCount===1?'':'s'}`:'Browse matching printers',()=>{view='match';render();},'wide'));

    if(settings.hardwareEnabled)body.append(el('p','Status lights show free (green), busy (blue), paused (orange), or out of service (red). Ask Voice to flash the one you need.','muted'));

    if(!demo){const link=el('a','Open Printers dashboard');link.href='https://cloud.3dprinteros.com/#/printers';body.append(link);}

  }

  function renderMatch(body){

    body.append(el('h3','Matching printers'));
    body.append(el('p',material||color?`Filtered for ${[material,color].filter(Boolean).join(' · ')}.`:'Showing all printers. Set material or color under Find a printer.','muted'));

    const fields=el('div',undefined,'fields');fields.append(select('Material',materials,material,v=>{material=v;changed();}),select('Color',colors,color,v=>{color=v;changed();}));body.append(fields);

    const matches=FarmLightsLogic.matchingPrinters(rows,material,color,settings.collectionMinutes);
    if(!matches.length){body.append(el('p',rows.length?'Nothing matches that material and color right now.':'Open the Printers page to load the farm.'));return;}

    matches.forEach(item=>{
      const r=item.row,box=el('div',undefined,'match-item');
      box.style.borderColor=tones[item.kind]||'#637080';
      box.append(el('b',`${r.name} · ${item.label}`),el('p',item.minutes===0?'Available now':item.minutes!=null?`~${item.minutes} min wait`:item.label,'muted'));
      if(broken(r)||item.kind==='broken')box.append(el('p','Out of service — skip this one.','bad'));
      box.append(button('Show printer',()=>showPrinter(r)));
      body.append(box);
    });

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

    body.append(el('h3','Your print space'));

    const lightsJump=button('Set up status lights',()=>{
      body.querySelector('[data-printy-lights]')?.scrollIntoView({behavior:'smooth',block:'start'});
    },'wide');
    body.append(lightsJump,el('p','Connect the USB gateway, then assign lights 1–6 to printers so you can find them on the floor.','muted'));

    body.append(el('h4','Wait estimates'));

    appendNumberSetting('Extra minutes after a print finishes (collection)','collectionMinutes',0,60);

    appendNumberSetting('Treat uploads as “recent” for this many minutes','recentMinutes',1,120);

    const lightsHeading=el('h4','Status lights');lightsHeading.dataset.printyLights='true';body.append(lightsHeading);
    const enableLabel=el('label'),enable=el('input');enable.type='checkbox';enable.checked=settings.hardwareEnabled;
    enable.onchange=()=>{settings.hardwareEnabled=enable.checked;save();changed();void syncHardware();};enableLabel.append(enable,document.createTextNode('Use status lights'));body.append(enableLabel);
    const connect=button('Connect USB gateway',()=>chrome.runtime.sendMessage({type:'open-options'}));
    if(!hardware.connected)body.append(connect);
    if(hardwareError)body.append(el('p',hardwareError,'bad'));
    if(settings.hardwareEnabled){
      const maxLights=hardware.maxLights||6;
      const onlineCount=hardware.modules.filter(m=>m.online).length;
      body.append(el('p',hardware.connected?`${onlineCount} of ${maxLights} light(s) online`:'Connect the S3 in the helper to use lights.','muted'));
      body.append(el('p','Modules use fixed IDs 1–6. No pairing step.','muted'));
      for(let id=1;id<=maxLights;id++){
        const m=hardware.modules.find(m=>m.id===id),row=el('div',undefined,'item');
        row.append(el('b',`Light ${id}`),el('p',!m?.online?'Offline':m.broken?'Down switch on — printer treated as out of service':'Connected','muted'));
        const assigned=Object.entries(settings.printers).find(([,cfg])=>Number(cfg.light)===id)?.[0]||'';
        const names=[...new Set([...rows.map(r=>r.name),...(assigned?[assigned]:[])])];
        row.append(select(`Printer for light ${id}`,names,assigned,name=>{for(const cfg of Object.values(settings.printers))if(Number(cfg.light)===id)cfg.light=0;if(name){settings.printers[name]||={};settings.printers[name].light=id;}save();changed();},'Choose a printer'));
        body.append(row);
      }
    }
    body.append(el('h4','Printers'),el('p','Loaded AMS filament wins when available. Manual material/color are backups. Mark a printer out of service if you should not use it.','muted'));

    rows.forEach(r=>{const d=el('details');d.open=settingsOpen.has(r.name);d.addEventListener('toggle',()=>{if(d.isConnected){if(d.open)settingsOpen.add(r.name);else settingsOpen.delete(r.name);}});d.append(el('summary',r.name),el('p',slotDescription(r),'muted'));function change(k,v){settings.printers[r.name][k]=v;save();changed();}

      d.append(select(`${r.name} fallback material`,materials,r.config.material,v=>change('material',v),'Unknown'),select(`${r.name} fallback color`,colors,r.config.color,v=>change('color',v),'Unknown'));

      const l=el('label'),c=el('input');c.type='checkbox';c.checked=settings.printers[r.name].broken===true;c.disabled=r.ambiguous;c.onchange=()=>change('broken',c.checked);l.append(c,document.createTextNode(`${r.name} is out of service`));d.append(l);if(r.physicalBroken)d.append(el('p','Physical down switch is on. Flip it off on the module to clear.','bad'));if(r.hardwareUnknown)d.append(el('p','Light module not verified online.','muted'));body.append(d);

    });

  }

  function showActionBlocker(message){
    shadow.querySelector('.action-blocker')?.remove();
    const box=el('aside',undefined,'action-blocker');box.setAttribute('role','alert');box.style.cssText='position:fixed;bottom:22px;left:22px;width:min(400px,calc(100vw - 44px));padding:18px;background:#fff8ed;color:#633b15;border:1px solid #e7c597;border-left:5px solid #c67b27;border-radius:14px;box-shadow:0 8px 32px #32241925;z-index:2147483647';
    box.append(el('b','Could not prepare that print'),el('p',message),el('p','Nothing was started.','muted'),button('Dismiss',()=>box.remove()));shadow.append(box);
  }
  let printProposal=null;
  const fileRequirements=new Map();
  function readFileRequirements(r,j){
    const key=String(r.id)+':'+String(j.id)+':'+j.name;
    const visible=PrintySource.fileDialogs(j.name);
    const labels=[...(j.element?.querySelectorAll('*')||[])].filter(n=>!n.children.length&&!n.closest('.file-details-title')).map(n=>n.textContent.trim());
    const parsed=PrintySource.requirements([j.element?.innerText||'',...labels,...visible.map(n=>PrintySource.fileText(n,j.name))].join('\n'));
    const known=fileRequirements.get(key)||{};
    for(const [k,v] of Object.entries(parsed))if(v&&(k!=='source'||parsed.material))known[k]=v;
    const detailsText=visible.map(n=>PrintySource.fileText(n,j.name)).join('\n');
    if(detailsText){known.views||=[];if(!known.views.includes(detailsText))known.views=[...known.views.slice(-2),detailsText];known.detailsText=known.views.join('\n\n').slice(0,16000);}
    fileRequirements.set(key,known);return known;
  }
  function voiceSnapshot(){
    scan();
    const snapshot=buildSnapshot();
    snapshot.printers.forEach(p=>{const r=rows.find(r=>String(r.id||r.name)===p.id);p.model=r?.model;p.slotsKnown=!!r?.slotsKnown;p.hardwareUnknown=!!r?.hardwareUnknown;p.ambiguous=!!r?.ambiguous;p.files=(r?.jobs||[]).map(j=>({id:String(j.id),name:j.name,state:j.state,current:!!j.current,requirements:readFileRequirements(r,j),estimatedMinutes:j.estimatedMinutes,uploadedAt:j.uploadedAt,detailsAvailable:!!detailsControl(j),startAvailable:!!startButton(j)}));});
    return snapshot;
  }
  function detailsControl(job){return job?.element?.querySelector('.file-details-title')||null;}
  function startButton(job){const buttons=[...(job?.element?.querySelectorAll('button')||[])].filter(b=>b.textContent.trim()==='Start'&&!b.disabled&&b.getAttribute('aria-disabled')!=='true');return buttons.length===1?buttons[0]:null;}
  // Review-only target: any visible file with a Details control. Start/queue/idle are not required.
  function printTarget(printerId,fileId){
    scan();if(demo||!location.hash.startsWith('#/printers'))throw Error('Open the Printers page first.');
    const matches=rows.filter(r=>String(r.id||r.name)===printerId);if(matches.length!==1)throw Error('Printer missing or ambiguous.');const r=matches[0];
    if(r.ambiguous||broken(r))throw Error(r.name+': '+(broken(r)?'out of service':'printer name ambiguous')+'. Choose another printer before preparing this file.');
    const jobs=r.jobs.filter(j=>String(j.id)===fileId);if(jobs.length!==1)throw Error('File not found on this printer.');
    if(!detailsControl(jobs[0]))throw Error('File details control unavailable for this file.');
    return {r,j:jobs[0]};
  }
  if(globalThis.chrome?.runtime?.onMessage)chrome.runtime.onMessage.addListener((message,sender,respond)=>{
    if(sender.id!==chrome.runtime.id||!['voice-snapshot','voice-find','voice-prepare','voice-commit','voice-review-read','voice-review-open','voice-file-info','voice-show'].includes(message.type))return;
    try{
      if(message.type==='voice-show'){
        if(message.view&&['overview','match','settings'].includes(message.view)){view=message.view;collapsed=false;render();}
        // Legacy next tab → matching list
        if(message.view==='next'){view='match';collapsed=false;render();}
        if(message.material!==undefined)material=String(message.material||'');if(message.color!==undefined)color=String(message.color||'');
        changed();
        const r=rows.find(r=>String(r.id||r.name)===String(message.printerId));
        if(message.printerId&&!r)throw Error('Printer no longer visible. Refresh the dashboard.');
        if(r){highlightPrinter(r);const card=PrintyGrid.elementFor(r.id)||r.card;card.scrollIntoView({behavior:'smooth',block:'center'});
          if(message.fileId){const j=r.jobs.find(j=>String(j.id)===String(message.fileId));if(!j)throw Error('File not found on this printer.');const details=detailsControl(j);if(!details)throw Error('File details control unavailable.');details.click();collapsed=true;assistantFocus=r.name+' · '+j.name;}
        }
        render();respond({ok:true,showing:assistantFocus||view,message:'Screen navigation only. No printer command issued.'});return;
      }
      if(message.type==='voice-commit'){respond({ok:false,error:'Print execution is disabled. Review only.'});return;}
      if(['voice-review-read','voice-review-open'].includes(message.type)){
        if(!printProposal||message.nonce!==printProposal.nonce)throw Error('Prepare a review for this file first.');
        scan();
        const r=rows.find(row=>String(row.id||row.name)===printProposal.printerId),j=r?.jobs.find(job=>String(job.id)===printProposal.fileId);
        if(!r||!j||j.name!==printProposal.file)throw Error('The reviewed file changed. Prepare a new review.');
        const dialogs=PrintySource.fileDialogs(j.name);
        if(message.type==='voice-review-open'){
          const viewer=dialogs.flatMap(n=>[...n.querySelectorAll('button,a')]).find(n=>/^Open in toolpath viewer$/i.test(n.textContent.trim())&&!n.disabled);
          if(viewer)viewer.click();
          else if(!dialogs.length){const details=detailsControl(j);if(!details)throw Error('File viewer control was not found. Open the file manually.');details.click();}
          collapsed=true;render();
          respond({ok:true,message:viewer?'Toolpath viewer opened. Inspect View layers, Info and Slice Info.':'File details opened. If this is Job Details, click Open model / details again to open the toolpath viewer.'});return;
        }
        const review={...printProposal.review,status:r.state,slots:r.slotsKnown?r.slots:[],filamentKnown:!!r.slotsKnown,printerDetails:r.card.innerText||r.card.textContent||'',fileDetails:j.element?.innerText||j.element?.textContent||'',remainingMinutes:r.minutes??null,readAt:new Date().toISOString(),viewerText:dialogs.map(n=>n.innerText).join('\n')||'Open this file’s viewer to read its displayed information.'};
        printProposal.review=review;respond({ok:true,review});return;
      }
      if(message.type==='voice-file-info'){
        (async()=>{
          scan();const r=rows.find(r=>String(r.id||r.name)===String(message.printerId)),j=r?.jobs.find(j=>String(j.id)===String(message.fileId));
          if(!r||!j)throw Error('File no longer found. Refresh the printer list.');
          const matching=()=>PrintySource.fileDialogs(j.name);
          if(message.openDetails===true){
            if(!matching().length){const control=detailsControl(j);if(!control)throw Error('File details control unavailable. Open this file manually.');control.click();}
            collapsed=true;render();
            const clicked=new Set();
            for(let attempt=0;attempt<60;attempt++){
              const dialogs=matching();
              // Save Job Details metadata BEFORE the toolpath viewer replaces the dialog.
              const captured=readFileRequirements(r,j);
              const controls=dialogs.flatMap(n=>[...n.querySelectorAll('button,a,[role="tab"]')]);
              // Details populates asynchronously. Do not navigate away while its data loads.
              if(captured.material)break;
              const next=controls.find(n=>/^(Open in toolpath viewer|Slice Info)$/i.test(n.textContent.trim())&&!n.disabled&&!clicked.has(n.textContent.trim()));
              const isViewer=next&&/^Open in toolpath viewer$/i.test(next.textContent.trim());
              if(next&&(!isViewer||attempt>=35)){clicked.add(next.textContent.trim());next.click();}
              await new Promise(resolve=>setTimeout(resolve,200));
            }
          }
          const requirements=readFileRequirements(r,j),viewerText=matching().map(n=>PrintySource.fileText(n,j.name)).join('\n')||requirements.detailsText||'';
          respond({ok:true,requirements,file:j.name,printer:r.name,printerInfo:r.card.innerText||r.card.textContent||'',fileInfo:j.element?.innerText||j.element?.textContent||'',viewerText,complete:!!requirements.material,detailsAvailable:!!detailsControl(j),startAvailable:!!startButton(j),readState:requirements.material?'ready':matching().length?'reader_unparsed':'details_not_observed',note:requirements.material?'File requirements read from 3DPrinterOS Details. Use these values and the captured detailsText for preparation. Start/queue state does not block preparation.':'The reader could not extract the material from this view. This does not mean the file lacks slice data. Report the reader limitation without guessing.'});
        })().catch(e=>{showActionBlocker(e.message);respond({ok:false,error:e.message});});return true;
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
          showActionBlocker(r.name+' does not have verified '+required+'. '+(alternatives[0]?'Try '+alternatives[0].name+'; the same file must be available there.':'No compatible free printer was found.'));
          respond({ok:false,error:'This file requires '+required+'. Review blocked: selected printer has no verified matching filament.',requiredMaterial:required,alternative:alternatives[0]?{id:String(alternatives[0].id),name:alternatives[0].name}:null});return;
        }
        message.material=required;
        printProposal={material:message.material||'',color:message.color||'',nonce:crypto.randomUUID(),printerId:String(r.id||r.name),fileId:String(j.id),printer:r.name,file:j.name,expires:Date.now()+60000};
        printProposal.review={requirements,printer:r.name,model:r.model||'Not reported',status:r.state,file:j.name,estimatedMinutes:j.estimatedMinutes??null,requestedMaterial:message.material||'Not specified',requestedColor:message.color||'Any',slots:r.slotsKnown?r.slots:[],filamentKnown:!!r.slotsKnown,fileDetails:j.element?.innerText||j.element?.textContent||'',remainingMinutes:r.minutes??null,readAt:new Date().toISOString(),startAvailable:!!startButton(j),unavailable:['Native Start stays on the printer dashboard for the human after this review.','Slicing profile, plate selection, calibration options and AMS mapping require verification in 3DPrinterOS.'],executionEnabled:false};
        highlightPrinter(r);
        respond({ok:true,proposal:printProposal,note:'Review card prepared. Printing stays disabled. Start/queue state does not block this review.'});return;
      }
    }catch(e){showActionBlocker(e.message);respond({ok:false,error:e.message});}
  });
  function buildSnapshot(capturedAt=Date.now()){

    return {source:demo?'simulation':'3dprinteros',capturedAt:new Date(capturedAt).toISOString(),request:{material,color},printers:rows.map(r=>{

        const groups=FarmLightsLogic.groupJobs(r.jobs,settings.recentMinutes),info=FarmLightsLogic.statusInfo(r);

        return {id:String(r.id||r.name),name:r.name,state:r.state,broken:broken(r),status:info,eligible:FarmLightsLogic.recommend([r],material,color,broken).length===1,slots:r.slotsKnown?r.slots:[{material:r.config.material,color:r.config.color,source:'manual fallback'}],currentFiles:groups.current.map(x=>x.name),recentFiles:groups.recent.map(x=>x.name),currentEstimatedMinutes:groups.current[0]?.estimatedMinutes??null,remainingMinutes:r.state==='printing'?r.minutes??null:null};})};

  }

  (async()=>{try{const stored=globalThis.chrome?.runtime?.id?(await chrome.runtime.sendMessage({type:'get-settings',key})).value:JSON.parse(localStorage.getItem(key)||'null');if(stored?.printers)settings={...settings,...stored};}catch{}scan();void syncHardware();const scanTimer=setInterval(()=>{if(!chrome.runtime?.id){clearInterval(scanTimer);clearInterval(hardwareTimer);showPanelError(Error('Printability was updated. Refresh this dashboard to reconnect.'));return;}try{scan();}catch(e){showPanelError(e);}},1500);const hardwareTimer=setInterval(syncHardware,2000);window.addEventListener('hashchange',changed);})().catch(showPanelError);

})();
