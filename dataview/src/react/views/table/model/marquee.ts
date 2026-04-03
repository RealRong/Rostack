import type { AppearanceId } from '@dataview/react/runtime/currentView'

const emptyRowIds = [] as readonly AppearanceId[]
type RowSelectionMode = 'replace' | 'toggle' | 'range'

export interface RowMarqueeState {
  startEdge: number | null
  currentEdge: number | null
}

export interface RowMarqueeSelection {
  ids: readonly AppearanceId[]
  anchor?: AppearanceId
  focus?: AppearanceId
}

export const rowMarqueeMode = (input: {
  shiftKey: boolean
  metaKey: boolean
  ctrlKey: boolean
}): RowSelectionMode => {
  if (input.shiftKey) {
    return 'range'
  }

  return input.metaKey || input.ctrlKey
    ? 'toggle'
    : 'replace'
}

export const rowMarqueeState = (input: {
  previous: RowMarqueeState
  edge: number | null
}): RowMarqueeState => {
  if (input.edge === null) {
    return input.previous
  }

  if (input.previous.startEdge !== null) {
    return {
      startEdge: input.previous.startEdge,
      currentEdge: input.edge
    }
  }

  return {
    startEdge: input.edge,
    currentEdge: input.edge
  }
}

export const rowMarqueeSelection = (input: {
  rowIds: readonly AppearanceId[]
  state: RowMarqueeState
}): RowMarqueeSelection => {
  const {
    startEdge,
    currentEdge
  } = input.state
  if (
    startEdge === null
    || currentEdge === null
    || startEdge === currentEdge
  ) {
    return {
      ids: emptyRowIds
    }
  }

  const start = Math.max(0, Math.min(startEdge, currentEdge))
  const end = Math.min(
    input.rowIds.length,
    Math.max(startEdge, currentEdge)
  )
  const ids = input.rowIds.slice(start, end)
  if (!ids.length) {
    return {
      ids: emptyRowIds
    }
  }

  return currentEdge > startEdge
    ? {
        ids,
        anchor: input.rowIds[startEdge],
        focus: input.rowIds[end - 1]
      }
    : {
        ids,
        anchor: input.rowIds[startEdge - 1],
        focus: input.rowIds[start]
      }
}
