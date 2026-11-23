import './kernel.js';
import {integrity} from './assets.mjs';

async function load(name) {
  const res = await fetch(new URL(name + '.json', import.meta.url), {integrity:integrity[name]});
  if (!res.ok) throw Error('Could not load '+name);
  return res.json();
}

function drawPath(svg, prediction, truth, plane) {
  const ia = 'xyz'.indexOf(plane[0]), ib = 'xyz'.indexOf(plane[1]);
  const xy = v=>[v[ia]*100, v[ib]*100];
  const paths = [prediction,truth].map(rows=>rows ? [[0,0],...rows.map(v=>v?xy(v):null)] : []);
  const points = paths.flat().filter(Boolean);
  const max = Math.max(.1,...points.flat().map(Math.abs));
  const step = 10**Math.floor(Math.log10(max));
  const bound = Math.ceil(max/step)*step, scale=77/bound;
  const map=([x,y])=>[200+x*scale,100-y*scale];
  const el=(name,attrs,text) => {
    const node=svg.ownerDocument.createElementNS('http://www.w3.org/2000/svg',name);
    for(const [k,v] of Object.entries(attrs))node.setAttribute(k,v);
    if(text!=null)node.textContent=text;svg.append(node);
    return node;
  };
  svg.replaceChildren();
  el('path',{d:'M 20 100 H 380 M 200 15 V 182',fill:'none',stroke:'#6d8181','stroke-width':1});
  paths.forEach((path,i)=>{
    const color=i?'#f3da99':'#85dfbc';let previous=null;
    for(const point of path){
      if(!point){previous=null;continue;}
      const [x,y]=map(point);
      if(previous)el('line',{x1:previous[0],y1:previous[1],x2:x,y2:y,stroke:color,'stroke-width':i?2:3,'stroke-dasharray':i?'4 3':'none'});
      el('circle',{cx:x,cy:y,r:i?3:4,fill:i?'#132b31':color,stroke:color});
      previous=[x,y];
    }
  });
  el('text',{x:379,y:96,'text-anchor':'end',fill:'#dbebe6','font-size':11},'+'+plane[0].toUpperCase());
  el('text',{x:206,y:20,fill:'#dbebe6','font-size':11},'+'+plane[1].toUpperCase());
  el('line',{x1:24,y1:181,x2:101,y2:181,stroke:'#cadee1','stroke-width':2});
  el('text',{x:24,y:198,fill:'#dbebe6','font-size':11},Number(bound.toPrecision(3))+' cm');
}

export function bindTargetReach(panel,on){
  const get=key=>panel.querySelector(key), side=get('[data-tr-side]'), clock=get('[data-tr-clock]'), origin=get('[data-tr-original]'), goal=get('[data-tr-goal]'), plane=get('[data-tr-plane]');
  const status=get('[role=status]'), table=get('tbody'), section=get('[data-target-results]');
  let pending,cases,models;
  function options(s,values,preferred){
    s.replaceChildren(...values.map(n=>new Option('Target '+n,String(n))));s.value=String(values.includes(preferred)?preferred:values[0]);
  }
  function selectRecording(){
    const available=cases[clock.value].filter(s=>s.hand===side.value).map(x=>x.target);
    options(origin,available,Number(origin.value)||5);
    draw();
  }
  function draw(){
    const row=cases[clock.value].find(x=>x.hand===side.value&&x.target===Number(origin.value));
    if(!row){section.hidden=true;status.textContent='No recording for this combination.';return;}
    const t=Number(goal.value);
    const prediction=globalThis.TargetReach.predict(models[clock.value],{xyz:row.xyz,time:row.time,hand:row.hand,target:t});
    const real=t===row.target?row.observed:null;
    drawPath(get('[data-tr-plot]'),prediction,real,plane.value);
    table.replaceChildren();
    const format=v=>v.map(x=>(100*x).toFixed(2)).join(' / ');
    prediction.forEach((v,i)=>{
      const tr=table.insertRow(), th=panel.ownerDocument.createElement('th');th.scope='row';th.textContent=[400,600,800][i]+' ms';tr.append(th);
      tr.insertCell().textContent=format(v);tr.insertCell().textContent=real?.[i]?format(real[i]):'—';
    });
    status.textContent=(real?'Recorded assignment':'Changed destination · simulated forecast')+' · '+side.value+' hand · requested target '+t;
    get('[data-tr-caption]').textContent='Green dots join the three forecasts after the 200-ms input. '+(real?'Gold rings show the same trial’s measured object positions.':'The other destination has no measured outcome for this starting movement.');
    section.hidden=false;
  }
  on(side,'change',selectRecording);on(clock,'change',selectRecording);on(origin,'change',draw);on(goal,'change',draw);on(plane,'change',draw);
  return {async show(selection,current){
    pending??=Promise.all([load('cases'),load('models')]).catch(error=>{pending=null;throw error;});
    [cases,models]=await pending;
    if(!current())return;
    side.value=selection?.hand==='left'?'left':'right';clock.value='crossing';
    options(goal,[1,2,3,4,5,6,7,8,9],selection?.goal??5);
    options(origin,cases[clock.value].filter(x=>x.hand===side.value).map(x=>x.target),5);
    draw();
  }};
}
