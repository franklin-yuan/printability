class PrintyMic extends AudioWorkletProcessor {
  constructor(){super();this.samples=[];}
  process(inputs){const data=inputs[0]?.[0];if(data){for(const v of data)this.samples.push(v);if(this.samples.length>=2048){this.port.postMessage(new Float32Array(this.samples));this.samples=[];}}return true;}
}
registerProcessor('printy-mic',PrintyMic);
