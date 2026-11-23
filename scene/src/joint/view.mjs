import {BONES,WRIST,TRACKED_POINTS,trackedPoint,observation,endpoint,observeTarget,parseGoal,virtualFrame,checkGoal,virtualUnits} from './landmark.mjs';
import {captureSource,readKeyframes} from './media.mjs';
import {calibratedPose, poseForSelection, trackedLimbs, trackingChoices} from '../camera/limb-pose.mjs';
import {createVideoTakeWindow, pictureOffsetMs, poseForFollow} from '../camera/limb-take.mjs';

import {bindTouch, isTouchQuestion, touchPanel} from './touch.mjs';

const markup=`
<header class="joint-title"><div><h1>Movement mirror</h1></div><div><button data-size type="button">Compact</button> <button data-close type="button">Close</button></div></header>
<div class="joint-layout"><div class="joint-stage">
<canvas width="640" height="480" aria-label="Frontal field with the tracked skeleton and the forecast for the selected point"></canvas>
<p class="joint-key"><span>● Observed or simulated</span><span>◎ Forecast +120 ms</span></p>
<p data-frame>Waiting for movement.</p><p data-camera-follow role="status" hidden></p><p data-forecast></p><p data-score></p><p data-goal role="status"></p>
<p data-take-status role="status" hidden></p><button data-take-command type="button" hidden>Open Command box</button>
</div><div class="joint-inputs"><fieldset><legend>C · Follow movement</legend>
<label>Source <select data-source><option value="camera">Live camera</option><option value="clip">Recorded video</option><option value="stills">Timestamped stills</option></select></label>
<p data-hint>Face the camera with your shoulders, elbows and wrists in view.</p>
<label data-clip-wrap hidden>Local video <input data-clip type="file" accept="video/*"></label>
<div data-stills-wrap hidden><label>Still images <input data-stills type="file" multiple accept="image/*"></label>
<p data-names></p><label>Times in seconds, in file order <input data-times placeholder="0, .1, .2, .3, .4"></label></div>
<label data-follow-wrap hidden>Body follows <select data-follow aria-describedby="joint-follow-help"></select></label>
<p id="joint-follow-help" hidden>Choose what moves the avatar. Choose Forecast only to keep manual control. For live camera, show a clear bend in each knee you want the body to follow.</p>
<label>Point to forecast <select data-side><option value="auto">Either visible wrist</option></select></label>
<p id="joint-forecast-help" hidden>The forecast can use a different point, including a hip or ankle. It shows where that point may appear in the image 0.12 seconds later.</p>
<p id="joint-take-help" hidden>Save up to eight seconds of tracked movement for the limbs the avatar follows. The movement readings stay in this tab.</p>
<button data-start type="button">Start camera</button> <button data-save-take type="button" aria-describedby="joint-take-help" hidden disabled>Save take</button> <button data-stop type="button" disabled>Stop</button>
<video muted playsinline hidden></video><p data-status role="status">Camera off. Images stay on this device.</p>
</fieldset><form><label for="joint-outcome"><strong>F · Command box</strong></label>
<input id="joint-outcome" maxlength="240" value="Raise my left hand above my shoulder">
<button type="submit">Run virtual goal</button> <button data-voice type="button">Dictate locally</button>
<p data-language role="status">Try “Raise my left hand above my shoulder.” The avatar attempts the goal. The ring forecasts its wrist.</p></form>
${touchPanel}
<details><summary>Virtual brain</summary><p>Three invented unit histories. Which unit would the model rank first for the next single-spike bin?</p><button data-brain type="button">Score virtual units</button><output data-brain-output></output></details>
<details><summary>Measurements and limits</summary><p>The tracker estimates 2D joint positions in each source image. The model uses the last five frames to forecast the selected point 120 ms ahead. The score uses the nearest tracked frame within 40 ms of the target time, even when the reply arrives later. Simulated movement is compared with a simulated frame.</p><p>The model trained on tracked animal movement. Human camera accuracy remains unmeasured. Sparse keyframes and tracking losses can leave gaps. No frames are interpolated. Camera images contain no neural recording. The 3D game checks the drawn wrist and shoulder in world metres. The standalone two-link arm checks its drawing in pixels.</p></details>
<p data-model></p>
</div></div>`;
const finitePair=p=>Array.isArray(p)&&p.length===2&&p.every(Number.isFinite);
export function bindJointView({host,onPose=()=>{},embedded=false,readRig=null,onClose=()=>{},onSaveTake=null,onOpenCommand=null,backend='local-model'}) {
  const node=document.createElement('section');
  node.className='joint-view'+(embedded?' joint-overlay':'');
  node.setAttribute('aria-label','Movement mirror'); node.innerHTML=markup;
  host.append(node);
  const el=s=>node.querySelector(s), text=(s,v)=>{el(s).textContent=v;};
  const browserModel = backend === 'browser';
  text('[data-model]', browserModel ? 'NeuroTranslate 0.0 runs in this browser.' : 'Waiting for the local NeuroTranslate model.');
  const canvas=el('canvas'),ctx=canvas.getContext('2d'),video=el('video');
  const stageImage=document.createElement('canvas'), frameCtx=stageImage.getContext('2d',{alpha:false});
  const source=el('[data-source]'),pointControl=el('[data-side]'),followControl=el('[data-follow]'),goalField=el('#joint-outcome');
  const cameraFollow=el('[data-camera-follow]'), title=el('.joint-title h1');
  const startButton=el('[data-start]'), stopButton=el('[data-stop]'), sizeButton=el('[data-size]');
  const saveTake = el('[data-save-take]');
  const takeStatus = el('[data-take-status]');
  const takeCommand = el('[data-take-command]');
  const canSaveTake = embedded && Boolean(onSaveTake);
  let takeWindow = null;
  if (canSaveTake) {
    saveTake.hidden = false;
    el('#joint-take-help').hidden = false;
  }
  const partList=new Intl.ListFormat('en');
  if (embedded) {
    title.tabIndex=-1;
    el('[data-follow-wrap]').hidden=false;
    el('#joint-follow-help').hidden=false;
    el('#joint-forecast-help').hidden=false;
    pointControl.setAttribute('aria-describedby','joint-forecast-help');
    for (const choice of ['armsAndKnees','leftArm','rightArm','bothArms','leftLeg','rightLeg','bothKnees']) {
      followControl.add(new Option(trackingChoices[choice].name, choice));
    }
    followControl.add(new Option('Forecast only', 'none'));
  }
  for (const [key, point] of Object.entries(TRACKED_POINTS)) {
    const title=point.label[0].toUpperCase()+point.label.slice(1);
    pointControl.add(new Option(title,key));
  }
  const comparisons=new Set();
  let media=null,epoch=0,controller=new AbortController(),pending=null,busy=false,rows=[],latest=null,shown=null,schedule=null,modelHash=null,recognizer=null,active=false,simSide=null,lastIssue=-Infinity,activePoint=null;
  let lastComparisonIssue=-Infinity;
  let lastBodyPose = null, bodyRevision = 0;
  if (!embedded) {el('[data-close]').hidden=true;el('[data-size]').hidden=true;}
  function compact(value) {
    const collapsed=embedded && value;
    const hidesFocus=collapsed && el('.joint-inputs').contains(document.activeElement);
    if (collapsed !== node.classList.contains('joint-compact')) {
      if (collapsed) sizeButton.before(saveTake,stopButton);
      else startButton.after(saveTake,stopButton);
    }
    node.classList.toggle('joint-compact',collapsed);
    sizeButton.textContent=value?'Controls':'Compact';
    sizeButton.setAttribute('aria-expanded',String(!value));
    if (hidesFocus) title.focus({preventScroll:true});
  }
  el('[data-size]').onclick=()=>compact(!node.classList.contains('joint-compact'));

  function clearTake() {
    takeWindow = null;
    saveTake.disabled = true;
  }
  function refreshTake() {
    const disabled = !takeWindow?.hasSamples;
    if (saveTake.disabled !== disabled) saveTake.disabled = disabled;
  }
  function advanceVideoTake() {
    if (source.value === 'stills' || video.seeking || !takeWindow) return;
    takeWindow.advance(video.currentTime * 1000);
    refreshTake();
  }
  function updateTake(frame, pose, firstPictureTime) {
    const limb = followControl.value;
    if (!canSaveTake || !Object.hasOwn(trackingChoices, limb)) return;
    // Picture times define the spacing for replay. A long video gap releases
    // the avatar during replay instead of holding the previous movement.
    const pictureTimes = firstPictureTime !== undefined;
    const time = pictureTimes ? pictureOffsetMs(frame.t, firstPictureTime) : frame.t * 1000;
    takeWindow ??= createVideoTakeWindow(limb, pictureTimes ? Infinity : 400, {pictureTimes});
    takeWindow.observe(pose, time, frame.wrists, frame.armGeometry);
    refreshTake();
  }
  saveTake.onclick = () => {
    if (source.value === 'clip' && video.seeking) return;
    advanceVideoTake();
    const take = takeWindow?.finish();
    const kind = {camera:'camera', clip:'video', stills:'pictures'}[source.value];
    if (!take || !onSaveTake(take, kind)) return;
    takeStatus.hidden = false;
    takeStatus.textContent = 'Take saved. In the Command box, type “replay my take”.';
    takeCommand.hidden = !onOpenCommand;
  };
  takeCommand.onclick = () => onOpenCommand?.();

  function paint() {
    const w=latest?.w??640,h=latest?.h??480;
    canvas.width=w;canvas.height=h;
    ctx.fillStyle='#102a32';ctx.fillRect(0,0,w,h);
    if(latest?.photo) {ctx.drawImage(stageImage,0,0,w,h);ctx.fillStyle='rgba(7,24,29,.22)';ctx.fillRect(0,0,w,h);}
    const xy=latest?.xy??virtualFrame('left',0);
    function line(a,b,clr,width) {if(!finitePair(a)||!finitePair(b))return;ctx.beginPath();ctx.moveTo(...a);ctx.lineTo(...b);ctx.strokeStyle=clr;ctx.lineWidth=width;ctx.stroke();}
    if(!latest?.photo) {ctx.fillStyle='#abbdba';ctx.beginPath();ctx.arc(320,100,31,0,Math.PI*2);ctx.fill();}
    for(const [a,b] of BONES)line(xy[a],xy[b],latest?.photo?'#cbf7e5':'#97beb0',Math.max(2,w*.009));
    for(const p of xy) if(finitePair(p)){ctx.fillStyle='#c6ffe1';ctx.beginPath();ctx.arc(...p,Math.max(2,w*.007),0,Math.PI*2);ctx.fill();}
    if(shown && latest && shown.point!==undefined && finitePair(xy[shown.point]) && latest.t<=shown.issue+.18) {
      line(shown.origin,shown.pred,'#ffba61',3);
      ctx.strokeStyle='#ffba61';ctx.lineWidth=3;ctx.beginPath();ctx.arc(...shown.pred,Math.max(6,w*.016),0,Math.PI*2);ctx.stroke();
    }
  }
  function clearHistory(reason='', {keepImage=false}={}) {
    epoch++;controller.abort();controller=new AbortController();pending=null;rows=[];shown=null;lastIssue=-Infinity;activePoint=null;
    if (!keepImage) latest=null;
    comparisons.clear();lastComparisonIssue=-Infinity;
    text('[data-frame]',reason||'Waiting for movement.');text('[data-forecast]','');text('[data-score]','');paint();
  }
  function applyCapturePose(pose) {
    lastBodyPose = pose;
    onPose(pose);
  }
  function releaseCapturePose() {
    bodyRevision++;
    applyCapturePose(null);
  }
  function cameraMessage(message) {
    if (!cameraFollow.hidden && cameraFollow.textContent !== message) cameraFollow.textContent=message;
  }
  function showCameraFollow(pose, observed, kind) {
    if (cameraFollow.hidden) return;
    const choice = trackingChoices[followControl.value];
    if (!choice) {
      cameraMessage('Manual body controls. Forecasts use the source images.');
      return;
    }
    const accepted = trackedLimbs(pose), seen = trackedLimbs(observed);
    const names = limbs => partList.format(limbs.map(limb => trackingChoices[limb].name.toLowerCase()));
    const missing = choice.parts.filter(limb => !accepted.includes(limb));
    const waitingForBend = kind==='camera'
      ? missing.filter(limb => limb.endsWith('Leg') && seen.includes(limb)) : [];
    const statements = [];
    if (accepted.length) statements.push('Following '+names(accepted)+'.');
    if (missing.length) statements.push('Waiting for '+names(missing)+'.');
    if (waitingForBend.length) statements.push('Show a clear bend in your '+names(waitingForBend)+'.');
    cameraMessage(statements.join(' '));
  }
  function stopDictation() {
    const speech=recognizer;
    if (!speech) return;
    recognizer=null;
    speech.onresult=speech.onerror=speech.onend=null;
    try {speech.abort();} catch { /* already ended */ }
  }
  function stop(keep=false) {
    media?.stop();media=null;clearTimeout(schedule);schedule=null;active=false;simSide=null;
    stopDictation();
    clearTake();
    video.hidden=true;el('[data-stop]').disabled=true;
    cameraFollow.hidden=true;cameraFollow.textContent='';
    if(!keep){clearHistory();text('[data-goal]','');}
    text('[data-status]','Capture stopped.');releaseCapturePose();
  }
  async function forecast(task,X,signal) {
    let d;
    if (browserModel) {
      const { predictBrowserTask } = await import('./browser-forecast.mjs');
      signal.throwIfAborted();
      d = predictBrowserTask(task, X);
    } else {
      const r=await fetch('/api/forecast',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({task,X}),signal});
      if(!r.ok) throw Error('Local forecast service returned '+r.status+'.');
      d=await r.json();
    }
    signal.throwIfAborted();
    if(d.task!==task || !/^[a-f0-9]{64}$/.test(d.checkpoint_sha256) || (modelHash && d.checkpoint_sha256!==modelHash)) throw Error('The selected checkpoint changed. Reopen this session.');
    modelHash=d.checkpoint_sha256;
    text('[data-model]', (browserModel ? 'Browser checkpoint ' : 'Local checkpoint ') + modelHash);
    node.dataset.checkpoint=modelHash;
    return d.prediction[0];
  }
  async function drain() {
    if(busy || !pending) return;
    busy=true;
    const job=pending;pending=null;
    try {
      const pred=endpoint(job.packet,await forecast('landmark_motion',job.packet.X,controller.signal));
      if(job.epoch!==epoch) return;
      const p={...job.packet,pred,label:job.label};
      job.pred=pred;
      job.replyThrough=latest?.t??p.issue;
      shown=job.replyThrough<p.issue+p.lead ? p : null;
      text('[data-forecast]',job.label+' · frame '+p.frameId+' → '+(p.issue+p.lead).toFixed(3)+' s · forecast ('+pred.map(x=>x.toFixed(1)).join(', ')+') px');
      showComparison(job);
      paint();
    } catch(e) {
      comparisons.delete(job);
      if(job.epoch===epoch && e.name!=='AbortError')text('[data-forecast]',e.message);
    }
    finally {busy=false;if(pending) drain();}
  }

  function showComparison(job) {
    if (!job.closed || !job.pred) return;
    comparisons.delete(job);
    const {packet, match, pred} = job;
    if (packet.issue < lastComparisonIssue) return;
    lastComparisonIssue = packet.issue;
    const prefix = job.label + ' · forecast from frame ' + packet.frameId;
    const frameName = job.tracked ? 'tracked frame' : 'simulated frame';
    if (!match) {
      text('[data-score]', prefix + ' · no ' + frameName + ' within 40 ms of ' +
        (packet.issue + packet.lead).toFixed(3) + ' s');
      return;
    }
    const error = Math.hypot(match.coordinates[0] - pred[0], match.coordinates[1] - pred[1]);
    const timing = match.time <= job.replyThrough ? ' · reply arrived after frame processing' : '';
    text('[data-score]', prefix + ' · ' + frameName + ' at ' + match.time.toFixed(3) +
      ' s · error ' + error.toFixed(1) + ' px' + timing);
  }

  function finishComparisons() {
    for (const job of comparisons) {
      job.closed = true;
      showComparison(job);
    }
  }

  function add(frame,kind,chosen) {
    if (latest && (frame.w!==latest.w || frame.h!==latest.h || frame.t<=latest.t || frame.t-latest.t>.24+1e-10)) clearHistory('Frame gap. Building a new window.');
    const point=trackedPoint(chosen,frame.xy);
    const present=point!==null && finitePair(frame.xy[point.index]);
    if (activePoint!==null && (!present || activePoint!==point.index)) {
      clearHistory('Building a new window for the visible point.');
    }
    if (present && activePoint!==point.index) {
      text('[data-forecast]','Building a forecast for the '+point.label+'.');
    }
    activePoint=present ? point.index : null;
    if(frame.bitmap){stageImage.width=frame.w;stageImage.height=frame.h;frameCtx.drawImage(frame.bitmap,0,0);}
    latest={xy:frame.xy,t:frame.t,id:frame.id,w:frame.w,h:frame.h,photo:!!frame.bitmap};
    if (!present) text('[data-forecast]',(point?.label || 'Selected point')+' obscured. Forecast withheld.');
    rows.push(latest);rows=rows.slice(-5);
    text('[data-frame]',kind+' · frame '+frame.id+' · '+frame.t.toFixed(3)+' s · '+frame.xy.filter(finitePair).length+(frame.bitmap?' tracked points':' simulated points'));
    for (const job of comparisons) {
      observeTarget(job, frame);
      showComparison(job);
    }
    if (present && frame.t>=lastIssue+.12-1e-9) {
      const packet=observation(rows,point.index);
      if(packet) {
        lastIssue=frame.t;
        if (pending) comparisons.delete(pending);
        pending={epoch,packet,label:point.label,tracked:Boolean(frame.bitmap),closed:false};
        comparisons.add(pending);
        drain();
      }
    }
    paint();
  }
  function changeSource() {
    stop();const kind=source.value;
    el('[data-clip-wrap]').hidden=kind!=='clip';el('[data-stills-wrap]').hidden=kind!=='stills';
    text('[data-start]',{camera:'Start camera',clip:'Play selected clip',stills:'Track keyframes'}[kind]);
    text('[data-hint]',{camera:'Keep your selected point and enough of your body in view to track it.',clip:'Play, pause or seek using the video controls. The frame clock comes from the clip.',stills:'The tracker reads each image at its stated capture time. At least five closely spaced stills are needed for a forecast.'}[kind]);
    text('[data-status]','Images stay on this device. Only numeric movement features reach the local checkpoint.');
  }
  function start() {
    stop();const kind=source.value;
    try {
      const clip=el('[data-clip]').files[0],stills=kind==='stills'?readKeyframes([...el('[data-stills]').files],el('[data-times]').value):null;
      if(kind==='clip' && !clip) throw Error('Choose a video first.');
      active=true;el('[data-stop]').disabled=false;compact(kind==='camera');video.hidden=kind!=='clip';video.controls=kind==='clip';
      cameraFollow.hidden=!embedded;
      if (kind==='camera') {
        const message='Waiting for camera permission.';
        text('[data-status]',message);
        cameraMessage(message);
      }
      const cameraKnees=kind==='camera' && embedded ? {} : null;
      let lastCameraPoseAt=null;
      media=captureSource({kind,video,clip,stills,followKnees:embedded,captureWrists:canSaveTake,waitForFinalFrame:true,
        getBodyRevision:()=>kind==='clip' && video.paused ? null : bodyRevision,
        onFrame:f=>{
          let pose=f.pose;
          if (cameraKnees) {
            lastCameraPoseAt=performance.now();
            pose=calibratedPose(cameraKnees,'armsAndKnees',pose,lastCameraPoseAt);
          }
          // Source images remain eligible for the forecast. The avatar uses
          // only those acquired after its most recent control change.
          if (f.bodyRevision===bodyRevision && (kind!=='clip' || !video.paused)) {
            const selected = embedded ? poseForFollow(pose, followControl.value) : pose;
            applyCapturePose(selected);
            showCameraFollow(selected,f.pose,kind);
            updateTake(f, selected, stills?.[0].t);
          }
          add(f,{camera:'Live camera estimate',clip:'Recorded video estimate',stills:'Still-image estimate'}[kind],pointControl.value);
        },
        onReset:reason=>{
          if (cameraKnees && lastCameraPoseAt!==null) {
            calibratedPose(cameraKnees,'armsAndKnees',null,lastCameraPoseAt);
          }
          releaseCapturePose();
          clearTake();
          clearHistory(reason);
          cameraMessage('Waiting for a fresh source image.');
        },onStatus:m=>{
          text('[data-status]',m);
          cameraMessage('Waiting for the first source image.');
        },
        onError:m=>{
          stop();compact(false);text('[data-status]',m);
          if (document.activeElement===title) el('[data-start]').focus({preventScroll:true});
        },
        onEnd:()=>{
          finishComparisons();
          releaseCapturePose();
          cameraMessage('Source ended. Manual body controls are available.');
          text('[data-status]',kind==='clip'?'Clip ended. Seek or replay to inspect another interval.':'All still images processed.');
          if(kind==='stills'){media?.stop();media=null;active=false;el('[data-stop]').disabled=true;}
        }});
    } catch(e){stop();text('[data-status]',e.message);}
  }
  function runGoal(intent) {
    stop();compact(true);active=true;simSide=intent.side;el('[data-stop]').disabled=false;
    const side=intent.side, wrist=WRIST[side], shoulder=side==='left'?11:12;
    const target=readRig?'5 cm · tolerance 0.5 cm':intent.targetClearancePx+' px · tolerance '+intent.tolerancePx+' px';
    text('[data-language]','Virtual '+intent.effector+' · target clearance '+target+'.');
    text('[data-status]','Virtual movement. Camera and microphone off.');text('[data-goal]','Moving the virtual arm…');
    let i=0, first=null, lastRig=null, extraDegrees=0;
    function tick(){
      if(!active||simSide!==side)return;
      const xy=virtualFrame(side,i/16,extraDegrees);
      const points=xy.map(p=>p&&({x:p[0]/640,y:p[1]/480,visibility:1}));
      const pose=poseForSelection(points,640,480,side+'Arm',()=>true);
      if(readRig) {
        onPose(pose);
        const drawn=readRig();
        if(drawn && drawn.id!==lastRig?.id && drawn.world[shoulder] && drawn.world[wrist]) {
          first??={x:drawn.world[shoulder][0],y:drawn.world[shoulder][1],t:drawn.t};
          // Fixed, isotropic projection of drawn simulator coordinates in metres.
          const projected=drawn.world.map(p=>p&&[320+(p[0]-first.x)*240,170-(p[1]-first.y)*240]);
          add({xy:projected,t:drawn.t-first.t,id:drawn.id,w:640,h:480},'Drawn 3D rig',side);
          lastRig=drawn;
        }
      } else {
        onPose(pose);
        add({xy,t:i*.06,id:i,w:640,h:480},'Virtual arm',side);
      }
      if(i>=19){
        const ready=lastRig && lastRig.t>first.t && drawnFresh(lastRig);
        const clearance=ready?lastRig.world[wrist][1]-lastRig.world[shoulder][1]:null;
        const shortfall=ready?Math.max(0,intent.targetClearanceM-clearance):null;
        if(readRig && i<36 && (!ready || shortfall>intent.toleranceM)) {
          if(ready)extraDegrees=Math.min(42,extraDegrees+3);
        } else {
          let result;
          if(readRig && ready){
            result={frame:lastRig.id,domain:'drawn 3D game rig',unit:'m',clearance,shortfall,passed:shortfall<=intent.toleranceM};
            text('[data-goal]',(result.passed?'Goal reached':'Goal missed')+' on the 3D rig. The '+side+' wrist finished '+(Math.abs(clearance)*100).toFixed(1)+' cm '+(clearance>=0?'above':'below')+' its shoulder. Shortfall '+(shortfall*100).toFixed(1)+' cm.');
          } else if(readRig){
            result={domain:'drawn 3D game rig',passed:null};
            text('[data-goal]','Goal unscored. A current wrist and shoulder could not be read from the drawn 3D rig.');
          } else {
            result={...checkGoal(intent,xy),domain:'two-link simulator',unit:'px'};
            text('[data-goal]',(result.passed?'Goal reached':'Goal missed')+' in the simulator. The '+side+' wrist cleared the shoulder by '+result.clearance.toFixed(1)+' px. Shortfall '+result.shortfall.toFixed(1)+' px.');
          }
          finishComparisons();
          node.dataset.result=JSON.stringify(result);active=false;el('[data-stop]').disabled=true;return;
        }
      }
      i++;schedule=setTimeout(tick,60);
    }
    function drawnFresh(snapshot){return performance.now()/1000-snapshot.t<.35;}
    tick();
  }
  const touch = browserModel ? null : bindTouch(node, forecast);
  async function askTouch(words) {
    node.hidden = false;
    compact(false);
    goalField.value = words;
    const supported = await touch?.run();
    text('[data-language]', supported ? 'Using the invented plate load and earlier nerve activity below.' :
      'Open the Touch study with this game to forecast fingertip spikes.');
  }
  function submit(event) {
    event.preventDefault();
    if (isTouchQuestion(goalField.value)) {askTouch(goalField.value); return;}
    const intent = parseGoal(goalField.value);
    if (intent) runGoal(intent);
    else text('[data-language]', 'Choose one side and a supported goal, for example “Lift my right wrist above my shoulder”.');
  }
  el('form').addEventListener('submit',submit);
  goalField.addEventListener('input',stopDictation);
  source.addEventListener('change',changeSource);
  pointControl.addEventListener('change',()=>clearHistory('Point changed. Building a new window.', {keepImage:true}));
  followControl.addEventListener('change',()=>{
    clearTake();
    if (!media || simSide) return;
    bodyRevision++;
    // Keep any active channels that are still selected. Newly selected limbs
    // wait for the next source image.
    const selected = poseForFollow(lastBodyPose, followControl.value);
    applyCapturePose(selected);
    if (source.value==='clip' && video.paused) {
      cameraMessage((video.ended ? 'Source ended' : 'Video paused')+'. Manual body controls are available.');
    } else showCameraFollow(selected,null,source.value);
  });
  function releaseClipPose() {
    if (!media || source.value!=='clip') return;
    releaseCapturePose();
    cameraMessage((video.ended ? 'Source ended' : 'Video paused')+'. Manual body controls are available.');
  }
  video.addEventListener('pause',releaseClipPose);
  video.addEventListener('ended',releaseClipPose);
  video.addEventListener('timeupdate',advanceVideoTake);
  el('[data-clip]').addEventListener('change',()=>{
    if (source.value==='clip' && (media || latest)) changeSource();
  });
  const stillFiles=el('[data-stills]'), stillTimes=el('[data-times]');
  let hadStillFiles=false;
  function invalidateStillRun() {
    if (source.value==='stills' && !simSide && (media || latest)) changeSource();
  }
  stillFiles.addEventListener('change',()=>{
    // Explicit times belong to positions in the previous file list.
    if (hadStillFiles) stillTimes.value='';
    hadStillFiles=stillFiles.files.length>0;
    invalidateStillRun();
    text('[data-names]',[...stillFiles.files].map(f=>f.name).join(' · '));
  });
  stillTimes.addEventListener('input',invalidateStillRun);
  startButton.onclick=start;
  stopButton.onclick=()=>{
    const restart=simSide ? goalField : startButton;
    stop();
    compact(false);
    restart.focus({preventScroll:true});
  };
  const Speech=window.SpeechRecognition||window.webkitSpeechRecognition;
  const localSpeech=!!Speech && 'processLocally' in Speech.prototype;
  el('[data-voice]').disabled=!localSpeech;
  if(!localSpeech) el('[data-voice]').title='On-device speech unavailable. Type your goal.';
  el('[data-voice]').onclick=()=>{
    if(recognizer || !localSpeech) return;
    try{
      const r=new Speech();r.processLocally=true;if(!r.processLocally)throw Error('On-device speech unavailable.');
      recognizer=r;r.lang='en-US';r.continuous=false;r.interimResults=false;
      r.onresult=e=>{if(recognizer===r && e.results[0]?.[0]?.transcript){goalField.value=e.results[0][0].transcript;text('[data-language]','Check the transcript, then choose Run virtual goal.');goalField.focus();}};
      r.onend=()=>{if(recognizer===r)recognizer=null;};
      r.onerror=()=>{if(recognizer===r)text('[data-language]','Local speech unavailable. Type your goal.');};
      r.start();
    }catch(e){recognizer=null;text('[data-language]',e.message);}
  };
  const brain=el('[data-brain]');
  brain.onclick=async()=>{
    brain.disabled=true;const g=epoch;
    try{const p=await forecast('rat_next_unit',virtualUnits(),controller.signal);
      if(g!==epoch)return;
      if(p.length!==3 || !p.every(x=>Number.isFinite(x)&&x>=0&&x<=1) || Math.abs(p.reduce((a,b)=>a+b)-1)>1e-4)throw Error('Invalid unit probabilities.');
      text('[data-brain-output]',p.map((x,i)=>'Unit '+(i+1)+' '+(x*100).toFixed(1)+'%').join(' · ')+' (invented inputs).');
    }catch(e){if(e.name!=='AbortError')text('[data-brain-output]',e.message);}finally{brain.disabled=false;}
  };
  function hideTakeMessage() {
    takeStatus.hidden = true;
    takeCommand.hidden = true;
  }
  const close=()=>{touch?.clear();stop();hideTakeMessage();if(embedded){node.hidden=true;onClose();}};
  el('[data-close]').onclick=close;
  function leave(){
    stop();
    hideTakeMessage();
    if (!node.hidden) compact(false);
  }
  function visibility(){if(document.hidden)leave();}
  function closeFocusedMirror(e) {
    // The game shell also handles Escape in capture. Close the focused mirror
    // first, while leaving the browser's native pointer-lock escape available.
    if (e.code !== 'Escape' || node.hidden || document.pointerLockElement || e.defaultPrevented ||
        e.repeat || e.isComposing || e.ctrlKey || e.metaKey || e.altKey || !e.target?.nodeType ||
        !node.contains(e.target) || e.target.closest?.('dialog[open]')) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    close();
  }
  function keys(e){
    if(node.hidden||e.repeat||e.ctrlKey||e.metaKey||e.altKey || e.isComposing || e.target?.closest?.('input,select,textarea,button,dialog[open]'))return;
    if(e.code==='Escape' && embedded){e.preventDefault();close();}
    if(!embedded && e.code==='KeyF'){e.preventDefault();goalField.focus();goalField.select();}
    if(!embedded && e.code==='KeyC'){e.preventDefault();el('[data-start]').focus();}
  }
  document.addEventListener('visibilitychange',visibility);window.addEventListener('pagehide',leave);window.addEventListener('keydown',keys);
  if (embedded) window.addEventListener('keydown',closeFocusedMirror,true);
  const params=new URLSearchParams(location.search);
  if(params.get('goal')==='above_shoulder' && ['left_hand','right_hand'].includes(params.get('effector')))goalField.value='Raise my '+params.get('effector').split('_')[0]+' hand above my shoulder';
  changeSource();if(embedded)node.hidden=true;
  return {askTouch: browserModel ? null : askTouch,open(){node.hidden=false;compact(false);el('[data-start]').focus();},run(intent,words){node.hidden=false;goalField.value=words||('Raise my '+intent.side+' hand above my shoulder');runGoal(intent);},stop,close,get active(){return active;},get visible(){return !node.hidden;},
    dispose(){touch?.clear();stop();document.removeEventListener('visibilitychange',visibility);window.removeEventListener('pagehide',leave);window.removeEventListener('keydown',keys);window.removeEventListener('keydown',closeFocusedMirror,true);node.remove();}};
}
