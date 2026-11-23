import { DEFAULT_VIEW, markerName, prepareClip, readManifest, readMotion, sourceFrame } from './spatial-recording.mjs';
import { drawFrame } from './spatial-view.mjs';
import { markup } from './spatial-template.mjs';

export function mountSpatialReplay(panel, {baseUrl, fetchImpl} = {}) {
  const events = new AbortController();
  const on = (el,type,fn) => el.addEventListener(type,fn,{signal:events.signal});
  panel.classList.add('spatial-panel');
  panel.innerHTML = markup;
  const q = name => panel.querySelector('[data-motion-' + name + ']');
  const win = panel.ownerDocument.defaultView;
  const select = q('clip'), body = q('body'), status = q('status'), retry = q('retry');
  const canvas = q('canvas'), seek = q('time'), play = q('play'), marker = q('marker');
  const follow = q('follow'), lines = q('lines'), yaw = q('yaw'), pitch = q('pitch');
  const markerDetails = marker.closest('details');
  let active = false, disposed = false, request = 0, index = 0, animation = 0;
  let manifest, model, drag, width = 0, height = 0;
  const clock = q('clock'), count = q('count'), coordinates = q('coordinates'), view = q('view');
  function setText(node,text) { if (node.textContent !== text) node.textContent = text; }
  function stop() {
    win.cancelAnimationFrame(animation);
    animation = 0;
    play.textContent = model && index === model.clip.frames.length-1 ? 'Replay movement' : 'Play movement';
  }
  function draw() {
    if (!active || !model) return;
    drawFrame(canvas,model,index,{
      width,height,dpr:Math.min(2,win.devicePixelRatio || 1), yaw:Number(yaw.value),pitch:Number(pitch.value),
      follow:follow.checked,lines:lines.checked,selected:markerDetails.open ? marker.selectedIndex : -1
    });
  }
  function update() {
    if (!model) return;
    const {clip} = model;
    const row = clip.frames[index], t = (index/clip.rateHz).toFixed(3);
    seek.value = String(index);
    const frame = sourceFrame(clip,index);
    seek.setAttribute('aria-valuetext',t + ' seconds, source frame ' + frame);
    clock.textContent = t + ' s · frame ' + frame;
    setText(count,row.filter(Boolean).length + ' of ' + row.length + ' visible');
    const p = row[marker.selectedIndex];
    coordinates.textContent = marker.value + ' · ' + (p ? p.map((v,i) => 'XYZ'[i]+' '+v+' mm').join(' · ') : 'Missing in this frame');
    if (follow.checked) {
      const label = clip.markers[model.waist];
      setText(view,row[model.waist]
        ? 'The view follows waist marker ' + label + ' across the floor. Each grid square is half a metre wide.'
        : 'Waist marker ' + label + ' is missing. The camera holds its horizontal position.');
    } else setText(view,'The camera stays in one place. Each square on the lab floor is half a metre wide.');
    draw();
  }
  function setAngles(a,b) {
    yaw.value = String(a); pitch.value = String(b);
    yaw.setAttribute('aria-valuetext',yaw.value + ' degrees');
    pitch.setAttribute('aria-valuetext',pitch.value + ' degrees');
    draw();
  }
  async function show(id) {
    active = true;
    if (!id && model) { draw(); return; }
    const token = ++request;
    const stale = () => disposed || !active || token !== request;
    stop();
    model = null;
    body.hidden = true;
    retry.hidden = true;
    status.textContent = 'Opening the recording…';
    try {
      if (!manifest) {
        const found = await readManifest(baseUrl,fetchImpl);
        if (stale()) return;
        manifest = found;
        select.replaceChildren(...manifest.clips.map(r => new Option(r.label, r.id)));
        select.disabled = false;
      }
      const chosen = id || select.value || manifest.clips[0].id;
      const entry = manifest.clips.find(r => r.id === chosen);
      if (!entry) {
        status.textContent = 'This recording is unavailable. Choose a recording from the list.';
        select.selectedIndex = -1;
        return;
      }
      select.value = chosen;
      const clip = await readMotion(entry,baseUrl,fetchImpl);
      if (stale()) return;
      model = prepareClip(clip, clip.connections ?? entry.connections ?? manifest.connections);
      marker.replaceChildren(...clip.markers.map(m => new Option(markerName(m),m)));
      marker.selectedIndex = model.waist ?? 0;
      q('info').textContent = 'CMU trial ' + clip.id + ' · ' + clip.markers.length + ' body markers · ' +
        clip.rateHz + ' frames per second shown from the ' + clip.sourceRateHz + ' Hz recording.';
      const inferredUp = clip.source?.upAxisEvidence?.startsWith('inferred');
      q('quality').textContent = clip.qualityNote + ' Displayed coordinates are rounded to 0.1 mm.' +
        (inferredUp ? ' This file omits the screen axes. Its head and heel heights indicate that Z points up.' : '');
      index = 0;
      follow.checked = false;
      follow.disabled = !model.anchors.length;
      seek.max = clip.frames.length-1;
      body.hidden = false;
      status.textContent = '';
      setAngles(DEFAULT_VIEW.yaw,DEFAULT_VIEW.pitch);
      const box = canvas.getBoundingClientRect(); width = box.width; height = box.height;
      update();
    } catch {
      if (stale()) return;
      model = null;
      status.textContent = 'The recording could not be opened or its file has changed.';
      retry.hidden = false;
    }
  }
  function hide() {
    active = false; request++; drag = null; stop();
  }
  on(select,'change',() => show(select.value));
  on(retry,'click',() => show(select.value));
  on(seek,'input',() => { index = Number(seek.value); stop(); update(); });
  on(play,'click',() => {
    if (!active || !model) return;
    if (animation) { stop(); return; }
    const {clip} = model, last = clip.frames.length-1;
    if (index === last) { index = 0; update(); }
    const from = index, start = win.performance.now();
    const advance = now => {
      const next = Math.min(last,from+Math.floor((now-start)*clip.rateHz/1000));
      if (next !== index) { index = next; update(); }
      if (index === last) stop();
      else animation = win.requestAnimationFrame(advance);
    };
    play.textContent = 'Pause movement';
    animation = win.requestAnimationFrame(advance);
  });
  on(yaw,'input',() => setAngles(yaw.value,pitch.value));
  on(pitch,'input',() => setAngles(yaw.value,pitch.value));
  on(q('reset'),'click',() => { follow.checked = false; setAngles(DEFAULT_VIEW.yaw,DEFAULT_VIEW.pitch); update(); });
  on(lines,'change',draw);
  on(follow,'change',update);
  on(marker,'change',update);
  on(markerDetails,'toggle',draw);
  on(canvas,'pointerdown',e => {
    if (!e.isPrimary || e.button !== 0) return;
    drag = {id:e.pointerId,x:e.clientX,y:e.clientY,yaw:Number(yaw.value),pitch:Number(pitch.value)};
    canvas.setPointerCapture(e.pointerId);
  });
  on(canvas,'pointermove',e => {
    if (drag?.id !== e.pointerId) return;
    let a = Math.round(drag.yaw+(e.clientX-drag.x)*.5);
    a = ((a+180)%360+360)%360-180;
    setAngles(a,Math.max(-75,Math.min(75,Math.round(drag.pitch+(e.clientY-drag.y)*.35))));
  });
  on(canvas,'lostpointercapture',() => { drag = null; });
  const observer = new win.ResizeObserver(([entry]) => {
    width = entry.contentRect.width; height = entry.contentRect.height;
    draw();
  });
  observer.observe(canvas);
  on(win,'blur',stop);
  on(panel.ownerDocument,'visibilitychange',() => { if (panel.ownerDocument.hidden) stop(); });
  return {show,hide,stop,dispose() { disposed = true; hide(); events.abort(); observer.disconnect(); }};
}
