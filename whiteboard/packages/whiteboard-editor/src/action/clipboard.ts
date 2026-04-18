import type {
  SliceRoots
} from '@whiteboard/core/document'
import type { Point } from '@whiteboard/core/types'
import type { EditorStore } from '@whiteboard/editor/types/editor'
import type { EditorQuery } from '@whiteboard/editor/query'
import type {
  ClipboardCommands,
  SessionActions,
  ClipboardTarget
} from '@whiteboard/editor/types/commands'
import {
  createClipboardPacket,
  type ClipboardPacket
} from '@whiteboard/editor/clipboard/packet'
import type { DocumentCommands } from '@whiteboard/editor/write/document'
import type { SelectionCommands } from '@whiteboard/editor/action/selection'

type ClipboardCommandsHost = {
  read: EditorQuery
  document: Pick<DocumentCommands, 'insert'>
  session: Pick<SessionActions, 'selection'>
  selection: Pick<SelectionCommands, 'delete'>
  state: Pick<EditorStore, 'viewport' | 'selection'>
}

const applyInsertedRoots = (input: {
  editor: ClipboardCommandsHost
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
  editor: ClipboardCommandsHost
): Exclude<ClipboardTarget, 'selection'> | undefined => {
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
  editor: ClipboardCommandsHost
  target: ClipboardTarget
}): Exclude<ClipboardTarget, 'selection'> | undefined => (
  input.target === 'selection'
    ? readSelectionTarget(input.editor)
    : input.target
)

const readClipboardPacket = (input: {
  editor: ClipboardCommandsHost
  target: ClipboardTarget
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

export const createClipboardCommands = ({
  editor
}: {
  editor: ClipboardCommandsHost
}): ClipboardCommands => ({
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
