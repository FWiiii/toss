/* eslint-disable test/no-import-node-test */
import assert from 'node:assert/strict'
import test from 'node:test'

/**
 * 远端可以反复推送 file-cancel / file-error，标记集合必须有上限，
 * 否则异常或恶意对端能在会话内无限制撑大内存。
 * 上限值定义在 lib/transfer-connection.ts 的 MAX_REMOTE_TRANSFER_MARKERS。
 */
const MARKER_CAP = 1024

function waitForCondition(predicate, timeoutMs = 5000) {
  const deadline = Date.now() + timeoutMs
  return new Promise((resolve, reject) => {
    const tick = () => {
      if (predicate()) {
        resolve()
        return
      }
      if (Date.now() > deadline) {
        reject(new Error('Condition was not met before timeout'))
        return
      }
      setTimeout(tick, 5)
    }
    tick()
  })
}

function createConnectionHarness() {
  const handlers = new Map()
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
    peerConnection: { connectionState: 'connected', iceConnectionState: 'connected', addEventListener() {} },
    metadata: null,
    send() {},
    on(event, handler) { handlers.set(event, handler) },
  }

  refs.connectionsRef.current.set(conn.peer, conn)

  return { callbacks, conn, handlers, messages, refs }
}

test('remote cancel/failure markers are capped instead of growing without bound', async () => {
  const { createSetupConnection } = await import('../lib/transfer-connection.ts')
  const harness = createConnectionHarness()
  const setupConnection = createSetupConnection(harness.refs, harness.callbacks)
  await setupConnection(harness.conn, false)
  harness.refs.keyExchangePendingRef.current.delete('peer-1')

  const injected = MARKER_CAP + 200
  const dataHandler = harness.handlers.get('data')
  assert.equal(typeof dataHandler, 'function', 'connection must register a data handler')

  for (let index = 0; index < injected; index++) {
    dataHandler({ type: 'file-cancel', itemId: `remote-${index}` })
    dataHandler({ type: 'file-error', itemId: `remote-${index}`, reason: '接收方无法写入文件（可能空间不足）' })
  }

  // file-error 每条都会产生系统消息；等最后一条被串行处理器消费即代表全部注入处理完毕。
  await waitForCondition(() => harness.messages.length >= injected)

  assert.equal(harness.refs.cancelledTransfersRef.current.size, MARKER_CAP)
  assert.equal(harness.refs.failedTransfersRef.current.size, MARKER_CAP)
})
