import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {fileURLToPath} from 'node:url';
import {createHandler,HOST} from '../serve-local.mjs';
const {chromium}=await import(process.env.NS_PLAYWRIGHT_MODULE||'playwright');
const root=fileURLToPath(new URL('../',import.meta.url)),allowedHosts=new Set(),s=createServer(createHandler({root,allowedHosts})).listen(0,HOST);
await once(s,'listening');const host=HOST+':'+s.address().port,origin='http://'+host;allowedHosts.add(host);
const oracle=JSON.parse(fs.readFileSync(new URL('cortical-reach-cases.json',import.meta.url)));
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
  const map=page.getByRole('dialog',{name:'Activity map'}),panel=page.locator('#ns-act-cortical-reach'),canvas=page.locator('#ns-canvas');
  const before=await page.evaluate(()=>window.__nsQA.inspect().state.activity.moveSeq);
  for(const [epoch,command] of [[0,'replay a perturbed reach'],[1,'forecast a cued reach']]){
    if(mobile)await page.getByRole('button',{name:'F · Command box'}).tap();else await canvas.press('f');
    const box=page.getByRole('textbox',{name:'Command box'});await box.fill(command);
    if(mobile)await page.getByRole('button',{name:'Move',exact:true}).tap();else await box.press('Enter');
    await panel.locator('[data-reach-results]').waitFor();
    assert.equal(await panel.getByLabel('Trial event',{exact:true}).inputValue(),String(epoch));
    for(const k of [0,5,10,15]){
      await panel.getByLabel('Forecast begins',{exact:true}).selectOption(String(k));
      const values=await panel.locator('tbody tr').evaluateAll(rows=>rows.map(r=>[...r.cells].slice(1,3).map(c=>Number(c.textContent))));
      const expected=oracle.find(o=>o.epoch===epoch&&o.offset===k);assert.equal(values.length,3);
      for(const [i,id] of ['all','movement_cue','y'].entries())
        for(let a=0;a<2;a++)assert.ok(Math.abs(values[i][a]-expected[id][a])<=.00051);
    }
    if(!epoch){await map.getByRole('button',{name:'Game pathways'}).click();await map.getByRole('button',{name:'Cortical reach',exact:true}).click();await panel.locator('[data-reach-results]').waitFor();}
    assert.ok(await map.evaluate(d=>d.scrollWidth<=d.clientWidth));
    if(mobile)await map.getByRole('button',{name:'Back to game'}).tap();else await page.keyboard.press('Escape');
  }
  assert.deepEqual(errors,[]);assert.deepEqual(external,[]);assert.equal(await page.evaluate(()=>window.reachDeviceRequests),0);assert.equal(await page.evaluate(()=>window.__nsQA.inspect().state.activity.moveSeq),before);
  reports.push({width,commands:2,events:2,offsets:4,errors,external,deviceCalls:0});await page.close();
 }
 console.log(JSON.stringify(reports));
}finally{await b?.close();await new Promise(r=>s.close(r));}
