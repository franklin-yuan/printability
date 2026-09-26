/* A card view over the existing printer/file DOM. File actions run only on user clicks. */
globalThis.PrintyGrid=(()=>{
  const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
  const button=(label,action)=>{const b=el('button',label);b.type='button';b.onclick=action;return b;};
  let host=null,root=null,grid=null,notice=null,sourceStyle=null,manage=null;
  const hidden=new Set(),cards=new Map();
  const tones={fatal:'#a51b2b',fault:'#bb3427',broken:'#96304f',paused:'#9a6000',recoverable:'#087c80',offline:'#66578c',unknown:'#637080',finished:'#23753b',idle:'#23753b',working:'#3065a5'};
  function placeholder(preview,label){
    const wrap=el('div',undefined,'placeholder');
    const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 100 90');svg.setAttribute('aria-hidden','true');
    const path=document.createElementNS(svg.namespaceURI,'path');path.setAttribute('d','M18 76V12h64v64M12 76h76v8H12zM25 28h50M50 28v15m-6 0h12l-6 8zM29 65h42M28 54v11m44-11v11');path.setAttribute('fill','none');path.setAttribute('stroke','currentColor');path.setAttribute('stroke-width','3');path.setAttribute('stroke-linecap','round');svg.append(path);
    wrap.append(svg,el('strong',label));preview.replaceChildren(wrap);
  }
  function restore(){hidden.forEach(n=>n.removeAttribute('data-printy-source-hidden'));hidden.clear();host?.remove();sourceStyle?.remove();host=root=grid=notice=sourceStyle=manage=null;cards.clear();}
  function showOriginal(row){
    if(manage)manage.removeAttribute('data-printy-managing');
    manage=row.card.parentElement;manage.removeAttribute('data-printy-source-hidden');manage.setAttribute('data-printy-managing','');
    notice.replaceChildren(el('span',`${row.name} · original file controls`),button('Close file controls',()=>{manage?.setAttribute('data-printy-source-hidden','');manage?.removeAttribute('data-printy-managing');manage=null;notice.replaceChildren();}));
    manage.scrollIntoView({behavior:'smooth',block:'start'});
  }
  function mount(rows){
    const first=rows[0]?.card.parentElement;if(!first)return;
    host=el('section');host.id='printy-printer-grid';root=host.attachShadow({mode:'open'});
    const css=el('style');css.textContent=`
      :host{display:block;margin:22px 390px 28px 0;padding:22px;background:#f3f6f4;border-radius:18px;font:14px system-ui;color:#173b32}*{box-sizing:border-box}
      h2{margin:0;font-size:25px;letter-spacing:-.6px}h3{margin:0;font-size:18px}p{line-height:1.5;margin:7px 0}
      .top{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:20px}.muted{color:#65776d;font-size:12px}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:18px;align-items:start}
      article{background:white;border:1px solid #d9e5dd;border-radius:15px;overflow:hidden;box-shadow:0 5px 18px #1d4b3209}.heading{padding:17px;display:flex;gap:10px;justify-content:space-between;align-items:center}.status{border-radius:20px;padding:5px 9px;font-size:11px;background:#e5eee8;white-space:nowrap}.idle{background:#def3e4;color:#226843}.printing,.heating{background:#e3eeff;color:#315890}.paused{background:#fff0d8;color:#855a16}.error,.broken{background:#ffe7e2;color:#a3352b}
      .preview{height:170px;min-height:170px;max-height:170px;overflow:hidden;background:linear-gradient(140deg,#edf3ef,#e2ece6);display:flex;align-items:center;justify-content:center;position:relative}.preview img{display:block;width:100%;height:100%;min-width:0;min-height:0;max-width:100%;max-height:100%;object-fit:contain}.placeholder{display:flex;flex-direction:column;align-items:center;gap:6px;color:#607e6f;font-size:12px}.placeholder svg{width:82px;height:75px}.preview small{position:absolute;bottom:8px;left:10px;background:#ffffffdf;padding:3px 6px;border-radius:4px}.body{padding:15px}.current{background:#f2f7f3;padding:11px;border-radius:8px;margin:10px 0}.filename{font-weight:600;overflow-wrap:anywhere}.slots{display:flex;gap:5px;flex-wrap:wrap}.slot{font-size:11px;padding:4px 6px;background:#f0f4f1;border-radius:5px}.swatch{display:inline-block;width:9px;height:9px;margin-right:5px;border-radius:50%;border:1px solid #9bab9f}.next{border-left:4px solid;padding:8px 10px;background:#f7f9f8;margin-bottom:12px}.status{white-space:normal;text-align:center;max-width:55%}.heading h3{overflow-wrap:anywhere;min-width:0}
      button,input{font:inherit;border:1px solid #c6d8cb;background:white;border-radius:7px;padding:7px 10px;color:#24523d}button{cursor:pointer}button:hover{background:#e8f2ec}input{width:100%;margin:10px 0}button:disabled{opacity:.5;cursor:default}.actions{display:flex;gap:7px;flex-wrap:wrap;margin-top:10px}details{border-top:1px solid #e2ebe5;margin-top:13px;padding-top:12px}summary{cursor:pointer;font-weight:600}.job{padding:10px 0;border-top:1px solid #edf1ee}.recent{color:#477350;font-size:11px}.fault{color:#a3352b;font-size:12px}.notice{position:sticky;top:8px;z-index:2;background:#eaf3ed}.notice:not(:empty){padding:12px;display:flex;justify-content:space-between;gap:10px;margin:15px 0}
      @media(max-width:1100px){:host{margin-right:0}.grid{grid-template-columns:repeat(auto-fit,minmax(250px,1fr))}}`;
    root.append(css);const top=el('div',undefined,'top'),title=el('div');title.append(el('h2','Your printers'),el('p','Current prints, loaded filament and files in one place.','muted'));top.append(title);root.append(top);
    // Shared/virtual print queues stay visible in the original page with all their controls.
    notice=el('div',undefined,'notice');grid=el('div',undefined,'grid');root.append(notice,grid);
    first.parentElement.insertBefore(host,first);
    sourceStyle=el('style');sourceStyle.textContent='[data-printy-source-hidden]{display:none!important}[data-printy-managing]{margin:20px 390px 20px 0!important;border:2px solid #78a38c!important;border-radius:12px!important}';document.head.append(sourceStyle);
  }
  function sync(rows,{recentMinutes=15,collectionMinutes=5,fresh}){
    if(!location.hash.startsWith('#/printers')||!rows.length){restore();return;}
    if(!host?.isConnected){restore();mount(rows);}if(!host)return;
    for(const row of rows){
      const source=row.card.parentElement;hidden.add(source);if(manage!==source)source.setAttribute('data-printy-source-hidden','');
      let entry=cards.get(row.id);if(!entry){entry={node:el('article'),query:'',page:0,expanded:true,signature:''};cards.set(row.id,entry);grid.append(entry.node);}
      entry.row=row;
      const assessment=FarmLightsLogic.triage(row);
      const sig=JSON.stringify([row.name,row.state,row.config.broken,row.slots,row.config.material,row.config.color,row.minutes,row.jobs.map(({element,...j})=>j),row.log?.fault,fresh(row.log),assessment,recentMinutes,collectionMinutes]);
      if(entry.signature===sig||(root.activeElement?.matches('input')&&entry.node.contains(root.activeElement)))continue;entry.signature=sig;
      const card=entry.node;entry.expanded=card.querySelector('details')?.open??entry.expanded;card.replaceChildren();const heading=el('div',undefined,'heading'),state=row.config.broken?'broken':row.state;
      const badge=el('span',assessment.label,`status ${state}`);badge.style.color=tones[assessment.kind];badge.style.backgroundColor=tones[assessment.kind]+'15';card.style.borderTop=`4px solid ${tones[assessment.kind]}`;
      heading.append(el('h3',row.name),badge);card.append(heading);
      const active=row.jobs.find(FarmLightsLogic.isCurrentJob),preview=el('div',undefined,'preview');
      const src=active?.element?.querySelector('img')?.getAttribute('src');
      if(src&&/^https:\/\//.test(src)){const img=el('img');img.src=src;img.alt='Current print model preview';img.onerror=()=>placeholder(preview,'Preview unavailable');preview.append(img,el('small','Current model'));}
      else placeholder(preview,active?'Preview unavailable':row.state==='idle'?'No active print':row.state==='finished'?'Ready for collection':'Job details unavailable');
      card.append(preview);const body=el('div',undefined,'body');card.append(body);
      if(assessment.rank){const next=el('div',undefined,'next');next.style.borderColor=tones[assessment.kind];next.append(el('strong',assessment.priority==='high'?'Urgent · next action':'Next action'),el('p',assessment.action));body.append(next);}
      const slots=el('div',undefined,'slots');if(row.slotsKnown){row.slots.forEach(s=>{const chip=el('span',undefined,'slot'),swatch=el('span',undefined,'swatch');swatch.style.backgroundColor=s.rgb;chip.append(swatch,document.createTextNode(s.material));slots.append(chip);});if(!row.slots.length)slots.append(el('span','No loaded filament reported','muted'));}else slots.append(el('span',[row.config.material,row.config.color].filter(Boolean).join(' · ')||'Filament unavailable','muted'));body.append(slots);
      const current=el('div',undefined,'current');current.append(el('div',active?.name||(row.state==='idle'?'No active print':'Current job details unavailable'),'filename'));
      if(active){current.append(el('p',row.state==='printing'&&row.minutes!=null?`${row.minutes} min remaining + collection`:row.state==='paused'?'Paused · availability unknown':'Remaining time not available','muted'));if(active.estimatedMinutes!=null)current.append(el('p',`Total job estimate: ${active.estimatedMinutes} min`,'muted'));current.append(button('Job details',()=>entry.row.jobs.find(j=>j.id===active.id)?.element?.querySelector('.file-details-title')?.click()));}
      body.append(current);
      if(row.log?.fault&&fresh(row.log))body.append(el('p',`${row.log.faultHistorical?'Earlier fault':'Reported fault'}: ${row.log.fault.message}`,'fault'));
      const files=el('details');files.open=entry.expanded;files.append(el('summary',`Files (${row.jobs.length})`));files.addEventListener('toggle',()=>{if(files.isConnected)entry.expanded=files.open;});
      const search=el('input');search.type='search';search.placeholder='Find a file…';search.setAttribute('aria-label',`${row.name} files`);search.value=entry.query;
      const list=el('div');function showFiles(){list.replaceChildren();const groups=FarmLightsLogic.groupJobs(entry.row.jobs,recentMinutes),recent=new Set(groups.recent.map(j=>j.id));const selected=entry.row.jobs.filter(j=>j.name.toLowerCase().includes(entry.query.toLowerCase())).sort((a,b)=>Number(FarmLightsLogic.isCurrentJob(b))-Number(FarmLightsLogic.isCurrentJob(a))||Number(recent.has(b.id))-Number(recent.has(a.id)));
        entry.page=Math.min(entry.page,Math.max(0,Math.ceil(selected.length/3)-1));const start=entry.page*3;
        selected.slice(start,start+3).forEach(j=>{const line=el('div',undefined,'job');line.append(el('div',j.name,'filename'),el('p',`${j.state}${recent.has(j.id)?' · recently added':''}${j.estimatedMinutes!=null?' · '+j.estimatedMinutes+' min total':''}`,'muted'));line.append(button('Details',()=>entry.row.jobs.find(item=>item.id===j.id)?.element?.querySelector('.file-details-title')?.click()));list.append(line);});if(!selected.length)list.append(el('p','No matching files.','muted'));
        if(selected.length>3){const pages=el('div',undefined,'actions'),prev=button('Previous files',()=>{entry.page--;showFiles();}),next=button('Next files',()=>{entry.page++;showFiles();});prev.disabled=entry.page===0;next.disabled=start+3>=selected.length;pages.append(prev,el('span',`${start+1}–${Math.min(start+3,selected.length)} of ${selected.length}`,'muted'),next);list.append(pages);}}
      search.oninput=()=>{entry.query=search.value;entry.page=0;showFiles();};files.append(search,el('p','Current and recent files first · stored files add no wait.','muted'),list);showFiles();body.append(files);
      const actions=el('div',undefined,'actions');const live=row.card.querySelector('button[aria-label="Open live view"]');if(live){const b=button('Live camera',()=>entry.row.card.querySelector('button[aria-label="Open live view"]')?.click());b.disabled=live.disabled;actions.append(b);}actions.append(button('Manage files',()=>showOriginal(entry.row)));body.append(actions);
    }
    const ids=new Set(rows.map(r=>r.id));for(const[id,e]of cards)if(!ids.has(id)){e.node.remove();cards.delete(id);}
  }
  return {sync,restore,elementFor:id=>cards.get(id)?.node};
})();
