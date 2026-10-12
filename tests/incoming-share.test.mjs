/* eslint-disable test/no-import-node-test */
import assert from 'node:assert/strict'
import test from 'node:test'

test('incoming share is buffered until a consumer registers', async () => {
  const {
    deliverIncomingShare,
    registerIncomingShareConsumer,
    unregisterIncomingShareConsumer,
  } = await import('../lib/incoming-share.ts')

  const received = []
  deliverIncomingShare({ items: [], text: 'from cold start' })

  unregisterIncomingShareConsumer()
  registerIncomingShareConsumer(payload => received.push(payload))

  assert.equal(received.length, 1)
  assert.equal(received[0].text, 'from cold start')
})

test('empty incoming share payloads are ignored', async () => {
  const { deliverIncomingShare, registerIncomingShareConsumer, unregisterIncomingShareConsumer } = await import('../lib/incoming-share.ts')

  const received = []
  unregisterIncomingShareConsumer()
  registerIncomingShareConsumer(payload => received.push(payload))

  deliverIncomingShare({ items: [], text: '   ' })
  assert.equal(received.length, 0)
})

test('multiple shares before a consumer registers are merged without loss', async () => {
  const { deliverIncomingShare, registerIncomingShareConsumer, unregisterIncomingShareConsumer } = await import('../lib/incoming-share.ts')

  const file = name => ({
    mimeType: 'text/plain',
    name,
    path: `toss-inbox/${name}`,
    size: 1,
    uri: `file:///data/toss-inbox/${name}`,
  })

  unregisterIncomingShareConsumer()
  deliverIncomingShare({ items: [file('a.txt')], text: 'first' })
  deliverIncomingShare({ items: [file('b.txt')], text: 'second' })

  const received = []
  registerIncomingShareConsumer(payload => received.push(payload))

  assert.equal(received.length, 1)
  assert.deepEqual(received[0].items.map(item => item.name), ['a.txt', 'b.txt'])
  assert.equal(received[0].text, 'first\nsecond')
})

test('delivery goes straight to the consumer once registered', async () => {
  const { deliverIncomingShare, registerIncomingShareConsumer, unregisterIncomingShareConsumer } = await import('../lib/incoming-share.ts')

  const received = []
  unregisterIncomingShareConsumer()
  registerIncomingShareConsumer(payload => received.push(payload))

  deliverIncomingShare({ items: [], text: 'live' })
  assert.equal(received.length, 1)
  assert.equal(received[0].text, 'live')
})
