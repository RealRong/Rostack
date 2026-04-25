import type { Point } from '@whiteboard/core/types'
import type { ClipboardTarget } from '@whiteboard/editor'
import type { WhiteboardRuntime } from '@whiteboard/react/types/runtime'
import type { ClipboardAdapter } from '@whiteboard/react/dom/host/clipboard'

const clonePoint = (
  point: Point
): Point => ({
  x: point.x,
  y: point.y
})

export type ClipboardBridge = {
  copy: (
    target?: ClipboardTarget,
    options?: {
      event?: ClipboardEvent
    }
  ) => Promise<boolean>
  cut: (
    target?: ClipboardTarget,
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
  readDefaultOrigin
}: {
  editor: WhiteboardRuntime
  adapter: ClipboardAdapter
  readDefaultOrigin: () => Point
}): ClipboardBridge => {
  return {
    copy: async (target = 'selection', options) => {
      const packet = editor.write.clipboard.copy(target)
      if (!packet) {
        return false
      }

      return adapter.write(packet, options?.event)
    },
    cut: async (target = 'selection', options) => {
      const packet = editor.write.clipboard.cut(target)
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

      return editor.write.clipboard.paste(packet, {
        origin: options?.origin ?? clonePoint(readDefaultOrigin())
      })
    }
  }
}
