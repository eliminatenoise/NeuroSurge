"""Rebuild the synthetic wrist model with NumPy. No recordings or network access."""
import argparse
import json
from pathlib import Path

import numpy as np

OUT = Path(__file__).resolve().parents[1] / 'scene/src/camera/wrist-forecast/role-weights.mjs'
TIME = np.arange(-14, 16) / 30
FEATURES = ['wrist minus shoulder', 'elbow minus shoulder', 'wrist slope (15 samples)',
            'wrist slope (5 samples)', 'elbow slope (15 samples)', 'shoulder slope (15 samples)']


def trajectories(rng, count, role):
    """Generate independently phased planar oscillations in the fixed shoulder frame."""
    sign = 1 if role == 'lead' else -1
    def wave(low, high, amplitude):
        rate = rng.uniform(low, high, (count, 1, 2))
        phase = rng.uniform(-np.pi, np.pi, (count, 1, 2))
        size = rng.uniform(.25, 1, (count, 1, 2)) * amplitude
        return size * np.sin(TIME[None, :, None] * rate + phase)
    shoulder = np.array([sign * .5, 0]) + wave(.3, 1.2, .07)
    speed = (1.3, 3.6) if role == 'lead' else (.45, 1.75)
    elbow = shoulder + [sign * .22, -.47] + wave(*speed, .30)
    wrist = elbow + [sign * .18, -.32] + wave(*speed, .46)
    return np.stack([wrist, elbow, shoulder], axis=2)


def features(history):
    def slope(joint, count):
        centered = TIME[15-count:15] - TIME[15-count:15].mean()
        return np.einsum('i,nij->nj', centered, history[:, -count:, joint]) / (centered @ centered)
    wrist, elbow, shoulder = history[:, -1].transpose(1, 0, 2)
    return np.hstack([wrist-shoulder, elbow-shoulder, slope(0, 15), slope(0, 5), slope(1, 15), slope(2, 15)])


def targets(path):
    return (path[:, [22, 29], 0] - path[:, 14:15, 0]).reshape(len(path), 4)


def fit():
    models, metrics = {}, {}
    for index, role in enumerate(('lead', 'other')):
        train = trajectories(np.random.default_rng(1786 + index), 1024, role)
        held = trajectories(np.random.default_rng(1986 + index), 256, role)
        x, y = features(train[:, :15]), targets(train)
        mean, bias = x.mean(0), y.mean(0)
        std = x.std(0)
        z = (x - mean) / std
        weight = np.linalg.solve(z.T @ z + 2 * np.eye(z.shape[1]), z.T @ (y-bias))
        # Fold the normalization and intercept into one affine map for the browser.
        coef = weight / std[:, None]
        intercept = bias - mean @ coef
        models[role] = {'coef': coef.tolist(), 'bias': intercept.tolist()}
        pred = features(held[:, :15]) @ coef + intercept
        actual = targets(held)
        def error(delta):
            return np.linalg.norm(delta.reshape(-1, 2, 2), axis=2).mean(0).tolist()
        metrics[role] = {'ridge': error(pred-actual), 'hold': error(actual)}
    return models, metrics


if __name__ == '__main__':
    cli = argparse.ArgumentParser(description=__doc__)
    cli.add_argument('--check', action='store_true', help='Verify packaged coefficients without writing.')
    args = cli.parse_args()
    models, metrics = fit()
    source = '// Generated from fictional motions by tools/fit-shoulder-wrists.py.\nexport const roleWeights = ' + json.dumps(models, indent=2) + ';\n'
    if args.check:
        packaged = json.loads(OUT.read_text().split(' = ', 1)[1].rstrip(';\n'))
        for role, fields in models.items():
            for key, value in fields.items():
                np.testing.assert_allclose(packaged[role][key], value, atol=1e-10, rtol=1e-10)
    else:
        OUT.write_text(source)
    print(json.dumps({'synthetic_train_per_role': 1024, 'synthetic_test_per_role': 256,
                      'mean_endpoint_error_in_shoulder_widths_synthetic_only': metrics}))
