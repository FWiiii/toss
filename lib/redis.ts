import { createClient } from "redis"

const REDIS_URL = process.env.REDIS_URL
const CONNECT_TIMEOUT_MS = 5000

type RedisClient = ReturnType<typeof createClient>

declare global {
  // eslint-disable-next-line no-var
  var __tossRedisClient: RedisClient | undefined
  // eslint-disable-next-line no-var
  var __tossRedisConnecting: Promise<RedisClient> | undefined
}

export async function getRedisClient() {
  if (!REDIS_URL) {
    throw new Error("REDIS_URL is not configured")
  }

  if (globalThis.__tossRedisClient?.isOpen) {
    return globalThis.__tossRedisClient
  }

  if (!globalThis.__tossRedisClient) {
    const url = REDIS_URL
    const useTls = url.startsWith("rediss://")
    globalThis.__tossRedisClient = createClient({
      url,
      socket: {
        connectTimeout: CONNECT_TIMEOUT_MS,
        tls: useTls,
      },
    })
  }

  if (!globalThis.__tossRedisConnecting) {
    const client = globalThis.__tossRedisClient
    globalThis.__tossRedisConnecting = Promise.race([
      client.connect().then(() => client as RedisClient),
      new Promise<RedisClient>((_, reject) => {
        setTimeout(() => reject(new Error("Redis connection timeout")), CONNECT_TIMEOUT_MS)
      }),
    ]).catch((error) => {
      globalThis.__tossRedisConnecting = undefined
      throw error
    })
  }

  return globalThis.__tossRedisConnecting
}
