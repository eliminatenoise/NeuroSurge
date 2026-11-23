// CMU surface-marker names. These display guides join recorded dots only.
const GUIDE_PATHS = [
  ['LFHD','RFHD','RBHD','LBHD','LFHD'], ['C7','LSHO'], ['C7','RSHO'],
  ['LSHO','CLAV','RSHO'], ['CLAV','STRN'], ['C7','T10'], ['LBHD','C7','RBHD'],
  ['STRN','LFWT','RFWT','STRN'], ['T10','LBWT','RBWT','T10'],
  ['LFWT','LBWT'], ['RFWT','RBWT'],
  ...['L','R'].flatMap(side => [
    ['SHO','UPA','ELB','FRM','WRA','FIN','WRB','FRM'],
    ['FWT','THI','KNE','SHN','ANK','HEE','TOE','MT5','ANK']
  ].map(path => path.map(suffix => side + suffix)))
];
const gameAssets = () => new URL('../../../assets/spatial-motion/', import.meta.url);
export const DEFAULT_VIEW = { yaw:28, pitch:12 };

const SIDE_NAMES = {
  FHD:'front of head', BHD:'back of head', SHO:'shoulder', UPA:'upper arm', ELB:'elbow',
  FRM:'forearm', WRA:'wrist A', WRB:'wrist B', FIN:'hand', FWT:'front waist', BWT:'back waist',
  THI:'thigh', KNE:'knee', SHN:'shin', ANK:'ankle', HEE:'heel', TOE:'toe', MT5:'outer foot'
};
export function markerName(label) {
  const side = label[0] === 'R' ? 'Right' : label[0] === 'L' ? 'Left' : '';
  const name = side && SIDE_NAMES[label.slice(1)];
  if (name) return side + ' ' + name + ' · ' + label;
  const middle = {NOSE:'Nose', C7:'Base of neck', T10:'Mid-back', STRN:'Breastbone', CLAV:'Collarbone area', RBAC:'Right back'};
  return middle[label] ? middle[label] + ' · ' + label : label;
}

export async function readManifest(baseUrl = gameAssets(), fetchImpl = fetch) {
  const r = await fetchImpl(new URL('manifest.json',baseUrl));
  if (!r.ok) throw Error('Recording list unavailable.');
  const manifest = await r.json();
  const rows = manifest.clips;
  if (!Array.isArray(rows) || !rows.length || rows.some(row =>
    !/^\w+$/.test(row.id) || row.file !== row.id + '.json' || !row.label ||
    !/^[a-f\d]{64}$/.test(row.sha256)) || new Set(rows.map(row => row.id)).size !== rows.length) {
    throw Error('Invalid recording list.');
  }
  return manifest;
}

export async function readMotion(entry, baseUrl = gameAssets(), fetchImpl = fetch) {
  const r = await fetchImpl(new URL(entry.file,baseUrl));
  if (!r.ok) throw Error('Recording unavailable.');
  const bytes = await r.arrayBuffer();
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  if (Array.from(digest, n => n.toString(16).padStart(2, '0')).join('') !== entry.sha256)
    throw Error('Recording checksum differs.');
  const clip = JSON.parse(new TextDecoder().decode(bytes));
  if (clip.id !== entry.id || clip.units !== 'mm' || !/^\+?z$/i.test(clip.upAxis) ||
      !Number.isFinite(clip.rateHz) || clip.rateHz <= 0 ||
      !Number.isInteger(clip.frameStride) || clip.frameStride < 1 ||
      !Number.isInteger(clip.firstFrame) || clip.rateHz * clip.frameStride !== clip.sourceRateHz ||
      !Array.isArray(clip.markers) || !clip.markers.length ||
      clip.markers.some(m => typeof m !== 'string' || !m.length) ||
      new Set(clip.markers).size !== clip.markers.length ||
      !Array.isArray(clip.frames) || !clip.frames.length) throw Error('Invalid recording header.');
  return clip;
}

function bounds() {
  return {lo:[Infinity, Infinity, Infinity], hi:[-Infinity, -Infinity, -Infinity]};
}
function include(b, x, y, z) {
  b.lo[0] = Math.min(b.lo[0], x); b.hi[0] = Math.max(b.hi[0], x);
  b.lo[1] = Math.min(b.lo[1], y); b.hi[1] = Math.max(b.hi[1], y);
  b.lo[2] = Math.min(b.lo[2], z); b.hi[2] = Math.max(b.hi[2], z);
}
export function prepareClip(clip, connections) {
  const {markers, frames} = clip;
  const lab = bounds(), relative = bounds();
  const waistIndices = ['LFWT','RFWT','LBWT','RBWT','LASI','RASI'].map(m => markers.indexOf(m)).filter(i => i >= 0);
  const counts = new Map(waistIndices.map(i => [i, 0]));
  for (const row of frames) {
    if (!Array.isArray(row) || row.length !== markers.length) throw Error('Invalid marker count.');
    for (const p of row) {
      if (p === null) continue;
      if (!Array.isArray(p) || p.length !== 3 || !p.every(Number.isFinite)) throw Error('Invalid position.');
      include(lab, ...p);
    }
    for (const i of waistIndices) if (row[i]) counts.set(i, counts.get(i) + 1);
  }
  if (!Number.isFinite(lab.lo[0])) throw Error('Recording has no located markers.');
  // A tracked waist marker keeps the horizontal camera stable. During gaps
  // the camera holds its last horizontal position. No marker sample is filled.
  const waist = waistIndices.sort((a,b) => counts.get(b) - counts.get(a))[0];
  const anchors = [];
  if (counts.get(waist)) {
    let anchor = [(lab.lo[0]+lab.hi[0])/2, (lab.lo[1]+lab.hi[1])/2];
    for (const row of frames) {
      if (row[waist]) anchor = row[waist].slice(0,2);
      anchors.push(anchor);
      for (const p of row) if (p) include(relative, p[0]-anchor[0], p[1]-anchor[1], p[2]);
    }
  }
  const paths = connections || GUIDE_PATHS;
  const edges = [];
  for (const path of paths) for (let i=1; i<path.length; i++) {
    const a = markers.indexOf(path[i-1]), b = markers.indexOf(path[i]);
    if (a >= 0 && b >= 0) edges.push([a,b]);
  }
  return {clip, lab, relative, anchors, waist, edges};
}

export function viewBasis(yaw, pitch) {
  const deg = Math.PI / 180, c = Math.cos(yaw*deg), s = Math.sin(yaw*deg);
  const ct = Math.cos(pitch*deg), st = Math.sin(pitch*deg);
  // Orthonormal camera basis. Increasing screen y points down, +Z points up.
  return {right:[c,-s,0], down:[s*st,c*st,-ct], near:[s*ct,c*ct,st]};
}

export function makeCamera(model, index, follow, width, height, yaw, pitch) {
  const anchor = follow && model.anchors[index];
  const b = anchor ? model.relative : model.lab;
  const low = [b.lo[0], b.lo[1], Math.min(0,b.lo[2])];
  const half = b.hi.map((v,i) => (v-low[i])/2);
  const centre = half.map((v,i) => v+low[i]);
  if (anchor) { centre[0] += anchor[0]; centre[1] += anchor[1]; }
  const {right,down,near} = viewBasis(yaw,pitch);
  const span = axis => 2 * axis.reduce((sum,n,i) => sum + Math.abs(n)*half[i], 0);
  const scale = Math.min((width-30) / Math.max(100,span(right)), (height-35) / Math.max(100,span(down)));
  function project(p) {
    const x = p[0]-centre[0], y = p[1]-centre[1], z = p[2]-centre[2];
    return [width/2+scale*(x*right[0]+y*right[1]),
            height/2+scale*(x*down[0]+y*down[1]+z*down[2]),
            x*near[0]+y*near[1]+z*near[2]];
  }
  return {project, scale, right, down, centre};
}

export function sourceFrame(clip, index) { return clip.firstFrame + index * clip.frameStride; }
