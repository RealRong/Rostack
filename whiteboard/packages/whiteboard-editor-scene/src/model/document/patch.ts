import type { Size } from '@whiteboard/core/types'
import type { Input } from '../../contracts/editor'
import type { WorkingState } from '../../contracts/working'

export const patchDocumentState = (input: {
  current: Input
  working: WorkingState
  nodeSize: Size
  reset?: boolean
}) => {
  const snapshot = input.current.document.snapshot.document
  input.working.document.snapshot = snapshot
  input.working.document.background = snapshot.background
  void input.nodeSize
  void input.reset
}
