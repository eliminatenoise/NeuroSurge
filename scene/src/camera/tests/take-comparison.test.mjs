import test from 'node:test';
import assert from 'node:assert/strict';
import {angleRates, bendWindows, commonAngles, commonBends, comparisonNames, summarizeAngles} from '../take-comparison.mjs';
import {poseForLimb} from '../limb-pose.mjs';

test('joint selection only compares matching knees or elbows on the same side', () => {
  const common = (a,b) => commonBends({limb:a}, {limb:b}).map(joint => joint.label);
  assert.deepEqual(common('leftArm', 'rightArm'), []);
  assert.deepEqual(common('leftArm', 'leftLeg'), []);
  assert.deepEqual(common('bothKnees', 'bothArms'), []);
  assert.deepEqual(common('rightLeg', 'bothKnees'), ['Right knee']);
  assert.deepEqual(common('bothArms', 'leftArm'), ['Left elbow']);
  assert.deepEqual(common('bothArms', 'bothArms'), ['Left elbow','Right elbow']);
  assert.deepEqual(common('bothKnees', 'bothKnees'), ['Left knee','Right knee']);
});

test('fractional elapsed sample times, zero angle, dropout, expiry and unequal take lengths survive grouping', () => {
  const pair = {limb:'bothKnees',duration:1850,frames:[
    {time:499.975,pose:{joints:{knee_ext_L:0}}},
    {time:500,pose:{joints:{knee_ext_R:-41.67}}},
    {time:599.25,pose:null}, {time:728.75,pose:{joints:{knee_ext_L:-95,knee_ext_R:0}}},
    {time:930,pose:null,expiry:true},
    {time:1850,pose:{joints:{knee_ext_L:-77}}}
  ]};
  const short = {limb:'rightLeg', duration:510, frames:[{time:99.25,pose:{joints:{knee_ext_R:-18}}}]};
  const original = JSON.stringify(pair);
  const [left,right] = commonBends(pair,pair);
  assert.deepEqual(bendWindows(pair,left).map(window => window.map(p=>[p.time,p.angle,p.expired])), [
    [[499.975,0,false]],[[500,null,false],[599.25,null,false],[728.75,95,false],[930,null,true]],[],[]]);
  assert.deepEqual(bendWindows(pair,right).map(window => window.map(p=>p.angle)), [[null],[41.67,null,0,null],[],[]]);
  assert.deepEqual(bendWindows(short,right), [[{time:99.25,angle:18,expired:false}],[]]);
  assert.equal(JSON.stringify(pair),original);
});

test('one-arm and two-arm recordings share only the same elbow target', () => {
  const arms = {limb:'bothArms',duration:150,frames:[{time:9,pose:{leftArm:{elbowDeg:61.8},joints:{r_elbow_flex:24}}}, {time:75,pose:{joints:{r_elbow_flex:0}}}]};
  const [left,right] = commonBends(arms,arms);
  assert.deepEqual(bendWindows(arms,left)[0].map(p=>p.angle),[61.8,null]);
  assert.deepEqual(bendWindows(arms,right)[0].map(p=>p.angle),[24,0]);
});

test('whole names retain accents, side words and possible delimiters', () => {
  assert.deepEqual(comparisonNames(' Please  compare my take named Cafe\u0301 Left with the take named Second 2!'), [['Café Left','Second 2']]);
  assert.deepEqual(comparisonNames('compare take named A with take named X with take named B'), [
    ['A','X with take named B'],['A with take named X','B']]);
  assert.deepEqual(comparisonNames('compare take named A with B'),[]);
  for (const other of ['replay take named first', 'compare recorded brain activity', null, 'do not compare take named A with take named B']) {
    assert.equal(comparisonNames(other),null);
  }
});

test('compare upper-arm lift on the same side in the tracker’s tilted shoulder frame', () => {
  const points = [];
  for (const [index, x, y] of [[11,.6,.5],[12,.4,.35],[13,.76,.62],[15,.84,.68],[14,.24,.23],[16,.16,.17]]) {
    points[index] = {x, y, visibility: 1};
  }
  const left = poseForLimb(points, 480, 480, 'leftArm');
  const right = poseForLimb(points, 480, 480, 'rightArm');
  const take = (limb,pose) => ({limb, duration:125, frames:[{time:0,pose}]});
  const pair = take('bothArms', {...left,...right});
  for (const [other, channel] of [[take('leftArm',left),'Left upper-arm lift'],[take('rightArm',right),'Right shoulder lift']]) {
    const shared = commonAngles(pair,other);
    assert.equal(shared.length,2);
    assert.equal(shared[1].label,channel);
    for (const recording of [pair,other]) {
      assert.ok(Math.abs(bendWindows(recording,shared[1])[0][0].angle - 90) < 1e-8);
    }
  }
  assert.deepEqual(commonAngles(take('leftArm',left),take('rightArm',right)),[]);
  assert.deepEqual(commonAngles(take('bothArms',{leftArm:{elbowDeg:3}}),pair).map(x=>x.label),['Left elbow']);
  const legs = take('bothKnees',{joints:{knee_ext_L:-60,knee_ext_R:0,hip_flex_L:30,ankle_flex_L:15}});
  assert.deepEqual(commonAngles(legs,legs).map(x=>x.label),['Left knee','Right knee']);
});

test('visible range respects independent clocks, gaps and the take boundary', () => {
  const arms = {limb:'bothArms',duration:1400,frames:[
    {time:0,pose:{leftArm:{upper:[0,-1,0]},joints:{r_shoulder_abd:0}}},
    {time:149.3,pose:{leftArm:{upper:[1,0,0]}}},
    {time:249.9,pose:{leftArm:{upper:[0,1,0]},joints:{r_shoulder_abd:92.75}}},
    {time:580,pose:null}, {time:1020,pose:null,expiry:true},
    {time:1240,pose:{leftArm:{upper:[0,0,0]},joints:{r_shoulder_flex:0}}},
    {time:1300,pose:{leftArm:{upper:[0,0,1]}}},
    {time:1320,pose:{leftArm:{upper:[Infinity,0,0]}}},
    {time:1400,pose:{leftArm:{upper:[1,0,0]},joints:{r_shoulder_abd:180}}}
  ]};
  const before = structuredClone(arms);
  const [left, right] = commonAngles(arms,arms);
  assert.deepEqual(bendWindows(arms,left).flat().map(p=>p.angle),[0,90,180,null,null,null,null,null]);
  assert.deepEqual(summarizeAngles(bendWindows(arms,left)),{count:3,total:7,low:0,high:180,first:0,last:249.9});
  assert.deepEqual(summarizeAngles(bendWindows(arms,right)),{count:2,total:7,low:0,high:92.75,first:0,last:249.9});
  const old = {...arms,frames:[{time:0,pose:{joints:{r_elbow_flex:0,r_shoulder_flex:0}}}]};
  assert.deepEqual(commonAngles(arms,old),[]);
  assert.deepEqual(summarizeAngles(bendWindows(old,right)),{count:0,total:1,low:null,high:null,first:null,last:null});
  assert.deepEqual(arms,before);
});

test('per-interval knee rates use the bend sign, capture clock and valid adjacent frames', () => {
  const frame = (time, left, right) => ({time, pose:{joints:{knee_ext_L:left, knee_ext_R:right}}});
  const take = {limb:'bothKnees', duration:2000, frames:[
    frame(444.25,0,-5), frame(494.25,-5,-10), frame(744.25,-15,-10),
    frame(800,null,-15), frame(900,-17,-10), frame(1000,-7,-10),
    {...frame(1100,-99,-99),expiry:true}, frame(1150,-8,-10), frame(1200,-8,-10),
    frame(1450.01,0,-1), frame(1499.99,-25,-1), frame(1599.99,-60,-1),
    frame(1700,NaN,-1), frame(1800,-80,-1), frame(2000,-15,-1)
  ]};
  const original = structuredClone(take);
  const [left, right] = commonBends(take,take);
  const {intervals, coveredMs} = angleRates(take,left);
  assert.deepEqual(intervals, [
    {start:444.25,end:494.25,rate:100}, {start:494.25,end:744.25,rate:40},
    {start:900,end:1000,rate:-100}, {start:1150,end:1200,rate:0},
    {start:1499.99,end:1599.99,rate:350}
  ]);
  assert.equal(coveredMs,550);
  assert.deepEqual(angleRates(take,right).intervals.map(p=>p.start),[
    444.25,494.25,744.25,800,900,1150,1499.99,1599.99,1700
  ]);
  assert.deepEqual(take, original);
});

test('missing timestamps and observations break adjacency; ambiguous clocks suppress rates for that take', () => {
  const elbow = (time, angle) => ({time,pose:{leftArm:{elbowDeg:angle}}});
  const make = frames => ({limb:'leftArm',duration:1400,frames});
  const valid = make([elbow(0,10),elbow(225,55)]);
  const [joint] = commonBends(valid,valid);
  assert.deepEqual(angleRates(valid,joint),{clockConflict:false,coveredMs:225,intervals:[{start:0,end:225,rate:200}]});
  for (const time of [NaN,Infinity,null,'22',-2,1400]) {
    const damaged = make([elbow(0,10),elbow(time,55),elbow(75,100),elbow(225,70)]);
    assert.deepEqual(angleRates(damaged,joint),{clockConflict:false,coveredMs:150,intervals:[{start:75,end:225,rate:-200}]});
  }
  for (const time of [545,230]) {
    const damaged = make([elbow(400,55),elbow(545,70),elbow(time,0),elbow(600,100),elbow(799,120)]);
    assert.deepEqual(angleRates(damaged,joint),{clockConflict:true,coveredMs:0,intervals:[]});
    assert.equal(summarizeAngles(bendWindows(damaged,joint)).count,5);
  }
  for (const frames of [[],[elbow(0,5)],[elbow(0,100),elbow(49.999,55)],[elbow(0,10),elbow(250.01,20)],
    [elbow(0,10),{time:75,pose:null},elbow(150,55)]]) {
    assert.deepEqual(angleRates(make(frames),joint),{clockConflict:false,coveredMs:0,intervals:[]});
  }
});

test('compare older paired recordings with the channels actually seen in a four-limb take', () => {
  const four = {limb:'armsAndKnees',duration:400,frames:[
    {time:10,pose:{leftArm:{elbowDeg:15,upper:[-1,0,0]},joints:{knee_ext_L:-70}}},
    {time:190,pose:{joints:{r_elbow_flex:45,r_shoulder_abd:0}}}
  ]};
  const labels = other => commonAngles(four,{...four,limb:other}).map(angle => angle.label);
  assert.deepEqual(labels('bothArms'),['Left elbow','Right elbow','Left upper-arm lift','Right shoulder lift']);
  assert.deepEqual(labels('bothKnees'),['Left knee']);
  assert.deepEqual(labels('rightLeg'),[]);
});
