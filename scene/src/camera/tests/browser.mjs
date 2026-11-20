// Uses three public-domain exercise-film frames and a black negative control.
// Chromium's virtual video device cannot open a personal camera.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {once} from 'node:events';
import {mkdtemp,rm} from 'node:fs/promises';
import {createServer} from 'node:http';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHandler,HOST} from '../../../../serve-local.mjs';
const {chromium} = await import(process.env.NS_PLAYWRIGHT_MODULE || 'playwright');
const root = fileURLToPath(new URL('../../../../',import.meta.url));
const temp = await mkdtemp(join(tmpdir(),'ns-pose-'));
const stream = join(temp,'exercise.y4m');
const fixture = image => fileURLToPath(new URL(image,import.meta.url));
const allowedHosts = new Set();
const server = createServer(createHandler({root,allowedHosts}));
let browser;
try {
  execFileSync('ffmpeg',['-nostdin','-loglevel','error','-loop','1','-framerate','8','-t','2','-i',fixture('arm-down.jpg'),
    '-loop','1','-framerate','8','-t','2','-i',fixture('arm-up.jpg'),
    '-loop','1','-framerate','8','-t','2','-i',fixture('elbow-bent.jpg'),'-f','lavfi','-i','color=c=black:s=480x480:d=2:r=8',
    '-filter_complex_threads','1','-filter_complex','[0:v][1:v][2:v][3:v]concat=n=4:v=1:a=0,format=yuv420p','-threads','1',stream]);
  server.listen(0,HOST); await once(server,'listening');
  const host = HOST + ':' + server.address().port;
  allowedHosts.add(host);
  const origin = 'http://' + host;
  browser = await chromium.launch({executablePath:process.env.NS_CHROMIUM || undefined,
    args:['--disable-background-networking','--use-fake-device-for-media-stream','--use-file-for-fake-video-capture='+stream,
      '--use-angle='+(process.env.NS_ANGLE || 'swiftshader'),'--enable-unsafe-swiftshader']});
  const context = await browser.newContext({permissions:['camera'],viewport:{width:900,height:650}});
  const requests = [], workerPaths = [], external = [], nonget = [];
  context.on('request', r => {
    requests.push(r.url());
    if (new URL(r.url()).origin !== origin) external.push(r.url());
    if (r.method() !== 'GET') nonget.push(r.method());
    if (r.url().includes('/camera/vendor')) workerPaths.push(new URL(r.url()).pathname.split('/').at(-1));
  });
  const page = await context.newPage();
  // Keep the normal launcher response headers, CSP and device policy. Only the
  // game scene boot is skipped for this isolated module test.
  await page.route(/\/(ns-load-guard|early-load|eye-view-r558)\.mjs$/, route => route.fulfill({contentType:'text/javascript',body:''}));
  await page.goto(origin+'/scene/example/preview.html',{waitUntil:'domcontentloaded'});
  await page.evaluate(async () => {
    document.querySelectorAll('.ns-load').forEach(e=>e.remove());
    const {createCameraCapture} = await import('../src/camera.mjs');
    window.samples = [];
    window.cameraControl = createCameraCapture({onArmPose:({joints})=>window.samples.push({joints, time:performance.now()})});
    document.addEventListener('keydown', e=>{ if (e.code==='KeyC' && !e.repeat) window.cameraControl.toggle(); });
  });
  assert.equal(workerPaths.length,0);
  assert.equal(await page.locator('#ns-motion-camera').count(),0);
  await page.keyboard.press('c');
  await page.waitForFunction(()=>document.querySelector('#ns-motion-camera video')?.srcObject);
  await page.evaluate(()=>{window.testTrack=document.querySelector('#ns-motion-camera video').srcObject.getVideoTracks()[0]});
  try {
    await page.waitForFunction(()=> {
      const values = window.samples.map(s=>s.joints?.r_shoulder_abd);
      const low=values.some(v=>v<35), high=values.some(v=>v>130);
      return low && high && window.samples.some(s=>s.joints?.r_elbow_flex>65) && window.samples.some((s,i,a)=>!s.joints && i>0 && a[i-1].joints);
    },null,{timeout:45000});
  } catch(error) {
    throw new Error(await page.locator('#ns-motion-camera').innerText()+' '+JSON.stringify(await page.evaluate(()=>window.samples.slice(-3)))+' '+workerPaths.join(' '),{cause:error});
  }
  const results = await page.evaluate(()=>window.samples);
  const poses = results.filter(s=>s.joints);
  console.log(JSON.stringify({samples:results.length,
    shoulderRange: [Math.min(...poses.map(s=>s.joints.r_shoulder_abd)),Math.max(...poses.map(s=>s.joints.r_shoulder_abd))],
    elbowRange: [Math.min(...poses.map(s=>s.joints.r_elbow_flex)),Math.max(...poses.map(s=>s.joints.r_elbow_flex))],
    trackerAssets:workerPaths}));
  await page.getByRole('button',{name:'Stop camera'}).click();
  assert.equal(await page.evaluate(()=>window.testTrack.readyState),'ended');
  assert.equal(await page.evaluate(()=>window.cameraControl.active),false);
  assert.equal(await page.evaluate(()=>window.samples.at(-1).joints),null);
  assert.equal(await page.locator('#ns-motion-camera video').evaluate(v=>v.srcObject),null);
  await page.getByRole('button',{name:'Dismiss'}).click();
  assert.equal(await page.locator('#ns-motion-camera').isVisible(),false);
  await page.evaluate(()=>{
    navigator.mediaDevices.getUserMedia=async()=>{throw new DOMException('denied','NotAllowedError')};
  });
  await page.keyboard.press('c');
  await page.getByText(/permission was denied/).waitFor();
  assert.equal(await page.evaluate(()=>window.cameraControl.active),false);
  await page.evaluate(()=>{
    const canvas = document.createElement('canvas'); canvas.width=64; canvas.height=64;
    window.lateStream = canvas.captureStream(5);
    navigator.mediaDevices.getUserMedia=()=>new Promise(resolve=>{window.grantLate=()=>resolve(window.lateStream)});
  });
  await page.keyboard.press('c');
  await page.getByRole('button',{name:'Stop camera'}).click();
  await page.evaluate(()=>window.grantLate());
  await page.waitForFunction(()=>window.lateStream.getTracks()[0].readyState==='ended');
  assert.equal(await page.evaluate(()=>window.cameraControl.active),false);
  await page.evaluate(()=>Object.defineProperty(window,'OffscreenCanvas',{value:undefined}));
  await page.keyboard.press('c');
  await page.getByText(/browser lacks/).waitFor();
  assert.deepEqual(nonget,[]);
  assert.deepEqual(external,[]);
  console.log('PASS: opt-in, local real-model detection, negative control, permission denial, ended video track, camera off, same-origin reads only.');
  await page.close();
  const game = await context.newPage();
  await game.goto(origin+'/',{waitUntil:'domcontentloaded'});
  await game.waitForFunction(()=>window.__nsQA?.inspect()?.features?.bodyRig &&
    document.querySelector('#ns-app').dataset.nsPhase === 'playing' && window.__nsQA.inspect().bodyDrawnJoints,
    null,{timeout:120000});
  const initial = await game.evaluate(()=>window.__nsQA.inspect().bodyDrawnJoints.r_shoulder_abd);
  assert.equal(await game.locator('#ns-motion-camera').count(),0);
  await game.locator('#ns-canvas').focus();
  await game.keyboard.press('c');
  await game.waitForFunction(()=>document.querySelector('#ns-motion-camera video')?.srcObject,null,{timeout:20000});
  await game.evaluate(()=>{
    window.cameraTrack = document.querySelector('#ns-motion-camera video').srcObject.getVideoTracks()[0];
    window.poseProbe = [];
    window.poseProbeTimer = setInterval(()=>{
      const g = window.__nsQA.inspect();
      window.poseProbe.push([Math.round(performance.now()),g.bodyJointTargets?.r_shoulder_abd,g.bodyDrawnJoints?.r_shoulder_abd,g.bodyDrawnJoints?.r_elbow_flex]);
    },180);
  });
  try {
    await game.waitForFunction(()=>window.poseProbe.some(([,target,drawn])=>target>125 && drawn>100) &&
      window.poseProbe.some(([,target,drawn])=>target>8 && target<35 && drawn>8 && drawn<40) &&
      window.poseProbe.some(s=>s[3]>65),null,{timeout:70000});
  } catch (error) {
    throw new Error(await game.locator('#ns-motion-camera').innerText()+' '+JSON.stringify(await game.evaluate(()=>window.poseProbe.slice(-30))),{cause:error});
  }
  const probe = await game.evaluate(()=>{clearInterval(window.poseProbeTimer);return window.poseProbe});
  await game.keyboard.press('c');
  await game.waitForFunction(()=>window.cameraTrack.readyState==='ended');
  assert.deepEqual(external,[]);
  assert.deepEqual(nonget,[]);
  console.log(JSON.stringify({game:'normal launcher and C key',initialShoulder:initial,drawnShoulderRange:[
    Math.min(...probe.map(s=>s[2])),Math.max(...probe.map(s=>s[2]))],targetShoulderRange:[
    Math.min(...probe.map(s=>s[1])),Math.max(...probe.map(s=>s[1]))],drawnElbowRange:[Math.min(...probe.map(s=>s[3])),Math.max(...probe.map(s=>s[3]))],samples:probe.length}));

} finally {
  await browser?.close(); server.close();
  await rm(temp,{force:true,recursive:true});
}
