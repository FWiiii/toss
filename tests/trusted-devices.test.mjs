/* eslint-disable test/no-import-node-test */

import assert from 'node:assert/strict'
import test from 'node:test'

function createStorage(initial = {}) {
  const store = new Map(Object.entries(initial))
  return {
    getItem(key) {
      return store.has(key) ? store.get(key) : null
    },
    setItem(key, value) {
      store.set(key, String(value))
    },
    removeItem(key) {
      store.delete(key)
    },
  }
}

test('loadOrCreateLocalDeviceProfile persists a stable local device identity', async () => {
  const { loadOrCreateLocalDeviceProfile } = await import('../lib/trusted-devices.ts')
  const storage = createStorage()

  const first = loadOrCreateLocalDeviceProfile({
    storage,
    now: 100,
    platformHint: 'Mac',
    randomUUID: () => 'device-1234',
  })
  const second = loadOrCreateLocalDeviceProfile({
    storage,
    now: 200,
    platformHint: 'Windows',
    randomUUID: () => 'device-9999',
  })

  assert.deepEqual(first, {
    deviceId: 'device-1234',
    deviceName: 'Mac 1234',
    createdAt: 100,
  })
  assert.deepEqual(second, first)
})

test('rememberTrustedDevice stores and refreshes trusted devices by id', async () => {
  const {
    getTrustedDevices,
    isTrustedDevice,
    rememberTrustedDevice,
  } = await import('../lib/trusted-devices.ts')
  const storage = createStorage()

  rememberTrustedDevice({
    storage,
    now: 100,
    device: {
      deviceId: 'peer-1',
      deviceName: 'Alice Phone',
    },
  })

  rememberTrustedDevice({
    storage,
    now: 250,
    device: {
      deviceId: 'peer-1',
      deviceName: 'Alice iPhone',
    },
  })

  assert.equal(isTrustedDevice('peer-1', storage), true)
  assert.equal(isTrustedDevice('peer-2', storage), false)
  assert.deepEqual(getTrustedDevices(storage), [
    {
      deviceId: 'peer-1',
      deviceName: 'Alice iPhone',
      trustedAt: 100,
      lastSeenAt: 250,
    },
  ])
})

test('updateLocalDeviceName persists a sanitized custom device name', async () => {
  const {
    loadOrCreateLocalDeviceProfile,
    updateLocalDeviceName,
  } = await import('../lib/trusted-devices.ts')
  const storage = createStorage()

  loadOrCreateLocalDeviceProfile({
    storage,
    now: 100,
    platformHint: 'Mac',
    randomUUID: () => 'device-1234',
  })

  const updated = updateLocalDeviceName({
    storage,
    deviceName: '  我的办公电脑  ',
  })

  assert.deepEqual(updated, {
    deviceId: 'device-1234',
    deviceName: '我的办公电脑',
    createdAt: 100,
  })
})

test('removeTrustedDevice deletes a remembered device without touching others', async () => {
  const {
    getTrustedDevices,
    rememberTrustedDevice,
    removeTrustedDevice,
  } = await import('../lib/trusted-devices.ts')
  const storage = createStorage()

  rememberTrustedDevice({
    storage,
    now: 100,
    device: {
      deviceId: 'peer-1',
      deviceName: 'Alice Phone',
    },
  })
  rememberTrustedDevice({
    storage,
    now: 150,
    device: {
      deviceId: 'peer-2',
      deviceName: 'Bob Tablet',
    },
  })

  const remaining = removeTrustedDevice({
    storage,
    deviceId: 'peer-1',
  })

  assert.deepEqual(remaining, [
    {
      deviceId: 'peer-2',
      deviceName: 'Bob Tablet',
      trustedAt: 150,
      lastSeenAt: 150,
    },
  ])
  assert.deepEqual(getTrustedDevices(storage), remaining)
})

test('loadOrCreateLocalDeviceProfile falls back to cryptographic randomness without randomUUID', async () => {
  const { loadOrCreateLocalDeviceProfile } = await import('../lib/trusted-devices.ts')

  const makeStorage = () => {
    const data = new Map()
    return {
      getItem: key => (data.has(key) ? data.get(key) : null),
      setItem: (key, value) => data.set(key, value),
    }
  }

  // 不传 randomUUID 时走 fallback：应为 16 字节 hex，而非 Math.random 的短串
  const profile = loadOrCreateLocalDeviceProfile({
    storage: makeStorage(),
    now: Date.now(),
    platformHint: 'Test',
  })
  assert.match(profile.deviceId, /^device-[0-9a-f]{32}$/)

  // 两次生成的 id 不应相同
  const another = loadOrCreateLocalDeviceProfile({
    storage: makeStorage(),
    now: Date.now(),
    platformHint: 'Test',
  })
  assert.notEqual(profile.deviceId, another.deviceId)
})
