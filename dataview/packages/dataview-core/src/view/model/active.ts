import { documentViews } from '@dataview/core/document/views'
import type { DataDoc, View, ViewId } from '@dataview/core/types'

export const resolveActiveViewId = (
  document: DataDoc,
  preferredViewId?: ViewId
): ViewId | undefined => documentViews.activeId.resolve(document, preferredViewId)

export const getActiveView = (
  document: DataDoc,
  preferredViewId?: ViewId
): View | undefined => {
  const viewId = resolveActiveViewId(document, preferredViewId)
  return viewId
    ? document.views.byId[viewId]
    : undefined
}

export const active = {
  resolveId: resolveActiveViewId,
  get: getActiveView
} as const
