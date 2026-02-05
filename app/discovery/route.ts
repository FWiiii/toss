import { NextRequest, NextResponse } from "next/server"
import { getRedisClient } from "@/lib/redis"

export const dynamic = "force-dynamic"
export const revalidate = 0
export const runtime = "nodejs"

type DeviceType = "mobile" | "desktop" | "tablet" | "unknown"

type DiscoveryEntry = {
  deviceId: string
  name: string
  peerId: string
  roomCode: string
  isHost: boolean
  deviceType: DeviceType
  lastSeen: number
  ipGroup: string
}

const DISCOVERY_TTL_SEC = 25
const GROUP_TTL_SEC = 90
const REDIS_PREFIX = "toss:discovery"
const REDIS_TIMEOUT_MS = 4000

function jsonNoStore(data: unknown, init?: Parameters<typeof NextResponse.json>[1]) {
  const response = NextResponse.json(data, init)
  response.headers.set("Cache-Control", "no-store")
  return response
}

async function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: NodeJS.Timeout
  const timeout = new Promise<T>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timeout`)), ms)
  })

  try {
    return await Promise.race([promise, timeout])
  } finally {
    clearTimeout(timer!)
  }
}

function normalizeIp(raw: string): string | null {
  let ip = raw.trim()
  if (!ip) return null

  if (ip.startsWith("for=")) {
    ip = ip.slice(4)
  }

  if (ip.startsWith("\"") && ip.endsWith("\"")) {
    ip = ip.slice(1, -1)
  }

  if (ip.startsWith("[")) {
    const end = ip.indexOf("]")
    if (end > 0) {
      ip = ip.slice(1, end)
    }
  }

  if (ip.includes("%")) {
    ip = ip.split("%")[0]
  }

  const ipv4PortMatch = ip.match(/^(\d{1,3}(?:\.\d{1,3}){3}):\d+$/)
  if (ipv4PortMatch) {
    ip = ipv4PortMatch[1]
  }

  return ip || null
}

function parseForwardedFor(value: string | null): string[] {
  if (!value) return []
  return value
    .split(",")
    .map((entry) => normalizeIp(entry))
    .filter((entry): entry is string => Boolean(entry))
}

function parseForwardedHeader(value: string | null): string[] {
  if (!value) return []
  const entries = value.split(";").map((entry) => entry.trim())
  const ips: string[] = []
  entries.forEach((entry) => {
    if (entry.startsWith("for=")) {
      const ip = normalizeIp(entry)
      if (ip) ips.push(ip)
    }
  })
  return ips
}

function getClientIps(request: NextRequest): string[] {
  const ips = new Set<string>()

  parseForwardedFor(request.headers.get("x-forwarded-for")).forEach((ip) => ips.add(ip))
  parseForwardedHeader(request.headers.get("forwarded")).forEach((ip) => ips.add(ip))

  const headerCandidates = [
    request.headers.get("x-real-ip"),
    request.headers.get("cf-connecting-ip"),
    request.headers.get("x-client-ip"),
  ]

  headerCandidates.forEach((value) => {
    if (!value) return
    const ip = normalizeIp(value)
    if (ip) ips.add(ip)
  })

  const reqIp = (request as unknown as { ip?: string }).ip
  if (reqIp) {
    const ip = normalizeIp(reqIp)
    if (ip) ips.add(ip)
  }

  const host = request.headers.get("host") || ""
  if (
    host.includes("localhost") ||
    host.startsWith("127.0.0.1") ||
    host.startsWith("[::1]")
  ) {
    ips.add("127.0.0.1")
  }

  return Array.from(ips)
}

function getIpGroup(ip: string): string {
  if (ip.includes(".")) {
    const parts = ip.split(".")
    if (parts.length === 4) {
      return `${parts[0]}.${parts[1]}.${parts[2]}.0/24`
    }
  }
  if (ip.includes(":")) {
    const parts = ip.split(":").filter(Boolean)
    return `${parts.slice(0, 4).join(":")}::/64`
  }
  return ip
}

function deviceKey(ipGroup: string, deviceId: string) {
  return `${REDIS_PREFIX}:device:${ipGroup}:${deviceId}`
}

function groupKey(ipGroup: string) {
  return `${REDIS_PREFIX}:group:${ipGroup}`
}

function uniqueGroups(ips: string[]) {
  return Array.from(new Set(ips.map(getIpGroup)))
}

export async function POST(request: NextRequest) {
  const now = Date.now()

  const ips = getClientIps(request)
  const ipGroups = uniqueGroups(ips)
  if (ipGroups.length === 0) {
    return jsonNoStore({ ok: false }, { status: 400 })
  }

  const { searchParams } = new URL(request.url)
  const debug = searchParams.get("debug") === "1"
  if (searchParams.get("health") === "1") {
    return jsonNoStore({ ok: true, now })
  }

  let body: {
    deviceId?: string
    name?: string
    peerId?: string
    roomCode?: string
    isHost?: boolean
    deviceType?: DeviceType
    action?: "unregister"
  } | null = null

  try {
    const text = await withTimeout(request.text(), 2000, "body")
    body = text ? (JSON.parse(text) as typeof body) : null
  } catch (error) {
    if (debug) {
      return jsonNoStore(
        {
          ok: false,
          error: error instanceof Error ? error.message : "body parse error",
          now,
        },
        { status: 400 }
      )
    }
    body = null
  }

  if (!body?.deviceId) {
    return jsonNoStore({ ok: false }, { status: 400 })
  }

  const entryKeys = ipGroups.map((group) => deviceKey(group, body.deviceId))
  const groupKeys = ipGroups.map((group) => groupKey(group))

  if (body.action === "unregister") {
    try {
      const client = await withTimeout(getRedisClient(), REDIS_TIMEOUT_MS, "redis-connect")
      const pipeline = client.multi()
      entryKeys.forEach((key) => pipeline.del(key))
      groupKeys.forEach((key) => pipeline.sRem(key, body.deviceId))
      await withTimeout(pipeline.exec(), REDIS_TIMEOUT_MS, "redis-exec")
    } catch {
      // Ignore cleanup errors
    }
    return jsonNoStore({ ok: true })
  }

  if (!body.peerId || !body.name) {
    return jsonNoStore({ ok: false }, { status: 400 })
  }

  const entryBase: Omit<DiscoveryEntry, "ipGroup"> = {
    deviceId: body.deviceId,
    name: body.name,
    peerId: body.peerId,
    roomCode: body.roomCode ?? "",
    isHost: Boolean(body.isHost),
    deviceType: body.deviceType ?? "unknown",
    lastSeen: now,
  }

  try {
    const client = await withTimeout(getRedisClient(), REDIS_TIMEOUT_MS, "redis-connect")
    const pipeline = client.multi()
    ipGroups.forEach((group) => {
      const payload = JSON.stringify({ ...entryBase, ipGroup: group })
      pipeline.set(deviceKey(group, body.deviceId), payload, { EX: DISCOVERY_TTL_SEC })
      pipeline.sAdd(groupKey(group), body.deviceId)
      pipeline.expire(groupKey(group), GROUP_TTL_SEC)
    })
    await withTimeout(pipeline.exec(), REDIS_TIMEOUT_MS, "redis-exec")
  } catch (error) {
    if (debug) {
      return jsonNoStore(
        {
          ok: false,
          error: error instanceof Error ? error.message : "redis error",
          now,
          ipGroups,
        },
        { status: 500 }
      )
    }
    return jsonNoStore({ ok: false }, { status: 500 })
  }

  return jsonNoStore({ ok: true })
}

export async function GET(request: NextRequest) {
  const now = Date.now()

  const ips = getClientIps(request)
  const ipGroups = uniqueGroups(ips)
  if (ipGroups.length === 0) {
    return jsonNoStore({ devices: [] })
  }

  const { searchParams } = new URL(request.url)
  const deviceId = searchParams.get("deviceId")
  const debug = searchParams.get("debug") === "1"
  if (searchParams.get("health") === "1") {
    return jsonNoStore({ ok: true, now })
  }

  const devicesById = new Map<string, DiscoveryEntry>()
  const groupSizes: Record<string, number> = {}

  try {
    const client = await withTimeout(getRedisClient(), REDIS_TIMEOUT_MS, "redis-connect")
    for (const group of ipGroups) {
      const groupRedisKey = groupKey(group)
      const ids = await withTimeout(client.sMembers(groupRedisKey), REDIS_TIMEOUT_MS, "redis-smembers")
      groupSizes[group] = ids.length
      if (ids.length === 0) {
        continue
      }

      const keys = ids.map((id) => deviceKey(group, id))
      const values = await withTimeout(client.mGet(keys), REDIS_TIMEOUT_MS, "redis-mget")
      const staleIds: string[] = []

      values.forEach((value, index) => {
        if (!value) {
          staleIds.push(ids[index])
          return
        }
        try {
          const entry = JSON.parse(value) as DiscoveryEntry
          if (!entry.peerId) return

          const existing = devicesById.get(entry.deviceId)
          if (!existing || existing.lastSeen < entry.lastSeen) {
            devicesById.set(entry.deviceId, entry)
          }
        } catch {
          staleIds.push(ids[index])
        }
      })

      if (staleIds.length > 0) {
        await withTimeout(client.sRem(groupRedisKey, ...staleIds), REDIS_TIMEOUT_MS, "redis-srem")
      }
    }
  } catch (error) {
    if (debug) {
      return jsonNoStore(
        {
          devices: [],
          debug: {
            ipCandidates: ips,
            ipGroups,
            groupSizes,
            deviceId,
            now,
            error: error instanceof Error ? error.message : "redis error",
          },
        },
        { status: 500 }
      )
    }
    return jsonNoStore({ devices: [] })
  }

  const payload = Array.from(devicesById.values())
    .filter((entry) => (deviceId ? entry.deviceId !== deviceId : true))
    .sort((a, b) => b.lastSeen - a.lastSeen)
    .map((entry) => ({
      deviceId: entry.deviceId,
      name: entry.name,
      peerId: entry.peerId,
      roomCode: entry.roomCode || "",
      isHost: entry.isHost,
      deviceType: entry.deviceType,
      lastSeen: entry.lastSeen,
    }))

  if (debug) {
    return jsonNoStore({
      devices: payload,
      debug: {
        ipCandidates: ips,
        ipGroups,
        groupSizes,
        deviceId,
        now,
      },
    })
  }

  return jsonNoStore({ devices: payload })
}
