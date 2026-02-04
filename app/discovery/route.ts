import { NextRequest, NextResponse } from "next/server"

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

const DISCOVERY_TTL_MS = 25 * 1000
const discoveryStorage = new Map<string, DiscoveryEntry>()

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

function cleanupStorage(now: number) {
  for (const [key, entry] of discoveryStorage.entries()) {
    if (now - entry.lastSeen > DISCOVERY_TTL_MS) {
      discoveryStorage.delete(key)
    }
  }
}

export async function POST(request: NextRequest) {
  const now = Date.now()
  cleanupStorage(now)

  const ip = getClientIp(request)
  if (!ip) {
    return NextResponse.json({ ok: false }, { status: 400 })
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
    return NextResponse.json({ ok: false }, { status: 400 })
  }

  const ipGroup = getIpGroup(ip)
  const entryKey = `${ipGroup}:${body.deviceId}`

  if (body.action === "unregister") {
    discoveryStorage.delete(entryKey)
    return NextResponse.json({ ok: true })
  }

  if (!body.peerId || !body.name) {
    return NextResponse.json({ ok: false }, { status: 400 })
  }

  discoveryStorage.set(entryKey, {
    deviceId: body.deviceId,
    name: body.name,
    peerId: body.peerId,
    roomCode: body.roomCode ?? "",
    isHost: Boolean(body.isHost),
    deviceType: body.deviceType ?? "unknown",
    lastSeen: now,
    ipGroup,
  })

  return NextResponse.json({ ok: true })
}

export async function GET(request: NextRequest) {
  const now = Date.now()
  cleanupStorage(now)

  const ip = getClientIp(request)
  if (!ip) {
    return NextResponse.json({ devices: [] })
  }

  const ipGroup = getIpGroup(ip)
  const { searchParams } = new URL(request.url)
  const deviceId = searchParams.get("deviceId")

  const devices = Array.from(discoveryStorage.values())
    .filter((entry) => entry.ipGroup === ipGroup)
    .filter((entry) => entry.peerId)
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

  return NextResponse.json({ devices })
}
