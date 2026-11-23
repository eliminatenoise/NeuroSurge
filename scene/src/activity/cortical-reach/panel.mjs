import {predict} from './predict.mjs';
import {integrity} from './assets.mjs';
const f=(v)=>Number(v.toFixed(3)).toString();
async function asset(name){
  const r=await fetch(new URL(name+'.json',import.meta.url),{integrity:integrity[name]});
  if(!r.ok)throw Error('Missing reach asset');return r.json();
}
export function bindReach(panel,on){
  const q=s=>panel.querySelector(s), section=q('[data-reach-results]'), status=q('[role=status]');
  const event=q('[data-reach-phase]'), offset=q('[data-reach-offset]');let loading,data,models;
  function draw(){
    const h=data.rows.find(row=>row.epoch===Number(event.value)&&row.offset===Number(offset.value));
    const table=q('tbody');table.replaceChildren();
    if(!h){status.textContent='This interval was unavailable in the selected original trial.';q('[data-reach-units]').textContent='';return;}
    const input={...h,session:data.session,unit_ids:data.unit_ids};
    const a=predict(models.all,input),b=predict(models.movement_cue,input);
    for(const [name,p] of [['With spikes',a],['Motion and cue',b],['Recorded',h.y]]){
      const tr=table.insertRow(),head=panel.ownerDocument.createElement('th');head.scope='row';head.textContent=name;tr.append(head);
      for(const x of p)tr.insertCell().textContent=f(x);
      tr.insertCell().textContent=name==='Recorded'?'—':f(Math.hypot(p[0]-h.y[0],p[1]-h.y[1]));
    }
    const counts=h.neural.map(bin=>bin.reduce((x,y)=>x+y,0));
    q('[data-reach-units]').textContent='Across the 30 sorted units, the five completed 40 ms bins contain '+counts.join(' · ')+' spikes (oldest first).';
    const cue=h.cue.at(-1);
    q('[data-reach-cue]').textContent='At the cutoff: '+(cue[0]?'earlier perturbation recorded':'no earlier perturbation cue')+', '+(cue[3]?'target available':'target still hidden')+', '+(cue[6]?'go cue available.':'no earlier go cue.');
    status.textContent='Held recording · original trial '+data.trial+' · '+Number(((h.k-data.start)*.01).toFixed(2))+' s from trial start';
  }
  for(const el of [event,offset])on(el,'change',draw);
  return {async show(phase,current){
    section.hidden=true;status.textContent='Loading the recorded reach and its two forecasts…';
    loading??=Promise.all([asset('trial'),asset('models')]).catch(error=>{loading=null;throw error;});
    [data,models]=await loading;if(!current())return;
    event.value=String(phase);offset.value='5';section.hidden=false;draw();
  }};
}
