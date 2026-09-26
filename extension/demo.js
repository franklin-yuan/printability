(() => {
  document.documentElement.dataset.farmLightsDemo = 'true';
  const data = [
    ['Crane','idle','PLA','Blue',0], ['Link','printing','PETG','Black',35],
    ['Tigress','idle','PLA','White',0], ['Po','paused','PLA','Blue',null],
    ['Remy','idle','PLA','Blue',0], ['Gusteau','error','ABS','Black',null]
  ];
  const farm = document.querySelector('#farm');
  const demoStart = Date.now();
  document.querySelector('#show-log').addEventListener('click',()=>{
    const dialog=document.createElement('dialog');dialog.setAttribute('aria-label','Job Details');
    dialog.style.cssText='margin:5vh auto 5vh 3vw;width:55vw;max-height:85vh;overflow:auto;border:1px solid #b6ccc1;border-radius:12px;padding:24px;color:#173b32';
    const text=document.createElement('div');text.style.whiteSpace='pre-wrap';text.textContent=`Job Details\nLogs\n\nFireboy\nBambu Lab X1E\n\nDemo bracket.gcode\nTime left: 04:21h\n\n[16:25 09/23/2026] The printer status changed: from printing to heating\n[16:27 09/23/2026] The printer status changed: from heating to printing\n[16:27 09/23/2026] Printer info 50364440: Chamber temperature malfunction.\n[16:27 09/23/2026] The printer status changed: from printing to paused`;
    const resume=document.createElement('button');resume.textContent='Resume';resume.disabled=true;resume.title='Simulation only';
    const close=document.createElement('button');close.textContent='Close';close.addEventListener('click',()=>{dialog.close();dialog.remove();});
    dialog.append(text,resume,close);document.body.append(dialog);dialog.showModal();
  });
  data.forEach(([name,state,material,color,minutes]) => {
    const card = document.createElement('article'); card.className = 'live-view-wall-camera';
    card.dataset.demoMaterial = material; card.dataset.demoColor = color;
    const title = document.createElement('div'); title.className = 'live-view-wall-printer-name';
    const strong = document.createElement('strong'); strong.textContent = name;
    const badge = document.createElement('span'); badge.className = 'printer-badge'; title.append(strong,badge);
    const preview = document.createElement('div'); preview.className = 'preview'; preview.textContent = '▧';
    const controls = document.createElement('label'); controls.className = 'state-controls'; controls.textContent = 'Source';
    const select = document.createElement('select'); select.setAttribute('aria-label', `${name} simulated source status`);
    ['idle','heating','preparing','printing','paused','finished','error','offline'].forEach(s => select.add(new Option(s,s)));
    function update() {
      const s = select.value; const raw = s + (s === 'printing' ? ' 40%' : s === 'paused' ? ' 47%' : '');
      badge.setAttribute('data-original-title',raw); badge.title = raw;
      badge.style.background = ({idle:'#46bd77',printing:'#548bea',paused:'#efad39',error:'#d65c59'})[s] || '#89958e';
      card.dataset.demoMinutes = s === 'printing' ? String(minutes || 35) : '';
      const jobs = [
        {id:name+'-new',name:'Bracket revision B',state:'in queue',uploadedAt:new Date(demoStart-5*60000).toISOString()},
        {id:name+'-old',name:'Old calibration cube',state:'in queue',uploadedAt:new Date(demoStart-45*86400000).toISOString()},
        {id:name+'-history',name:'Previous enclosure',state:'aborted',uploadedAt:new Date(demoStart-10*86400000).toISOString()}
      ];
      if (['printing','paused','heating','preparing'].includes(s)) jobs.unshift({id:name+'-active',name:'Current demo model',state:s,uploadedAt:new Date(demoStart-3*3600000).toISOString()});
      card.dataset.demoJobs = JSON.stringify(jobs);
    }
    select.value = state; update(); select.addEventListener('change',update);
    controls.append(select); card.append(title,preview,controls); farm.append(card);
  });
  document.querySelector('#disconnect').addEventListener('click', e => {
    const disconnected = document.documentElement.dataset.demoDisconnected !== 'true';
    document.documentElement.dataset.demoDisconnected = String(disconnected);
    farm.style.opacity = disconnected ? '.4' : '1';
    e.target.textContent = disconnected ? 'Reconnect simulated source' : 'Simulate source disconnect';
  });
  document.querySelector('#reset').addEventListener('click', async () => {
    const key = 'farm-lights:demo:v1';
    if (globalThis.chrome?.storage?.local) await chrome.storage.local.remove(key);
    else localStorage.removeItem(key);
    location.reload();
  });
})();
