import { createHandQuery } from './hand-query.mjs';
import './hand-replay.js';
import {mountWristForecast} from './wrist-future.mjs';

const introduction = `
  <h2>Which hand movement fits your words?</h2>
  <p>A headset tracked the person’s right hand during one task. Type a description to rank moments from that recording, then play one to see how the hand moved.</p>
  <p data-hand-task class="hand-search-source"></p>
  <p data-hand-load role="status">Opening the recording and models…</p>
  <button data-hand-loadsearch type="button" hidden>Open the recorded hand search</button>
  <button data-hand-retry type="button" hidden>Try loading again</button>
  <div data-hand-ready hidden>
    <form data-hand-form>
      <label>Describe a hand movement <input data-hand-input type="text" maxlength="500" autocomplete="off"></label>
      <div class="hand-search-actions"><button type="submit">Find matching moments</button><button data-hand-example type="button">Try a training example</button></div>
    </form>
    <p data-hand-message role="status"></p>
    <p data-hand-known hidden><span></span> <button type="button">Replay the described moment</button></p>
    <div data-hand-ranking hidden>
      <label>Order by <select data-hand-method><option value="ridge">Word counts and movement summaries</option><option value="attention">Attention model</option><option value="joint">Timing and tracking coverage</option></select></label>
      <table><caption>Where each model ranked the same moments</caption><thead><tr><th scope="col">Time in recording</th><th scope="col">Word counts</th><th scope="col">Attention</th><th scope="col">Timing</th></tr></thead><tbody data-hand-rows></tbody></table>
      <p class="hand-search-note">First place is the model’s closest match. A shared rank means the model gave those moments the same score. The timing comparison uses duration, position in the task and how often the hand was tracked. It has no hand coordinates.</p>
    </div>
    <label data-hand-browse>Inspect a recorded moment <select data-hand-segment></select></label>
    <section data-hand-replay aria-label="Selected right-hand movement"></section>
    <details data-hand-observer><summary>What did the observer write?</summary><p data-hand-description></p></details>
    <details><summary>What did the models learn?</summary><p data-hand-study></p><p>The movement models used distances between the wrist and five fingertips and the distance the wrist travelled from its starting position. The hand drawing can show all 26 tracked joints. The motion summaries for this recording are saved with the viewer. Your words are processed on this device each time you search. The observer described the action after seeing it. A match retrieves a recording that already exists.</p><p data-hand-credit></p><details><summary>Data licence</summary><pre data-hand-licence></pre></details></details>
  </div>
  <details data-hand-future class="wrist-future"><summary>Forecast how far the wrist moves after an instruction</summary>
  <div data-hand-mounted-forecast><p role="status">Opening the one-second forecast…</p></div></details>`;

const shortTime = seconds => {
  const tenths = Math.round(seconds * 10);
  return Math.floor(tenths / 600) + ':' + ((tenths % 600) / 10).toFixed(1).padStart(4,'0');
};

function rankString(row) {
  return row.rankMin === row.rankMax ? String(row.rankMin) : row.rankMin + '–' + row.rankMax;
}

function makeAssetReader(baseUrl, fetchImpl) {
  const url = file => new URL(file, baseUrl);
  let indexRequest;
  async function readIndex() {
    const response = await fetchImpl(url('asset-index.json'));
    if (!response.ok) throw Error('Index unavailable');
    return response.json();
  }
  return async function bytes(name) {
    if (!indexRequest) {
      const pending = readIndex();
      indexRequest = pending;
      pending.catch(()=>{ if (indexRequest===pending) indexRequest=null; });
    }
    const currentIndex=indexRequest;
    try {
      const index = await currentIndex;
      if (!/^[a-f0-9]{64}$/.test(index[name])) throw Error('Missing file identity');
      const response = await fetchImpl(url(name));
      if (!response.ok) throw Error('File unavailable');
      const contents = await response.arrayBuffer();
      const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',contents)), b => b.toString(16).padStart(2,'0')).join('');
      if (hash !== index[name]) throw Error('File changed');
      return contents;
    } catch(error) {
      if(indexRequest===currentIndex) indexRequest=null;
      throw error;
    }
  };
}

async function loadBundle(bytes) {
  const names = ['catalogue.json','hand-query.json','hand-query.bin','hand-recording.json'];
  const [catalogueData, queryData, weights, geometryData] = await Promise.all(names.map(bytes));
  const decode = raw => JSON.parse(new TextDecoder().decode(raw));
  const catalogue = decode(catalogueData), recording = decode(geometryData);
  const engine = createHandQuery(decode(queryData), weights);
  const ids = new Set(catalogue.segments.map(s=>s.id));
  if (engine.recordingId !== catalogue.recordingId || !ids.size || ids.size !== catalogue.segments.length ||
      ids.size !== engine.segmentIds.length || !engine.segmentIds.every(id=>ids.has(id)) ||
      !engine.methods.includes('ridge') || !engine.methods.includes('attention')) throw Error('The model and recording refer to different moments.');
  if (recording.recording !== catalogue.recordingId || recording.side !== 'right' || recording.units !== 'm' ||
      !engine.methods.includes('joint') || !Array.isArray(recording.segments) || recording.segments.length !== ids.size) {
    throw Error('The hand replay and model gallery disagree.');
  }
  const replayEvents = new Map(recording.segments.map(s=>[s.segmentId,s]));
  for (const s of catalogue.segments) {
    const captured = replayEvents.get(s.id);
    if (!Number.isFinite(s.startSeconds) || !Number.isFinite(s.endSeconds) || s.startSeconds >= s.endSeconds ||
        !Array.isArray(s.descriptions) || !s.descriptions.length || !captured ||
        captured.start !== s.startSeconds || captured.end !== s.endSeconds) throw Error('Incomplete or misaligned source event');
  }
  return {catalogue, recording, engine};
}

export function mountHandSearch(panel, {baseUrl, fetchImpl=fetch, headingLevel=2}={}) {
  const doc = panel.ownerDocument;
  const readAsset = makeAssetReader(baseUrl,fetchImpl);
  panel.classList.add('hand-search');
  panel.innerHTML = headingLevel===1 ? introduction.replace('<h2>','<h1>').replace('</h2>','</h1>') : introduction;
  const q = name => panel.querySelector('[data-hand-'+name+']');
  const events = new AbortController();
  const listen = (el,type,fn) => el.addEventListener(type,fn,{signal:events.signal});
  const input = q('input'), method = q('method'), tbody = q('rows');
  const status = q('message'), loading = q('load');
  let bundle, request, replay, ranks, selected, knownId, active = false, version = 0, pending;
  function clearSelection() {
    selected=null;
    for (const button of tbody.querySelectorAll('button[aria-pressed=true]')) button.setAttribute('aria-pressed','false');
    replay?.pause?.();
    q('segment').value=''; q('replay').hidden=true; q('observer').hidden=true;
  }
  function select(id, moveReplay=true) {
    const segment = bundle.catalogue.segments.find(s=>s.id===id);
    if (!segment) { clearSelection(); return; }
    selected = id; q('segment').value=id; q('replay').hidden=false; q('observer').hidden=false;
    if (moveReplay) replay.selectSegment(id);
    q('description').textContent = segment.descriptions.join(' / ');
    for (const b of tbody.querySelectorAll('button')) b.setAttribute('aria-pressed',String(b.dataset.segment === id));
  }
  function drawRanks(chooseFirst=false) {
    const sorted = ranks[method.value].rows;
    const maps = Object.fromEntries(['ridge','attention','joint'].map(key=>[key,new Map(ranks[key].rows.map(r=>[r.segmentId,r]))]));
    tbody.replaceChildren();
    for (const result of sorted) {
      const s = bundle.catalogue.segments.find(item=>item.id===result.segmentId);
      const tr = tbody.insertRow(), th = doc.createElement('th'), b = doc.createElement('button');
      th.scope = 'row'; b.type='button'; b.dataset.segment=s.id;
      b.textContent = shortTime(s.startSeconds)+' – '+shortTime(s.endSeconds);
      b.setAttribute('aria-label','Inspect '+b.textContent); b.setAttribute('aria-pressed',String(selected===s.id));
      th.append(b);tr.append(th);
      for (const key of ['ridge','attention','joint']) tr.insertCell().textContent=rankString(maps[key].get(s.id));
    }
    if (chooseFirst) {
      if (sorted[0]?.rankMin === sorted[0]?.rankMax) select(sorted[0].segmentId);
      else clearSelection();
    }
  }
  function search(text, expectedId=null) {
    knownId=expectedId; q('known').hidden=true;
    q('observer').open=false;
    const value = text.trim();
    input.value = value;
    if (!value) {
      ranks=null; clearSelection(); q('ranking').hidden=true; q('browse').hidden=false; status.textContent='Enter a description or try the example.'; return;
    }
    const next = {ridge:bundle.engine.rank(value,'ridge'),attention:bundle.engine.rank(value,'attention'),joint:bundle.engine.rank(value,'joint')};
    const cover=next.ridge.coverage;
    if (cover.empty || cover.allUnknown || !cover.knownTokens) {
      ranks=null; clearSelection(); q('ranking').hidden=true; q('browse').hidden=false;
      status.textContent='None of these words occurred in training. Try another description, or choose a moment below to inspect it.';
      return;
    }
    ranks=next; q('ranking').hidden=false; q('browse').hidden=true; drawRanks(true);
    describeSearch();
    if (expectedId) {
      const target = bundle.catalogue.segments.find(s=>s.id===expectedId);
      const place = key => rankString(ranks[key].rows.find(row=>row.segmentId===expectedId));
      q('known').querySelector('span').textContent = 'The observer described '+shortTime(target.startSeconds)+' – '+shortTime(target.endSeconds)+'. Word-count rank '+place('ridge')+', attention rank '+place('attention')+', timing rank '+place('joint')+'.';
      q('known').hidden=false;
    }
  }
  function describeSearch() {
    const ranked = ranks[method.value], cover=ranked.coverage, top=ranked.rows[0];
    status.textContent = cover.knownTokens+' of '+cover.usedTokens+' words used by the model occurred in training.'+
      (cover.truncated?' Some words were beyond the model’s input limit.':'')+
      (top?.rankMax>1?' Several moments share first place. Choose one to inspect.':'');
  }
  listen(tbody,'click',event=>{const b=event.target.closest('button[data-segment]');if(b && tbody.contains(b)) select(b.dataset.segment);});
  listen(q('segment'),'change',()=>select(q('segment').value));
  listen(q('form'),'submit',event=>{event.preventDefault();search(input.value);});
  listen(q('example'),'click',()=>{
    const event=bundle.catalogue.segments.find(s=>s.id===selected) || bundle.catalogue.segments[0];
    search(event.descriptions[0],event.id);
  });
  listen(q('known').querySelector('button'),'click',()=>{if(knownId) select(knownId);});
  listen(method,'change',()=>{if(ranks) { drawRanks(true); describeSearch(); }});
  async function show(text) {
    active=true; q('loadsearch').hidden=true;pending=text; const current=++version;
    try {
      if (!bundle) {
        loading.textContent='Opening the recording and models…';q('retry').hidden=true;
        request ??= loadBundle(readAsset);
        const data=await request;
        if (!active || current!==version) return;
        bundle=data;
        replay=window.mountHandReplay(q('replay'),{recording:bundle.recording,showSegmentPicker:false});
        const placeholder=doc.createElement('option');placeholder.value='';placeholder.textContent='Choose a moment…';
        q('segment').replaceChildren(placeholder);
        for (const s of bundle.catalogue.segments) {
          const option=doc.createElement('option');option.value=s.id;option.textContent=shortTime(s.startSeconds)+' – '+shortTime(s.endSeconds);
          q('segment').append(option);
        }
        q('task').textContent=bundle.catalogue.displayName+' · '+bundle.catalogue.segments.length+' moments from one training recording.';
        q('study').textContent=bundle.catalogue.study;
        q('credit').textContent=bundle.catalogue.credit;
        q('licence').textContent=bundle.catalogue.licence;
        q('ready').hidden=false;loading.textContent='';select(bundle.catalogue.segments[0].id);
      }
      if (typeof text==='string') search(text);
      if(q('future').open) await openForecast();
    } catch (e) {
      if (!active || version!==current) return;
      request=null;bundle=null;replay?.destroy();replay=null;q('ready').hidden=true;q('retry').hidden=false;
      loading.textContent='The hand recording or model files could not be opened together. Check the download and try again.';
    }
  }
  let futureApp, futurePending;
  async function openForecast() {
    if (!q('future').open || futureApp || !active) return;
    const current=version;
    try {
      futurePending ??= readAsset('wrist-forecast-fit.json').then(b=>JSON.parse(new TextDecoder().decode(b)));
      const fit=await futurePending;
      if (current!==version || !active || futureApp || !q('future').open) return;
      mountWristForecast(q('mounted-forecast'),fit);
      futureApp=true;
    } catch {
      futurePending=null;
      if(active && current===version) q('mounted-forecast').textContent='The forecast model could not open. Close and reopen this section to try again.';
    }
  }
  listen(q('future'),'toggle',openForecast);
  listen(q('loadsearch'),'click',()=>show());
  function showForecastOnly() {
    active=true;
    q('loadsearch').hidden=Boolean(bundle);
    if (!bundle) loading.textContent='';
    q('future').open=true;
    return openForecast();
  }
  listen(q('retry'),'click',()=>show(pending));
  return {show,showForecastOnly,hide(){active=false;version++;replay?.pause?.();},dispose(){active=false;version++;events.abort();replay?.destroy();}};
}
