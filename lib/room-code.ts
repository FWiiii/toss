/**
 * 房间代码的唯一格式来源。
 * 之前正则与格式化字符串散落在房间面板、扫码组件、加入码 Hook 和房间管理里，
 * 任何一处改动都可能只生效于部分路径。
 */

export const ROOM_CODE_LENGTH = 6

const ROOM_CODE_SANITIZE_REGEX = /[^A-Z0-9]/g
const ROOM_CODE_REGEX = /^[A-Z0-9]{6}$/i

/** 去掉非 `[A-Z0-9]` 字符并统一大写。 */
export function sanitizeRoomCode(value: string): string {
  return value.toUpperCase().replace(ROOM_CODE_SANITIZE_REGEX, '')
}

/** 校验 6 位房间代码（大小写不敏感）。 */
export function isValidRoomCode(value: string): boolean {
  return ROOM_CODE_REGEX.test(value)
}

/** `ABC123` -> `ABC 123`，用于展示。 */
export function formatRoomCode(code: string): string {
  return `${code.slice(0, 3)} ${code.slice(3)}`
}
