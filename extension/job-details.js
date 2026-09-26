/* Reads only the visible Job Details dialog. No network interception or job controls. */
globalThis.PrintyJobs = (() => {
  function parse(text, knownNames = [], controls = []) {
    if (!/^Job Details\b/m.test(text)) return null;
    const lines = text.split(/\n/).map(s=>s.trim()).filter(Boolean);
    const header = text.split(/\[\d{1,2}:\d{2}/)[0];
    const matching = knownNames.filter(n=>lines.includes(n));
    const model = lines.findIndex(s=>/^Bambu Lab X1[EC]$/i.test(s));
    const printer = matching.length===1 ? matching[0] : model>0 ? lines[model-1] : null;
    if (!printer || printer.length>150) return null;
    const file = lines.find(s=>/\.(?:gcode|3mf|stl)(?:\.gcode)?$/i.test(s)) || null;
    const time = header.match(/Time left:\s*(\d+):(\d{2})h/i);
    const timeMinutes = time && Number(time[2])<60 ? Number(time[1])*60+Number(time[2]) : null;
    const events = [];
    const pattern=/\[(\d{1,2}):(\d{2})\s+(\d{2})\/(\d{2})\/(\d{4})\]\s*([\s\S]*?)(?=\[\d{1,2}:\d{2}\s+\d{2}\/\d{2}\/\d{4}\]|$)/g;
    for (const m of text.matchAll(pattern)) {
      const message=m[6].split(/\n\s*(?:Close|Open in toolpath viewer)\s*(?:\n|$)/)[0].replace(/\s+/g,' ').trim();
      const timestamp=`${m[3]}/${m[4]}/${m[5]} ${m[1]}:${m[2]}`;
      const order=Number(`${m[5]}${m[3]}${m[4]}${m[1].padStart(2,'0')}${m[2]}`);
      events.push({timestamp,order,message});
    }
    // Use timestamp order, preserving source order for entries in the same minute.
    events.sort((a,b)=>a.order-b.order);
    const transitions=events.map(e=>({...e,state:e.message.match(/^The printer status changed:\s*from .+? to ([\w ]+?)[.!]?$/i)?.[1]?.trim().toLowerCase()})).filter(e=>e.state);
    const latest=transitions.at(-1);
    const fault=events.filter(e=>/^(?:Printer (?:info|error)|Error|Printing failed|Printing error)\b/i.test(e.message)
      && /\b(malfunction|failed|failure|error|fault)\b/i.test(e.message)
      && !/\b(no errors?|cleared|resolved)\b/i.test(e.message)).at(-1);
    const currentJobVerified=controls.some(s=>/^(Pause|Resume)$/i.test(s.trim()));
    const pausedControl=controls.some(s=>/^Resume$/i.test(s.trim()));
    const phase=pausedControl?'paused':latest?.state||'unknown';
    return {printer,file,timeMinutes,phase,currentJobVerified,latest:latest?{timestamp:latest.timestamp,message:latest.message}:null,
      fault:fault?{timestamp:fault.timestamp,message:fault.message}:null,
      availabilityMinutes:currentJobVerified&&phase==='printing'?timeMinutes:null,
      events:events.slice(-8).map(e=>({timestamp:e.timestamp,message:e.message})),
      observedAt:Date.now(),source:'open-job-details'};
  }
  function capture(document, knownNames) {
    const candidates=[...document.querySelectorAll('#job-details-modal, [role="dialog"], [aria-modal="true"], dialog, .modal')];
    const modal=candidates.find(n=>n.getClientRects().length && /^Job Details\b/m.test(n.innerText||''));
    if(!modal) return null;
    const controls=[...modal.querySelectorAll('button,[role="button"]')].filter(n=>n.getClientRects().length).map(n=>n.textContent.trim());
    const title=modal.querySelector('#job-logs-panel .printer-details-title')?.textContent.trim();
    const result=parse(modal.innerText,title?[title]:knownNames,controls);
    if(!result)return null;
    const live=modal.querySelector('#job-logs-panel');
    if(live){
      result.jobId=modal.querySelector('[id^="pt-"]')?.id.replace('pt-','')||null;
      result.file=live.querySelector('.job-name')?.textContent.trim()||result.file;
      result.currentJobVerified=live.querySelector('.job-status')?.getAttribute('aria-label')==='In progress';
      result.phase=FarmLightsLogic.status(PrintySource.badge(live));
      result.availabilityMinutes=result.currentJobVerified&&result.phase==='printing'?result.timeMinutes:null;
      result.slots=PrintySource.slots(live);
    }
    result.faultHistorical=!!result.fault&&(!result.currentJobVerified||!['paused','error'].includes(result.phase));
    return result;
  }
  return {parse,capture};
})();
