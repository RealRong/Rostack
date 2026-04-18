import type { RecordId, ViewId } from '@dataview/core/contracts'

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
