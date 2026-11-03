import { test } from 'node:test'
import assert from 'node:assert/strict'
import { BattleAudio } from './audio.js'
const param = { setValueAtTime() {}, exponentialRampToValueAtTime() {}, linearRampToValueAtTime() {} }
test('gesture gate, music cadence, mute and pause stop scheduled voices', () => {
  let created = 0,
    stopped = 0
  globalThis.AudioContext = class {
    state = 'running'
    currentTime = 1
    resume() {
      return Promise.resolve()
    }
    createOscillator() {
      created++
      return {
        frequency: param,
        connect() {
          return { connect() {} }
        },
        start() {},
        stop() {
          stopped++
        },
        disconnect() {}
      }
    }
    createGain() {
      return { gain: param, disconnect() {} }
    }
  }
  const sound = new BattleAudio()
  sound.setRunning(true)
  sound.tick()
  sound.effect('summon')
  assert.equal(created, 0, 'no autoplay context before gesture')
  sound.unlock()
  sound.tick()
  assert.equal(created, 2, 'melody and bass begin')
  sound.tick()
  assert.equal(created, 2, 'no duplicate notes within the beat')
  sound.context.currentTime += 0.3
  sound.tick()
  assert.equal(created, 3)
  const stops = stopped
  sound.muted = true
  sound.setRunning(true)
  assert.equal(stopped - stops, 3, 'mute stops all active voices')
  sound.effect('hit')
  sound.tick()
  assert.equal(created, 3)
  sound.muted = false
  sound.setRunning(false)
  sound.tick()
  assert.equal(created, 3, 'paused music remains silent')
  sound.setRunning(true)
  sound.tick()
  assert.equal(created, 4, 'resume begins one note without catch-up burst')
  delete globalThis.AudioContext
})
test('missing Web Audio does not prevent game startup', () => {
  const sound = new BattleAudio()
  sound.unlock()
  sound.setRunning(true)
  sound.tick()
  sound.effect('victory')
  assert.equal(sound.context, null)
})
test('retries suspended and interrupted audio and supports prefixed Web Audio', () => {
  let resumes = 0
  globalThis.webkitAudioContext = class {
    state = 'suspended'
    resume() {
      resumes++
      return Promise.resolve()
    }
  }
  try {
    const sound = new BattleAudio()
    sound.unlock()
    sound.unlock()
    assert.equal(resumes, 2)
    sound.context.state = 'interrupted'
    sound.unlock()
    assert.equal(resumes, 3)
    sound.context.state = 'running'
    sound.unlock()
    assert.equal(resumes, 3)
  } finally {
    delete globalThis.webkitAudioContext
  }
})
