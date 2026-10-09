export interface LocalDeviceProfile {
  deviceId: string
  deviceName: string
  createdAt: number
}

export interface TrustedDeviceRecord {
  deviceId: string
  deviceName: string
  trustedAt: number
  lastSeenAt: number
}

interface StorageLike {
  getItem: (key: string) => string | null
  setItem: (key: string, value: string) => void
  removeItem?: (key: string) => void
}

const LOCAL_DEVICE_PROFILE_KEY = 'toss-local-device-profile'
const TRUSTED_DEVICES_KEY = 'toss-trusted-devices'
const MAX_DEVICE_NAME_LENGTH = 64

function safeJsonParse<T>(value: string | null): T | null {
  if (!value) {
    return null
  }

  try {
    return JSON.parse(value) as T
  }
  catch {
    return null
  }
}

function clampDeviceName(deviceName: string) {
  const trimmed = deviceName.trim()
  if (!trimmed) {
    return 'Device'
  }
  return trimmed.slice(0, MAX_DEVICE_NAME_LENGTH)
}

function normalizePlatformHint(platformHint: string) {
  const trimmed = platformHint.trim()
  if (!trimmed) {
    return 'Device'
  }
  return trimmed.slice(0, 24)
}

function createFallbackDeviceId() {
  // 优先使用密码学安全随机数：deviceId 会被用于信任判定，Math.random 可预测
  const cryptoRef = globalThis.crypto
  if (cryptoRef?.getRandomValues) {
    const bytes = cryptoRef.getRandomValues(new Uint8Array(16))
    const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('')
    return `device-${hex}`
  }
  // 终极兜底（理论上到不了）：混入时间戳增加熵
  return `device-${Math.random().toString(16).slice(2)}${Date.now().toString(16)}`
}

export function createDefaultDeviceName(deviceId: string, platformHint: string) {
  return `${normalizePlatformHint(platformHint)} ${deviceId.slice(-4).toUpperCase()}`
}

export function getTrustedDevices(storage: StorageLike): TrustedDeviceRecord[] {
  const parsed = safeJsonParse<TrustedDeviceRecord[]>(storage.getItem(TRUSTED_DEVICES_KEY))
  if (!Array.isArray(parsed)) {
    return []
  }

  return parsed
    .filter(device => typeof device?.deviceId === 'string' && device.deviceId.length > 0)
    .map(device => ({
      deviceId: device.deviceId,
      deviceName: clampDeviceName(typeof device.deviceName === 'string' ? device.deviceName : 'Device'),
      trustedAt: Number.isFinite(device.trustedAt) ? device.trustedAt : 0,
      lastSeenAt: Number.isFinite(device.lastSeenAt) ? device.lastSeenAt : 0,
    }))
}

export function isTrustedDevice(deviceId: string, storage: StorageLike) {
  return getTrustedDevices(storage).some(device => device.deviceId === deviceId)
}

export function rememberTrustedDevice({
  storage,
  now,
  device,
}: {
  storage: StorageLike
  now: number
  device: {
    deviceId: string
    deviceName: string
  }
}) {
  const currentDevices = getTrustedDevices(storage)
  const existing = currentDevices.find(item => item.deviceId === device.deviceId)

  let nextDevices: TrustedDeviceRecord[]
  if (existing) {
    nextDevices = currentDevices.map(item => item.deviceId === device.deviceId
      ? {
          ...item,
          deviceName: clampDeviceName(device.deviceName),
          lastSeenAt: now,
        }
      : item)
  }
  else {
    nextDevices = [
      ...currentDevices,
      {
        deviceId: device.deviceId,
        deviceName: clampDeviceName(device.deviceName),
        trustedAt: now,
        lastSeenAt: now,
      },
    ]
  }

  storage.setItem(TRUSTED_DEVICES_KEY, JSON.stringify(nextDevices))
  return nextDevices
}

export function loadOrCreateLocalDeviceProfile({
  storage,
  now,
  platformHint,
  randomUUID,
}: {
  storage: StorageLike
  now: number
  platformHint: string
  randomUUID?: () => string
}): LocalDeviceProfile {
  const stored = safeJsonParse<LocalDeviceProfile>(storage.getItem(LOCAL_DEVICE_PROFILE_KEY))
  if (
    stored
    && typeof stored.deviceId === 'string'
    && stored.deviceId.length > 0
    && typeof stored.deviceName === 'string'
    && stored.deviceName.length > 0
  ) {
    return {
      deviceId: stored.deviceId,
      deviceName: clampDeviceName(stored.deviceName),
      createdAt: Number.isFinite(stored.createdAt) ? stored.createdAt : now,
    }
  }

  const deviceId = (randomUUID?.() || createFallbackDeviceId()).trim()
  const profile: LocalDeviceProfile = {
    deviceId,
    deviceName: createDefaultDeviceName(deviceId, platformHint),
    createdAt: now,
  }
  storage.setItem(LOCAL_DEVICE_PROFILE_KEY, JSON.stringify(profile))
  return profile
}

export function updateLocalDeviceName({
  storage,
  deviceName,
}: {
  storage: StorageLike
  deviceName: string
}): LocalDeviceProfile {
  const stored = safeJsonParse<LocalDeviceProfile>(storage.getItem(LOCAL_DEVICE_PROFILE_KEY))
  const createdAt = typeof stored?.createdAt === 'number' && Number.isFinite(stored.createdAt)
    ? stored.createdAt
    : Date.now()

  const nextProfile: LocalDeviceProfile = {
    deviceId: typeof stored?.deviceId === 'string' && stored.deviceId.length > 0
      ? stored.deviceId
      : createFallbackDeviceId(),
    deviceName: clampDeviceName(deviceName),
    createdAt,
  }

  storage.setItem(LOCAL_DEVICE_PROFILE_KEY, JSON.stringify(nextProfile))
  return nextProfile
}

export function removeTrustedDevice({
  storage,
  deviceId,
}: {
  storage: StorageLike
  deviceId: string
}) {
  const nextDevices = getTrustedDevices(storage).filter(device => device.deviceId !== deviceId)
  storage.setItem(TRUSTED_DEVICES_KEY, JSON.stringify(nextDevices))
  return nextDevices
}

export {
  LOCAL_DEVICE_PROFILE_KEY,
  TRUSTED_DEVICES_KEY,
}
