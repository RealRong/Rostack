import type {
  Slice,
  SliceExportResult,
  SliceRoots
} from '@whiteboard/core/document'
import { document as documentApi } from '@whiteboard/core/document'

const CLIPBOARD_PACKET_TYPE = 'whiteboard/slice'
const CLIPBOARD_PACKET_VERSION = 1

export type ClipboardPacket = {
  type: typeof CLIPBOARD_PACKET_TYPE
  version: typeof CLIPBOARD_PACKET_VERSION
  slice: Slice
  roots?: SliceRoots
}

export const createClipboardPacket = (
  exported: SliceExportResult
): ClipboardPacket => ({
  type: CLIPBOARD_PACKET_TYPE,
  version: CLIPBOARD_PACKET_VERSION,
  slice: documentApi.slice.translate(exported.slice, {
    x: -exported.bounds.x,
    y: -exported.bounds.y
  }),
  roots: exported.roots
})

export const serializeClipboardPacket = (
  packet: ClipboardPacket
) => JSON.stringify(packet)

export const parseClipboardPacket = (
  value: string
): ClipboardPacket | undefined => {
  try {
    const parsed = JSON.parse(value) as Partial<ClipboardPacket> | null
    if (
      !parsed
      || parsed.type !== CLIPBOARD_PACKET_TYPE
      || parsed.version !== CLIPBOARD_PACKET_VERSION
    ) {
      return undefined
    }

    if (!parsed.slice || parsed.slice.version !== 1) {
      return undefined
    }

    return {
      type: CLIPBOARD_PACKET_TYPE,
      version: CLIPBOARD_PACKET_VERSION,
      slice: parsed.slice,
      roots: parsed.roots
        ? {
            nodeIds: [...parsed.roots.nodeIds],
            edgeIds: [...parsed.roots.edgeIds]
          }
        : undefined
    }
  } catch {
    return undefined
  }
}
