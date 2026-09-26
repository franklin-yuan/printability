chrome.notifications.clear('printy-farm-update').catch(()=>{});
let startupError='';
chrome.storage.local.setAccessLevel({accessLevel:'TRUSTED_CONTEXTS'}).catch(e=>{startupError=e.message||'Storage initialization failed.';});
async function helper(type,payload){
 const {printyConnection}=await chrome.storage.local.get('printyConnection');if(!printyConnection?.token)throw Error('Connect the local helper in Printability connection settings.');
 const r=await fetch(`http://127.0.0.1:8765/${type}`,{method:type==='health'?'GET':'POST',headers:{Authorization:`Bearer ${printyConnection.token}`,'Content-Type':'application/json'},...(type==='hardware'?{body:JSON.stringify(payload)}:{}),signal:AbortSignal.timeout(type==='hardware'?5000:25000)});
 const data=await r.json();if(!r.ok)throw Error(data.error||'Helper request failed.');return {ok:true,...data};
}
chrome.runtime.onMessage.addListener((m,sender,reply)=>{
 const page=sender.id===chrome.runtime.id&&sender.url?.startsWith('https://cloud.3dprinteros.com/');
 const extension=sender.id===chrome.runtime.id&&sender.url?.startsWith(chrome.runtime.getURL(''));
 const voice=extension&&sender.url?.split('?')[0]===chrome.runtime.getURL('voice.html');if(!page&&!extension)return;
 if(m.type==='open-voice'&&page){const opening=chrome.sidePanel.open({tabId:sender.tab.id});Promise.all([opening,chrome.storage.session.set({voiceSource:sender.tab.id})]).then(()=>reply({ok:true})).catch(e=>reply({ok:false,error:'Could not open Printability Voice: '+(e.message||'Refresh the dashboard and try again.')}));return true;}
 (async()=>{
 if(m.type==='worker-status')return {ok:!startupError,error:startupError,version:chrome.runtime.getManifest().version};
 if(m.type==='select-voice-source'&&extension){const tab=await chrome.tabs.get(m.tabId);if(!tab.url?.startsWith('https://cloud.3dprinteros.com/'))throw Error('Select the printer dashboard.');await chrome.storage.session.set({voiceSource:tab.id});return {ok:true};}
 if(m.type==='open-options'){await chrome.runtime.openOptionsPage();return {ok:true};}
 if(['get-settings','save-settings'].includes(m.type)){if(!/^farm-lights:3dprinteros:v1$/.test(m.key))throw Error('Invalid settings key.');if(m.type==='save-settings'){await chrome.storage.local.set({[m.key]:m.value});return {ok:true};}return {ok:true,value:(await chrome.storage.local.get(m.key))[m.key]};}
 if(m.type==='notify-updates')return {ok:true};
 if(m.type==='voice-source'&&voice)return {ok:true,source:sender.tab?.id??(await chrome.storage.session.get('voiceSource')).voiceSource};
 if(m.type==='voice-token'&&voice)return helper('voice-token');
 if(m.type==='voice-commit')throw Error('Print execution is disabled. Review only.');
 if(['voice-snapshot','voice-find','voice-prepare','voice-review-read','voice-review-open','voice-file-info','voice-show'].includes(m.type)&&voice){const voiceSource=m.source;if(!Number.isInteger(voiceSource))throw Error('Open Printability Voice from the Printers page.');const result=await chrome.tabs.sendMessage(voiceSource,m);if(!result)throw Error('Refresh the Printers page.');return result;}
 if(['health','hardware'].includes(m.type))return helper(m.type,m.payload);throw Error('Unknown request.');
 })().then(reply).catch(e=>reply({ok:false,error:e.message==='Failed to fetch'?'Start the Printability helper and check its connection code.':e.message}));return true;
});
