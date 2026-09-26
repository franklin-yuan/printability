/* DOM adapter verified against the 3DPrinterOS Printers page, September 2026.
   Reads rendered fields only. Does not access cookies or private application APIs. */
globalThis.PrintySource = (() => {
  const text=n=>(n?.textContent||'').trim();
  const dates=new Map();
  function requirements(value){
    // Only explicit sliced-file labels. Never infer requirements from filenames or AMS contents.
    const text=String(value||'').replace(/\u00a0/g,' ');
    // Job Details renders the file requirement as "131.00g - TPU - 0.4mm".
    // This is file metadata, distinct from the printer's loaded AMS materials.
    const compact=text.match(/\b(\d+(?:\.\d+)?)\s*g\s*[-–—]\s*([A-Za-z][A-Za-z0-9 +_/-]*?)\s*[-–—]\s*(\d+(?:\.\d+)?)\s*mm\b/i);
    const material=text.match(/(?:^|\n)\s*(?:Filament type|Material|Sliced material)(?:[ \t]*:[ \t]*|[ \t]*\n[ \t]*)([A-Za-z0-9 +_/-]+)(?=\n|$)/im)?.[1]?.trim()||compact?.[2]?.trim()||'';
    const profile=text.match(/(?:^|\n)\s*(?:Printer profile|Sliced printer)(?:[ \t]*:[ \t]*|[ \t]*\n[ \t]*)([^\n]+)/im)?.[1]?.trim()||'';
    const nozzle=text.match(/(?:^|\n)\s*(?:Nozzle diameter|Sliced nozzle)(?:[ \t]*:[ \t]*|[ \t]*\n[ \t]*)(\d+(?:\.\d+)?)\s*mm/im)?.[1]||compact?.[3]||'';
    const plate=text.match(/(?:^|\n)\s*(?:Plate type|Build plate)(?:[ \t]*:[ \t]*|[ \t]*\n[ \t]*)([^\n]+)/im)?.[1]?.trim()||'';
    return {material,profile,nozzle,plate,filamentGrams:compact?Number(compact[1]):null,source:compact?'3DPrinterOS file details summary':'Explicit file metadata labels'};
  }
  function fileDialogs(name){
    const nodes=[...document.querySelectorAll('#job-details-modal,[role="dialog"],[aria-modal="true"],dialog,.modal')]
      .filter(n=>n.getClientRects().length&&(n.innerText||'').includes(name));
    return nodes.filter(n=>!nodes.some(other=>other!==n&&n.contains(other)));
  }
  function fileText(dialog,name){
    let value=dialog.innerText||'';
    // Never interpret AMS entries or historical log messages as sliced requirements.
    if(dialog.id==='job-details-modal'||/^Job Details\b/.test(value.trim())){
      const start=value.indexOf(name);if(start<0)return '';
      value=value.slice(start+name.length).split(/\[\d{1,2}:\d{2}\s+\d{2}\/\d{2}\/\d{4}\]/)[0];
    }
    return value.trim();
  }
  function slots(root) {
    const parent=root.querySelector('.filament-properties-parent');
    if(!parent)return {slotsKnown:false,slots:[]};
    const items=[...parent.querySelectorAll('.filament-properties')];
    return {slotsKnown:items.length>0,slots:items.flatMap((n,index)=>{
      const swatch=n.querySelector('.filament-color'), material=text(n.querySelector('.filament-extra'));
      if(!material||/^empty$/i.test(material)||swatch?.classList.contains('no-filament'))return [];
      const rgb=swatch?.style.backgroundColor||'';
      return [{slot:index+1,material,rgb,color:FarmLightsLogic.colorName(rgb),source:'AMS/page'}];
    })};
  }
  function badge(root) {
    const b=root.querySelector('.printer-badge');
    return b?.getAttribute('data-original-title')||b?.getAttribute('title')||b?.getAttribute('aria-label')||text(b);
  }
  function printers(doc) {
    return [...doc.querySelectorAll('.printers-table__item[id^="printer-item-"]')].map(card=>{
      const name=text(card.querySelector('.printer-details-title'));
      const model=text(card.querySelector('.printer-details-type'));
      const jobs=[...card.parentElement.querySelectorAll('tr[id^="printers-job__row_"]')].map(tr=>{
        const nameNode=tr.querySelector('.file-details-title [title]');
        const date=tr.querySelector('.edit-time');
        const justNow=/^(just now|a few seconds ago|moments ago)$/i.test(text(date));
        const relative=text(date).match(/^(\d+)\s*(m|min|mins|minutes?|s|sec|seconds?)\s+ago$/i);
        // This is a displayed file date; it is not a promised scheduled start.
        const dateKey=tr.id+':'+text(date);
        if(!dates.has(dateKey))dates.set(dateKey,justNow?new Date().toISOString():relative?new Date(Date.now()-Number(relative[1])*(/^m/i.test(relative[2])?60000:1000)).toISOString():null);
        const uploadedAt=dates.get(dateKey);
        return {id:tr.getAttribute('data-pk')||tr.id,name:nameNode?.getAttribute('title')||text(tr.querySelector('.file-details-title')),
          state:tr.querySelector('.job-status')?.getAttribute('aria-label')||'unknown',uploadedAt,
          dateLabel:text(date),dateTitle:date?.getAttribute('title')||'',estimatedMinutes:duration(text(tr.querySelector('.print-time'))),source:'printers-page',current:!!tr.closest('.collapse-jobs--in-progress'),element:tr};
      });
      return {id:card.id.replace('printer-item-',''),name,model,raw:badge(card),card,jobs,...slots(card)};
    }).filter(r=>r.name&&!/virtual|industrial|print queue/i.test(r.model+' '+r.raw+' '+r.name+' '+r.card.querySelector('.printer-badge')?.className));
  }
  function duration(value){const m=String(value).match(/(\d+):(\d{2})h/);return m&&Number(m[2])<60?Number(m[1])*60+Number(m[2]):null;}
  function logJob(row){
    const active=row.jobs.filter(j=>j.current||FarmLightsLogic.isCurrentJob(j));
    if(active.length)return active[0];
    // Stored queued files are not execution evidence. Use latest displayed execution history.
    return row.jobs.filter(j=>/^(finished|aborted|failed|completed)$/i.test(j.state)).sort((a,b)=>{
      const ad=Date.parse(a.dateTitle),bd=Date.parse(b.dateTitle);
      return Number.isFinite(ad)&&Number.isFinite(bd)?bd-ad:Number(b.id)-Number(a.id);
    })[0]||null;
  }
  return {slots,badge,printers,duration,logJob,requirements,fileDialogs,fileText};
})();
