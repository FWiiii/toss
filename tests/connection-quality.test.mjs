/* eslint-disable test/no-import-node-test */

import assert from 'node:assert/strict'
import test from 'node:test'

test('connection quality tracker keeps per-peer latency for the same ping id', async () => {
  const { createConnectionQualityTracker } = await import('../lib/connection-quality.ts')

  const tracker = createConnectionQualityTracker()
  const pingId = tracker.createPing(['peer-a', 'peer-b'], 100)

  tracker.recordPong('peer-a', pingId, 140)
  tracker.recordPong('peer-b', pingId, 220)
  tracker.recordBandwidth('peer-a', 1200)
  tracker.recordBandwidth('peer-b', 2800)

  assert.deepEqual(tracker.getSnapshot(), {
    bandwidth: 2000,
    latency: 80,
    quality: 'good',
  })
})

test('connection quality tracker clears peer metrics independently', async () => {
  const { createConnectionQualityTracker } = await import('../lib/connection-quality.ts')

  const tracker = createConnectionQualityTracker()
  const pingId = tracker.createPing(['peer-a', 'peer-b'], 0)

  tracker.recordPong('peer-a', pingId, 40)
  tracker.recordPong('peer-b', pingId, 180)
  tracker.removePeer('peer-b')

  assert.deepEqual(tracker.getSnapshot(), {
    bandwidth: null,
    latency: 40,
    quality: 'excellent',
  })
})

test('connection quality tracker exposes heartbeat-based peer liveness', async () => {
  const {
    createConnectionQualityTracker,
    HEARTBEAT_TIMEOUT_MS,
  } = await import('../lib/connection-quality.ts')

  const tracker = createConnectionQualityTracker()
  tracker.touchPeer('peer-a', 100)

  assert.equal(tracker.isPeerHealthy('peer-a', 100 + HEARTBEAT_TIMEOUT_MS - 1), true)
  assert.equal(tracker.isPeerHealthy('peer-a', 100 + HEARTBEAT_TIMEOUT_MS + 1), false)
})

test('pong refreshes peer liveness after a heartbeat', async () => {
  const {
    createConnectionQualityTracker,
    HEARTBEAT_TIMEOUT_MS,
  } = await import('../lib/connection-quality.ts')

  const tracker = createConnectionQualityTracker()
  tracker.touchPeer('peer-a', 0)
  const pingId = tracker.createPing(['peer-a'], HEARTBEAT_TIMEOUT_MS + 10)
  tracker.recordPong('peer-a', pingId, HEARTBEAT_TIMEOUT_MS + 20)

  assert.equal(tracker.isPeerHealthy('peer-a', HEARTBEAT_TIMEOUT_MS * 2), true)
})
