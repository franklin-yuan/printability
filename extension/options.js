document.querySelector('#extension-id').textContent=chrome.runtime.id;
chrome.storage.local.get('printyConnection').then(({printyConnection})=>{document.querySelector('#token').value=printyConnection?.token||'';});
document.querySelector('#save').onclick=async()=>{
  const status=document.querySelector('#status'),token=document.querySelector('#token').value.trim();
  if(!/^[a-zA-Z0-9_-]{32,128}$/.test(token)){status.textContent='Paste the connection code from the Printability helper.';return;}
  await chrome.storage.local.set({printyConnection:{token}});status.textContent='Checking…';
  const res=await chrome.runtime.sendMessage({type:'health'});status.textContent=res?.ok?(res.configured?'Connected for lights and Printability Voice.':'Connected for lights. Add your xAI key in the helper for Printability Voice.'):(res?.error||'Connection failed.');
};
