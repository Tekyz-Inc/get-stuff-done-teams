'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const { execFileSync } = require('child_process');
const path = require('path');
const { demoVideoSignal } = require('../scripts/gsd-t-auto-route.js');

test('a request for a demo / walkthrough / tutorial video is flagged', () => {
  for (const p of [
    'make a demo video of the admin screens',
    'Can you record a walkthrough video for the client?',
    'we need tutorial videos for onboarding',
    'create a product tour video',
    'video walkthrough of the checkout flow',
    'build demo videos for FL-041',
    'redo the walk-through recordings',
  ]) assert.ok(demoVideoSignal(p), p);
});

test('unrelated prompts and an explicit /gsd-t-demo-videos call are not flagged', () => {
  for (const p of [
    '/gsd-t-demo-videos admin',
    'the video player crashes on demo data',
    'fix the training data loader',
    'upload the recording to drive',
    'our demo is tomorrow',
    'video upload fails',
    '',
  ]) assert.strictEqual(demoVideoSignal(p), null, p);
});

test('the hook prints the signal after the clock and Reader Contract', () => {
  const out = execFileSync('node', [path.join(__dirname, '..', 'scripts', 'gsd-t-auto-route.js')], {
    input: JSON.stringify({ prompt: 'make a demo video' }), encoding: 'utf8',
  });
  assert.match(out, /^\[GSD-T NOW\]/);
  assert.match(out, /\[GSD-T READER CONTRACT\]/);
  assert.match(out, /\[GSD-T DEMO VIDEOS\][^\n]*\/gsd-t-demo-videos/);
});
