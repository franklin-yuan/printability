/* Sequential, read-only Job Details navigation. Never invokes job action buttons. */
globalThis.PrintyLogReader = (()=>{
  const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
  const visible=n=>n&&n.getClientRects().length>0;
  async function read(rows,{document:doc,capture,onResult,onProgress,cancelled}){
    // A hard boundary: automated navigation is never allowed in the user's document.
    if(!doc||doc===document)return {blocked:true,reason:'Background log reader unavailable; foreground dialogs will not be opened.'};
    const modal=()=>[...doc.querySelectorAll('[role="dialog"],.modal')].find(visible);
    if(modal())return {blocked:true,reason:'Background reader is busy.'};
    let checked=0,read=0;
    for(const row of rows){
      if(cancelled()||!doc.location.hash.startsWith('#/printers'))break;
      if(modal())return {checked,read,blocked:true,reason:'Another dialog opened; log collection paused.'};
      const job=PrintySource.logJob(row);
      const result={printer:row.name,state:row.state,jobId:job?.id||null,checkedAt:Date.now(),status:'unavailable'};
      onProgress(row.name,checked,rows.length);
      if(!job){result.reason='No current or completed job log is exposed on this page.';onResult(row,result,null);checked++;continue;}
      const target=job.element?.isConnected&&job.element.querySelector('.file-details-title');
      if(!target){result.reason='Job details link is unavailable.';onResult(row,result,null);checked++;continue;}
      let owned=null,evidence=null;
      target.click();
      try{
        for(let i=0;i<40&&!cancelled();i++){
          await wait(250);
          if(!doc.location.hash.startsWith('#/printers'))break;
          const current=doc.querySelector('#job-details-modal');
          if(visible(current)&&!owned)owned=current;
          if(!owned||current!==owned)continue;
          const j=capture([row.name]);
          if(j?.printer===row.name&&j.file===job.name&&(!j.jobId||String(j.jobId)===String(job.id))&&(j.events?.length||j.latest||j.fault)){
            evidence={...j,jobId:String(job.id),capturedPrinterState:row.state};
            // Historical job details must never supply current-print remaining time.
            if(!job.current&&!FarmLightsLogic.isCurrentJob(job)){evidence.currentJobVerified=false;evidence.availabilityMinutes=null;evidence.faultHistorical=!!evidence.fault;}
            result.status='read';read++;break;
          }
        }
        if(!evidence)result.reason=cancelled()?'Collection stopped.':'Job log did not load or could not be matched to this printer and file.';
        onResult(row,result,evidence);checked++;
      }finally{
        // Leave any user-interrupted dialog alone.
        if(!cancelled()&&owned&&doc.querySelector('#job-details-modal')===owned){
          owned.querySelector('header button[aria-label="Close"]')?.click();
          for(let i=0;i<20&&visible(owned);i++)await wait(100);
        }
      }
    }
    return {checked,read,blocked:false};
  }
  let frame=null;
  function dispose(){frame?.remove();frame=null;}
  async function backgroundDocument(cancelled=()=>false){
    dispose();
    frame=document.createElement('iframe');frame.id='printy-background-reader';frame.title='Printability background log reader';
    frame.tabIndex=-1;frame.setAttribute('aria-hidden','true');frame.setAttribute('inert','');
    frame.setAttribute('sandbox','allow-scripts allow-same-origin');
    frame.style.cssText='position:fixed!important;left:-20000px!important;top:0!important;width:1280px!important;height:900px!important;opacity:0!important;pointer-events:none!important;border:0!important;';
    frame.src=location.origin+'/#/printers';document.documentElement.append(frame);
    let lastInventory='',stable=0;
    for(let i=0;i<80&&!cancelled();i++){
      await wait(250);
      try{
        const doc=frame?.contentDocument;
        if(!doc||doc.location.origin!==location.origin||!doc.location.hash.startsWith('#/printers'))continue;
        const inventory=PrintySource.printers(doc).map(r=>r.id).sort().join(',');
        stable=inventory&&inventory===lastInventory?stable+1:0;lastInventory=inventory;
        if(stable>=6)return doc;
      }catch{/* Session or framing restrictions: do not fall back to foreground navigation. */}
    }
    dispose();throw Error('Background logs could not load. Your session or this site may block embedded pages; logs remain unavailable until opened manually.');
  }
  return {read,backgroundDocument,dispose};
})();
