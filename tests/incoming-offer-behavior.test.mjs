/* eslint-disable test/no-import-node-test */

import assert from 'node:assert/strict'
import test from 'node:test'

function createMockRef(current) {
  return { current }
}

function waitForQueue() {
  return new Promise(resolve => setTimeout(resolve, 0))
}

function createConnectionAttemptRegistryMock() {
  return {
    begin() { return true },
    complete() {},
    fail() {},
    isConnecting() { return false },
    clear() {},
  }
}

function createConnectionHarness() {
  const handlers = new Map()
  const sentPayloads = []
  const queuedOffers = []
  const addedItems = []

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
    shouldReconnectRef: createMockRef(false),
    suppressReconnectUntilRef: createMockRef(0),
    pendingReconnectRef: createMockRef(false),
    peerRef: createMockRef(null),
    connectingPeersRef: createMockRef(createConnectionAttemptRegistryMock()),
    setupConnectionRef: createMockRef(null),
    attemptReconnectRef: createMockRef(null),
    joinRoomRef: createMockRef(null),
    cancelledTransfersRef: createMockRef(new Set()),
  }

  const callbacks = {
    setError() {},
    setConnectionStatus() {},
    setConnectionInfo() {},
    setErrorMessage() {},
    setIsEncrypted() {},
    setPeerCount() {},
    updatePeerCount() {},
    addSystemMessage() {},
    addItem() {},
    addItemWithId(item) {
      addedItems.push(item)
      return `local-${addedItems.length}`
    },
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
    queueIncomingFileOffer(offer) {
      queuedOffers.push(offer)
    },
    rememberTrustedPeer() {},
  }

  const conn = {
    open: true,
    peer: 'peer-1',
    peerConnection: { connectionState: 'disconnected', iceConnectionState: 'connected' },
    metadata: null,
    send(payload) {
      sentPayloads.push(payload)
    },
    on(event, handler) {
      handlers.set(event, handler)
    },
  }

  refs.connectionsRef.current.set(conn.peer, conn)

  return {
    addedItems,
    callbacks,
    conn,
    handlers,
    queuedOffers,
    refs,
    sentPayloads,
  }
}

test('createSetupConnection rejects file-start payloads that bypass approval', async () => {
  const { createSetupConnection } = await import('../lib/transfer-connection.ts')
  const harness = createConnectionHarness()

  const setupConnection = createSetupConnection(harness.refs, harness.callbacks, null)
  await setupConnection(harness.conn, false)

  harness.handlers.get('data')?.({
    type: 'file-start',
    itemId: 'offer-1',
    name: 'notes.txt',
    fileType: 'text/plain',
    size: 12,
    offset: 0,
    resume: false,
  })

  await waitForQueue()
  await waitForQueue()

  assert.deepEqual(harness.sentPayloads, [{
    type: 'file-offer-response',
    offerId: 'offer-1',
    accepted: false,
  }])
  assert.equal(harness.addedItems.length, 0)
})

test('createSetupConnection keeps trusted executable offers pending when risk comes from declared summary', async () => {
  const { createSetupConnection } = await import('../lib/transfer-connection.ts')
  const harness = createConnectionHarness()

  harness.refs.peerDevicesRef.current.set('peer-1', {
    deviceId: 'trusted-device',
    deviceName: 'Trusted Mac',
  })
  harness.refs.trustedDevicesRef.current.set('trusted-device', {
    deviceId: 'trusted-device',
    deviceName: 'Trusted Mac',
    trustedAt: Date.now(),
  })

  const setupConnection = createSetupConnection(harness.refs, harness.callbacks, null)
  await setupConnection(harness.conn, false)

  harness.handlers.get('data')?.({
    type: 'file-offer',
    offerId: 'offer-2',
    name: 'photo-1.jpg',
    fileType: 'image/jpeg',
    size: 12,
    summary: {
      fileCount: 4,
      totalSize: 24,
      sampleFiles: [
        { name: 'photo-1.jpg', size: 12, type: 'image/jpeg' },
        { name: 'photo-2.jpg', size: 6, type: 'image/jpeg' },
        { name: 'photo-3.jpg', size: 6, type: 'image/jpeg' },
      ],
      riskFlags: ['executable'],
      requiresSecondaryConfirmation: true,
      executableFileName: 'installer.dmg',
    },
  })

  await waitForQueue()
  await waitForQueue()

  assert.equal(harness.sentPayloads.length, 0)
  assert.equal(harness.queuedOffers.length, 1)
  assert.equal(harness.queuedOffers[0].summary.requiresSecondaryConfirmation, true)
  assert.equal(harness.queuedOffers[0].summary.executableFileName, 'installer.dmg')
})

test('processIncomingFileOfferResponse sends only one response for concurrent decisions', async () => {
  const { processIncomingFileOfferResponse } = await import('../lib/transfer-context.tsx')

  const pendingIncomingFileOffers = new Map([
    ['offer-1', {
      offerId: 'offer-1',
      peerId: 'peer-1',
      deviceId: 'device-1',
      deviceName: 'Trusted Mac',
      fileName: 'installer.dmg',
      fileType: 'application/x-apple-diskimage',
      size: 12,
      fingerprint: null,
      requestedAt: Date.now(),
      summary: {
        fileCount: 1,
        totalSize: 12,
        sampleFiles: [{ name: 'installer.dmg', size: 12, type: 'application/x-apple-diskimage' }],
        riskFlags: ['executable'],
        requiresSecondaryConfirmation: true,
        executableFileName: 'installer.dmg',
      },
    }],
  ])
  const approvedIncomingFileOffers = new Map()
  const acceptedIncomingFileOffers = new Map()
  const respondingIncomingFileOffers = new Set()
  const sentPayloads = []
  const messages = []
  const trustedPeers = []

  const run = () => processIncomingFileOfferResponse({
    offerId: 'offer-1',
    accepted: true,
    trustDevice: true,
    secondaryConfirmed: true,
    pendingIncomingFileOffers,
    acceptedIncomingFileOffers,
    approvedIncomingFileOffers,
    respondingIncomingFileOffers,
    sendControlToPeer: async (peerId, payload) => {
      sentPayloads.push({ peerId, payload })
      await waitForQueue()
      return true
    },
    rememberTrustedPeer: (deviceInfo) => {
      trustedPeers.push(deviceInfo)
    },
    enqueueSystemMessage: (message) => {
      messages.push(message)
    },
    removeIncomingOffer: (offerId) => {
      pendingIncomingFileOffers.delete(offerId)
    },
  })

  await Promise.all([run(), run()])

  assert.equal(sentPayloads.length, 1)
  assert.equal(approvedIncomingFileOffers.get('offer-1'), 'peer-1')
  assert.equal(acceptedIncomingFileOffers.get('offer-1')?.deviceName, 'Trusted Mac')
  assert.equal(trustedPeers.length, 1)
  assert.ok(messages.some(message => message.includes('已接受来自 Trusted Mac')))
})

test('processIncomingFileOfferResponse records rejected receive history without blocking rejection', async () => {
  const { processIncomingFileOfferResponse } = await import('../lib/transfer-context.tsx')

  const pendingIncomingFileOffers = new Map([
    ['offer-2', {
      offerId: 'offer-2',
      peerId: 'peer-2',
      deviceId: 'device-2',
      deviceName: 'Alice Mac',
      fileName: 'photo.jpg',
      fileType: 'image/jpeg',
      size: 24,
      fingerprint: null,
      requestedAt: Date.now(),
      summary: {
        fileCount: 1,
        totalSize: 24,
        sampleFiles: [{ name: 'photo.jpg', size: 24, type: 'image/jpeg' }],
        riskFlags: [],
        requiresSecondaryConfirmation: false,
        executableFileName: null,
      },
    }],
  ])
  const acceptedIncomingFileOffers = new Map()
  const approvedIncomingFileOffers = new Map()
  const respondingIncomingFileOffers = new Set()
  const sentPayloads = []
  const historyWrites = []

  await processIncomingFileOfferResponse({
    offerId: 'offer-2',
    accepted: false,
    pendingIncomingFileOffers,
    acceptedIncomingFileOffers,
    approvedIncomingFileOffers,
    respondingIncomingFileOffers,
    sendControlToPeer: async (peerId, payload) => {
      sentPayloads.push({ peerId, payload })
      return true
    },
    rememberTrustedPeer() {},
    enqueueSystemMessage() {},
    removeIncomingOffer: (offerId) => {
      pendingIncomingFileOffers.delete(offerId)
    },
    recordReceiveHistory: (entry) => {
      historyWrites.push(entry)
    },
  })

  assert.equal(sentPayloads.length, 1)
  assert.equal(historyWrites.length, 1)
  assert.equal(historyWrites[0].outcome, 'rejected')
  assert.equal(historyWrites[0].offer.deviceName, 'Alice Mac')
})
