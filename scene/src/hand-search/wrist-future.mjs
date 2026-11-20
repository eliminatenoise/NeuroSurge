// A configurable one-second displacement forecast. All coordinate inputs precede
// the cutoff. A later measurement is handled only by the separate comparison UI.
const phases=[-1,-0.5,-0.25,0];
export const inventedHistory=[[0,0,0],[2,0,0],[3,1,0],[3,2,0]];
const distance=(a,b)=>Math.hypot(...a.map((v,i)=>v-b[i]));
const finiteVector=(x,n)=>Array.isArray(x)&&x.length===n&&x.every(Number.isFinite);

function standardized(values,mean,scale) {
  if (!finiteVector(mean,values.length)||!finiteVector(scale,values.length)||scale.some(x=>x<=0)) throw Error('Invalid training scales.');
  return values.map((v,i)=>(v-mean[i])/scale[i]);
}

export function forecastWrist({positions,task,words,cutoff,duration}, spec, weights) {
  if (!Array.isArray(positions)||positions.length!==4||!positions.every(p=>finiteVector(p,3))) throw Error('Enter four positions, each with three numbers in centimetres.');
  if (!spec.tasks.includes(task) || !Array.isArray(words) || new Set(words).size!==words.length || !words.every(w=>spec.vocabulary.includes(w))) throw Error('Choose one of the fitted tasks and words.');
  if (!Number.isFinite(cutoff)||!Number.isFinite(duration)||duration<=0||cutoff<duration+0.25) throw Error('Allow the instruction to finish at least a quarter-second before the forecast.');
  const features=[];
  for(let i=1;i<positions.length;i++) {
    const elapsed=phases[i]-phases[i-1];
    const speed=positions[i].map((v,j)=>(v-positions[i-1][j])/elapsed);
    features.push(...speed,Math.hypot(...speed));
  }
  const recent=distance(positions[0],positions[3]);
  features.push(recent,0,0,0,0); // Measurements exactly at the four requested times.
  const motion=standardized(features,spec.motion_mean,spec.motion_scale);
  const context=standardized([Math.log1p(cutoff),Math.log1p(duration),words.length,1],spec.context_mean,spec.context_scale);
  const terms=spec.vocabulary.map(w=>Number(words.includes(w)));
  const base=[...motion,...context,...spec.tasks.map(t=>Number(t===task))];
  function fit(name, values) {
    const coefficients=weights[name];
    if(!finiteVector(coefficients,values.length+1))throw Error('The coefficient count differs from the feature count.');
    const estimate=coefficients[0]+values.reduce((sum,v,i)=>sum+coefficients[i+1]*v,0);
    if (!Number.isFinite(estimate)) throw Error('These coordinates exceed the available numeric range.');
    return Math.max(0,estimate);
  }
  return {recent, motion:fit('motion_context',base), withWords:fit('motion_context_words',[...base,...terms]),
    removed:fit('motion_context_words',[...base,...terms.map(()=>0)]), previousPositions:positions.map(p=>distance(p,positions[3]))};
}

export function mountWristForecast(host, fit) {
  const doc=host.ownerDocument,spec=fit.spec;
  host.innerHTML=`<p>An instructor speaks, the instruction ends, and a headset has one more quarter-second to observe the wrist. How far will the wrist be from its current position one second later?</p>
    <p>The example starts with invented positions. Change them to run the published models on your device. Distances describe the straight line between two positions.</p>
    <form data-fw-form><fieldset><legend>Words available before the forecast</legend><div data-fw-words></div></fieldset>
    <details><summary>Change the movement or timing</summary>
      <label>Task <select data-fw-task></select></label>
      <label>Wrist positions in cm <textarea data-fw-points rows="4" spellcheck="false"></textarea></label>
      <p>Enter one X, Y, Z position per line, for 1.00, 0.50 and 0.25 seconds before the cutoff, then the cutoff itself. All four readings use the same axes.</p>
      <label>Time in recording at cutoff, seconds <input data-fw-time type="number" min="1" step="any" value="60" required></label>
      <label>Duration of completed instruction, seconds <input data-fw-duration type="number" min="0.001" step="any" value="3" required></label>
    </details><button type="submit">Run forecast</button></form>
    <p data-fw-status role="status"></p><div data-fw-result>
      <table><caption>Predicted displacement one second after the cutoff</caption><thead><tr><th scope="col">Information used</th><th scope="col">Distance</th></tr></thead><tbody data-fw-rows></tbody></table>
      <details><summary>Compare with a known later position</summary><label>Later X, Y, Z in cm <input data-fw-later type="text" placeholder="Three numbers separated by commas"></label>
      <button type="button" data-fw-compare>Compare distances</button><p data-fw-error role="status"></p></details>
    </div><details><summary>How well did this work on recordings?</summary><p>Across 26 forecasts from four acquisition groups, repeating the wrist’s previous one-second displacement missed by 7.38 cm on average. A learned model using motion, task and speech timing missed by 9.79 cm. Adding the retained words increased the error to 10.04 cm.</p><p>Twenty forecasts came from one acquisition group. Every included transcript had an unrated confidence field. The study kept six recurring word indicators and fitted its linear models on 44 examples. That was below the prespecified minimum of 160 for training an attention model.</p></details>`;
  const q=n=>host.querySelector('[data-fw-'+n+']');
  const picker=q('task');const taskNames={smallprinter:'Small printer',bigprinter:'Large printer',gopro:'Action camera',switch:'Game console',nespresso:'Coffee maker',dslr:'Digital camera'};
  for(const t of spec.tasks){const o=doc.createElement('option');o.value=t;o.textContent=taskNames[t]||t;picker.append(o);}
  picker.value=spec.tasks.includes('gopro')?'gopro':spec.tasks[0];
  q('points').value=inventedHistory.map(x=>x.join(', ')).join('\n');
  for(const word of spec.vocabulary){const label=doc.createElement('label'),c=doc.createElement('input');c.type='checkbox';c.value=word;c.checked=word==='turn';label.append(c,doc.createTextNode(word));q('words').append(label);}
  const labels={recent:'Repeat previous one-second displacement', motion:'Motion, task and timing', withWords:'Motion, task, timing and word identities', removed:'Same fitted model with word identities removed'};
  function parsePoint(line) {
    const fields=line.trim().split(/[\s,]+/);
    if(fields.length!==3||fields.some(x=>!x))throw Error('Enter three numbers on each coordinate line.');
    const values=fields.map(Number);
    if(!finiteVector(values,3))throw Error('Every coordinate must be a finite number.');
    return values;
  }
  let run=null,anchor=null;
  function submit(e){
    e?.preventDefault();q('error').textContent='';q('status').textContent='';
    try{
      const positions=q('points').value.trim().split(/\r?\n/).map(parsePoint);
      const words=Array.from(q('words').querySelectorAll('input:checked'),c=>c.value);
      run=forecastWrist({positions,task:picker.value,words,cutoff:q('time').valueAsNumber,duration:q('duration').valueAsNumber},spec,fit.weights);
      anchor=positions[3];const rows=q('rows');rows.replaceChildren();
      for(const [k,label] of Object.entries(labels)){const tr=rows.insertRow(),th=doc.createElement('th');th.scope='row';th.textContent=label;tr.append(th);tr.insertCell().textContent=run[k].toFixed(2)+' cm';}
      q('status').textContent='Forecast calculated from the four earlier positions. Transcript confidence is set to unrated, as in the study.';
      q('result').hidden=false;
    }catch(error){run=null;anchor=null;q('result').hidden=true;q('status').textContent=error.message;}
  }
  q('form').addEventListener('submit',submit);
  q('form').addEventListener('input',()=>{run=null;anchor=null;q('result').hidden=true;q('status').textContent='Run the forecast to use the changed inputs.';});
  q('later').addEventListener('input',()=>{q('error').textContent='';});
  q('compare').addEventListener('click',()=>{
    try {
      if(!run)throw Error('Run the forecast first.');
      const observed=distance(parsePoint(q('later').value),anchor);
      q('error').textContent='Entered displacement '+observed.toFixed(2)+' cm. Absolute errors: repeat previous displacement '+Math.abs(run.recent-observed).toFixed(2)+' cm, movement with words '+Math.abs(run.withWords-observed).toFixed(2)+' cm.';
    }catch(e){q('error').textContent=e.message;}
  });
  submit();
}
