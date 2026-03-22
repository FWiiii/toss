/* eslint-disable test/no-import-node-test */

import assert from 'node:assert/strict'
import test from 'node:test'

test('connection attempt registry prevents duplicate concurrent dials', async () => {
  const { createConnectionAttemptRegistry } = await import('../lib/connection-attempts.ts')

  const registry = createConnectionAttemptRegistry()

  assert.equal(registry.begin('host-peer'), true)
  assert.equal(registry.begin('host-peer'), false)

  registry.complete('host-peer')

  assert.equal(registry.begin('host-peer'), true)
})

test('connection attempt registry tracks attempts independently per peer', async () => {
  const { createConnectionAttemptRegistry } = await import('../lib/connection-attempts.ts')

  const registry = createConnectionAttemptRegistry()

  assert.equal(registry.begin('peer-a'), true)
  assert.equal(registry.begin('peer-b'), true)
  assert.equal(registry.has('peer-a'), true)
  assert.equal(registry.has('peer-b'), true)
})
