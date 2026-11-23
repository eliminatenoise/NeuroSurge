// Project the rendered 3D triangles with the actual WebGL camera. Use a point on either arm of each chevron
// to exercise the normal pointer/touch path; no game-provided hit location or camera mutation is used.
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const { chromium } = await import(process.env.NS_PLAYWRIGHT_MODULE || 'playwright');
const root = resolve(process.env.NS_TEST_ROOT || fileURLToPath(new URL('../', import.meta.url)));
const { createHandler, HOST } = await import(pathToFileURL(join(root, 'serve-local.mjs')));
const allowedHosts = new Set(), server = createServer(createHandler({ root, allowedHosts }));
server.listen(0, HOST);
await once(server, 'listening');
const host = `${HOST}:${server.address().port}`;
allowedHosts.add(host);
const native = process.env.NS_BROWSER_CDP;
const touch = process.env.NS_TOUCH === '1';
const baseline = process.env.NS_OBSERVE === '1';
const viewport = { width: Number(process.env.NS_WIDTH || 1600), height: Number(process.env.NS_HEIGHT || 900) };
const args = ['--disable-background-networking'];
if (process.env.NS_ANGLE) args.push('--use-angle=' + process.env.NS_ANGLE);
const report = { errors: [], steps: [], assets: { packs: 0, raw: 0 } };
let browser;
try {
  browser = native ? await chromium.connectOverCDP(native, { noDefaults: true })
    : await chromium.launch({ executablePath: process.env.NS_CHROMIUM, args });
  const page = native ? browser.contexts()[0].pages()[0] : await browser.newPage({ viewport, isMobile: touch, hasTouch: touch });
  page.setDefaultTimeout(20000);
  page.on('pageerror', e => report.errors.push(String(e)));
  page.on('response', async r => {
    if (!r.ok()) return;
    if (r.url().endsWith('.nspack')) report.assets.packs++;
    if (r.url().endsWith('.obj')) report.assets.raw++;
  });
  if (process.env.NS_RAW === '1') await page.route('**/packs/PACK-INDEX.json', route => route.abort());
  const cd = native ? await page.context().newCDPSession(page) : null;
  if (native) {
    await page.goto('about:blank');
    report.originalViewport = await page.evaluate(() => ({ width: innerWidth, ratio: devicePixelRatio }));
    await page.goto('chrome://settings/appearance');
    const zoom = page.locator('select').filter({ has: page.getByRole('option', { name: '200%', exact: true }) });
    await zoom.selectOption({ label: '200%' });
  }
  async function capture(label) {
    if (!process.env.NS_SCREENSHOTS) return;
    const path = join(process.env.NS_SCREENSHOTS, label + '.png');
    if (!cd) return page.screenshot({ path });
    const { data } = await cd.send('Page.captureScreenshot', {format:'png'});
    await writeFile(path, Buffer.from(data,'base64'));
  }
  const started = performance.now();
  await page.goto(`http://${host}/START.html`);
  // 24 November 2026 (DESIGN-DECISIONS section 204): GitHub main's start page offers two editions, "Play Full" and "Play
  // Lite" (until then one link, "Play the experimental preview"). This test opens the full edition, the game it checks.
  // As before it runs in a publish tree, whose START.html is main's (NS_TEST_ROOT).
  await page.getByRole('link', { name: 'Play Full', exact: true }).click();
  await page.waitForFunction(() => window.__nsQA?.inspect()?.shell?.mode === 'playing');
  report.readyMs = Math.round(performance.now() - started);
  await page.locator('.ns-keys.ns-ctl').waitFor({state:'detached'});
  report.graphics = await page.evaluate(async () => {
    const { Scene, Vector3 } = await import('/vendor/three.module.js');
    const onAfterRender = Scene.prototype.onAfterRender;
    const tips = new Map();
    let camera;
    Scene.prototype.onAfterRender = function (renderer, scene, active) {
      if (active.isPerspectiveCamera && renderer.domElement.id === 'ns-canvas') {
        if (tips.size < 8) scene.traverse(n => {
          const a=n.userData.nsArrow;
          if (n.isMesh && a) tips.set(a.target + '/' + a.dir,n);
        });
        if (tips.size === 8) camera = active;
      }
      return onAfterRender.apply(this, arguments);
    };
    // Count CSS pixel centres for which the same camera ray intersects both rendered objects. Bounding
    // rectangles alone cannot tell whether the empty space between the arms of two chevrons is shared.
    window.overlappingCompassStrokes = async () => {
      const { Raycaster, Vector2 } = await import('/vendor/three.module.js');
      const ray = new Raycaster(), {meshes} = window.readOutsideCompasses(), shared = [];
      const box = document.querySelector('#ns-canvas').getBoundingClientRect();
      const green = [...tips.keys()].filter(k => k.startsWith('mirror/'));
      const grey = [...tips.keys()].filter(k => k.startsWith('brain/'));
      for (const g of green) for (const b of grey) {
        const a = meshes[g], c = meshes[b];
        if (!a.shown || !c.shown) continue;
        const points = [];
        for (let x = Math.ceil(Math.max(a.box[0],c.box[0])); x <= Math.min(a.box[2],c.box[2]); x++) {
          for (let y = Math.ceil(Math.max(a.box[1],c.box[1])); y <= Math.min(a.box[3],c.box[3]); y++) {
            ray.setFromCamera(new Vector2(2*(x+0.5-box.left)/box.width-1,1-2*(y+0.5-box.top)/box.height),camera);
            if (ray.intersectObject(tips.get(g),false).length && ray.intersectObject(tips.get(b),false).length) points.push([x+0.5,y+0.5]);
          }
        }
        if (points.length) shared.push({green:g,grey:b,pixels:points.length,point:points[Math.floor(points.length/2)]});
      }
      return shared;
    };
    window.readOutsideCompasses = () => {
      if (!camera || tips.size !== 8) return null;
      const s=window.__nsQA.inspect({ arrowTrace:true }), canvas=document.querySelector('#ns-canvas').getBoundingClientRect();
      const trace=s.arrowTrace.value, meshes={};
      for (const [key,mesh] of tips) {
        const [set,dir]=key.split('/'), geometry=mesh.geometry, positions=geometry.attributes.position, index=geometry.index;
        const screen=Array.from({length:positions.count}, (_,i) => {
          const v=new Vector3().fromBufferAttribute(positions,i).applyMatrix4(mesh.matrixWorld).project(camera);
          return [canvas.left+(v.x+1)*canvas.width/2,canvas.top+(1-v.y)*canvas.height/2];
        });
        const xs=screen.map(q=>q[0]), ys=screen.map(q=>q[1]);
        const bb=[Math.min(...xs),Math.min(...ys),Math.max(...xs),Math.max(...ys)];
        const vertical = dir==='forward'||dir==='back';
        const triangles=[];
        for (let i=0;i < (index?.count ?? positions.count);i+=3) {
          const [a,b,c]=[i,i+1,i+2].map(j=>screen[index?index.getX(j):j]);
          const area=Math.abs((b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]));
          if (area>1) triangles.push({ x:(a[0]+b[0]+c[0])/3, y:(a[1]+b[1]+c[1])/3, area });
        }
        const component = vertical ? 0 : 1;
        const strokes = [0.24,0.76].map(frac => {
          const goal=bb[component]+(bb[component+2]-bb[component])*frac;
          const best=triangles.reduce((a,b)=>Math.abs((vertical?b.x:b.y)-goal)<Math.abs((vertical?a.x:a.y)-goal)?b:a);
          return [best.x,best.y];
        });
        const d=trace[set].dirs[dir];
        meshes[key]={box:bb,strokes,world:new Vector3().setFromMatrixPosition(mesh.parent.matrixWorld).toArray(),
          onCanvas:strokes.map(p=>document.elementFromPoint(...p)?.id==='ns-canvas'), shown:trace[set].groupVisible&&d.retainedDraw.rootVisible,
          motorOverlap:d.retainedDraw.boxOverlapsMotorArea};
      }
      return { meshes, brain:s.state.view.orbit, mirror:s.features.round5.mirrorOrbit, drawnMirror:s.scene.mirror.orbit,
        camera:s.camera.pose, lens:camera.fov, trigger:s.state.trigger.seq, gaze:s.state.gaze.regionId, frames:s.frames,
        hover: [trace.brain.hovered,trace.mirror.hovered], input:s.controlTargets, locked:!!document.pointerLockElement };
    };
    const gl=document.querySelector('#ns-canvas').getContext('webgl2'), info=gl.getExtension('WEBGL_debug_renderer_info');
    const s=window.__nsQA.inspect();
    return { renderer:info?gl.getParameter(info.UNMASKED_RENDERER_WEBGL):null, healthy:s.phase==='running'&&s.features.bodyRig&&!s.placeholder&&!s.qa,
      width:innerWidth,height:innerHeight,ratio:devicePixelRatio };
  });
  assert.ok(report.graphics.healthy);
  if (process.env.NS_ANGLE === 'vulkan') assert.match(report.graphics.renderer,/Vulkan/);
  if(native) assert.ok(report.graphics.ratio>=report.originalViewport.ratio*1.99);
  await page.waitForFunction(()=>!!window.readOutsideCompasses());
  const snap=()=>page.evaluate(()=>window.readOutsideCompasses());
  const advance=async (n=4)=>{
    const frame=await page.evaluate(()=>window.__nsQA.inspect().frames);
    await page.waitForFunction(([f,n])=>window.__nsQA.inspect().frames>=f+n,[frame,n]);
  };
  async function switchView(outside){
    await page.keyboard.press('e');
    await page.waitForFunction(outside=>{const p=window.__nsQA.inspect().camera.pose;return p.thirdPerson===outside&&!p.moving;},outside);
    await advance();
  }
  report.eye=await snap();
  await switchView(true);
  if(process.env.NS_RESIZE) {
    const [width,height]=process.env.NS_RESIZE.split('x').map(Number);
    await page.setViewportSize({width,height});
    await page.waitForFunction(([w,h])=>{const c=window.__nsQA.inspect({arrowTrace:true}).arrowTrace.value.activeCamera;return c.width===w&&c.height===h;},[width,height]);
    await advance(8);
    report.resizedViewport={width,height};
  }
  report.outside=await snap();
  await capture('outside');
  const collisions=[];
  const keys=Object.keys(report.outside.meshes);
  for(let i=0;i<keys.length;i++)for(let j=i+1;j<keys.length;j++){
    const a=report.outside.meshes[keys[i]].box,b=report.outside.meshes[keys[j]].box;
    if(a[0]<b[2]&&b[0]<a[2]&&a[1]<b[3]&&b[1]<a[3]) collisions.push([keys[i],keys[j]]);
  }
  report.boxOverlaps=collisions;
  report.sharedStrokePixels=await page.evaluate(()=>window.overlappingCompassStrokes());
  for(const pair of report.sharedStrokePixels) {
    if(touch) continue;
    await page.mouse.move(...pair.point);
    await advance(4);
    pair.actualHover=(await snap()).hover;
  }
  const moves=[['forward','pitch',15],['back','pitch',-15],['right','yaw',15],['left','yaw',-15]];
  for(const set of ['mirror','brain'])for(const [dir,axis,amount] of moves) {
    const before=await snap(), mesh=before.meshes[set+'/'+dir], other=set==='brain'?'mirror':'brain';
    const ix=(dir==='forward'||dir==='left')?0:1, point=mesh.strokes[ix];
    const step={set,dir,axis,point,shown:mesh.shown,onCanvas:mesh.onCanvas[ix],before:before[set]};
    report.steps.push(step);
    if(!mesh.shown || !mesh.onCanvas[ix]) {if(baseline) continue; assert.fail(set+' '+dir+' stroke is unreachable');}
    if(touch) await page.touchscreen.tap(...point);
    else {
      await page.mouse.move(...point);
      await advance(3);
      step.hover=(await snap()).hover;
      const wanted=step.hover[set==='brain'?0:1]===dir;
      if(!baseline) assert.ok(wanted,set+' '+dir+' hover');
      if(wanted&&dir==='forward') await capture(set+'-up');
      await page.mouse.click(...point);
    }
    await advance(4);
    const after=await snap();
    step.after=after[set];step.other=after[other];step.success=after[set][axis]===before[set][axis]+amount;
    if(!baseline) {
      assert.ok(step.success,set+' '+dir+' changed the intended angle');
      assert.deepEqual(after[other],before[other]);
      assert.deepEqual(after.camera,before.camera); assert.equal(after.lens,before.lens);
      assert.equal(after.trigger,before.trigger);
      for (const [key,tip] of Object.entries(after.meshes)) {
        const drift = Math.hypot(...tip.world.map((v,i) => v - before.meshes[key].world[i]));
        assert.ok(drift < 1e-8, key + ' stays fixed through ' + set + ' ' + dir);
      }
      if(set==='mirror') assert.equal(after.drawnMirror[axis+'Deg'],after.mirror[axis]);
    }
    if(after.locked) {
      await page.keyboard.press('Escape');
      await page.waitForFunction(()=>window.__nsQA.inspect().shell.mode==='paused');
      await page.keyboard.press('Escape');
      await page.waitForFunction(()=>window.__nsQA.inspect().shell.mode==='playing');
    }
  }
  if(!baseline) {
    assert.deepEqual(collisions,[]);
    assert.deepEqual(report.sharedStrokePixels,[]);
    for(const [key,m] of Object.entries(report.outside.meshes)) assert.equal(m.motorOverlap,false,key+' leaves the motor strip clear');
    assert.deepEqual(report.steps.at(-1).after,report.outside.brain);
    assert.deepEqual(report.steps.at(-1).other,report.outside.mirror);
    if(process.env.NS_RESIZE) {
      await page.setViewportSize(viewport);
      await advance(8);
    }
    await switchView(false);
    report.returned=await snap();
    assert.deepEqual(report.eye.camera,report.returned.camera);
    await capture('returned');
    assert.deepEqual(report.errors,[]);
  }
} catch(error) {
  report.failure=String(error); throw error;
} finally {
  console.log(JSON.stringify(report,null,2));
  await browser?.close(); server.closeAllConnections(); server.close();
}
