/** Nothing loose, nothing sticking out (18 November 2026; the owner: "some muscles have become detached and are sticking
 * out, such as around the hips. This needs to be fixed for all muscles, and everything should be in as much detail as
 * possible without destabilizing the game"). The cases load the game's own body from disk (tools/load-body.mjs) and
 * check what the rig and the stack compute for the start posture on this one reference body; they say nothing about
 * how a real body looks. */
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { loadBody } = await import(path.join(repo, 'tools/load-body.mjs'));
const { body, inputs, rig, baked } = await loadBody(repo);
const layers = body.bodyWorldsLayers(rig, baked, { meshesById: inputs.meshesById });
const lifted = body.bodyStackLiftedPositions(layers);

// The scene's own caps (ns-scene-three STACK_FILL_CAP_MM / STACK_LIFT_CAP_MM / STACK_CARRY_CAP_MM), from the same rule.
const R = body.BODY_STACK_RULE;
const FILL = Math.max(...Object.values(R.fill.mm)) + 0.01, LIFT = Math.max(...Object.values(R.gapMm)) + FILL;
const CARRY = LIFT + 2 * FILL + R.carryRule.marginMm - R.carryRule.coverMm, CARRIED = new Set(R.carry.map(r => r.id));
const capOf = id => (CARRIED.has(id) ? CARRY : ['outer', 'intermediate'].includes(body.bodyStackLevel(id)) ? LIFT : FILL);

test('the Body Worlds stack of the start posture stays inside the scene\'s caps for every muscle (else the scene refuses the whole lift)', () => {
  assert.ok(lifted.size > 200, `lifted muscles: ${lifted.size}`);
  const over = [];
  for (const [id, full] of lifted) {
    const rest = baked.meshesById.get(id).positions;
    let m = 0;
    for (let i = 0; i < full.length; i += 3) m = Math.max(m, Math.hypot(full[i] - rest[i], full[i + 1] - rest[i + 1], full[i + 2] - rest[i + 2]));
    if (m > capOf(id)) over.push(`${id} ${m.toFixed(1)} mm > ${capOf(id).toFixed(1)}`);
  }
  assert.deepEqual(over, []);
});

test('the relief of the external oblique is shaved toward the body in the reclined start posture, not along the room\'s depth', () => {
  for (const id of ['FJ1452', 'FJ1452M']) {
    const meta = layers.byId[id];
    assert.ok(meta && meta.reliefShavedMm > 0 && meta.reliefShavedMm < 20, `${id}: shaved ${meta && meta.reliefShavedMm} mm`);
  }
});
