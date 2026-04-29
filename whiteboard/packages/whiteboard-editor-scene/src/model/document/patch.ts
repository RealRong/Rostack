import type { Input } from '../../contracts/editor'
import type { WorkingState } from '../../contracts/working'

export const patchDocumentState = (input: {
  current: Input
  working: WorkingState
  reset?: boolean
}) => {
  const snapshot = input.current.document.doc
  input.working.document.snapshot = snapshot
  input.working.document.background = snapshot.background
  void input.reset
}
