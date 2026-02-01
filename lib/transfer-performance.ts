/**
 * 性能监控模块
 * 处理加密性能数据的收集和聚合
 */

import type { EncryptionPerformance } from "./types"
import { SessionEncryptor } from "./crypto"

export function createPerformanceMonitoring(
  encryptorsRef: React.MutableRefObject<Map<string, SessionEncryptor>>
) {
  const getEncryptionPerformance = (): EncryptionPerformance | null => {
    if (encryptorsRef.current.size === 0) {
      return null
    }

    // 聚合所有连接的加密性能数据
    let totalEncryptTime = 0
    let totalDecryptTime = 0
    let totalEncryptThroughput = 0
    let totalDecryptThroughput = 0
    let totalEncrypted = 0
    let totalDecrypted = 0
    let totalChunks = 0
    let encryptorCount = 0

    encryptorsRef.current.forEach((encryptor) => {
      const stats = encryptor.getPerformanceStats()
      if (stats.chunkCount > 0) {
        totalEncryptTime += stats.encryptTime
        totalDecryptTime += stats.decryptTime
        totalEncryptThroughput += stats.encryptThroughput
        totalDecryptThroughput += stats.decryptThroughput
        totalEncrypted += stats.totalEncrypted
        totalDecrypted += stats.totalDecrypted
        totalChunks += stats.chunkCount
        encryptorCount++
      }
    })

    if (encryptorCount === 0) {
      return null
    }

    return {
      encryptTime: totalEncryptTime / encryptorCount,
      decryptTime: totalDecryptTime / encryptorCount,
      encryptThroughput: totalEncryptThroughput / encryptorCount,
      decryptThroughput: totalDecryptThroughput / encryptorCount,
      totalEncrypted,
      totalDecrypted,
      chunkCount: totalChunks,
    }
  }

  return { getEncryptionPerformance }
}
