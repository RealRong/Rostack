import { scheduler } from '@shared/core'
import type { EditorProcedure, EditorTaskRequest } from './procedure'

export interface EditorBoundaryTaskRuntime {
  schedule(request: EditorTaskRequest): void
  dispose(): void
}

export const createEditorBoundaryTaskRuntime = ({
  execute
}: {
  execute: (procedure: EditorProcedure<void>) => void
}): EditorBoundaryTaskRuntime => {
  let disposed = false
  const microtasks = new Set<{
    active: boolean
  }>()
  const timeouts = new Set<scheduler.TimeoutTask>()
  const frames = new Set<scheduler.FrameTask>()

  const runProcedure = (
    procedure: EditorProcedure<void>
  ) => {
    if (disposed) {
      return
    }

    execute(procedure)
  }

  const scheduleMicrotask = (
    procedure: EditorProcedure<void>
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

      runProcedure(procedure)
    })
  }

  const scheduleDelay = (
    request: Extract<EditorTaskRequest, { lane: 'delay' }>
  ) => {
    const timeout = scheduler.createTimeoutTask(() => {
      timeouts.delete(timeout)
      runProcedure(request.procedure)
    })
    timeouts.add(timeout)
    timeout.schedule(request.delayMs)
  }

  const scheduleFrame = (
    procedure: EditorProcedure<void>
  ) => {
    const frame = scheduler.createFrameTask(() => {
      frames.delete(frame)
      runProcedure(procedure)
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
        scheduleMicrotask(request.procedure)
        return
      }

      if (request.lane === 'delay') {
        scheduleDelay(request)
        return
      }

      scheduleFrame(request.procedure)
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
