const note=document.getElementById('status');
async function dashboard(){const tabs=await chrome.tabs.query({url:'https://cloud.3dprinteros.com/*'});const target=tabs.find(t=>t.active&&t.url?.includes('#/printers'))||tabs.find(t=>t.url?.includes('#/printers'));if(!target)throw Error('Open the printer dashboard first.');return target;}
async function run(action){try{await action();}catch(e){note.textContent=e.message||'Could not connect. Reopen this popup after reloading the extension.';}}
document.getElementById('settings').onclick=()=>run(()=>chrome.runtime.openOptionsPage());
document.getElementById('refresh').onclick=()=>run(async()=>{const tab=await dashboard();await chrome.tabs.reload(tab.id);note.textContent='Dashboard refreshed. Your settings are preserved.';});
let voiceTab=null;const voiceButton=document.getElementById('voice');voiceButton.disabled=true;
void run(async()=>{voiceTab=await dashboard();const reply=await chrome.runtime.sendMessage({type:'select-voice-source',tabId:voiceTab.id});if(!reply?.ok)throw Error(reply?.error||'Could not select dashboard.');voiceButton.disabled=false;});
voiceButton.onclick=()=>run(async()=>{if(!voiceTab)throw Error('Open the printer dashboard first.');await chrome.sidePanel.open({tabId:voiceTab.id});note.textContent='Voice panel opened. Start voice there when ready.';});

void run(async()=>{const reply=await chrome.runtime.sendMessage({type:'worker-status'});if(!reply?.ok)throw Error(reply?.error||'Background worker unavailable. Toggle the extension off and on in Chrome.');note.textContent='Connected · v'+reply.version;});
