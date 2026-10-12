/**
 * IndexedDB 打开样板：三个存储模块（分享、接收分块、接收历史）此前各自复制了同一段
 * `open` / `onerror` / `onsuccess` / `onupgradeneeded` 代码。
 */
export function openIndexedDb(
  name: string,
  version: number,
  upgrade: (db: IDBDatabase) => void,
): Promise<IDBDatabase> {
  const { promise, resolve, reject } = Promise.withResolvers<IDBDatabase>()
  const request = indexedDB.open(name, version)

  request.onerror = () => reject(request.error)
  request.onsuccess = () => resolve(request.result)
  request.onupgradeneeded = (event) => {
    upgrade((event.target as IDBOpenDBRequest).result)
  }

  return promise
}
