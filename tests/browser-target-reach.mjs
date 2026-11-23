import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {fileURLToPath} from 'node:url';
import {createHandler,HOST} from '../serve-local.mjs';
const {chromium}=await import(process.env.NS_PLAYWRIGHT_MODULE||'playwright');
const root=fileURLToPath(new URL('../',import.meta.url)),allowedHosts=new Set(),s=createServer(createHandler({root,allowedHosts})).listen(0,HOST);
await once(s,'listening');const host=HOST+':'+s.address().port,origin='http://'+host;allowedHosts.add(host);
const oracle=JSON.parse(fs.readFileSync(new URL('target-reach-oracle.json',import.meta.url)));
let b;
try{
 b=await chromium.launch({executablePath:process.env.NS_CHROMIUM,args:process.env.NS_ANGLE?['--use-angle='+process.env.NS_ANGLE]:[]});
 const reports=[];
 for(const width of [1280,320]){
  const mobile=width===320,page=await b.newPage({viewport:{width,height:820},hasTouch:mobile,isMobile:mobile,reducedMotion:'reduce'});
  const errors=[],external=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(new URL(r.url()).origin!==origin)external.push(r.url());});
  await page.addInitScript(()=>{window.reachDeviceRequests=0;
    for(const k of ['getUserMedia','getDisplayMedia','enumerateDevices'])Object.defineProperty(navigator.mediaDevices,k,{value:()=>{window.reachDeviceRequests++;throw Error('Unexpected device request');}});
  });
  await page.goto(origin+'/START.html');await page.getByRole('link',{name:'Play the experimental preview'}).click();
  await page.waitForFunction(()=>window.__nsQA?.inspect().features.bodyRig&&document.querySelector('#ns-app').dataset.nsPhase==='playing',null,{timeout:120000});
  const map=page.getByRole('dialog',{name:'Activity map'}),canvas=page.locator('#ns-canvas');
  const panel=page.locator('#ns-act-target-reach');
  const before=await page.evaluate(()=>window.__nsQA.inspect().state.activity.moveSeq);
  let compared=0;
  for(const [side,initial] of [['left',3],['right',8]]){
    if(mobile)await page.getByRole('button',{name:'F · Command box'}).tap();else await canvas.press('f');
    const box=page.getByRole('textbox',{name:'Command box'});
    await box.fill('move the cylinder to target '+initial+' with the '+side+' hand');
    if(mobile)await page.getByRole('button',{name:'Move',exact:true}).tap();else await box.press('Enter');
    await panel.locator('[data-target-results]').waitFor();
    assert.equal(await panel.getByLabel('Transport hand',{exact:true}).inputValue(),side);
    assert.equal(await panel.getByLabel('Requested destination',{exact:true}).inputValue(),String(initial));
    for(const clock of ['acquisition','crossing']){
      await panel.locator('[data-tr-clock]').selectOption(clock);
      const rows=await panel.evaluate(el=>{
        const set=(key,v)=>{const input=el.querySelector(key);input.value=String(v);input.dispatchEvent(new Event('change'));};
        const out=[];
        for(const original of [1,5,9]){
          set('[data-tr-original]',original);
          for(let goal=1;goal<=9;goal++){
            set('[data-tr-goal]',goal);
            const cells=Array.from(el.querySelectorAll('tbody tr'),r=>[r.cells[1].textContent,r.cells[2].textContent]);
            out.push({original,goal,cells,curves:el.querySelectorAll('[data-tr-plot] circle').length});
          }
        }
        return out;
      });
      for(const row of rows){
        const ref=oracle[clock].find(r=>r.hand===side&&r.target===row.original);
        for(const [j,[ys,obs]] of row.cells.entries()){
          for(const [k,v] of ys.split(' / ').map(Number).entries()){assert.ok(Math.abs(v-ref.forecasts[row.goal-1][j][k]*100)<.0051);compared++;}
          if(row.goal===row.original&&ref.observed[j])for(const [k,v] of obs.split(' / ').map(Number).entries())assert.ok(Math.abs(v-ref.observed[j][k]*100)<.0051);
          else assert.equal(obs,'—');
        }
        assert.ok(row.curves >=4);
      }
    }
    await panel.locator('[data-tr-plane]').selectOption('xz');
    if(side==='left'){await map.getByRole('button',{name:'Game pathways'}).click();await map.getByRole('button',{name:'Move a cylinder',exact:true}).click();await panel.locator('[data-target-results]').waitFor();}
    assert.ok(await map.evaluate(d=>d.scrollWidth<=d.clientWidth));
    if(mobile)await map.getByRole('button',{name:'Back to game'}).tap();else await page.keyboard.press('Escape');
  }
  assert.deepEqual(errors,[]);assert.deepEqual(external,[]);assert.equal(await page.evaluate(()=>window.reachDeviceRequests),0);assert.equal(await page.evaluate(()=>window.__nsQA.inspect().state.activity.moveSeq),before);
  reports.push({width,commands:2,hands:2,timings:2,requestedTargets:9,compared,errors,external,deviceCalls:0});await page.close();
 }
 console.log(JSON.stringify(reports));
}finally{await b?.close();await new Promise(r=>s.close(r));}
