import type {
  SliceRoots
} from '@whiteboard/core/document'
import type { SelectionTarget } from '@whiteboard/core/selection'
import type { Point } from '@whiteboard/core/types'
import type { DocumentFrame } from '@whiteboard/editor-scene'
import type {
  ClipboardActions,
  ClipboardTarget,
} from '@whiteboard/editor/actions/types'
import {
  createClipboardPacket,
  type ClipboardPacket
} from '@whiteboard/editor/clipboard'
import type { SelectionActionHelpers } from '@whiteboard/editor/actions/selection'
import type { EditorStateStores } from '@whiteboard/editor/scene-ui/state'
import type { EditorStateStoreFacade } from '@whiteboard/editor/state/runtime'
import type { EditorViewport } from '@whiteboard/editor/state/viewport'
import type { DocumentWrite } from '@whiteboard/editor/write/types'

type ClipboardActionHelpersHost = {
  documentSource: Pick<DocumentFrame, 'slice'>
  document: Pick<DocumentWrite, 'insert'>
  selection: Pick<SelectionActionHelpers, 'delete'>
  selectionState: Pick<EditorStateStores['selection'], 'get'>
  state: Pick<EditorStateStoreFacade, 'write'>
  viewport: Pick<EditorViewport, 'get'>
}

const replaceSelection = (
  state: Pick<EditorStateStoreFacade, 'write'>,
  selection: SelectionTarget
) => {
  state.write(({
    writer
  }) => {
    writer.selection.set(selection)
  })
}

const applyInsertedRoots = (input: {
  context: ClipboardActionHelpersHost
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
    replaceSelection(input.context.state, {
      nodeIds,
      edgeIds
    })
    return
  }

  replaceSelection(input.context.state, {
    nodeIds: [],
    edgeIds: []
  })
}

const readSelectionTarget = (
  context: ClipboardActionHelpersHost
): Exclude<ClipboardTarget, 'selection'> | undefined => {
  const target = context.selectionState.get()

  if (target.nodeIds.length > 0 || target.edgeIds.length > 0) {
    return {
      nodeIds: target.nodeIds,
      edgeIds: target.edgeIds
    }
  }

  return undefined
}

const resolveClipboardTarget = (input: {
  context: ClipboardActionHelpersHost
  target: ClipboardTarget
}): Exclude<ClipboardTarget, 'selection'> | undefined => (
  input.target === 'selection'
    ? readSelectionTarget(input.context)
    : input.target
)

const readClipboardPacket = (input: {
  context: ClipboardActionHelpersHost
  target: ClipboardTarget
}): ClipboardPacket | undefined => {
  const resolved = resolveClipboardTarget(input)
  if (!resolved) {
    return undefined
  }

  const exported = input.context.documentSource.slice(resolved)
  return exported
    ? createClipboardPacket(exported)
    : undefined
}

export const createClipboardActions = (
  context: ClipboardActionHelpersHost
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
      const removed = context.selection.delete(resolved, {
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
    const inserted = context.document.insert(packet.slice, {
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
