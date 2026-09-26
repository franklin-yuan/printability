// Reserve before fetching so tabs share the automatic request budget.
let automaticQueue=Promise.resolve();
async function automaticUpdate(message){
  const events=(message.events||[]).slice(0,150).filter(e=>typeof e.name==='string'&&typeof e.description==='string');
  if(!events.length)return {ok:false,error:'No major changes.'};
  const reserve=automaticQueue.then(async()=>{
    const now=Date.now(),day=new Date(now).toISOString().slice(0,10);
    const stored=await chrome.storage.local.get(['printyAutoBudget','printyConnection','farm-lights:3dprinteros:v1','farm-lights:demo:v1']);
    const {printyAutoBudget,printyConnection}=stored;
    const enabled=stored[message.snapshot?.source==='simulation'?'farm-lights:demo:v1':'farm-lights:3dprinteros:v1']?.autoAI===true;
    const budget=printyAutoBudget||{day,count:0,lastAt:0};if(budget.day!==day){budget.day=day;budget.count=0;}
    if(now-budget.lastAt<300000)return {skip:true,reason:'Changes batched; another notification was just delivered.'};
    budget.lastAt=now;
    const useAI=enabled&&!!printyConnection?.token&&budget.count<6&&(!budget.lastAIAt||now-budget.lastAIAt>=1800000);
    if(useAI){budget.count++;budget.lastAIAt=now;}
    await chrome.storage.local.set({printyAutoBudget:budget});
    return {useAI,token:printyConnection?.token,reason:!enabled?'Automatic AI off · no API call.':!printyConnection?.token?'AI helper not connected.':'Automatic AI budget or cooldown reached; showing the next check.'};
  });
  automaticQueue=reserve.catch(()=>{});const reservation=await reserve;
  if(reservation.skip)return {ok:true,reason:reservation.reason};
  let result=null,reason=reservation.reason;
  if(reservation.useAI){try{
    const response=await fetch('http://127.0.0.1:8765/analyze',{method:'POST',headers:{Authorization:`Bearer ${reservation.token}`,'Content-Type':'application/json'},body:JSON.stringify({...message.snapshot,changes:events}),signal:AbortSignal.timeout(65000)});
    const data=await response.json();if(!response.ok)throw Error(data.error||'AI request failed.');result=data.result;
  }catch{reason='AI unavailable; showing observed facts. Check the helper connection.';}}
  events.sort((a,b)=>(Number(b.rank)||0)-(Number(a.rank)||0));
  const urgent=events[0]?.priority==='high';
  const groups={down:[],paused:[],recovered:[],ready:[],other:[]};
  for(const e of events){const key=e.broken||['error','offline'].includes(e.to)||['fault','fatal','broken'].includes(e.kind)?'down':e.to==='paused'?'paused':['paused','error','offline'].includes(e.from)&&['printing','heating','preparing','idle'].includes(e.to)?'recovered':['idle','finished'].includes(e.to)?'ready':'other';groups[key].push(e.name);}
  const labels={down:'NOW DOWN',paused:'PAUSED',recovered:'RECOVERED',ready:'READY / FINISHED',other:'UPDATED'};
  const text=Object.entries(groups).filter(([,names])=>names.length).map(([key,names])=>`${labels[key]} (${names.length}): ${names.join(', ')}`).join('\n');
  let notificationError=false;
  try{await chrome.notifications.create('printy-farm-update',{type:'basic',iconUrl:chrome.runtime.getURL('icon.png'),title:groups.down.length?`Printy · ${groups.down.length} printer${groups.down.length===1?'':'s'} now down`:'Printy · Printer updates',message:String(text).slice(0,450),contextMessage:'Open Updates for details · Next steps for actions',priority:urgent?2:1});}catch{notificationError=true;}
  return {ok:true,result,reason,notificationError};
}
// API credentials never enter a web-page content script.
chrome.storage.local.setAccessLevel({accessLevel:'TRUSTED_CONTEXTS'});
// Page preferences use messages too; trusted storage keeps the pairing code isolated.
chrome.runtime.onMessage.addListener((message,sender,respond)=>{
  const trusted=sender.id===chrome.runtime.id;
  const isPage=sender.url?.startsWith('https://cloud.3dprinteros.com/');
  const isExtension=sender.url?.startsWith(chrome.runtime.getURL(''));
  if(!trusted||(!isPage&&!isExtension))return;
  (async()=>{
    if(message.type==='open-options'){await chrome.runtime.openOptionsPage();return {ok:true};}
    if(message.type==='get-settings'&&!/^farm-lights:(demo|3dprinteros):v1$/.test(message.key))throw Error('Invalid settings key.');
    if(message.type==='get-settings')return {ok:true,value:(await chrome.storage.local.get(message.key))[message.key]};
    if(message.type==='save-settings'){
      if(!/^farm-lights:(demo|3dprinteros):v1$/.test(message.key))throw Error('Invalid settings key.');
      await chrome.storage.local.set({[message.key]:message.value});return {ok:true};
    }
    if(message.type==='auto-analyze')return automaticUpdate(message);
    if(!['health','analyze'].includes(message.type))throw Error('Unknown request.');
    const {printyConnection}=await chrome.storage.local.get('printyConnection');
    if(!printyConnection?.token)throw Error('Connect the local helper in Settings → Open AI connection settings.');
    const response=await fetch(`http://127.0.0.1:8765/${message.type==='health'?'health':'analyze'}`,{
      method:message.type==='health'?'GET':'POST',headers:{'Authorization':`Bearer ${printyConnection.token}`,'Content-Type':'application/json'},
      ...(message.type==='analyze'?{body:JSON.stringify(message.snapshot)}:{}),signal:AbortSignal.timeout(65000)
    });
    const data=await response.json();if(!response.ok)throw Error(data.error||'The helper could not complete the request.');return {ok:true,...data};
  })().then(respond).catch(e=>respond({ok:false,error:e.message==='Failed to fetch'?'Start the Printy helper, then check the connection code in Settings.':e.message}));
  return true;
});
