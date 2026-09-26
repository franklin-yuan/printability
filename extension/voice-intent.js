/* Conversational selection, based only on user speech and known dashboard filenames. */
globalThis.PrintabilityIntent=(()=>{
  const normalize=s=>String(s||'').replace(/([A-Z]+)([A-Z][a-z])/g,'$1 $2').replace(/([a-z])([A-Z])/g,'$1 $2').toLowerCase().replace(/\.(?:gcode|3mf|stl)(?:\.gcode)?$/,'').replace(/[^a-z0-9]+/g,' ').trim();
  const stop=new Set(['plate','file','print','prepare','open','inspect','review','show','check','please','the','for','me','on']);
  const tokens=s=>normalize(s).split(' ').filter(t=>t.length>1&&!/^\d+$/.test(t)&&!stop.has(t)).map(t=>t.length>4?t.replace(/s$/,''):t);
  function near(a,b){
    if(a===b)return true;if(Math.min(a.length,b.length)<4||Math.abs(a.length-b.length)>1)return false;
    let i=0,j=0,edits=0;while(i<a.length&&j<b.length){if(a[i]===b[j]){i++;j++;continue;}if(++edits>1)return false;if(a.length>=b.length)i++;if(b.length>=a.length)j++;}return edits+(a.length-i)+(b.length-j)<=1;
  }
  function resolve(history,printers){
    const names=[...new Set(printers.flatMap(p=>(p.files||[]).map(f=>f.name)))];
    let selected=null,workflow=false,printer=null,reason='Which file would you like to inspect or prepare?';
    for(const entry of history){
      const spoken=typeof entry==='string'?entry:entry.text;
      const text=normalize(spoken);
      if(entry?.affirmPrepare){workflow=true;reason=selected?'':'Prepare the review for the file already identified.';continue;}
      if(entry?.confirmationOf&&workflow){
        const question=String(entry.confirmationOf).toLowerCase();
        const candidates=names.filter(name=>question.includes(name.toLowerCase()));
        if(candidates.length===1){selected=candidates[0];reason='';continue;}
        selected=null;reason='The confirmation mentions multiple files. Ask which version to use.';continue;
      }
      if(/\b(cancel|stop|never|don t|dont|do not)\b/.test(text)){workflow=false;selected=null;printer=null;continue;}
      const action=/\b(print|prepare|open|inspect|review|show|check)\b/.test(text);
      if(action)workflow=true;
      const mentionedPrinters=printers.filter(p=>(' '+text+' ').includes(' '+normalize(p.name)+' '));
      if(mentionedPrinters.length===1)printer=mentionedPrinters[0].id;
      const speech=tokens(text);
      const matches=names.filter(name=>{
        if((' '+text+' ').includes(' '+normalize(name)+' '))return true;
        const words=tokens(name);return words.length>=2&&words.every(word=>speech.some(t=>near(t,word)));
      });
      if(matches.length===1&&workflow){selected=matches[0];reason='';}
      else if(matches.length>1){selected=null;reason='More than one file matches that name. Ask the user which version they mean.';}
      else if(action&&!/\b(it|this|that|file|something|printer|material|color)\b/.test(text)){selected=null;reason='No unique file matches the spoken name. Ask one short question about the filename.';}
    }
    return {selected,printer,workflow,reason};
  }
  return {resolve};
})();
