/* eslint-disable test/no-import-node-test */

import assert from 'node:assert/strict'
import test from 'node:test'

test('isInboundPeerPayloadAllowed lets handshake and heartbeat through in every state', async () => {
  const { isInboundPeerPayloadAllowed } = await import('../lib/transfer-protocol.ts')

  for (const handshake of ['unknown', 'pending', 'ready']) {
    assert.equal(isInboundPeerPayloadAllowed(handshake, 'key-exchange'), true, handshake)
    assert.equal(isInboundPeerPayloadAllowed(handshake, 'ping'), true, handshake)
    assert.equal(isInboundPeerPayloadAllowed(handshake, 'pong'), true, handshake)
    // 加密信封始终放行：没有解密器时下游解密会自然失败并丢弃
    assert.equal(isInboundPeerPayloadAllowed(handshake, 'encrypted'), true, handshake)
  }
})

test('isInboundPeerPayloadAllowed drops plaintext control messages once handshake starts', async () => {
  const { isInboundPeerPayloadAllowed } = await import('../lib/transfer-protocol.ts')

  const plaintextControlTypes = [
    'text',
    'device-intro',
    'file-offer',
    'file-offer-response',
    'file-start',
    'file-end',
    'file-cancel',
    'room-dissolved',
  ]

  for (const type of plaintextControlTypes) {
    // 握手进行中：攻击者未完成密钥交换，冒充 device-intro / file-offer 必须被拦下
    assert.equal(isInboundPeerPayloadAllowed('pending', type), false, type)
    // 握手已完成：合法对端只会发 encrypted 信封，明文一律可疑
    assert.equal(isInboundPeerPayloadAllowed('ready', type), false, type)
    // 兼容状态：保留原有行为
    assert.equal(isInboundPeerPayloadAllowed('unknown', type), true, type)
  }
})

test('isInboundPeerPayloadAllowed only accepts encrypted file chunks after handshake', async () => {
  const { isInboundPeerPayloadAllowed } = await import('../lib/transfer-protocol.ts')

  // ready + 逐块加密：合法
  assert.equal(isInboundPeerPayloadAllowed('ready', 'file-chunk', true), true)
  // ready + 明文块：丢弃，防止加密会话中被降级写入明文
  assert.equal(isInboundPeerPayloadAllowed('ready', 'file-chunk', false), false)
  assert.equal(isInboundPeerPayloadAllowed('ready', 'file-chunk'), false)
  // 握手未完成：任何文件块都不该出现
  assert.equal(isInboundPeerPayloadAllowed('pending', 'file-chunk', true), false)
  assert.equal(isInboundPeerPayloadAllowed('pending', 'file-chunk', false), false)
})

test('isInboundPeerPayloadAllowed rejects unknown outer types conservatively', async () => {
  const { isInboundPeerPayloadAllowed } = await import('../lib/transfer-protocol.ts')

  assert.equal(isInboundPeerPayloadAllowed('ready', 'peer-joined'), false)
  assert.equal(isInboundPeerPayloadAllowed('pending', 'peer-joined'), false)
  // unknown 状态保持兼容：交由下游 validateIncomingRawPeerPayload 判定
  assert.equal(isInboundPeerPayloadAllowed('unknown', 'peer-joined'), true)
})
