import type {
  DataDoc,
  ViewId
} from '@dataview/core/contracts'
import {
  getDocumentViewById
} from '@dataview/core/document'
import type {
  ActiveView
} from '../../types'
import type {
  Stage
} from '../runtime/stage'
import {
  reuse,
  shouldRun
} from '../runtime/stage'

export const resolveActiveView = (
  document: DataDoc,
  activeViewId: ViewId | undefined
): ActiveView | undefined => {
  if (!activeViewId) {
    return undefined
  }

  const view = getDocumentViewById(document, activeViewId)
  if (!view) {
    return undefined
  }

  return {
    id: view.id,
    name: view.name,
    type: view.type
  }
}

export const viewStage: Stage<ActiveView> = {
  run: input => {
    if (!shouldRun(input.action)) {
      return reuse(input)
    }

    return resolveActiveView(
      input.next.document,
      input.next.activeViewId
    )
  }
}
