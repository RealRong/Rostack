import { scheduler } from '@shared/core'
import type {
  EditorCommand,
  EditorCommandTaskRuntime,
  EditorTaskRequest
} from './contracts'

export const createEditorCommandTaskRuntime = ({
  execute
}: {
  execute: (command: EditorCommand<void>) => void
}): EditorCommandTaskRuntime => {
  let disposed = false
  const microtasks = new Set<{
    active: boolean
  }>()
  const timeouts = new Set<scheduler.TimeoutTask>()
  const frames = new Set<scheduler.FrameTask>()

  const runCommand = (
    command: EditorCommand<void>
  ) => {
    if (disposed) {
      return
    }

    execute(command)
  }

  const scheduleMicrotask = (
    command: EditorCommand<void>
  ) => {
    const ticket = {
      active: true
    }
    microtasks.add(ticket)
    queueMicrotask(() => {
      microtasks.delete(ticket)
      if (!ticket.active || disposed) {
        return
      }

      runCommand(command)
    })
  }

  const scheduleDelay = (
    request: Extract<EditorTaskRequest, { lane: 'delay' }>
  ) => {
    const timeout = scheduler.createTimeoutTask(() => {
      timeouts.delete(timeout)
      runCommand(request.command)
    })
    timeouts.add(timeout)
    timeout.schedule(request.delayMs)
  }

  const scheduleFrame = (
    command: EditorCommand<void>
  ) => {
    const frame = scheduler.createFrameTask(() => {
      frames.delete(frame)
      runCommand(command)
    })
    frames.add(frame)
    frame.schedule()
  }

  return {
    schedule: (request) => {
      if (disposed) {
        return
      }

      if (request.lane === 'microtask') {
        scheduleMicrotask(request.command)
        return
      }

      if (request.lane === 'delay') {
        scheduleDelay(request)
        return
      }

      scheduleFrame(request.command)
    },
    dispose: () => {
      disposed = true
      microtasks.forEach((ticket) => {
        ticket.active = false
      })
      microtasks.clear()
      timeouts.forEach((timeout) => {
        timeout.cancel()
      })
      timeouts.clear()
      frames.forEach((frame) => {
        frame.cancel()
      })
      frames.clear()
    }
  }
}
