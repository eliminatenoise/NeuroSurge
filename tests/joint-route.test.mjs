import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isLocalModelMount } from '../scene/src/joint/route.mjs';

test('the model bridge requires the loopback game mount', () => {
  for (const url of [
    'http://127.0.0.1:4321/game/',
    'http://localhost:4321/game/scene/example/preview.html?edition=lite',
    'http://[::1]:4321/game/movement-mirror.html'
  ]) assert.equal(isLocalModelMount(new URL(url)), true, url);

  for (const url of [
    'https://eliminatenoise.github.io/NeuroSurge/scene/example/preview.html?edition=lite',
    'https://example.org/game/scene/example/preview.html',
    'http://127.0.0.1.attacker.example/game/',
    'http://127.0.0.1:4321/scene/example/preview.html',
    'file:///game/movement-mirror.html'
  ]) assert.equal(isLocalModelMount(new URL(url)), false, url);
});
