// Verify the exact F intents and recorded count forecasts in the ordinary game.
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {createServer} from 'node:http';
import {fileURLToPath} from 'node:url';
import {readFileSync} from 'node:fs';
import {createHandler,HOST} from '../serve-local.mjs';
const {chromium}=await import(process.env.NS_PLAYWRIGHT_MODULE||'playwright');
const root=fileURLToPath(new URL('../',import.meta.url)),allowedHosts=new Set();
const oracle=JSON.parse(readFileSync(new URL('spindle-cases.json',import.meta.url),'utf8'));
const server=createServer(createHandler({root,allowedHosts})).listen(0,HOST);
await once(server,'listening');const host=HOST+':'+server.address().port;allowedHosts.add(host);
const origin='http://'+host;
let browser;
try{
  const args=process.env.NS_ANGLE?['--use-angle='+process.env.NS_ANGLE]:[];
  browser=await chromium.launch({executablePath:process.env.NS_CHROMIUM,args});const reports=[];
  for(const width of [1280,320]){
    const mobile=width===320;
    const p=await browser.newPage({viewport:{width,height:820},hasTouch:mobile,isMobile:mobile,reducedMotion:'reduce'});
    const errors=[],external=[];p.on('pageerror',e=>errors.push(e.message));
    p.on('request',req=>{if(new URL(req.url()).origin!==origin)external.push(req.url());});
    await p.addInitScript(()=>{window.spindleDeviceRequests=0;
      for(const name of ['getUserMedia','getDisplayMedia','enumerateDevices']){
        Object.defineProperty(navigator.mediaDevices,name,{value:()=>{++window.spindleDeviceRequests;throw Error('Unexpected device access');}});
      }
    });
    await p.goto(origin+'/START.html');await p.getByRole('link',{name:'Play the experimental preview'}).click();
    await p.waitForFunction(()=>window.__nsQA?.inspect().features.bodyRig&&document.querySelector('#ns-app').dataset.nsPhase==='playing',null,{timeout:120000});
    const panel=p.locator('#ns-act-spindle'),map=p.getByRole('dialog',{name:'Activity map'}),canvas=p.locator('#ns-canvas');
    const before=await p.evaluate(()=>window.__nsQA.inspect().state.activity.moveSeq);
    for(const [index,command] of ['replay a muscle stretch','forecast sensory spikes'].entries()){
      if(mobile)await p.getByRole('button',{name:'F · Command box'}).tap();else await canvas.press('f');
      const field=p.getByRole('textbox',{name:'Command box'});await field.fill(command);
      if(mobile) await p.getByRole('button',{name:'Move',exact:true}).tap();else await field.press('Enter');
      await panel.locator('[data-spindle-results]').waitFor();
      for(const check of oracle){
        await panel.locator('[data-spindle-cursor]').fill(String(check.row));
        for(const method of ['all','history','mechanics']){
          await panel.locator('[data-spindle-model]').selectOption(method);
          assert.ok(Math.abs(Number(await panel.locator('[data-spindle-expected]').innerText())-check[method])<=.00051);
        }
        assert.equal(await panel.locator('[data-spindle-observed]').innerText(),String(check.count));
        assert.match(await panel.locator('[data-spindle-time]').innerText(),/archive clock/);
      }
      assert.ok(await map.evaluate(el=>el.scrollWidth<=el.clientWidth));
      if(index===0){
        await map.getByRole('button',{name:'Game pathways'}).click();
        await map.getByRole('button',{name:'Stretch and spikes'}).click();
        await panel.locator('[data-spindle-results]').waitFor();
      }
      if(mobile)await map.getByRole('button',{name:'Back to game'}).tap();else await p.keyboard.press('Escape');
    }
    assert.equal(await p.evaluate(()=>window.spindleDeviceRequests),0);
    assert.equal(await p.evaluate(()=>window.__nsQA.inspect().state.activity.moveSeq),before);
    assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
    reports.push({width,commands:2,numericCases:oracle.length,deviceRequests:0,errors});await p.close();
  }
  console.log(JSON.stringify(reports));
} finally {await browser?.close();await new Promise(r=>server.close(r));}
