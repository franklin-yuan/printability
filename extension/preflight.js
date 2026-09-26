/* Read-only manual verification. Entries describe checks; they never edit printer settings. */
globalThis.PrintabilityPreflight={
  check(review,values){
    const checks=[],add=(name,state,detail)=>checks.push({name,state,detail});
    const norm=s=>String(s||'').trim().toLowerCase();
    add('Printer availability',review.status==='idle'?'match':'mismatch',review.status||'Unknown');
    const slot=(review.slots||[]).find(s=>String(s.slot)===values.slot);
    const required=norm(values.material).replace(/\s+(basic|matte)$/,'');
    const loaded=norm(slot?.material).replace(/\s+(basic|matte)$/,'');
    add('File material → selected AMS slot',!required||!review.filamentKnown||!slot?'unknown':required===loaded?'match':'mismatch',slot?`Slot ${slot.slot}: ${slot.material} · ${slot.color||'color unknown'}`:'Select a loaded slot and enter the material from Slice Info.');
    add('File color → selected AMS slot',!values.color||!slot?.color?'unknown':norm(values.color)===norm(slot.color)?'match':'mismatch','Enter the required color or explicitly confirm color does not matter.');
    if(values.anyColor)checks[checks.length-1]={name:'File color',state:'manual',detail:'User confirmed any color is acceptable.'};
    for(const [name,a,b] of [['Printer profile','profile','printerModel'],['Nozzle diameter (mm)','fileNozzle','printerNozzle'],['Build plate','filePlate','printerPlate']]){
      const left=norm(values[a]),right=norm(values[b]);
      add(name,!left||!right?'unknown':left===right?'manual':'mismatch',!left||!right?'Compare the sliced file setting with the actual printer.':`${values[a]} / ${values[b]} (entered by you)`);
    }
    for(const [name,key] of [['Model fits plate, orientation and layers inspected','geometry'],['Supports and first layer inspected','supports'],['All file materials mapped; enough filament on each spool','mapping'],['Nozzle/bed temperature settings verified for filament and plate','temperatures'],['Bed clear, plate installed, printer physically ready','physical']])add(name,values[key]?'manual':'unknown',values[key]?'Confirmed by you':'Needs manual inspection');
    return checks;
  },
  mount(host,review){
    host.replaceChildren();const req=review.requirements||{};
    const picked=(review.slots||[]).find(s=>String(s.material).replace(/\s+(Basic|Matte)$/i,'').toLowerCase()===String(req.material||'').replace(/\s+(Basic|Matte)$/i,'').toLowerCase()&&(!review.requestedColor||review.requestedColor==='Any'||s.color===review.requestedColor));
    const values={material:req.material||'',profile:req.profile||'',fileNozzle:req.nozzle||'',filePlate:req.plate||'',printerModel:review.model==='Not reported'?'':review.model||'',slot:picked?String(picked.slot):'',color:review.requestedColor==='Any'?'':review.requestedColor||'',anyColor:review.requestedColor==='Any'},fields=document.createElement('details'),results=document.createElement('div'),manuals=document.createElement('div');
    const summary=document.createElement('summary');summary.textContent='Optional slice / AMS notes';fields.append(summary);
    const overview=document.createElement('p');
    overview.textContent=(req.material||'Material still unknown')+' · '+(picked?'Looks like AMS slot '+picked.slot+(picked.color?' ('+picked.color+')':''):'No matching AMS slot found yet')+'.';
    const intro=document.createElement('p');intro.className='small';intro.textContent='Check these at the machine. Nothing here starts a print or changes the printer.';
    host.append(overview,intro,results,manuals,fields);
    function plainMismatch(c){
      if(c.name==='Printer availability')return 'Printer is not free ('+(c.detail||'busy')+').';
      if(c.name.startsWith('File material'))return 'Material does not match the selected AMS slot.';
      if(c.name.startsWith('File color'))return 'Color does not match the selected AMS slot.';
      if(c.name==='Build plate')return 'Build plate may not match what this file expects.';
      if(c.name==='Printer profile')return 'Printer model may not match the sliced profile.';
      if(c.name.startsWith('Nozzle'))return 'Nozzle size may not match what this file expects.';
      return c.name+': '+c.detail;
    }
    function update(){
      results.replaceChildren();
      const checks=PrintabilityPreflight.check(review,values);
      const title=document.createElement('strong');
      title.textContent=checks.some(c=>c.state==='mismatch')?'Fix these before you print':checks.some(c=>c.state==='unknown')?'A few checks still need you':'Looks consistent — printing stays disabled here';
      results.append(title);
      for(const c of checks.filter(c=>c.state==='mismatch')){
        const item=document.createElement('p');item.className='check-'+c.state;item.textContent=plainMismatch(c);results.append(item);
      }
    }
    function input(label,key,type='text',into=fields){const l=document.createElement('label'),i=document.createElement('input');l.textContent=label;i.type=type;if(type==='checkbox')i.checked=!!values[key];else i.value=values[key]||'';i.oninput=()=>{values[key]=type==='checkbox'?i.checked:i.value;update();};l.append(i);into.append(l);}
    const label=document.createElement('label');label.textContent='AMS slot to use';const select=document.createElement('select');select.add(new Option('Choose slot',''));for(const s of review.slots||[])select.add(new Option(`${s.slot}: ${s.material} · ${s.color||'unknown color'}`,String(s.slot)));select.value=values.slot;select.onchange=()=>{values.slot=select.value;update();};label.append(select);fields.append(label);
    for(const [label,key] of [['File material (from Slice Info)','material'],['Required color','color'],['Sliced printer profile','profile'],['Actual printer model','printerModel'],['Sliced nozzle diameter (mm)','fileNozzle'],['Installed nozzle diameter (mm)','printerNozzle'],['Sliced plate type','filePlate'],['Installed plate type','printerPlate']])input(label,key);
    input('Any color is acceptable','anyColor','checkbox',fields);
    for(const [label,key] of [['I inspected model size, orientation and layers','geometry'],['I inspected supports and first layer','supports'],['I verified material-to-slot mappings and spool amounts','mapping'],['I verified temperatures for this filament and plate','temperatures'],['I checked the bed and physical printer','physical']])input(label,key,'checkbox',manuals);
    update();
    return {refresh(next){review=next;update();},values};
  }
};
