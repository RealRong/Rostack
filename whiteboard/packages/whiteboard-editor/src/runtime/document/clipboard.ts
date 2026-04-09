import type {
  ClipboardPacket,
  SliceRoots
} from '@whiteboard/core/document'
import { createClipboardPacket } from '@whiteboard/core/document'
import type { Point } from '@whiteboard/core/types'
import type {
  EditorClipboardTarget
} from '../../types/editor'
import type {
  ClipboardActions,
  ClipboardRuntime
} from '../editor/runtimeTypes'

const applyInsertedRoots = (input: {
  editor: ClipboardRuntime
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
    input.editor.session.selection.replace({
      nodeIds,
      edgeIds
    })
    return
  }

  input.editor.session.selection.clear()
}

const readSelectionTarget = (
  editor: ClipboardRuntime
): Exclude<EditorClipboardTarget, 'selection'> | undefined => {
  const target = editor.state.selection.get()

  if (target.nodeIds.length > 0 || target.edgeIds.length > 0) {
    return {
      nodeIds: target.nodeIds,
      edgeIds: target.edgeIds
    }
  }

  return undefined
}

const resolveClipboardTarget = (input: {
  editor: ClipboardRuntime
  target: EditorClipboardTarget
}): Exclude<EditorClipboardTarget, 'selection'> | undefined => (
  input.target === 'selection'
    ? readSelectionTarget(input.editor)
    : input.target
)

const readClipboardPacket = (input: {
  editor: ClipboardRuntime
  target: EditorClipboardTarget
}): ClipboardPacket | undefined => {
  const resolved = resolveClipboardTarget(input)
  if (!resolved) {
    return undefined
  }

  const exported = input.editor.read.slice.fromSelection(resolved)
  return exported
    ? createClipboardPacket(exported)
    : undefined
}

export const createClipboardActions = ({
  editor
}: {
  editor: ClipboardRuntime
}): ClipboardActions => ({
  export: (target = 'selection') =>
    readClipboardPacket({
      editor,
      target
    }),
  cut: (target = 'selection') => {
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
      const removed = editor.canvas.delete(resolved, {
        clearSelection: true
      })
      if (!removed) {
        return undefined
      }
    }

    return packet
  },
  insert: (
    packet,
    options?: {
      origin?: Point
    }
  ) => {
    const origin = options?.origin ?? { ...editor.state.viewport.get().center }
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
