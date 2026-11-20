const ns = 'http://www.w3.org/2000/svg';
function node(tag, attrs, text) {
  const element = document.createElementNS(ns, tag);
  for (const [name, value] of Object.entries(attrs)) element.setAttribute(name, value);
  if (text !== undefined) element.textContent = text;
  return element;
}

export function drawPlane(svg, track, history, forecast, measured, close) {
  // A square plotting area keeps one centimetre the same length on both axes.
  // Hidden outcomes cannot affect the viewport. Once revealed, the reading also has to fit.
  const last = history.at(-1);
  const endpoints = Object.values(forecast.both);
  if (measured) endpoints.push(measured);
  const largestOffset = Math.max(...endpoints.flatMap(
    xy => xy.map((coord, i) => Math.abs(coord - last[i]))
  ));
  const step = close ? Math.max(2, Math.ceil((largestOffset + 1.5) / 4) * 2) : 25;
  const center = close ? last.map(coord => Math.round(coord / step) * step) : [62.5, 62.5];
  const half = close ? 2.5 * step : 62.5;
  const left = 43, top = 9, side = 218;
  const scale = side / (2 * half);
  const tx = x => left + (x - center[0] + half) * scale;
  const ty = y => top + (center[1] + half - y) * scale;
  const lo = center.map(v => v - half), hi = center.map(v => v + half);
  const clipId = svg.id + '-clip';
  const group = node('g', {'clip-path': 'url(#' + clipId + ')'});
  const clip = node('clipPath', {id: clipId});
  clip.append(node('rect', {x:left, y:top, width:side, height:side}));
  const defs = node('defs', {});
  defs.append(clip);
  svg.replaceChildren(defs, node('rect', {x:left, y:top, width:side, height:side, fill:'#f9fbf8'}));
  for (const axis of [0, 1]) {
    for (let v = Math.ceil(lo[axis]/step)*step; v <= hi[axis]; v += step) {
      const x = tx(v), y = ty(v);
      if (axis === 0) {
        svg.append(node('line', {x1:x, x2:x, y1:top, y2:top+side, class:'wt-grid'}),
                   node('text', {x, y:top+side+13, 'text-anchor':'middle'}, v));
      } else {
        svg.append(node('line', {x1:left, x2:left+side, y1:y, y2:y, class:'wt-grid'}),
                   node('text', {x:left-5, y:y+4, 'text-anchor':'end'}, v));
      }
    }
  }
  svg.append(group, node('text', {x:left+side/2, y:256, 'text-anchor':'middle'}, 'X (cm)'),
    node('text', {transform:'translate(12 118) rotate(-90)', 'text-anchor':'middle'}, 'Y (cm)'));
  const dots = track.map(([x, y]) => 'M'+tx(x).toFixed(2)+' '+ty(y).toFixed(2)+'h0.01').join('');
  group.append(node('path', {d:dots, stroke:'#a3b8b0', 'stroke-width':close?2:2.7, 'stroke-linecap':'round', fill:'none'}));
  for (let i = 0; i < history.length; i++) {
    const [x,y] = history[i];
    group.append(node('circle', {cx:tx(x), cy:ty(y), r:i===4?4:2.6, fill:'#184d4b', stroke:'white','stroke-width':.7}));
  }
  const [x,y] = forecast.both[forecast.mode].map((v,i) => i===0 ? tx(v) : ty(v));
  group.append(node('path', {d:'M'+x+' '+(y-5.8)+'l5.8 5.8 -5.8 5.8 -5.8 -5.8z',
    fill:'white', stroke:'#a5440a', 'stroke-width':2.6}));
  if (measured) {
    const [mx,my] = [tx(measured[0]),ty(measured[1])];
    group.append(node('path', {d:'M'+(mx-5)+' '+my+'h10 M'+mx+' '+(my-5)+'v10',
      fill:'none',stroke:'#60217c', 'stroke-width':3}));
  }
}
