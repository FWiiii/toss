/* eslint-disable test/no-import-node-test */
import assert from 'node:assert/strict'
import test from 'node:test'

// Native local origins must never escape into cross-device invitations.
test('room invitations require a public HTTPS origin in native mode', async () => {
  const { buildRoomUrl } = await import('../lib/room-url.ts')
  assert.equal(buildRoomUrl('ABC234', '', 'capacitor://localhost', true), null)
  assert.equal(buildRoomUrl('ABC234', 'http://localhost:3000', 'capacitor://localhost', true), null)
  assert.equal(buildRoomUrl('ABC234', 'https://toss.example', 'capacitor://localhost', true), 'https://toss.example/?join=ABC234')
})

test('web invitations use their current origin and reject malformed room codes', async () => {
  const { buildRoomUrl } = await import('../lib/room-url.ts')
  assert.equal(buildRoomUrl('ABC234', '', 'http://localhost:3000', false), 'http://localhost:3000/?join=ABC234')
  assert.equal(buildRoomUrl('ABC234', 'https://toss.example/', 'https://preview.example', false), 'https://toss.example/?join=ABC234')
  assert.equal(buildRoomUrl('ABC234', 'https://toss.example/path?x=1', '', true), null)
  assert.equal(buildRoomUrl('../bad', 'https://toss.example', '', true), null)
})
