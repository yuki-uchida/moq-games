import { expect, test } from '@playwright/test'

test('discovery remains prominent through full-range and small-speaker playback', async ({ page }) => {
  await page.route('**/src/main.ts*', async (route) => {
    const response = await route.fetch()
    await route.fulfill({
      response,
      body: `${await response.text()}
import { RabbitersSfx as MixSfx } from '/src/sfx.ts';
window.rabbitersAudioLevels = async () => {
  const rate = 48000;
  const originalContext = window.AudioContext;
  const originalRandom = Math.random;
  let seed = 1;
  Math.random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32);
  function loudness(input) {
    let signal = input;
    for (const [numerator, denominator] of [
      [[1.53512485958697, -2.69169618940638, 1.19839281085285], [1, -1.69065929318241, 0.73248077421585]],
      [[1, -2, 1], [1, -1.99004745483398, 0.99007225036621]]
    ]) {
      const output = new Float32Array(signal.length);
      let previousInput = 0, olderInput = 0, previousOutput = 0, olderOutput = 0;
      for (let index = 0; index < signal.length; index++) {
        const value = numerator[0] * signal[index] + numerator[1] * previousInput + numerator[2] * olderInput
          - denominator[1] * previousOutput - denominator[2] * olderOutput;
        olderInput = previousInput; previousInput = signal[index];
        olderOutput = previousOutput; previousOutput = value; output[index] = value;
      }
      signal = output;
    }
    const windowSize = 0.4 * rate;
    let peak = 0;
    for (let start = 0; start + windowSize <= signal.length; start += 0.1 * rate) {
      let sum = 0;
      for (let index = start; index < start + windowSize; index++) sum += signal[index] ** 2;
      peak = Math.max(peak, sum / windowSize);
    }
    return -0.691 + 10 * Math.log10(peak || 1e-20);
  }
  async function render(kind, small) {
    const music = kind === 'calm' || kind === 'suspicious' || kind === 'chase';
    const offline = new OfflineAudioContext(1, rate * (music ? 4.5 : 1.5), rate);
    let destination = offline.destination;
    if (small) {
      for (let index = 0; index < 2; index++) {
        const filter = offline.createBiquadFilter();
        filter.type = 'highpass'; filter.frequency.value = 300; filter.Q.value = 0.707;
        filter.connect(destination); destination = filter;
      }
    }
    const context = {
      state: 'running', currentTime: 0, sampleRate: rate, destination,
      createGain: () => offline.createGain(), createOscillator: () => offline.createOscillator(),
      createDynamicsCompressor: () => offline.createDynamicsCompressor(),
      createBuffer: (...args) => offline.createBuffer(...args),
      createBufferSource: () => offline.createBufferSource(), createBiquadFilter: () => offline.createBiquadFilter(),
      resume: () => Promise.resolve(), close: () => Promise.resolve()
    };
    window.AudioContext = function () { return context; };
    if (kind === 'alarm' || music) {
      const source = new RabbitersAudio();
      source.start(); clearInterval(source.timer); source.timer = null;
      source.previous = { phase: 'playing', threat: kind, time: 0 };
      if (music) {
        for (let time = 0; time < 4; time += 0.25) {
          context.currentTime = time; source.voices.clear(); source.music();
        }
      } else {
        context.currentTime = 0.05; source.alarm();
      }
    } else {
      const source = new MixSfx();
      source.start(); context.currentTime = 0.05;
      source.play({ type: kind, streak: 1 });
    }
    return loudness((await offline.startRendering()).getChannelData(0));
  }
  try {
    const results = {};
    for (const small of [false, true]) {
      results[small ? 'small' : 'full'] = {};
      for (const kind of ['alarm', 'eat', 'escaped', 'taskDone', 'downed', 'grown', 'calm', 'suspicious', 'chase'])
        results[small ? 'small' : 'full'][kind] = await render(kind, small);
    }
    return results;
  } finally {
    window.AudioContext = originalContext;
    Math.random = originalRandom;
  }
};`
    })
  })
  await page.goto('/')
  type Sound = 'alarm' | 'eat' | 'escaped' | 'taskDone' | 'downed' | 'grown' | 'calm' | 'suspicious' | 'chase'
  const levels = await page.evaluate<{
    full: Record<Sound, number>
    small: Record<Sound, number>
  }>('window.rabbitersAudioLevels()')
  for (const playback of [levels.full, levels.small]) {
    expect(playback.alarm - playback.eat).toBeGreaterThanOrEqual(3)
    expect(playback.alarm - playback.escaped).toBeGreaterThanOrEqual(3)
    expect(playback.alarm).toBeGreaterThan(playback.taskDone)
    expect(playback.alarm).toBeGreaterThan(playback.downed)
    expect(playback.alarm).toBeGreaterThan(playback.grown)
    expect(playback.suspicious).toBeGreaterThan(playback.calm)
    expect(playback.chase).toBeGreaterThan(playback.suspicious)
  }
})
