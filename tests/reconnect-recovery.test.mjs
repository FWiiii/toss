/* eslint-disable test/no-import-node-test */

import assert from 'node:assert/strict'
import test from 'node:test'

import { createConnectionAttemptRegistry } from '../lib/connection-attempts.ts'
import { MAX_RECONNECT_ATTEMPTS } from '../lib/peer-config.ts'

function createMockRef(current) {
  return { current }
}

function createRefs(overrides = {}) {
  const refs = {
    connectionsRef: createMockRef(new Map()),
    encryptorsRef: createMockRef(new Map()),
    encryptionFingerprintsRef: createMockRef(new Map()),
    keyExchangePendingRef: createMockRef(new Map()),
    fileBuffersRef: createMockRef(new Map()),
    peerDevicesRef: createMockRef(new Map()),
    localDeviceProfileRef: createMockRef(null),
    trustedDevicesRef: createMockRef(new Map()),
    pendingIncomingFileOffersRef: createMockRef(new Map()),
    approvedIncomingFileOffersRef: createMockRef(new Map()),
    pendingFileOfferResponsesRef: createMockRef(new Map()),
    reconnectAttemptsRef: createMockRef(0),
    reconnectTimeoutRef: createMockRef(null),
    shouldReconnectRef: createMockRef(true),
    suppressReconnectUntilRef: createMockRef(0),
    pendingReconnectRef: createMockRef(false),
    peerRef: createMockRef(null),
    connectingPeersRef: createMockRef(createConnectionAttemptRegistry()),
    setupConnectionRef: createMockRef(null),
    attemptReconnectRef: createMockRef(null),
    joinRoomRef: createMockRef(null),
    cancelledTransfersRef: createMockRef(new Set()),
    failedTransfersRef: createMockRef(new Set()),
  }

  return Object.assign(refs, overrides)
}

function createCallbacks(overrides = {}) {
  return Object.assign({
    setError() {},
    setConnectionStatus() {},
    setConnectionInfo() {},
    setErrorMessage() {},
    setIsEncrypted() {},
    setPeerCount() {},
    updatePeerCount() {},
    addSystemMessage() {},
    addItem() {},
    addItemWithId() { return 'mock-item' },
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
  }, overrides)
}

function installTimerSpy() {
  const originalSetTimeout = globalThis.setTimeout
  const originalClearTimeout = globalThis.clearTimeout
  const originalSetInterval = globalThis.setInterval
  const originalClearInterval = globalThis.clearInterval
  const pending = []
  const intervals = []

  globalThis.setTimeout = (callback, delay) => {
    const task = { callback, delay, cleared: false }
    pending.push(task)
    return task
  }
  globalThis.clearTimeout = (task) => {
    if (task && typeof task === 'object')
      task.cleared = true
  }
  globalThis.setInterval = (callback, delay) => {
    const task = { callback, delay, cleared: false }
    intervals.push(task)
    return task
  }
  globalThis.clearInterval = (task) => {
    if (task && typeof task === 'object')
      task.cleared = true
  }

  return {
    pending,
    runNext() {
      const task = pending.shift()
      if (!task)
        return false
      if (!task.cleared)
        task.callback()
      return true
    },
    runByDelay(delay) {
      const index = pending.findIndex(task => task.delay === delay && !task.cleared)
      if (index === -1)
        return false
      const [task] = pending.splice(index, 1)
      task.callback()
      return true
    },
    // 執行所有指定間隔的 interval 回呼(模擬時間推進)
    tickInterval(delay) {
      let ticks = 0
      for (const task of intervals) {
        if (task.delay !== delay || task.cleared)
          continue
        ticks += 1
        task.callback()
      }
      return ticks
    },
    restore() {
      globalThis.setTimeout = originalSetTimeout
      globalThis.clearTimeout = originalClearTimeout
      globalThis.setInterval = originalSetInterval
      globalThis.clearInterval = originalClearInterval
    },
  }
}

test('createSetupConnection keeps the library ICE handler while monitoring ICE state', async () => {
  const { createSetupConnection } = await import('../lib/transfer-connection.ts')

  const refs = createRefs()
  const libraryFailures = []
  const restarts = []
  const listeners = []
  const libraryHandler = () => {
    libraryFailures.push('peer-closed')
  }

  const conn = {
    open: true,
    peer: 'peer-ice',
    destroyed: false,
    peerConnection: {
      connectionState: 'connected',
      iceConnectionState: 'connected',
      oniceconnectionstatechange: libraryHandler,
      restartIce() { restarts.push(true) },
      addEventListener(type, handler) { listeners.push({ type, handler }) },
    },
    send() {},
    on() {},
    close() {},
  }

  refs.connectionsRef.current.set(conn.peer, conn)

  const setupConnection = createSetupConnection(refs, createCallbacks())
  await setupConnection(conn, false)
  await new Promise(resolve => setTimeout(resolve, 250))

  assert.equal(
    conn.peerConnection.oniceconnectionstatechange,
    libraryHandler,
    'PeerJS ICE failure handling must stay attached so failures still close the connection',
  )

  const iceListener = listeners.find(entry => entry.type === 'iceconnectionstatechange')
  assert.ok(iceListener, 'app must monitor ICE state through its own listener')

  conn.peerConnection.oniceconnectionstatechange()
  assert.deepEqual(libraryFailures, ['peer-closed'], 'library failure handling must remain callable')

  conn.peerConnection.iceConnectionState = 'failed'
  iceListener.handler()
  assert.deepEqual(restarts, [true], 'app ICE monitoring must still react to failures')
})

test('createSetupConnection recovers when the transport fails without a PeerJS close event', async () => {
  // 連線建立時房間碼可能還沒 commit 到 state,這裡刻意不提供任何房間資訊:
  // 連線遺失的處理不得依賴建立當下的房間碼,否則自動重連永遠不會啟動。
  const { createSetupConnection } = await import('../lib/transfer-connection.ts')

  const refs = createRefs()
  const reconnects = []
  refs.attemptReconnectRef.current = () => {
    reconnects.push(true)
  }

  const handlers = new Map()
  const listeners = []
  let closeCalls = 0

  const peerConnection = {
    connectionState: 'connected',
    iceConnectionState: 'connected',
    restartIce() {},
    addEventListener(type, handler) { listeners.push({ type, handler }) },
  }

  const conn = {
    open: true,
    peer: 'peer-recovery',
    destroyed: false,
    peerConnection,
    send() {},
    on(event, handler) { handlers.set(event, handler) },
    // 傳輸中斷時 PeerJS 不一定會發出 close 事件(資料通道不會收到 close)。
    close() { closeCalls += 1 },
  }

  refs.connectionsRef.current.set(conn.peer, conn)

  const setupConnection = createSetupConnection(refs, createCallbacks())
  await setupConnection(conn, false)
  await new Promise(resolve => setTimeout(resolve, 250))

  const connectionStateListener = listeners.find(entry => entry.type === 'connectionstatechange')
  assert.ok(connectionStateListener, 'app must watch transport state, not only ICE state')

  peerConnection.connectionState = 'failed'
  connectionStateListener.handler()

  assert.equal(closeCalls, 1, 'failed transport must close the connection')
  assert.equal(refs.connectionsRef.current.has(conn.peer), false, 'failed connection must be dropped from state')
  assert.deepEqual(reconnects, [true], 'failed transport must reach the reconnect path on its own')
})

test('createSetupConnection drops state and reconnects when the peer connection closes', async () => {
  const { createSetupConnection } = await import('../lib/transfer-connection.ts')

  const refs = createRefs()
  const reconnects = []
  refs.attemptReconnectRef.current = () => {
    reconnects.push(true)
  }

  const handlers = new Map()
  const conn = {
    open: true,
    peer: 'peer-closed',
    destroyed: false,
    peerConnection: {
      connectionState: 'connected',
      iceConnectionState: 'connected',
      restartIce() {},
      addEventListener() {},
    },
    send() {},
    on(event, handler) { handlers.set(event, handler) },
    close() {},
  }

  refs.connectionsRef.current.set(conn.peer, conn)

  const setupConnection = createSetupConnection(refs, createCallbacks())
  await setupConnection(conn, false)

  handlers.get('close')?.()

  assert.equal(refs.connectionsRef.current.has(conn.peer), false)
  assert.deepEqual(reconnects, [true])
})

test('createSetupConnection keeps retrying when an outgoing reconnect attempt times out', async () => {
  const { createSetupConnection } = await import('../lib/transfer-connection.ts')

  const refs = createRefs()
  const reconnects = []
  refs.attemptReconnectRef.current = () => {
    reconnects.push(true)
  }

  const handlers = new Map()
  let closeCalls = 0
  const conn = {
    open: true,
    peer: 'peer-timeout',
    destroyed: false,
    peerConnection: {
      connectionState: 'connecting',
      iceConnectionState: 'checking',
      restartIce() {},
      addEventListener() {},
    },
    send() {},
    on(event, handler) { handlers.set(event, handler) },
    close() { closeCalls += 1 },
  }
  refs.connectionsRef.current.set(conn.peer, conn)

  const timers = installTimerSpy()
  try {
    await createSetupConnection(refs, createCallbacks(), { reconnectAttempt: true })(conn, true)

    conn.open = false
    assert.equal(timers.runByDelay(20000), true, 'reconnect attempts must arm the shorter connect timeout')

    assert.equal(closeCalls, 1)
    assert.equal(refs.connectionsRef.current.has(conn.peer), false)
    assert.deepEqual(reconnects, [true], 'a timed out reconnect attempt must schedule the next one')
  }
  finally {
    timers.restore()
  }
})

test('createSetupConnection reports the network hint when the first connect times out', async () => {
  const { createSetupConnection } = await import('../lib/transfer-connection.ts')

  const refs = createRefs()
  const reconnects = []
  refs.attemptReconnectRef.current = () => {
    reconnects.push(true)
  }

  const messages = []
  const callbacks = createCallbacks({
    setError(message) {
      messages.push(message)
    },
  })

  const conn = {
    open: true,
    peer: 'peer-timeout-initial',
    destroyed: false,
    peerConnection: {
      connectionState: 'connecting',
      iceConnectionState: 'checking',
      restartIce() {},
      addEventListener() {},
    },
    send() {},
    on() {},
    close() {},
  }

  const timers = installTimerSpy()
  try {
    await createSetupConnection(refs, callbacks)(conn, true)

    conn.open = false
    assert.equal(timers.runByDelay(20000), false, 'a first connect must not use the reconnect timeout')
    timers.runByDelay(40000)

    assert.match(String(messages.at(-1)), /连接超时/)
    assert.deepEqual(reconnects, [], 'a first connect failure keeps the manual retry flow')
  }
  finally {
    timers.restore()
  }
})

test('createAttemptReconnect keeps retrying after the fast attempt budget is exhausted', async () => {
  const { createAttemptReconnect } = await import('../lib/transfer-connection.ts')

  const statuses = []
  const errorMessages = []
  const connectedPeers = []
  const refs = createRefs({
    reconnectAttemptsRef: createMockRef(MAX_RECONNECT_ATTEMPTS + 3),
    peerRef: createMockRef({
      destroyed: false,
      disconnected: false,
      connect(peerId) {
        connectedPeers.push(peerId)
        return { peer: peerId, open: false }
      },
    }),
  })
  const callbacks = createCallbacks({
    setConnectionStatus(status) { statuses.push(status) },
    setErrorMessage(message) { errorMessages.push(message) },
  })

  const attemptReconnect = createAttemptReconnect(refs, callbacks, 'ABC123', 'reconnecting', false)
  const timers = installTimerSpy()

  try {
    attemptReconnect()

    assert.notEqual(statuses.at(-1), 'error', 'exhausted fast budget must not stop reconnecting')
    assert.ok(refs.reconnectTimeoutRef.current, 'a retry must still be scheduled')

    timers.runNext()
    assert.deepEqual(connectedPeers, ['snapdrop-room-ABC123'])
  }
  finally {
    timers.restore()
  }
})

test('createAttemptReconnect defers while reconnects are suppressed', async () => {
  const { createAttemptReconnect } = await import('../lib/transfer-connection.ts')

  const refs = createRefs({
    suppressReconnectUntilRef: createMockRef(Date.now() + 60_000),
  })

  createAttemptReconnect(refs, createCallbacks(), 'ABC123', 'connected', true)()

  assert.equal(refs.pendingReconnectRef.current, true)
  assert.equal(refs.reconnectTimeoutRef.current, null)
  assert.equal(refs.reconnectAttemptsRef.current, 0)
})

test('createAttemptReconnect defers while the document is hidden', async () => {
  const { createAttemptReconnect } = await import('../lib/transfer-connection.ts')

  const statuses = []
  const refs = createRefs()
  const callbacks = createCallbacks({
    setConnectionStatus(status) { statuses.push(status) },
  })

  const originalDocument = globalThis.document
  globalThis.document = { visibilityState: 'hidden' }

  try {
    createAttemptReconnect(refs, callbacks, 'ABC123', 'connected', true)()

    assert.equal(refs.pendingReconnectRef.current, true)
    assert.equal(refs.reconnectTimeoutRef.current, null)
    assert.deepEqual(statuses, [])
  }
  finally {
    if (originalDocument === undefined)
      delete globalThis.document
    else
      globalThis.document = originalDocument
  }
})

test('createSetupConnection tears down and reconnects a connection that stays silent while open', async () => {
  const { createSetupConnection } = await import('../lib/transfer-connection.ts')
  const { STALE_CONNECTION_CHECK_INTERVAL_MS, STALE_CONNECTION_UNHEALTHY_LIMIT } = await import('../lib/connection-quality.ts')

  const refs = createRefs()
  const reconnects = []
  refs.attemptReconnectRef.current = () => {
    reconnects.push(true)
  }
  // 對端已完全停止送出任何資料:conn 仍為 open,雙方都不會收到 close。
  const callbacks = createCallbacks({ isPeerHealthy: () => false })

  const handlers = new Map()
  let closeCalls = 0
  const conn = {
    open: true,
    peer: 'peer-silent',
    destroyed: false,
    peerConnection: {
      connectionState: 'connected',
      iceConnectionState: 'connected',
      restartIce() {},
      addEventListener() {},
    },
    send() {},
    on(event, handler) { handlers.set(event, handler) },
    close() { closeCalls += 1 },
  }
  refs.connectionsRef.current.set(conn.peer, conn)

  const timers = installTimerSpy()
  try {
    await createSetupConnection(refs, callbacks)(conn, false)

    const first = timers.tickInterval(STALE_CONNECTION_CHECK_INTERVAL_MS)
    assert.equal(first, 1, 'an open connection must be watched for silence')
    assert.equal(closeCalls, 0, '一次沒心跳還不足以判定連線已死')
    assert.equal(refs.connectionsRef.current.has(conn.peer), true)

    for (let i = 1; i < STALE_CONNECTION_UNHEALTHY_LIMIT; i++) {
      timers.tickInterval(STALE_CONNECTION_CHECK_INTERVAL_MS)
    }

    assert.equal(closeCalls, 1, 'silent connections must be closed so the session can be rebuilt')
    assert.equal(refs.connectionsRef.current.has(conn.peer), false, 'silent connections must be dropped from state')
    assert.deepEqual(reconnects, [true], 'the silent connection must reach the reconnect path')
  }
  finally {
    timers.restore()
  }
})

test('createSetupConnection keeps a connection that still receives heartbeats', async () => {
  const { createSetupConnection } = await import('../lib/transfer-connection.ts')
  const { STALE_CONNECTION_CHECK_INTERVAL_MS } = await import('../lib/connection-quality.ts')

  const refs = createRefs()
  const reconnects = []
  refs.attemptReconnectRef.current = () => {
    reconnects.push(true)
  }
  const callbacks = createCallbacks({ isPeerHealthy: () => true })

  let closeCalls = 0
  const conn = {
    open: true,
    peer: 'peer-chatty',
    destroyed: false,
    peerConnection: {
      connectionState: 'connected',
      iceConnectionState: 'connected',
      restartIce() {},
      addEventListener() {},
    },
    send() {},
    on() {},
    close() { closeCalls += 1 },
  }
  refs.connectionsRef.current.set(conn.peer, conn)

  const timers = installTimerSpy()
  try {
    await createSetupConnection(refs, callbacks)(conn, false)
    for (let i = 0; i < 6; i++) {
      timers.tickInterval(STALE_CONNECTION_CHECK_INTERVAL_MS)
    }

    assert.equal(closeCalls, 0, '連線仍有心跳時不得被拆掉')
    assert.deepEqual(reconnects, [])
  }
  finally {
    timers.restore()
  }
})
