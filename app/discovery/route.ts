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

function jsonNoStore(data: unknown, init?: Parameters<typeof NextResponse.json>[1]) {
  const response = NextResponse.json(data, init)
  response.headers.set("Cache-Control", "no-store")
  return response
}

function getClientIp(request: NextRequest): string | null {
  const forwarded = request.headers.get("x-forwarded-for")
  if (forwarded) {
    const ip = forwarded.split(",")[0]?.trim()
    if (ip) return ip
  }
  const realIp = request.headers.get("x-real-ip")
  if (realIp) return realIp

  const reqIp = (request as unknown as { ip?: string }).ip
  if (reqIp) return reqIp

  const host = request.headers.get("host") || ""
  if (
    host.includes("localhost") ||
    host.startsWith("127.0.0.1") ||
    host.startsWith("[::1]")
  ) {
    return "127.0.0.1"
  }

  return null
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

export async function POST(request: NextRequest) {
  const now = Date.now()

  const ip = getClientIp(request)
  if (!ip) {
    return jsonNoStore({ ok: false }, { status: 400 })
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
    body = await request.json()
  } catch {
    body = null
  }

  if (!body?.deviceId) {
    return jsonNoStore({ ok: false }, { status: 400 })
  }

  const ipGroup = getIpGroup(ip)
  const entryKey = deviceKey(ipGroup, body.deviceId)
  const group = groupKey(ipGroup)

  if (body.action === "unregister") {
    try {
      const client = await getRedisClient()
      await client.multi().del(entryKey).sRem(group, body.deviceId).exec()
    } catch {
      // Ignore cleanup errors
    }
    return jsonNoStore({ ok: true })
  }

  if (!body.peerId || !body.name) {
    return jsonNoStore({ ok: false }, { status: 400 })
  }

  const entry: DiscoveryEntry = {
    deviceId: body.deviceId,
    name: body.name,
    peerId: body.peerId,
    roomCode: body.roomCode ?? "",
    isHost: Boolean(body.isHost),
    deviceType: body.deviceType ?? "unknown",
    lastSeen: now,
    ipGroup,
  }

  try {
    const client = await getRedisClient()
    const payload = JSON.stringify(entry)
    await client
      .multi()
      .set(entryKey, payload, { EX: DISCOVERY_TTL_SEC })
      .sAdd(group, body.deviceId)
      .expire(group, GROUP_TTL_SEC)
      .exec()
  } catch {
    return jsonNoStore({ ok: false }, { status: 500 })
  }

  return jsonNoStore({ ok: true })
}

export async function GET(request: NextRequest) {
  const now = Date.now()

  const ip = getClientIp(request)
  if (!ip) {
    return jsonNoStore({ devices: [] })
  }

  const ipGroup = getIpGroup(ip)
  const { searchParams } = new URL(request.url)
  const deviceId = searchParams.get("deviceId")

  let devices: DiscoveryEntry[] = []

  try {
    const client = await getRedisClient()
    const group = groupKey(ipGroup)
    const ids = await client.sMembers(group)
    if (ids.length === 0) {
      return jsonNoStore({ devices: [] })
    }

    const keys = ids.map((id) => deviceKey(ipGroup, id))
    const values = await client.mGet(keys)
    const staleIds: string[] = []

    values.forEach((value, index) => {
      if (!value) {
        staleIds.push(ids[index])
        return
      }
      try {
        const entry = JSON.parse(value) as DiscoveryEntry
        if (entry.peerId) {
          devices.push(entry)
        }
      } catch {
        staleIds.push(ids[index])
      }
    })

    if (staleIds.length > 0) {
      await client.sRem(group, ...staleIds)
    }
  } catch {
    return jsonNoStore({ devices: [] })
  }

  const payload = devices
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

  return jsonNoStore({ devices: payload })
}
