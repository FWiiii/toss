/* eslint-disable test/no-import-node-test */

import assert from 'node:assert/strict'
import test from 'node:test'

test('sequential async processor preserves task order across awaits', async () => {
  const { createSequentialAsyncProcessor } = await import('../lib/serial-async-processor.ts')

  const runSequentially = createSequentialAsyncProcessor()
  const events = []

  let releaseFirstTask
  const firstTaskReleased = new Promise((resolve) => {
    releaseFirstTask = resolve
  })

  const firstTask = runSequentially(async () => {
    events.push('start:first')
    await firstTaskReleased
    events.push('end:first')
  })

  const secondTask = runSequentially(async () => {
    events.push('start:second')
    events.push('end:second')
  })

  await Promise.resolve()
  assert.deepEqual(events, ['start:first'])

  releaseFirstTask()
  await Promise.all([firstTask, secondTask])

  assert.deepEqual(events, [
    'start:first',
    'end:first',
    'start:second',
    'end:second',
  ])
})
