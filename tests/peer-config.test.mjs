/* eslint-disable test/no-import-node-test */

import assert from 'node:assert/strict'
import test from 'node:test'

test('generateRoomCode uses cryptographic randomness when available', async () => {
  const originalCrypto = globalThis.crypto
  const nextBytes = Uint8Array.from([0, 1, 2, 3, 4, 5])

  Object.defineProperty(globalThis, 'crypto', {
    configurable: true,
    value: {
      getRandomValues(target) {
        target.set(nextBytes)
        return target
      },
    },
  })

  try {
    const { generateRoomCode } = await import('../lib/peer-config.ts')
    assert.equal(generateRoomCode(), 'ABCDEF')
  }
  finally {
    Object.defineProperty(globalThis, 'crypto', {
      configurable: true,
      value: originalCrypto,
    })
  }
})
