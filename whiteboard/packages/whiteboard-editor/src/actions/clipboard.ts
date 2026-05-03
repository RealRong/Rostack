import type {
  SliceRoots
} from '@whiteboard/core/document'
import type { SelectionTarget } from '@whiteboard/core/selection'
import type { Point } from '@whiteboard/core/types'
import type { EditorActionContext } from '@whiteboard/editor/actions'
import type {
  ClipboardActions,
  ClipboardTarget,
  SelectionActions,
} from '@whiteboard/editor/actions/types'
import {
  createClipboardPacket,
  type ClipboardPacket
} from '@whiteboard/editor/clipboard'

const replaceSelection = (
  context: EditorActionContext,
  selection: SelectionTarget
) => {
  context.state.write(({
    writer
  }) => {
    writer.selection.set(selection)
  })
}

const applyInsertedRoots = (input: {
  context: EditorActionContext
  inserted: {
    roots: SliceRoots
    allNodeIds: readonly string[]
    allEdgeIds: readonly string[]
  }
}) => {
  const nodeIds = input.inserted.roots.nodeIds.length > 0
    ? input.inserted.roots.nodeIds
    : input.inserted.allNodeIds
  const edgeIds = input.inserted.roots.edgeIds.length > 0
    ? input.inserted.roots.edgeIds
    : input.inserted.allEdgeIds

  if (nodeIds.length > 0 || edgeIds.length > 0) {
    replaceSelection(input.context, {
      nodeIds,
      edgeIds
    })
    return
  }

  replaceSelection(input.context, {
    nodeIds: [],
    edgeIds: []
  })
}

const readSelectionTarget = (
  context: EditorActionContext
): Exclude<ClipboardTarget, 'selection'> | undefined => {
  const target = context.stores.selection.get()

  if (target.nodeIds.length > 0 || target.edgeIds.length > 0) {
    return {
      nodeIds: target.nodeIds,
      edgeIds: target.edgeIds
    }
  }

  return undefined
}

const resolveClipboardTarget = (input: {
  context: EditorActionContext
  target: ClipboardTarget
}): Exclude<ClipboardTarget, 'selection'> | undefined => (
  input.target === 'selection'
    ? readSelectionTarget(input.context)
    : input.target
)

const readClipboardPacket = (input: {
  context: EditorActionContext
  target: ClipboardTarget
}): ClipboardPacket | undefined => {
  const resolved = resolveClipboardTarget(input)
  if (!resolved) {
    return undefined
  }

  const exported = input.context.document.slice(resolved)
  return exported
    ? createClipboardPacket(exported)
    : undefined
}

export const createClipboardActions = (
  context: EditorActionContext,
  selection: SelectionActions
): ClipboardActions => ({
  copy: (target: ClipboardTarget = 'selection') =>
    readClipboardPacket({
      context,
      target
    }),
  cut: (target: ClipboardTarget = 'selection') => {
    const resolved = resolveClipboardTarget({
      context,
      target
    })
    if (!resolved) {
      return undefined
    }

    const packet = readClipboardPacket({
      context,
      target: resolved
    })
    if (!packet) {
      return undefined
    }

    if (resolved.nodeIds?.length || resolved.edgeIds?.length) {
      const removed = selection.delete(resolved, {
        clearSelection: true
      })
      if (!removed) {
        return undefined
      }
    }

    return packet
  },
  paste: (
    packet: ClipboardPacket,
    options?: {
      origin?: Point
    }
  ) => {
    const origin = options?.origin ?? {
      ...context.viewport.get().center
    }
    const inserted = context.write.document.insert(packet.slice, {
      origin,
      roots: packet.roots
    })
    if (!inserted.ok) {
      return false
    }

    applyInsertedRoots({
      context,
      inserted: inserted.data
    })
    return true
  }
})
