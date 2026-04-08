import type {
  ClipboardPacket,
  SliceRoots
} from '@whiteboard/core/document'
import { createClipboardPacket } from '@whiteboard/core/document'
import type { Point } from '@whiteboard/core/types'
import type {
  Editor,
  EditorClipboardTarget
} from '../../types/editor'

type ClipboardEditor = Pick<Editor, 'read'> & {
  commands: Omit<Editor['commands'], 'clipboard'>
  state: Pick<Editor['state'], 'viewport'>
}

const applyInsertedRoots = (input: {
  editor: ClipboardEditor
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
    input.editor.commands.selection.replace({
      nodeIds,
      edgeIds
    })
    return
  }

  input.editor.commands.selection.clear()
}

const readSelectionTarget = (
  editor: ClipboardEditor
): Exclude<EditorClipboardTarget, 'selection'> | undefined => {
  const summary = editor.read.selection.summary.get()
  const target = editor.read.selection.target.get()

  if (summary.items.count > 0) {
    return {
      nodeIds: target.nodeIds,
      edgeIds: target.edgeIds
    }
  }

  return undefined
}

const resolveClipboardTarget = (input: {
  editor: ClipboardEditor
  target: EditorClipboardTarget
}): Exclude<EditorClipboardTarget, 'selection'> | undefined => (
  input.target === 'selection'
    ? readSelectionTarget(input.editor)
    : input.target
)

const readClipboardPacket = (input: {
  editor: ClipboardEditor
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

export const createClipboard = ({
  editor
}: {
  editor: ClipboardEditor
}): Editor['commands']['clipboard'] => ({
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
      const result = editor.commands.canvas.delete([
        ...(resolved.nodeIds ?? []).map((id) => ({
          kind: 'node' as const,
          id
        })),
        ...(resolved.edgeIds ?? []).map((id) => ({
          kind: 'edge' as const,
          id
        }))
      ])
      if (!result.ok) {
        return undefined
      }

      editor.commands.selection.clear()
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
    const inserted = editor.commands.document.insert(packet.slice, {
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
