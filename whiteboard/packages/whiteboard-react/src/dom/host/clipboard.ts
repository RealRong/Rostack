import { editor } from '@whiteboard/editor'
import type { ClipboardPacket } from '@whiteboard/editor'

const CLIPBOARD_MIME = 'application/x-whiteboard-slice'

export type ClipboardHostAdapter = {
  write: (packet: ClipboardPacket, event?: ClipboardEvent) => Promise<boolean>
  read: (event?: ClipboardEvent) => Promise<ClipboardPacket | undefined>
}

export type ClipboardAdapter = ClipboardHostAdapter

const writeClipboardPacketToEvent = (
  packet: ClipboardPacket,
  event: ClipboardEvent
) => {
  const serialized = editor.clipboard.serialize(packet)
  event.clipboardData?.setData(CLIPBOARD_MIME, serialized)
  event.clipboardData?.setData('text/plain', serialized)
}

const readClipboardPacketFromEvent = (
  event: ClipboardEvent
): ClipboardPacket | undefined => {
  const custom = event.clipboardData?.getData(CLIPBOARD_MIME)
  if (custom) {
    const parsed = editor.clipboard.parse(custom)
    if (parsed) {
      return parsed
    }
  }

  const text = event.clipboardData?.getData('text/plain')
  return text
    ? editor.clipboard.parse(text)
    : undefined
}

export const createClipboardHostAdapter = (): ClipboardHostAdapter => {
  let memoryText: string | undefined

  return {
    write: async (packet, event) => {
      const serialized = editor.clipboard.serialize(packet)
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
        memoryText = editor.clipboard.serialize(fromEvent)
        return fromEvent
      }

      if (typeof navigator !== 'undefined' && navigator.clipboard?.readText) {
        try {
          const text = await navigator.clipboard.readText()
          const parsed = editor.clipboard.parse(text)
          if (parsed) {
            memoryText = text
            return parsed
          }
        } catch {
          // Ignore clipboard read failures.
        }
      }

      return memoryText
        ? editor.clipboard.parse(memoryText)
        : undefined
    }
  }
}
