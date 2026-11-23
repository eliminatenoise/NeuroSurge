import {predictCount} from './predict.mjs';
import {integrity} from './assets.mjs';

const fmt = (n,places=3) => String(Number(n.toFixed(places)));
async function get(name) {
  const r=await fetch(new URL(name+'.json',import.meta.url),{integrity:integrity[name]});
  if(!r.ok) throw Error('Missing spindle asset');
  return r.json();
}
export function bindSpindle(section,on){
  const q=s=>section.querySelector(s);
  const viewport=q('[data-spindle-results]'),status=q('[role=status]'),cursor=q('[data-spindle-cursor]');
  const method=q('[data-spindle-model]');
  let payload,loading;
  function draw(){
    const i=Number(cursor.value),row=payload.trial.rows[i];
    const expected=predictCount(payload.models[method.value],row.input);
    const delta=row.delta;
    q('[data-spindle-time]').textContent=fmt(row.time*1000,0)+' ms into the excerpt · '+fmt(payload.trial.start+row.time,3)+' s on the archive clock';
    q('[data-spindle-expected]').textContent=fmt(expected);
    q('[data-spindle-observed]').textContent=String(row.count);
    q('[data-spindle-past]').textContent=row.input.map(bin=>bin[4]).join(' · ');
    q('[data-spindle-mechanics]').textContent='During the following 20 ms the tendon force changed by '+fmt(delta[0],5)+' and the apparatus position by '+fmt(delta[1],5)+' in their respective recorded units.';
    q('[data-spindle-before]').disabled=i===0;q('[data-spindle-after]').disabled=i===payload.trial.rows.length-1;
    status.textContent='Recorded rat sensory fiber · held recording';
  }
  on(cursor,'input',draw);on(method,'change',draw);
  for(const [key,step] of [['before',-1],['after',1]])on(q('[data-spindle-'+key+']'),'click',()=>{
    cursor.value=String(Number(cursor.value)+step);draw();
  });
  return {async show(current){
    viewport.hidden=true;status.textContent='Loading the recording and fitted models…';
    loading??=Promise.all([get('trial'),get('models')]).then(([trial,models])=>({trial,models}))
      .catch(error=>{loading=null;throw error;});
    payload=await loading;if(!current())return;
    cursor.max=String(payload.trial.rows.length-1);cursor.value='0';method.value='all';
    viewport.hidden=false;draw();
  }};
}
