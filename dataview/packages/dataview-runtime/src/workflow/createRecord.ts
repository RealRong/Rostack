import type {
  RecordId,
  View,
  ViewId
} from '@dataview/core/contracts'
import { store } from '@shared/core'

export type CreateRecordOpenResult =
  | 'opened'
  | 'retry'
  | 'failed'

export interface CreateRecordRequest {
  ownerViewId?: ViewId
  create: () => RecordId | undefined
  open: (recordId: RecordId, attempt: number) => CreateRecordOpenResult
  onFailure?: () => void
  retryFrames?: number
}

export interface CreateRecordApi {
  create(request: CreateRecordRequest): RecordId | undefined
  cancel(): void
}

const scheduleFrame = (
  callback: () => void
) => {
  if (typeof requestAnimationFrame === 'function') {
    const handle = requestAnimationFrame(() => {
      callback()
    })

    return () => {
      cancelAnimationFrame(handle)
    }
  }

  const handle = setTimeout(callback, 0)
  return () => {
    clearTimeout(handle)
  }
}

export const createRecordWorkflow = (input: {
  activeView: store.ReadStore<View | undefined>
}): CreateRecordApi => {
  let requestToken = 0
  let cancelScheduled: (() => void) | undefined

  const cancel = () => {
    requestToken += 1
    cancelScheduled?.()
    cancelScheduled = undefined
  }

  const create = (
    request: CreateRecordRequest
  ) => {
    cancel()

    const recordId = request.create()
    if (!recordId) {
      request.onFailure?.()
      return undefined
    }

    requestToken += 1
    const token = requestToken
    const retryFrames = Math.max(0, request.retryFrames ?? 0)

    const tryOpen = (attempt: number) => {
      if (token !== requestToken) {
        return
      }

      if (
        request.ownerViewId
        && input.activeView.get()?.id !== request.ownerViewId
      ) {
        cancel()
        request.onFailure?.()
        return
      }

      const result = request.open(recordId, attempt)
      if (result === 'opened') {
        cancelScheduled = undefined
        return
      }

      if (result === 'retry' && attempt < retryFrames) {
        cancelScheduled = scheduleFrame(() => {
          tryOpen(attempt + 1)
        })
        return
      }

      cancel()
      request.onFailure?.()
    }

    tryOpen(0)
    return recordId
  }

  return {
    create,
    cancel
  }
}
