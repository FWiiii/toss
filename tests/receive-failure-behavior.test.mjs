/* eslint-disable test/no-import-node-test */
import assert from 'node:assert/strict'
import test from 'node:test'

function createConnectionHarness() {
  const handlers = new Map()
  const sentPayloads = []
  const messages = []

  const refs = {
    connectionsRef: { current: new Map() },
    encryptorsRef: { current: new Map() },
    encryptionFingerprintsRef: { current: new Map() },
    keyExchangePendingRef: { current: new Map() },
    fileBuffersRef: { current: new Map() },
    peerDevicesRef: { current: new Map() },
    localDeviceProfileRef: { current: null },
    trustedDevicesRef: { current: new Map() },
    pendingIncomingFileOffersRef: { current: new Map() },
    acceptedIncomingFileOffersRef: { current: new Map() },
    approvedIncomingFileOffersRef: { current: new Map() },
    pendingFileOfferResponsesRef: { current: new Map() },
    reconnectAttemptsRef: { current: 0 },
    reconnectTimeoutRef: { current: null },
    shouldReconnectRef: { current: false },
    suppressReconnectUntilRef: { current: 0 },
    pendingReconnectRef: { current: false },
    peerRef: { current: null },
    connectingPeersRef: {
      current: {
        begin() { return true },
        complete() {},
        fail() {},
        isConnecting() { return false },
        clear() {},
      },
    },
    setupConnectionRef: { current: null },
    attemptReconnectRef: { current: null },
    joinRoomRef: { current: null },
    cancelledTransfersRef: { current: new Set() },
    failedTransfersRef: { current: new Set() },
  }

  const callbacks = {
    setError() {},
    setConnectionStatus() {},
    setConnectionInfo() {},
    setErrorMessage() {},
    setIsEncrypted() {},
    setPeerCount() {},
    updatePeerCount() {},
    addSystemMessage(message) { messages.push(message) },
    addItem() {},
    addItemWithId() { return 'local-1' },
    updateItemProgress() {},
    createTrackedBlobUrl() { return 'blob:mock' },
    broadcastToConnections: async () => {},
    cleanupAll() {},
    handlePong() {},
    touchPeer() {},
    isPeerHealthy() { return true },
    recordBandwidth() {},
    removePeerQuality() {},
    notifyReceived() {},
    queueIncomingFileOffer() {},
    rememberTrustedPeer() {},
  }

  const conn = {
    open: true,
    peer: 'peer-1',
    peerConnection: { connectionState: 'connected', iceConnectionState: 'connected' },
    metadata: null,
    send(payload) { sentPayloads.push(payload) },
    on(event, handler) { handlers.set(event, handler) },
  }

  refs.connectionsRef.current.set(conn.peer, conn)

  return { callbacks, conn, handlers, messages, refs, sentPayloads }
}

function waitForQueue() {
  return new Promise(resolve => setTimeout(resolve, 0))
}

test('validateIncomingTransferPayload accepts receiver failure reports', async () => {
  const { validateIncomingTransferPayload } = await import('../lib/transfer-protocol.ts')

  assert.deepEqual(
    validateIncomingTransferPayload({
      type: 'file-error',
      itemId: 'file-1',
      reason: '接收方无法写入文件（可能空间不足）',
    }),
    {
      type: 'file-error',
      itemId: 'file-1',
      reason: '接收方无法写入文件（可能空间不足）',
    },
  )

  assert.equal(validateIncomingTransferPayload({ type: 'file-error', itemId: 123 }), null)
})

test('receiver failure stops the sender instead of reporting success', async () => {
  const { createSetupConnection } = await import('../lib/transfer-connection.ts')
  const harness = createConnectionHarness()

  const setupConnection = createSetupConnection(harness.refs, harness.callbacks, null)
  await setupConnection(harness.conn, false)
  harness.refs.keyExchangePendingRef.current.delete('peer-1')

  harness.handlers.get('data')?.({
    type: 'file-error',
    itemId: 'file-1',
    reason: '接收方无法写入文件（可能空间不足）',
  })

  await waitForQueue()
  await waitForQueue()

  assert.equal(harness.refs.cancelledTransfersRef.current.has('file-1'), true)
  assert.equal(harness.refs.failedTransfersRef.current.has('file-1'), true)
  assert.equal(harness.messages.some(message => message.includes('对方无法接收文件')), true)
})

test('sender reports receiver-side failure as an error, not a cancellation', async () => {
  const { SessionEncryptor, decryptJSON } = await import('../lib/crypto.ts')
  const { createDataTransfer } = await import('../lib/transfer-data.ts')

  const sender = new SessionEncryptor()
  const receiver = new SessionEncryptor()
  const secret = new Uint8Array(32).fill(3).buffer
  await sender.deriveKeys(secret, 'initiator')
  await receiver.deriveKeys(secret, 'responder')

  const updates = []
  const refs = {
    connectionsRef: { current: new Map() },
    encryptorsRef: { current: new Map([['peer', sender]]) },
    pendingFileOfferResponsesRef: { current: new Map() },
    cancelledTransfersRef: { current: new Set() },
    failedTransfersRef: { current: new Set() },
  }

  refs.connectionsRef.current.set('peer', {
    open: true,
    send(payload) {
      // 文件分片是二进制信封，控制消息才是加密 JSON。
      if (payload?.type === 'file-chunk') {
        refs.failedTransfersRef.current.add(payload.itemId)
        refs.cancelledTransfersRef.current.add(payload.itemId)
        return
      }

      if (payload?.type === 'encrypted') {
        void decryptJSON(receiver, payload.encrypted).then((control) => {
          if (control.type === 'file-offer') {
            // 接收端先同意接收，随后在首个分片写入时报告落盘失败。
            refs.pendingFileOfferResponsesRef.current.get(`peer:${control.offerId}`)?.resolve(true)
          }
        })
      }
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

  await sendFile(new File([new Uint8Array(4096)], 'rejected.bin', { type: 'application/octet-stream' }))

  const last = updates.at(-1)
  assert.equal(last.status, 'error')
  assert.equal(refs.failedTransfersRef.current.has('offer-1'), false)
  assert.equal(refs.cancelledTransfersRef.current.has('offer-1'), false)
})
