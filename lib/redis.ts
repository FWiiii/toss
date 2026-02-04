import { createClient } from "redis"

const REDIS_URL = process.env.REDIS_URL

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
    globalThis.__tossRedisClient = createClient({ url: REDIS_URL })
  }

  if (!globalThis.__tossRedisConnecting) {
    globalThis.__tossRedisConnecting = globalThis.__tossRedisClient
      .connect()
      .then(() => globalThis.__tossRedisClient as RedisClient)
      .catch((error) => {
        globalThis.__tossRedisConnecting = undefined
        throw error
      })
  }

  return globalThis.__tossRedisConnecting
}
