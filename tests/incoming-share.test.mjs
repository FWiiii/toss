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
  deliverIncomingShare({ items: [], text: 'from cold start', failed: [] })

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

  deliverIncomingShare({ items: [], text: '   ', failed: [] })
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
  deliverIncomingShare({ items: [file('a.txt')], text: 'first', failed: [] })
  deliverIncomingShare({ items: [file('b.txt')], text: 'second', failed: [] })

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

  deliverIncomingShare({ items: [], text: 'live', failed: [] })
  assert.equal(received.length, 1)
  assert.equal(received[0].text, 'live')
})

test('a share whose items all failed is still delivered so the user is told', async () => {
  const { deliverIncomingShare, registerIncomingShareConsumer, unregisterIncomingShareConsumer } = await import('../lib/incoming-share.ts')

  const received = []
  unregisterIncomingShareConsumer()
  registerIncomingShareConsumer(payload => received.push(payload))

  deliverIncomingShare({ items: [], text: '', failed: ['10546'] })
  assert.equal(received.length, 1)
  assert.deepEqual(received[0].failed, ['10546'])
})

test('failed items from separate shares are merged without loss', async () => {
  const { deliverIncomingShare, registerIncomingShareConsumer, unregisterIncomingShareConsumer } = await import('../lib/incoming-share.ts')

  unregisterIncomingShareConsumer()
  deliverIncomingShare({ items: [], text: 'kept', failed: ['a.jpg'] })
  deliverIncomingShare({ items: [], text: '', failed: ['b.jpg'] })

  const received = []
  registerIncomingShareConsumer(payload => received.push(payload))

  assert.equal(received.length, 1)
  assert.equal(received[0].text, 'kept')
  assert.deepEqual(received[0].failed, ['a.jpg', 'b.jpg'])
})
