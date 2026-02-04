/**
 * 端到端加密工具模块
 * 使用 Web Crypto API 实现 ECDH 密钥交换和 AES-GCM 加密
 */

// 加密算法配置
const ECDH_ALGORITHM = {
  name: "ECDH",
  namedCurve: "P-256",
} as const

const AES_GCM_ALGORITHM = {
  name: "AES-GCM",
  length: 256,
} as const

const HKDF_ALGORITHM = {
  name: "HKDF",
  hash: "SHA-256",
} as const

/**
 * 加密密钥对
 */
export interface EncryptionKeyPair {
  publicKey: CryptoKey
  privateKey: CryptoKey
}

/**
 * 会话加密器 - 用于加密和解密数据
 */
export class SessionEncryptor {
  private sendKey: CryptoKey | null = null
  private recvKey: CryptoKey | null = null
  private sendIvCounter: number = 0
  
  // 性能监控
  private encryptTimes: number[] = []
  private decryptTimes: number[] = []
  private totalEncryptedBytes: number = 0
  private totalDecryptedBytes: number = 0
  private chunkCount: number = 0

  /**
   * 从共享密钥派生加密密钥
   * 注意：双方使用相同的密钥进行加密和解密（对称加密）
   */
  async deriveKeys(sharedSecret: ArrayBuffer, role: "initiator" | "responder"): Promise<void> {
    // 将共享密钥导入为原始密钥，用于 HKDF 派生
    const baseKey = await crypto.subtle.importKey(
      "raw",
      sharedSecret,
      {
        name: "HKDF",
      },
      false,
      ["deriveBits", "deriveKey"] // HKDF 密钥需要 deriveBits 和 deriveKey 权限
    )

    const derive = async (info: string) => {
      return await crypto.subtle.deriveKey(
        {
          name: "HKDF",
          hash: "SHA-256",
          salt: new Uint8Array(32), // 固定盐值（在实际应用中可以使用随机盐）
          info: new TextEncoder().encode(info),
        },
        baseKey,
        AES_GCM_ALGORITHM,
        false,
        ["encrypt", "decrypt"]
      )
    }

    const keyA = await derive("toss-key-a")
    const keyB = await derive("toss-key-b")

    if (role === "initiator") {
      this.sendKey = keyA
      this.recvKey = keyB
    } else {
      this.sendKey = keyB
      this.recvKey = keyA
    }
  }

  /**
   * 生成新的 IV（初始化向量）
   * 使用计数器确保每次加密使用不同的 IV
   */
  private generateIV(): Uint8Array {
    const iv = new Uint8Array(12) // AES-GCM 标准 IV 长度
    const counter = this.sendIvCounter++
    
    // 将计数器编码到 IV 中（前 8 字节）
    const view = new DataView(iv.buffer)
    view.setBigUint64(0, BigInt(counter), true) // little-endian
    
    // 后 4 字节可以用于其他用途或保持为零
    return iv
  }

  /**
   * 加密数据
   */
  async encrypt(data: Uint8Array): Promise<Uint8Array> {
    if (!this.sendKey) {
      throw new Error("加密密钥未初始化")
    }

    const startTime = performance.now()
    const iv = this.generateIV()
    const encrypted = await crypto.subtle.encrypt(
      {
        name: "AES-GCM",
        iv: iv,
        tagLength: 128, // 128 位认证标签
      },
      this.sendKey,
      data
    )

    // 将 IV 和加密数据组合：IV (12 bytes) + 加密数据 + 认证标签 (16 bytes)
    const result = new Uint8Array(12 + encrypted.byteLength)
    result.set(iv, 0)
    result.set(new Uint8Array(encrypted), 12)
    
    // 性能监控
    const encryptTime = performance.now() - startTime
    this.encryptTimes.push(encryptTime)
    this.totalEncryptedBytes += data.length
    this.chunkCount++
    
    // 只保留最近 100 次的记录，避免内存泄漏
    if (this.encryptTimes.length > 100) {
      this.encryptTimes.shift()
    }
    
    return result
  }

  /**
   * 解密数据
   */
  async decrypt(encryptedData: Uint8Array): Promise<Uint8Array> {
    if (!this.recvKey) {
      throw new Error("解密密钥未初始化")
    }

    if (encryptedData.length < 12) {
      throw new Error("加密数据格式错误：缺少 IV")
    }

    const startTime = performance.now()
    // 提取 IV 和加密数据
    const iv = encryptedData.slice(0, 12)
    const ciphertext = encryptedData.slice(12)

    const decrypted = await crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: iv,
        tagLength: 128,
      },
      this.recvKey,
      ciphertext
    )

    const result = new Uint8Array(decrypted)
    
    // 性能监控
    const decryptTime = performance.now() - startTime
    this.decryptTimes.push(decryptTime)
    this.totalDecryptedBytes += result.length
    
    // 只保留最近 100 次的记录
    if (this.decryptTimes.length > 100) {
      this.decryptTimes.shift()
    }
    
    return result
  }

  /**
   * 检查是否已初始化
   */
  isReady(): boolean {
    return this.sendKey !== null && this.recvKey !== null
  }

  /**
   * 获取性能统计
   */
  getPerformanceStats() {
    const avgEncryptTime = this.encryptTimes.length > 0
      ? this.encryptTimes.reduce((a, b) => a + b, 0) / this.encryptTimes.length
      : 0
    
    const avgDecryptTime = this.decryptTimes.length > 0
      ? this.decryptTimes.reduce((a, b) => a + b, 0) / this.decryptTimes.length
      : 0

    const encryptThroughput = avgEncryptTime > 0 && this.totalEncryptedBytes > 0
      ? this.totalEncryptedBytes / (this.encryptTimes.reduce((a, b) => a + b, 0))
      : 0

    const decryptThroughput = avgDecryptTime > 0 && this.totalDecryptedBytes > 0
      ? this.totalDecryptedBytes / (this.decryptTimes.reduce((a, b) => a + b, 0))
      : 0

    return {
      encryptTime: avgEncryptTime,
      decryptTime: avgDecryptTime,
      encryptThroughput,
      decryptThroughput,
      totalEncrypted: this.totalEncryptedBytes,
      totalDecrypted: this.totalDecryptedBytes,
      chunkCount: this.chunkCount,
    }
  }

  /**
   * 重置性能统计
   */
  resetPerformanceStats() {
    this.encryptTimes = []
    this.decryptTimes = []
    this.totalEncryptedBytes = 0
    this.totalDecryptedBytes = 0
    this.chunkCount = 0
  }
}

/**
 * 生成 ECDH 密钥对
 */
export async function generateKeyPair(): Promise<EncryptionKeyPair> {
  const keyPair = await crypto.subtle.generateKey(
    ECDH_ALGORITHM,
    true, // 可导出（用于序列化公钥）
    ["deriveBits"] // 私钥只需要 deriveBits 来派生共享密钥
  )

  return {
    publicKey: keyPair.publicKey,
    privateKey: keyPair.privateKey,
  }
}

/**
 * 导出公钥为 ArrayBuffer（用于传输）
 */
export async function exportPublicKey(publicKey: CryptoKey): Promise<ArrayBuffer> {
  return await crypto.subtle.exportKey("raw", publicKey)
}

/**
 * 导入公钥（从接收到的数据）
 */
export async function importPublicKey(publicKeyData: ArrayBuffer): Promise<CryptoKey> {
  // ECDH 公钥导入时不需要指定用途，它只作为 deriveBits 的参数使用
  return await crypto.subtle.importKey(
    "raw",
    publicKeyData,
    ECDH_ALGORITHM,
    true,
    [] // 公钥不需要指定用途，它只作为 deriveBits 操作的参数
  )
}

/**
 * 计算共享密钥（ECDH）
 */
export async function deriveSharedSecret(
  privateKey: CryptoKey,
  peerPublicKey: CryptoKey
): Promise<ArrayBuffer> {
  return await crypto.subtle.deriveBits(
    {
      name: "ECDH",
      public: peerPublicKey,
    },
    privateKey,
    256 // 256 位共享密钥
  )
}

/**
 * 将 ArrayBuffer 转换为 Base64 字符串
 */
export function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  let binary = ""
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary)
}

/**
 * 将 Base64 字符串转换为 ArrayBuffer
 */
export function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binaryString = atob(base64)
  const bytes = new Uint8Array(binaryString.length)
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i)
  }
  return bytes.buffer
}

/**
 * 加密 JSON 对象
 */
export async function encryptJSON(
  encryptor: SessionEncryptor,
  data: unknown
): Promise<string> {
  const jsonString = JSON.stringify(data)
  const encoder = new TextEncoder()
  const dataBytes = encoder.encode(jsonString)
  const encrypted = await encryptor.encrypt(dataBytes)
  return arrayBufferToBase64(encrypted.buffer)
}

/**
 * 解密 JSON 对象
 */
export async function decryptJSON<T = unknown>(
  encryptor: SessionEncryptor,
  encryptedBase64: string
): Promise<T> {
  const encryptedBuffer = base64ToArrayBuffer(encryptedBase64)
  const decrypted = await encryptor.decrypt(new Uint8Array(encryptedBuffer))
  const decoder = new TextDecoder()
  const jsonString = decoder.decode(decrypted)
  return JSON.parse(jsonString) as T
}

/**
 * 加密 Uint8Array 数据（用于文件块）
 */
export async function encryptBytes(
  encryptor: SessionEncryptor,
  data: Uint8Array
): Promise<string> {
  const encrypted = await encryptor.encrypt(data)
  return arrayBufferToBase64(encrypted.buffer)
}

/**
 * 解密 Uint8Array 数据（用于文件块）
 */
export async function decryptBytes(
  encryptor: SessionEncryptor,
  encryptedBase64: string
): Promise<Uint8Array> {
  const encryptedBuffer = base64ToArrayBuffer(encryptedBase64)
  return await encryptor.decrypt(new Uint8Array(encryptedBuffer))
}
