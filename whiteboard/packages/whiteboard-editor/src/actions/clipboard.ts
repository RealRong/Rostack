import type {
  SliceRoots
} from '@whiteboard/core/document'
import type { SelectionTarget } from '@whiteboard/core/selection'
import type { Point, Viewport } from '@whiteboard/core/types'
import type { DocumentFrame } from '@whiteboard/editor-scene'
import type {
  ClipboardActions,
  ClipboardTarget,
} from '@whiteboard/editor/actions/types'
import type { EditorDispatchInput } from '@whiteboard/editor/state/intents'
import {
  createClipboardPacket,
  type ClipboardPacket
} from '@whiteboard/editor/clipboard'
import type { SelectionActionHelpers } from '@whiteboard/editor/actions/selection'
import type { DocumentWrite } from '@whiteboard/editor/write/types'

type ClipboardActionHelpersHost = {
  documentSource: Pick<DocumentFrame, 'slice'>
  document: Pick<DocumentWrite, 'insert'>
  dispatch: (command: EditorDispatchInput) => void
  selection: Pick<SelectionActionHelpers, 'delete'>
  selectionState: {
    get: () => SelectionTarget
  }
  viewport: {
    get: () => Viewport
  }
}

const applyInsertedRoots = (input: {
  editor: ClipboardActionHelpersHost
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
    input.editor.dispatch({
      type: 'selection.set',
      selection: {
        nodeIds,
        edgeIds
      }
    })
    return
  }

  input.editor.dispatch({
    type: 'selection.set',
    selection: {
      nodeIds: [],
      edgeIds: []
    }
  })
}

const readSelectionTarget = (
  editor: ClipboardActionHelpersHost
): Exclude<ClipboardTarget, 'selection'> | undefined => {
  const target = editor.selectionState.get()

  if (target.nodeIds.length > 0 || target.edgeIds.length > 0) {
    return {
      nodeIds: target.nodeIds,
      edgeIds: target.edgeIds
    }
  }

  return undefined
}

const resolveClipboardTarget = (input: {
  editor: ClipboardActionHelpersHost
  target: ClipboardTarget
}): Exclude<ClipboardTarget, 'selection'> | undefined => (
  input.target === 'selection'
    ? readSelectionTarget(input.editor)
    : input.target
)

const readClipboardPacket = (input: {
  editor: ClipboardActionHelpersHost
  target: ClipboardTarget
}): ClipboardPacket | undefined => {
  const resolved = resolveClipboardTarget(input)
  if (!resolved) {
    return undefined
  }

  const exported = input.editor.documentSource.slice(resolved)
  return exported
    ? createClipboardPacket(exported)
    : undefined
}

export const createClipboardActions = ({
  editor
}: {
  editor: ClipboardActionHelpersHost
}): ClipboardActions => ({
  copy: (target: ClipboardTarget = 'selection') =>
    readClipboardPacket({
      editor,
      target
    }),
  cut: (target: ClipboardTarget = 'selection') => {
    const resolved = resolveClipboardTarget({
      editor,
      target
    })
    if (!resolved) {
      return undefined
    }

    const packet = readClipboardPacket({
      editor,
      target: resolved
    })
    if (!packet) {
      return undefined
    }

    if (resolved.nodeIds?.length || resolved.edgeIds?.length) {
      const removed = editor.selection.delete(resolved, {
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
      ...editor.viewport.get().center
    }
    const inserted = editor.document.insert(packet.slice, {
      origin,
      roots: packet.roots
    })
    if (!inserted.ok) {
      return false
    }

    applyInsertedRoots({
      editor,
      inserted: inserted.data
    })
    return true
  }
})
