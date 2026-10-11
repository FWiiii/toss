/* eslint-disable test/no-import-node-test */
import assert from 'node:assert/strict'
import test from 'node:test'

async function waitForCondition(predicate, timeoutMs = 3000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (predicate()) {
      return
    }
    await new Promise(resolve => setTimeout(resolve, 10))
  }
  throw new Error('Condition was not met before timeout')
}

test('cancelling an offer wakes approval wait and sends no file bytes or completion', async () => {
  const { SessionEncryptor, decryptJSON } = await import('../lib/crypto.ts')
  const { createDataTransfer } = await import('../lib/transfer-data.ts')
  const sender = new SessionEncryptor()
  const receiver = new SessionEncryptor()
  const secret = new Uint8Array(32).fill(7).buffer
  await sender.deriveKeys(secret, 'initiator')
  await receiver.deriveKeys(secret, 'responder')
  const controls = []
  const updates = []
  const refs = {
    connectionsRef: { current: new Map() },
    encryptorsRef: { current: new Map([['peer', sender]]) },
    pendingFileOfferResponsesRef: { current: new Map() },
    cancelledTransfersRef: { current: new Set() },
  }
  refs.connectionsRef.current.set('peer', {
    open: true,
    send(payload) {
      void decryptJSON(receiver, payload.encrypted).then((control) => {
        controls.push(control.type)
        if (control.type === 'file-offer') {
          refs.cancelledTransfersRef.current.add(control.offerId)
          refs.pendingFileOfferResponsesRef.current.get(`peer:${control.offerId}`)?.resolve(false)
        }
      })
    },
  })
  const { sendFile } = createDataTransfer(refs, {
    setSendingCount() {},
    addItem() {},
    addItemWithId() { return 'offer-1' },
    updateItemProgress(id, patch) { updates.push(patch) },
    createTrackedBlobUrl() { return 'blob:unused' },
    addSystemMessage() {},
  }, refs.encryptorsRef)
  await sendFile(new File([], 'empty.txt', { type: 'text/plain' }))
  await waitForCondition(() => updates.some(patch => patch.status === 'cancelled'))
  await waitForCondition(() => controls.length === 2)
  assert.equal(updates.at(-1).status, 'cancelled')
  assert.deepEqual(controls, ['file-offer', 'file-cancel'])
  assert.equal(refs.pendingFileOfferResponsesRef.current.size, 0)
})
