/* Major changes only: batch 15 seconds of events, ignore loading and progress ticks. */
globalThis.PrintyChanges=(()=>{
  function fact(r){const assessment=globalThis.FarmLightsLogic?.triage(r);return {id:String(r.id||r.name),name:r.name,state:r.state,broken:r.config?.broken===true,
    fault:assessment&&['fault','fatal'].includes(assessment.kind)?assessment.reason:'',assessment};}
  function describe(a,b){
    if(a.broken!==b.broken)return b.broken?'Marked BROKEN':'BROKEN override cleared';
    if(b.fault&&a.fault!==b.fault)return `Reported fault: ${b.fault}`;
    if(a.assessment?.kind!==b.assessment?.kind&&b.assessment?.rank>=60&&a.state===b.state)return b.assessment.label;
    if(a.state===b.state)return '';
    if(b.state==='error')return 'Printer reports an error';
    if(b.state==='paused')return 'Print paused';
    if(b.state==='offline')return 'Printer disconnected';
    if(b.state==='finished')return 'Print finished; check collection and bed clearance';
    if(b.state==='idle'&&a.state!=='unknown')return 'Now idle; check bed clearance before starting a job';
    if(['error','paused','offline'].includes(a.state)&&['printing','heating','preparing'].includes(b.state))return `Now ${b.state} after being ${a.state}`;
    return '';
  }
  class Tracker{
    constructor(){this.seen=new Map();this.pending=new Map();this.due=0;}
    observe(rows,now=Date.now()){
      const present=new Set(rows.map(r=>r.name));
      for(const name of this.pending.keys())if(!present.has(name))this.pending.delete(name);
      for(const r of rows){if(r.ambiguous||r.state==='unknown')continue;const b=fact(r),old=this.seen.get(r.name);this.seen.set(r.name,b);if(!old)continue;
        const a=this.pending.get(r.name)?.before||old,description=describe(a,b);
        if(description){this.pending.set(r.name,{before:a,after:b,description});if(!this.due)this.due=now+15000;}
        else this.pending.delete(r.name);
      }
      if(!this.pending.size)this.due=0;
    }
    take(now=Date.now()){if(!this.due||now<this.due)return [];const events=[...this.pending.values()].map(e=>({id:e.after.id,name:e.after.name,from:e.before.state,to:e.after.state,broken:e.after.broken,description:e.description}));this.pending.clear();this.due=0;return events;}
    reset(){this.seen.clear();this.pending.clear();this.due=0;}
  }
  return {Tracker,describe};
})();
