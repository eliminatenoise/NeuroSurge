import {horizons, sides} from './forecast.mjs';
import {laterRoleWrist, roleForecast} from './role-model.mjs';

const labels = {leftArm: 'Left wrist', rightArm: 'Right wrist'};
const coordinate = p => '(' + p.map(v => v.toFixed(3)).join(', ') + ')';
const distance = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]).toFixed(3);

function draw(canvas, rows, shoulders) {
  const ctx = canvas.getContext('2d');
  const colors = ['#66d8ee', '#ffc178'];
  const objects = rows.flatMap(row => [row.last, ...row.predictions, ...row.observed.map(o => o.point)].filter(Boolean));
  const extent = Math.max(1, ...[...objects, ...shoulders].flat().map(Math.abs));
  const midX = canvas.width / 2, midY = canvas.height / 2, scale = (midY - 12) / extent;
  const pixel = ([x, y]) => [midX + x * scale, midY - y * scale];
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = '#5a6b78'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(0, midY); ctx.lineTo(canvas.width, midY);
  ctx.moveTo(midX, 0); ctx.lineTo(midX, canvas.height); ctx.stroke();
  const [l, r] = shoulders.map(pixel);
  ctx.strokeStyle = ctx.fillStyle = '#c5cfd7';
  ctx.beginPath(); ctx.moveTo(...l); ctx.lineTo(...r); ctx.stroke();
  for (const [x, y] of [l, r]) ctx.fillRect(x-3, y-3, 6, 6);
  for (const row of rows) {
    ctx.strokeStyle = ctx.fillStyle = colors[sides.indexOf(row.side)]; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(...pixel(row.last), 4, 0, 2*Math.PI); ctx.fill();
    ctx.beginPath(); ctx.moveTo(...pixel(row.last));
    for (const p of row.predictions) ctx.lineTo(...pixel(p));
    ctx.stroke();
    for (const [i, p] of row.predictions.entries()) {
      ctx.beginPath(); ctx.arc(...pixel(p), 4+2*i, 0, 2*Math.PI); ctx.stroke();
    }
    for (const o of row.observed) {
      if (!o.point) continue;
      const [x,y] = pixel(o.point);
      ctx.beginPath(); ctx.moveTo(x-3, y-3); ctx.lineTo(x+3, y+3);
      ctx.moveTo(x-3, y+3); ctx.lineTo(x+3, y-3); ctx.stroke();
    }
  }
}

export function showRoleForecast(panel, frames, index, lead, isExample) {
  const doc = panel.ownerDocument, result = roleForecast(frames, index, lead);
  const report = panel.querySelector('[data-role-status]');
  const readings = panel.querySelector('[data-role-values]'), canvas = panel.querySelector('canvas');
  panel.querySelector('[data-horizontal]').textContent = lead === 'leftArm' ? 'left' : 'right';
  readings.replaceChildren();
  canvas.hidden = true;
  if (result.issue) { report.textContent = result.issue; return; }
  report.textContent = result.originalSamples + (isExample ? ' example samples' : ' tracked samples') +
    ' bracket the 15 input times. ' + result.interpolated + ' of those 15 positions use interpolation.';
  const visible = [];
  for (const side of sides) {
    const arm = result.arms[side], section = doc.createElement('section'), title = doc.createElement('h3');
    section.dataset.roleSide = side;
    title.textContent = labels[side];
    if (lead !== 'auto') title.textContent += side === lead ? ' · lead' : ' · other';
    section.append(title); readings.append(section);
    if (arm.issue) {
      const p = doc.createElement('p'); p.textContent = arm.issue; section.append(p); continue;
    }
    const observed = horizons.map(dt => laterRoleWrist(frames, index, dt, side, result));
    visible.push({...arm, side, observed});
    const table = doc.createElement('table'), header = table.createTHead().insertRow();
    for (const text of ['Shoulder widths', '+8/30 s', '+15/30 s']) {
      const th = doc.createElement('th'); th.scope = 'col'; th.textContent = text; header.append(th);
    }
    const body = table.createTBody();
    function row(label, values) {
      const tr = body.insertRow(), th = doc.createElement('th');
      th.scope = 'row'; th.textContent = label; tr.append(th);
      for (const v of values) tr.insertCell().textContent = v;
    }
    row('Model position', arm.predictions.map(coordinate));
    row(isExample ? 'Example path' : 'Tracked wrist path', observed.map(o => o.point ? coordinate(o.point) + ' · ' + o.kind : o.kind));
    row('Model error', observed.map((o, i) => o.point ? distance(o.point, arm.predictions[i]) : '—'));
    row('Hold error', observed.map(o => o.point ? distance(o.point, arm.last) : '—'));
    section.append(table);
  }
  if (visible.length) { canvas.hidden = false; draw(canvas, visible, result.shoulderPositions); }
}
