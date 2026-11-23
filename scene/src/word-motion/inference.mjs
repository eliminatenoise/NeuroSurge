const words = new Map([
  ['walk', 'walk'], ['walking', 'walk'], ['run', 'run'], ['running', 'run'],
  ['jog', 'run'], ['jogging', 'run'], ['run/jog', 'run']
]);

export function actionFor(text) {
  return typeof text === 'string' ? (words.get(text.trim().toLowerCase()) ?? null) : null;
}

export function generateMotion(text, weights) {
  const action = actionFor(text);
  if (!action) return null;
  const embedding = weights.embedding[weights.tokens.indexOf(action)];
  const positionsMm = [];
  const rootMm = [];
  for (let frame = 0; frame < 25; frame++) {
    const t = frame / 24;
    let x = [...embedding, t];
    for (let frequency = 1; frequency <= 4; frequency++) {
      const angle = 2 * Math.PI * frequency * t;
      x.push(Math.sin(angle), Math.cos(angle));
    }
    for (const layer of weights.layers) {
      x = layer.weight.map((row, i) => {
        const value = row.reduce((sum, a, j) => sum + a * x[j], layer.bias[i]);
        return layer.activation === 'tanh' ? Math.tanh(value) : value;
      });
    }
    const y = x.map((v, i) => weights.scaleMm * v + weights.centreMm[i]);
    positionsMm.push(Array.from({length: 18}, (_, j) => y.slice(j*3, j*3+3)));
    rootMm.push(y.slice(-3));
  }
  const origin = rootMm[0];
  return {action, rateHz: 40, positionsMm,
          rootMm: rootMm.map(row => row.map((v, i) => v - origin[i]))};
}
