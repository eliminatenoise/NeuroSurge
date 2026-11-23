import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {fileURLToPath} from 'node:url';
import {createHandler,HOST} from '../serve-local.mjs';
const {chromium}=await import(process.env.NS_PLAYWRIGHT_MODULE||'playwright');
const root=fileURLToPath(new URL('../',import.meta.url)),allowedHosts=new Set(),s=createServer(createHandler({root,allowedHosts})).listen(0,HOST);
await once(s,'listening');const host=HOST+':'+s.address().port,origin='http://'+host;allowedHosts.add(host);
const oracle=JSON.parse(fs.readFileSync(new URL('contact-forecast-cases.json',import.meta.url)));
let b;
try{
 b=await chromium.launch({executablePath:process.env.NS_CHROMIUM,args:process.env.NS_ANGLE?['--use-angle='+process.env.NS_ANGLE]:[]});
 const reports=[];
 for(const width of [1280,320]){
  const mobile=width===320,page=await b.newPage({viewport:{width,height:820},hasTouch:mobile,isMobile:mobile,reducedMotion:'reduce'});
  const errors=[],external=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(new URL(r.url()).origin!==origin)external.push(r.url());});
  await page.addInitScript(()=>{window.contactDeviceRequests=0;
    for(const k of ['getUserMedia','getDisplayMedia','enumerateDevices'])Object.defineProperty(navigator.mediaDevices,k,{value:()=>{window.contactDeviceRequests++;throw Error('Unexpected device request');}});
  });
  await page.goto(origin+'/START.html');await page.getByRole('link',{name:'Play the experimental preview'}).click();
  await page.waitForFunction(()=>window.__nsQA?.inspect().features.bodyRig&&document.querySelector('#ns-app').dataset.nsPhase==='playing',null,{timeout:120000});
  const map=page.getByRole('dialog',{name:'Activity map'}),canvas=page.locator('#ns-canvas');
  const contactPanel=page.locator('#ns-act-contact-forecast');
  const before=await page.evaluate(()=>window.__nsQA.inspect().state.activity.moveSeq);
  let compared=0;
  for(const [phase,command] of ['forecast brain activity after a push','forecast brain activity after a reach cue','forecast brain activity during an unbumped reach'].entries()){
    if(mobile)await page.getByRole('button',{name:'F · Command box'}).tap();else await canvas.press('f');
    const box=page.getByRole('textbox',{name:'Command box'});await box.fill(command);
    if(mobile)await page.getByRole('button',{name:'Move',exact:true}).tap();else await box.press('Enter');
    await contactPanel.locator('[data-contact-results]').waitFor();
    assert.equal(await contactPanel.getByLabel('Recorded event',{exact:true}).inputValue(),String(phase));
    const snapshots=await contactPanel.evaluate((el,ids)=>{
      const set=(key,v)=>{const input=el.querySelector(key);input.value=String(v);input.dispatchEvent(new Event('change'));};
      const snapshots=[];
      for(const offset of [0,5,10,15]){
        set('[data-offset]',offset);
        for(const [c,id] of ids.entries()){
          set('[data-contact]',id);
          snapshots.push({offset,c,data:Array.from(el.querySelectorAll('tbody td'),cell=>Number(cell.textContent))});
        }
      }
      return snapshots;
    },oracle.contact_ids);
    for(const row of snapshots){
      const expected=oracle.rows.find(x=>x.phase===phase&&x.offset===row.offset);
      assert.equal(row.data[0],expected.recorded[row.c]);
      for(const [i,name] of ['all','count_cue'].entries()){
        assert.ok(Math.abs(row.data[i+1]-expected[name][row.c])<0.00051);
        compared++;
      }
    }
    if(!phase){
      await map.getByRole('button',{name:'Game pathways'}).click();
      await map.getByRole('button',{name:'Next-day brain activity',exact:true}).click();
      await contactPanel.locator('[data-contact-results]').waitFor();
    }
    assert.ok(await map.evaluate(d=>d.scrollWidth<=d.clientWidth));
    if(mobile)await map.getByRole('button',{name:'Back to game'}).tap();else await page.keyboard.press('Escape');
  }
  assert.deepEqual(errors,[]);assert.deepEqual(external,[]);assert.equal(await page.evaluate(()=>window.contactDeviceRequests),0);assert.equal(await page.evaluate(()=>window.__nsQA.inspect().state.activity.moveSeq),before);
  reports.push({width,commands:3,events:3,offsets:4,contacts:26,compared,errors,external,deviceCalls:0});await page.close();
 }
 console.log(JSON.stringify(reports));
}finally{await b?.close();await new Promise(r=>s.close(r));}
