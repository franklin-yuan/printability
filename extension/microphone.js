const allow=document.getElementById('allow'),result=document.getElementById('result');
allow.onclick=async()=>{
  allow.disabled=true;
  result.textContent='Choose Allow in Chrome’s microphone prompt.';
  try{
    const stream=await navigator.mediaDevices.getUserMedia({audio:true});
    stream.getTracks().forEach(track=>track.stop());
    result.textContent='Microphone access works. Close this tab, return to Printability, and click Start Printability Voice. You can then speak naturally.';
  }catch(error){
    result.textContent=`${error.name}: ${error.message}. `+(error.name==='NotAllowedError'
      ? 'Chrome still refused access in this tab. Check this Printability tab’s microphone permission; if Chrome is managed by your school, its policy may block access.'
      : error.name==='NotFoundError'?'No microphone was found. Connect a microphone and try again.'
      : 'Check that the microphone is available and try again.');
  }finally{allow.disabled=false;}
};
