export function createSequentialAsyncProcessor() {
  let chain = Promise.resolve()

  return function runSequentially<T>(task: () => Promise<T> | T): Promise<T> {
    const runTask = async () => await task()
    const next = chain.then(runTask, runTask)

    chain = next.then(
      () => undefined,
      () => undefined,
    )

    return next
  }
}
