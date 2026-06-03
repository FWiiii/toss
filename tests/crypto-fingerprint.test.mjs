/* eslint-disable test/no-import-node-test */

import assert from 'node:assert/strict'
import test from 'node:test'

test('getSessionFingerprint produces a stable short fingerprint', async () => {
  const { getSessionFingerprint } = await import('../lib/crypto.ts')

  const secret = Uint8Array.from([
    0,
    1,
    2,
    3,
    4,
    5,
    6,
    7,
    8,
    9,
    10,
    11,
    12,
    13,
    14,
    15,
  ])

  assert.equal(await getSessionFingerprint(secret.buffer), 'BE45 CB26 05BF')
})
