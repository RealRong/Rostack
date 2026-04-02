import type { ClipboardPacket } from '@whiteboard/core/document'
import {
  parseClipboardPacket,
  serializeClipboardPacket
} from '@whiteboard/core/document'

const CLIPBOARD_MIME = 'application/x-whiteboard-slice'

export type ClipboardHostAdapter = {
  write: (packet: ClipboardPacket, event?: ClipboardEvent) => Promise<boolean>
  read: (event?: ClipboardEvent) => Promise<ClipboardPacket | undefined>
}

const writeClipboardPacketToEvent = (
  packet: ClipboardPacket,
  event: ClipboardEvent
) => {
  const serialized = serializeClipboardPacket(packet)
  event.clipboardData?.setData(CLIPBOARD_MIME, serialized)
  event.clipboardData?.setData('text/plain', serialized)
}

const readClipboardPacketFromEvent = (
  event: ClipboardEvent
): ClipboardPacket | undefined => {
  const custom = event.clipboardData?.getData(CLIPBOARD_MIME)
  if (custom) {
    const parsed = parseClipboardPacket(custom)
    if (parsed) {
      return parsed
    }
  }

  const text = event.clipboardData?.getData('text/plain')
  return text
    ? parseClipboardPacket(text)
    : undefined
}

export const createClipboardHostAdapter = (): ClipboardHostAdapter => {
  let memoryText: string | undefined

  return {
    write: async (packet, event) => {
      const serialized = serializeClipboardPacket(packet)
      memoryText = serialized

      if (event?.clipboardData) {
        writeClipboardPacketToEvent(packet, event)
        return true
      }

      if (typeof navigator === 'undefined' || !navigator.clipboard?.writeText) {
        return true
      }

      try {
        await navigator.clipboard.writeText(serialized)
      } catch {
        // Ignore clipboard write failures.
      }

      return true
    },
    read: async (event) => {
      const fromEvent = event ? readClipboardPacketFromEvent(event) : undefined
      if (fromEvent) {
        memoryText = serializeClipboardPacket(fromEvent)
        return fromEvent
      }

      if (typeof navigator !== 'undefined' && navigator.clipboard?.readText) {
        try {
          const text = await navigator.clipboard.readText()
          const parsed = parseClipboardPacket(text)
          if (parsed) {
            memoryText = text
            return parsed
          }
        } catch {
          // Ignore clipboard read failures.
        }
      }

      return memoryText
        ? parseClipboardPacket(memoryText)
        : undefined
    }
  }
}
