document.querySelector('#extension-id').textContent=chrome.runtime.id;
chrome.storage.local.get('printyConnection').then(({printyConnection})=>{document.querySelector('#token').value=printyConnection?.token||'';});
document.querySelector('#save').onclick=async()=>{
  const status=document.querySelector('#status'),token=document.querySelector('#token').value.trim();
  if(!/^[a-zA-Z0-9_-]{32,128}$/.test(token)){status.textContent='Paste the connection code from the Printy helper.';return;}
  await chrome.storage.local.set({printyConnection:{token}});status.textContent='Checking…';
  const res=await chrome.runtime.sendMessage({type:'health'});status.textContent=res?.ok?(res.configured?'Connected. Open Overview and choose Analyze with OpenAI.':'Helper connected. Add your OpenAI API key in the helper.'):(res?.error||'Connection failed.');
};
