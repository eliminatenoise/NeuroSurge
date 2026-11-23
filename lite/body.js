/* NeuroSurge Lite body. Original procedural surfaces. Proportion references:
   BodyParts3D, © The Database Center for Life Science licensed under CC Attribution 4.0 International.
   https://dbarchive.biosciencedbc.jp/en/bodyparts3d/download.html
   https://creativecommons.org/licenses/by/4.0/
   Rounded and symmetrized atlas-derived joint lengths. Display surfaces and
   joint excursions are illustrative and do not reproduce the source meshes. */
(() => {
  'use strict';

  const PI = Math.PI;
  // Body coordinates in metres: subject left, up, forward.
  const upperArm = .329, forearm = .289, thigh = .463, shin = .467;
  const skin = [173, 146, 131], soft = [177, 135, 122], joints = [155, 137, 126];
  const highlight = [249, 188, 105];
  const zero = [0, 0, 0];
  const lateral = [1, 0, 0], vertical = [0, 1, 0], forward = [0, 0, 1];
  const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const cross = (a, b) => [
    a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0],
  ];
  const identity = p => p;
  const reflect = ([x, y, z]) => [x, y, -z];

  function turn(axis, angle) {
    const c = Math.cos(angle), s = Math.sin(angle);
    if (axis === lateral) return ([x, y, z]) => [x, c * y - s * z, s * y + c * z];
    if (axis === vertical) return ([x, y, z]) => [c * x + s * z, y, c * z - s * x];
    return ([x, y, z]) => [c * x - s * y, s * x + c * y, z];
  }

  // A rigid placement composes local joint rotations with the parent frame.
  function place(parent, offset, ...rotations) {
    return p => {
      let point = p;
      for (const rotate of rotations) point = rotate(point);
      return parent(add(offset, point));
    };
  }

  function excursion(value, positive, negative = positive) {
    const bounded = Number.isFinite(value) ? Math.max(-1, Math.min(1, value)) : 0;
    return bounded * (bounded >= 0 ? positive : negative);
  }

  const rim = new Map();
  function circle(sides) {
    if (!rim.has(sides)) rim.set(sides, Array.from({length:sides}, (_, i) => [
      Math.cos(2 * PI * i / sides), Math.sin(2 * PI * i / sides),
    ]));
    return rim.get(sides);
  }

  // Ring entries are [height, width radius, depth radius, forward offset].
  // Display proportions use continuous tapered surfaces around the joint chain.
  function tube(faces, key, color, transform, profile, sides = 10) {
    const rings = profile.map(([y, rx, rz, z = 0]) =>
      circle(sides).map(([c, s]) => transform([rx * c, y, z + rz * s])));
    for (let segment = 0; segment < rings.length - 1; segment++) {
      const top = rings[segment], bottom = rings[segment + 1];
      for (let i = 0; i < sides; i++) {
        const next = (i + 1) % sides;
        faces.push({key, color, vertices:[top[i], top[next], bottom[next], bottom[i]]});
      }
    }
    faces.push({key, color, vertices:[...rings[0]].reverse()});
    faces.push({key, color, vertices:rings.at(-1)});
  }

  function joint(faces, key, transform, height, width, depth) {
    tube(faces, key, joints, transform, [
      [height, width * .46, depth * .46], [0, width, depth], [-height, width * .52, depth * .52],
    ], 8);
  }

  function arm(faces, root, id, side, pose) {
    const shoulder = place(root, [side * .167, .49, .015],
      turn(forward, side * .13), turn(lateral, -excursion(pose.shoulder, 1.95, .48)));
    tube(faces, id + '-shoulder', soft, shoulder, [
      [.037, .041, .047], [.009, .064, .059], [-.055, .061, .054],
      [-.151, .049, .045], [-.25, .041, .034], [-upperArm, .033, .031],
    ]);
    const elbow = place(shoulder, [0, -upperArm, 0],
      turn(lateral, -excursion(pose.elbow, 2.25, .12)));
    joint(faces, id + '-elbow', elbow, .028, .038, .035);
    // A neutral forearm has its thumb forward. Opposite axial angles make
    // positive input turn both palms down when the elbows are flexed.
    const roll = place(elbow, zero, turn(vertical, -side * (PI / 2 + excursion(pose.forearm, 1.43))));
    tube(faces, id + '-forearm', skin, roll, [
      [.014, .031, .031], [-.045, .043, .034], [-.113, .038, .031],
      [-.215, .028, .025], [-forearm, .025, .019],
    ]);
    const wrist = place(roll, [0, -forearm, 0], turn(lateral, -excursion(pose.wrist, 1.04, .88)));
    joint(faces, id + '-wrist', wrist, .025, .028, .022);
    tube(faces, id + '-hand', skin, wrist, [
      [.005, .024, .019], [-.052, .04, .019], [-.094, .04, .014], [-.107, .033, .013],
    ], 8);
    const curl = excursion(pose.hand, 1.25, .22);
    const fingers = [.072, .083, .077, .060];
    for (let i = 0; i < fingers.length; i++) {
      const length = fingers[i], x = side * (.028 - .018 * i);
      const base = place(wrist, [x, -.096, .004], turn(lateral, -curl));
      tube(faces, id + '-hand', skin, base,
        [[.008,.010,.011], [-length * .49,.009,.009], [-length * .58,.0075,.008]], 6);
      const tip = place(base, [0, -length * .52, 0], turn(lateral, -curl * .7));
      tube(faces, id + '-hand', skin, tip,
        [[.006,.008,.009], [-length * .35,.007,.007], [-length * .48,.004,.004]], 6);
    }
    const thumb = place(wrist, [side * .029, -.039, .006],
      turn(forward, side * (.63 - curl * .29)), turn(lateral, -curl * .5));
    tube(faces, id + '-hand', skin, thumb,
      [[.014,.014,.014], [-.028,.011,.01], [-.052,.006,.006]], 7);
  }

  function leg(faces, root, id, side, pose) {
    const hip = place(root, [side * .087, .001, 0],
      turn(forward, -side * .033), turn(lateral, -excursion(pose.hip, 1.50, .56)));
    tube(faces, id + '-hip', soft, hip, [
      [.062, .063, .07], [.019, .081, .087], [-.082, .079, .084], [-.21, .065, .066],
      [-.331, .053, .053], [-thigh, .042, .042],
    ]);
    const knee = place(hip, [0, -thigh, 0], turn(lateral, excursion(pose.knee, 2.22, .1)));
    joint(faces, id + '-knee', knee, .044, .047, .048);
    tube(faces, id + '-knee', skin, knee, [
      [.012, .04, .041], [-.075, .055, .052, -.012], [-.147, .056, .053, -.014],
      [-.252, .041, .04, -.006], [-.376, .032, .03], [-shin, .028, .029],
    ]);
    const ankle = place(knee, [0, -shin, 0],
      turn(vertical, side * .10), turn(lateral, -excursion(pose.ankle, .42, .67)));
    tube(faces, id + '-ankle', skin, ankle, [
      [.035, .027, .033], [.008, .039, .049, .017], [-.025, .05, .11, .062],
      [-.054, .051, .133, .079], [-.066, .046, .122, .076],
    ]);
  }

  function shape(pose) {
    const faces = [];
    const pelvis = place(identity, [0, .995, 0]);
    tube(faces, 'trunk', skin, pelvis, [
      [.13,.12,.083,.011], [.069,.133,.094,.003], [.005,.147,.096,-.010],
      [-.067,.12,.085,-.004], [-.111,.067,.065,.004],
    ], 12);
    const trunk = place(pelvis, [0,.087,0], turn(lateral, excursion(pose.trunk, .61, .31)));
    tube(faces, 'trunk', soft, trunk, [
      [.455,.066,.06], [.422,.104,.076,.003], [.373,.161,.094,.009],
      [.29,.163,.101,.011], [.195,.136,.092,.018], [.104,.115,.079,.018],
      [.026,.114,.085,.012], [-.058,.121,.087,.007],
    ], 12);
    const shoulders = place(trunk, [0,-.087,0]);
    const neck = place(trunk, [0,.422,.006]);
    tube(faces, 'head', skin, neck, [
      [.164,.045,.055], [.110,.05,.05], [.059,.052,.049], [.001,.064,.058],
    ]);
    const skull = place(neck, [0,.108,.005], turn(vertical, excursion(pose.head, 1.02)));
    tube(faces, 'head', skin, skull, [
      [.224,.024,.03,-.006], [.209,.056,.061,-.008], [.169,.076,.077,-.007],
      [.116,.079,.075,-.006], [.079,.069,.064,.002], [.058,.055,.052,.009],
    ], 12);
    // Nose and ears are attached contours, not separate animated facial parts.
    tube(faces, 'head', skin, skull, [
      [.123,.01,.011,.065], [.105,.014,.023,.074], [.083,.021,.019,.071], [.077,.015,.01,.068],
    ], 8);
    for (const side of [-1,1]) {
      const ear = place(skull, [side * .073,.095,-.01]);
      tube(faces, 'head', skin, ear, [[.031,.01,.017],[0,.015,.023],[-.027,.009,.015]], 8);
    }
    const jaw = place(skull, [0,.083,-.019], turn(lateral, excursion(pose.jaw, .48, .05)));
    tube(faces, 'jaw', skin, jaw, [
      [.019,.060,.048,.021], [-.008,.058,.057,.028], [-.034,.047,.044,.039],
      [-.053,.027,.026,.043],
    ]);
    for (const [id, side] of [['left',1],['right',-1]]) {
      arm(faces, shoulders, id, side, pose[id] || {});
      leg(faces, pelvis, id, side, pose[id] || {});
    }
    return faces;
  }

  function normal(vertices) {
    // Newell's sum also handles the planar end polygons.
    let x = 0, y = 0, z = 0;
    for (let i = 0; i < vertices.length; i++) {
      const a = vertices[i], b = vertices[(i + 1) % vertices.length];
      x += (a[1] - b[1]) * (a[2] + b[2]);
      y += (a[2] - b[2]) * (a[0] + b[0]);
      z += (a[0] - b[0]) * (a[1] + b[1]);
    }
    return [x, y, z];
  }

  function contains(points, x, y) {
    let within = false;
    for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
      const a = points[i], b = points[j];
      if ((a[1] > y) !== (b[1] > y) &&
          x < (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]) + a[0]) within = !within;
    }
    return within;
  }

  const savedPoses = new WeakMap();
  const neutralPose = {};

  function bodySnapshot(pose) {
    // Both views receive the same pose object, which the controller mutates.
    const values = JSON.stringify(pose);
    const cached = savedPoses.get(pose);
    if (cached?.values === values) return cached;
    const meshes = shape(pose);
    let ground = Infinity;
    for (const face of meshes) for (const point of face.vertices) ground = Math.min(ground, point[1]);
    const snapshot = {values, meshes, ground};
    savedPoses.set(pose, snapshot);
    return snapshot;
  }

  function create(canvas, {mirror = false} = {}) {
    const context = canvas.getContext('2d');
    let drawn = [];

    function render(state = {}) {
      const width = canvas.clientWidth || canvas.width;
      const height = canvas.clientHeight || canvas.height;
      if (!context || !width || !height || !canvas.width || !canvas.height) return;
      const pose = state.pose && typeof state.pose === 'object' ? state.pose : neutralPose;
      const {meshes, ground} = bodySnapshot(pose);
      const yaw = Number.isFinite(state.yaw) ? state.yaw : 0;
      const pitch = Number.isFinite(state.pitch) ? state.pitch : 0;
      const azimuth = turn(vertical, mirror ? PI + yaw : -yaw);
      const elevation = turn(lateral, pitch);
      const scale = Math.min(width * .79 / 1.30, height * .83 / 1.88);
      const screen = ([x, y]) => [width / 2 + x * scale, height * .51 - y * scale];
      const light = [0,.58,.815];
      const projected = new Map();
      function project(point) {
        let view = projected.get(point);
        if (!view) {
          const p = mirror ? reflect(point) : point;
          view = elevation(azimuth([p[0], p[1] - ground - .94, p[2]]));
          projected.set(point, view);
        }
        return view;
      }

      drawn = [];
      for (const face of meshes) {
        const view = face.vertices.map(project);
        if (mirror) view.reverse();
        const n = normal(view);
        if (n[2] <= 1e-9) continue;
        const shade = .47 + .53 * Math.max(0, dot(n, light) / Math.hypot(...n));
        const points = view.map(screen);
        const depth = view.reduce((sum, p) => sum + p[2], 0) / view.length;
        const rgb = face.key === state.active ? highlight : face.color;
        const fill = 'rgb(' + rgb.map(value => Math.round(value * shade)).join(',') + ')';
        drawn.push({key:face.key, points, depth, fill});
      }
      drawn.sort((a,b) => a.depth - b.depth);

      context.save();
      context.setTransform(canvas.width / width, 0, 0, canvas.height / height, 0, 0);
      context.clearRect(0, 0, width, height);
      const shadow = screen(project([0, ground, 0]));
      context.beginPath();
      context.ellipse(shadow[0], shadow[1], scale * .21, Math.max(2,scale * .017),0,0,PI * 2);
      context.fillStyle = 'rgba(4, 11, 17, .22)';
      context.fill();
      context.lineJoin = 'round';
      context.lineWidth = .52;
      for (const face of drawn) {
        const points = face.points;
        context.beginPath();
        context.moveTo(...points[0]);
        for (let i = 1; i < points.length; i++) context.lineTo(...points[i]);
        context.closePath();
        context.strokeStyle = context.fillStyle = face.fill;
        context.fill();
        context.stroke();
      }
      context.restore();
    }

    function pick(x, y) {
      if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
      for (let i = drawn.length - 1; i >= 0; i--) {
        if (contains(drawn[i].points,x,y)) return drawn[i].key;
      }
      return null;
    }
    return {render, pick};
  }

  globalThis.NeuroSurgeLiteBody = Object.freeze({create});
})();
