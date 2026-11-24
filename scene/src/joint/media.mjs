// One local tracker and one transferred bitmap per active source.
export const MAX_LOCAL_VIDEO_BYTES = 512 * 1024 * 1024;

export function readKeyframes(files, times, {minimum=1} = {}) {
  if (files.length<minimum || files.length>256) throw Error(`Choose ${minimum}–256 still images.`);
  const supplied=times.trim()?times.trim().split(/[\s,]+/):null;
  if (supplied && supplied.length!==files.length) throw Error('Enter one time in seconds for every file, in the displayed file order.');
  const rows=files.map((file,i)=>{
    const stem=file.name.replace(/\.[^.]+$/,'');
    const token=supplied?.[i]??stem;
    if (!/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(token) || !Number.isFinite(Number(token))) throw Error('Enter capture times in seconds, or name each still with its time (e.g. 1.20.jpg).');
    if (file.size>32*1024*1024) throw Error('Choose images no larger than 32 MiB each.');
    return {t:Number(token),file};
  }).sort((a,b)=>a.t-b.t);
  if (rows.some((r,i)=>i && r.t<=rows[i-1].t)) throw Error('Each still needs a distinct capture time.');
  return rows;
}
export function captureSource({kind,video,clip,stills,followKnees=false,getLimb,captureWrists=false,
  waitForFinalFrame=false,getBodyRevision,getForecastRevision,onFrame,onReset,onStatus,onError,onEnd}) {
  let closed=false, epoch=0, id=0, busy=false, clock=0, callback, stream, objectURL, worker, timer, silence, finish;
  let endPending=false;
  const buffer=document.createElement('canvas');
  // Request a CPU canvas for the frames passed to the pose tracker.
  const ctx=buffer.getContext('2d',{alpha:false,willReadFrequently:true});
  const cancel=()=>new DOMException('Stopped','AbortError');
  function reset(reason) { if (!closed) { epoch++; onReset(reason); } }
  function stop() {
    if (closed) return;
    closed=true; epoch++;
    clearTimeout(timer);clearTimeout(silence);
    if (callback!==undefined) video.cancelVideoFrameCallback?.(callback);
    finish?.(cancel()); worker?.terminate();
    video.removeEventListener('seeking',seeking); video.removeEventListener('ended',ended); video.removeEventListener('error',mediaError);
    video.pause(); stream?.getTracks().forEach(tr=>tr.stop()); video.srcObject=null;
    video.removeAttribute('src'); video.load(); if (objectURL) URL.revokeObjectURL(objectURL);
  }
  function fail(error) { if (!closed) {stop(); onError(error.message||String(error));} }
  function seeking(){endPending=false;clearTimeout(silence);reset('Clip seek. Waiting for five fresh frames.');}
  function finishVideo() {
    if (closed || busy || !endPending || !video.ended) return;
    endPending=false;
    onEnd();
  }
  function ended() {
    if (closed) return;
    if (!waitForFinalFrame) {onEnd();return;}
    endPending=true;
    finishVideo();
  }
  function mediaError(){fail(Error('This browser could not decode the selected video.'));}
  function callWorker(data,transfers=[]) {
    return new Promise((resolve,reject)=>{
      if(closed) {transfers.forEach(f=>f.close()); return reject(cancel());}
      finish=error=>{clearTimeout(timer);finish=null; error?reject(error):resolve();};
      worker.onmessage=({data:reply})=>{
        if (!finish) return;
        if(reply.type==='error') return finish(Error('Local pose tracking failed: '+reply.message));
        clearTimeout(timer); finish=null; resolve(reply);
      };
      worker.onerror=()=>finish?.(Error('The local pose worker could not load.'));
      worker.onmessageerror=()=>finish?.(Error('The browser could not read the local pose result.'));
      timer=setTimeout(()=>finish?.(Error('The local pose tracker timed out.')),data.type==='init'?45000:12000);
      try {worker.postMessage(data,transfers);} catch(error) {transfers.forEach(f=>f.close());finish(error);}
    });
  }
  async function track(source,w,h,t,sequence) {
    if (!w || !h || !Number.isFinite(t) || busy || closed) return;
    const gen=epoch, grabbed=performance.now(), scale=Math.min(1,640/Math.max(w,h));
    const limb = getLimb ? getLimb() : followKnees ? 'armsAndKnees' : 'bothArms';
    const bodyRevision = getBodyRevision?.();
    const forecastRevision = getForecastRevision?.();
    busy=true;
    try {
      buffer.width=Math.max(1,Math.round(w*scale)); buffer.height=Math.max(1,Math.round(h*scale));
      ctx.drawImage(source,0,0,buffer.width,buffer.height);
      const frame=await createImageBitmap(buffer);
      if(closed || gen!==epoch) {frame.close();return;}
      const result=await callWorker({type:'frame',frame,timestamp:++clock,limb,selection:gen,
        jointPoints:!getLimb,limbPaths:!!getLimb,independent:true,...(captureWrists ? {captureWrists:true} : {})},[frame]);
      if (closed || gen!==epoch) return;
      if (kind==='camera' && performance.now()-grabbed>350) {
        reset('Camera processing lag. Waiting for a current frame.');return;
      }
      if(kind==='camera') {
        clearTimeout(silence);
        silence=setTimeout(()=>{if(!closed)reset('Camera frame gap. Waiting for fresh observations.');},400);
      }
      onFrame({id:sequence,t,xy:result.xy,pose:result.result,w:buffer.width,h:buffer.height,bitmap:buffer,
        ...(getBodyRevision ? {bodyRevision} : {}),
        ...(getForecastRevision ? {forecastRevision} : {}),
        ...(getLimb ? {limbPaths:result.limbPaths} : {}),
        ...(captureWrists ? {wrists:result.wrists,armGeometry:result.armGeometry} : {})});
    } catch (error) {
      endPending=false;
      throw error;
    } finally {
      busy=false;
      finishVideo();
    }
  }
  function schedule() {
    if(closed) return;
    callback=video.requestVideoFrameCallback((now,meta)=>{
      if(closed) return;
      schedule();
      if (!busy && !video.seeking && !(getLimb && video.paused) && !stream?.getVideoTracks()[0]?.muted) {
        // mediaTime is the presentation timestamp of this decoded image.
        track(video,video.videoWidth,video.videoHeight,meta.mediaTime,meta.presentedFrames).catch(fail);
      }
    });
  }
  async function start() {
    if (kind === 'clip' && (!clip || clip.size > MAX_LOCAL_VIDEO_BYTES)) {
      throw Error('Choose a local video no larger than 512 MiB.');
    }
    if (kind==='camera') {
      if(!navigator.mediaDevices?.getUserMedia) throw Error('This browser cannot open a camera. Use localhost or choose a local file.');
      stream=await navigator.mediaDevices.getUserMedia({audio:false,video:{width:{ideal:640},height:{ideal:480},frameRate:{ideal:15,max:30},facingMode:{ideal:'user'}}});
      if(closed) {stream.getTracks().forEach(tr=>tr.stop());return;}
      const tr=stream.getVideoTracks()[0];
      if(!tr || tr.readyState==='ended') throw Error('No camera video track was available.');
      tr.addEventListener('ended',()=>fail(Error('Camera disconnected.')), {once:true});
      tr.addEventListener('mute',()=>{if(!closed)reset('Camera paused. Waiting for fresh observations.');});
      video.srcObject=stream;
    }
    if(closed) return;
    if(kind!=='stills' && !video.requestVideoFrameCallback) throw Error('This browser cannot read decoded video timestamps. Choose timestamped stills.');
    onStatus('Opening the pose tracker on this device…');
    worker=new Worker(new URL('../camera/pose-worker.js',import.meta.url));
    await callWorker({type:'init'});
    if (closed) return;
    if(kind==='stills') {
      for(const row of stills) {
        if(closed) return;
        const image=await createImageBitmap(row.file);
        try {await track(image,image.width,image.height,row.t,++id);} finally {image.close();}
      }
      if(!closed) onEnd();
      return;
    }
    video.addEventListener('seeking',seeking); video.addEventListener('ended',ended); video.addEventListener('error',mediaError);
    if(kind==='clip') {
      objectURL=URL.createObjectURL(clip); video.src=objectURL;
      timer=setTimeout(()=>fail(Error('This browser did not start the video.')),15000);
    }
    video.muted=true; video.playsInline=true;
    await video.play();
    clearTimeout(timer);
    if(!closed) {
      onStatus(followKnees && kind==='camera'
        ? 'Tracking the camera image. Keep your arms and feet in view.'
        : 'Following decoded frames. Keep your shoulders, elbows and wrists visible.');
      schedule();
    }
  }
  start().catch(fail);
  return {stop, reset};
}
