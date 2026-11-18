import assert from 'node:assert/strict'
import test from 'node:test'
import { windSamples, windVector } from '../src/features/weather-map/wind.ts'
import type { Checkpoint } from '../src/lib/api'

test('meteorological wind blows away from its reported source direction', () => {
  assert.ok(Math.abs(windVector(10, 0)!.east) < 1e-9)
  assert.equal(windVector(10, 0)!.north, -10)
  assert.ok(Math.abs(windVector(10, 90)!.east + 10) < 1e-9)
  assert.ok(Math.abs(windVector(10, 270)!.east - 10) < 1e-9)
  assert.equal(windVector(20, 180)!.north, 20)
})

test('missing or invalid wind data never produces invented motion', () => {
  assert.equal(windVector(10, null), null)
  assert.equal(windVector(null, 45), null)
  assert.equal(windVector(-1, 45), null)
  assert.equal(windVector(NaN, 45), null)
})

test('particles use the chosen hour and omit calm or unavailable forecasts', () => {
  const point: Checkpoint = { id: 'a', lat: 40, lon: -80, mile: 0, represented_miles: 5, eta: '2026-11-18T12:00:00Z', frames: [[10, 0, 0, 'Low', 0], [20, 0, 0, 'Low', 180], [0, 0, 0, 'Low', 0]] }
  assert.equal(windSamples([point], 0)[0].north, -10)
  assert.equal(windSamples([point], 1)[0].north, 20)
  assert.deepEqual(windSamples([point], 2), [])
  assert.deepEqual(windSamples([point], 48), [])
})
