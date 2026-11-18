/** The Body Worlds stack in the game's own start posture (18 November 2026, audit S1; the owner: "it should apply to all
 * muscle groups especially the legs and torso"). The scene refuses a muscle whose lifted copy moves further than the
 * stack rule's cap (ns-scene-three stackCapMm). In the slumped start posture both external obliques used to go about
 * 95 mm past it (their "no six-pack" shave read forward as -y in the drawn frame, where the belly now faces up), and the
 * scene then refused the lift for the whole body. Nothing reported it. These cases load the game's body from disk
 * (tools/load-body.mjs) and check every lifted muscle against the same caps the scene uses. */
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { loadBody } = await import(path.join(repo, 'tools/load-body.mjs'));
const { body, inputs, rig, baked } = await loadBody(repo);
const R = body.BODY_STACK_RULE;
// The scene's caps (ns-scene-three.mjs STACK_FILL_CAP_MM / STACK_LIFT_CAP_MM / STACK_CARRY_CAP_MM), from the same rule.
const FILL = Math.max(...Object.values(R.fill.mm)) + 0.01;
const LIFT = Math.max(...Object.values(R.gapMm)) + FILL;
const CARRY = LIFT + 2 * FILL + R.carryRule.marginMm - R.carryRule.coverMm;
const carryIds = new Set(R.carry.map(r => r.id));
const capOf = id => { const lv = body.bodyStackLevel(id); return carryIds.has(id) ? CARRY : lv === 'outer' || lv === 'intermediate' ? LIFT : FILL; };

function overCap(bakedPosture) {
  const layers = body.bodyWorldsLayers(rig, bakedPosture, { meshesById: inputs.meshesById });
  const out = [];
  for (const [id, full] of body.bodyStackLiftedPositions(layers)) {
    const rest = bakedPosture.meshesById.get(id).positions;
    let m2 = 0;
    for (let i = 0; i < full.length; i += 3) { const d2 = (full[i] - rest[i]) ** 2 + (full[i + 1] - rest[i + 1]) ** 2 + (full[i + 2] - rest[i + 2]) ** 2; if (d2 > m2) m2 = d2; }
    if (Math.sqrt(m2) > capOf(id)) out.push(`${id} ${Math.sqrt(m2).toFixed(1)} mm (cap ${capOf(id).toFixed(1)})`);
  }
  return { out, layers };
}

test('in the slumped start posture no muscle of the Body Worlds stack moves past the scene\'s cap', () => {
  assert.equal(baked.posture, 'open');
  const { out, layers } = overCap(baked);
  assert.deepEqual(out, []);
  // the obliques are lifted, and their shave still takes the rectus relief off (about 17 mm, as in the source frame)
  for (const id of ['FJ1452', 'FJ1452M']) {
    assert.equal(layers.byId[id].displaySelected, true, id);
    assert.ok(layers.byId[id].reliefShavedMm > 8, `${id} shave ${layers.byId[id].reliefShavedMm}`);
  }
});

test('the seated posture stays within the caps as well', () => {
  assert.deepEqual(overCap(body.bakeBodyPosture(rig, inputs.meshesById, { posture: 'seated' })).out, []);
});
