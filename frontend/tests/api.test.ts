import assert from 'node:assert/strict'
import test from 'node:test'
import { analyze } from '../src/lib/api.ts'

test('weather batches run concurrently with a limit and retain checkpoint results', async () => {
  const originalFetch = globalThis.fetch
  const departure = new Date(Date.now() + 3600000).toISOString()
  const points = Array.from({ length: 60 }, (_, i) => ({
    id: `p${i}`, lat: 40 + i * 0.01, lon: -80, eta: departure, mile: i,
    represented_miles: 1,
  }))
  const plan = {
    departure, load_lb: 30000, warnings: [],
    routes: [{ id: '0', duration_seconds: 3600, checkpoints: points }],
  }
  const risk = { level: 'Low', score: 0, reason: 'Clear' }
  let pending = 0, peak = 0, batches = 0
  globalThis.fetch = async (input, init) => {
    const path = String(input)
    if (path.includes('/routes/')) return Response.json(plan)
    if (path.includes('/forecast/')) {
      batches++
      pending++
      peak = Math.max(peak, pending)
      const body = JSON.parse(String(init?.body))
      await new Promise(resolve => setTimeout(resolve, 15))
      pending--
      return Response.json({ checkpoints: body.checkpoints.map((point: { id: string }) => ({ id: point.id, risk })) })
    }
    if (path.includes('/rank/')) return Response.json({ summaries: [{ eligible: true }], recommended_index: 0 })
    throw new Error(`Unexpected path: ${path}`)
  }
  try {
    const result = await analyze({ origin: 'Chicago', destination: 'Detroit', departure, load_lb: 30000, spacing: 25 }, new AbortController().signal, () => {})
    assert.equal(batches, 5)
    assert.equal(peak, 4)
    assert.equal(result.routes[0].checkpoints.length, 60)
    assert.ok(result.routes[0].checkpoints.every(point => point.risk?.level === 'Low'))
    assert.equal(result.recommended_index, 0)
  } finally {
    globalThis.fetch = originalFetch
  }
})
