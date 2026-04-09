import type {
  ClipboardPacket,
  SliceRoots
} from '@whiteboard/core/document'
import { createClipboardPacket } from '@whiteboard/core/document'
import type { Point } from '@whiteboard/core/types'
import type {
  Editor,
  EditorClipboardCommands,
  EditorClipboardTarget,
  EditorDocumentWrite,
  EditorSessionWrite
} from '../../types/editor'

type ClipboardActionHost = Pick<Editor, 'read'> & {
  document: Pick<EditorDocumentWrite, 'doc'>
  session: Pick<EditorSessionWrite, 'selection'>
  canvas: {
    delete: (
      target: {
        nodeIds?: readonly string[]
        edgeIds?: readonly string[]
      },
      options?: {
        clearSelection?: boolean
      }
    ) => boolean
  }
  state: Pick<Editor['state'], 'viewport' | 'selection'>
}

const applyInsertedRoots = (input: {
  editor: ClipboardActionHost
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
  editor: ClipboardActionHost
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
  editor: ClipboardActionHost
  target: EditorClipboardTarget
}): Exclude<EditorClipboardTarget, 'selection'> | undefined => (
  input.target === 'selection'
    ? readSelectionTarget(input.editor)
    : input.target
)

const readClipboardPacket = (input: {
  editor: ClipboardActionHost
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
  editor: ClipboardActionHost
}): EditorClipboardCommands => ({
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
    const inserted = editor.document.doc.insert(packet.slice, {
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
