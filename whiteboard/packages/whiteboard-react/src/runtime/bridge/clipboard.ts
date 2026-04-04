import type { Point } from '@whiteboard/core/types'
import type { EditorClipboardTarget } from '@whiteboard/editor'
import type { WhiteboardRuntime } from '../../types/runtime'
import type { ClipboardAdapter } from '../dom/clipboard'

const clonePoint = (
  point: Point
): Point => ({
  x: point.x,
  y: point.y
})

export type ClipboardBridge = {
  copy: (
    target?: EditorClipboardTarget,
    options?: {
      event?: ClipboardEvent
    }
  ) => Promise<boolean>
  cut: (
    target?: EditorClipboardTarget,
    options?: {
      event?: ClipboardEvent
    }
  ) => Promise<boolean>
  paste: (options?: {
    event?: ClipboardEvent
    origin?: Point
  }) => Promise<boolean>
}

export const createClipboardBridge = ({
  editor,
  adapter,
  readPointer
}: {
  editor: WhiteboardRuntime
  adapter: ClipboardAdapter
  readPointer: () => Point | undefined
}): ClipboardBridge => {
  const readDefaultOrigin = () => {
    const pointer = readPointer()
    if (pointer) {
      return clonePoint(pointer)
    }

    return clonePoint(editor.state.viewport.get().center)
  }

  return {
    copy: async (target = 'selection', options) => {
      const packet = editor.commands.clipboard.export(target)
      if (!packet) {
        return false
      }

      return adapter.write(packet, options?.event)
    },
    cut: async (target = 'selection', options) => {
      const packet = editor.commands.clipboard.cut(target)
      if (!packet) {
        return false
      }

      return adapter.write(packet, options?.event)
    },
    paste: async (options) => {
      const packet = await adapter.read(options?.event)
      if (!packet) {
        return false
      }

      return editor.commands.clipboard.insert(packet, {
        origin: options?.origin ?? readDefaultOrigin()
      })
    }
  }
}
