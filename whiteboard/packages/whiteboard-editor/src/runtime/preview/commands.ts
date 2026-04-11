import type { NodeId } from '@whiteboard/core/types'
import type { EditorOverlay } from '../overlay'
import {
  isTextPreviewPatchEqual,
  readTextPreviewEntry,
  replaceTextPreviewEntry
} from '../overlay/node'
import type { PreviewRuntime } from './types'

const EMPTY_EDGE_PATCHES = [] as const
const EMPTY_NODE_IDS: readonly NodeId[] = []

const mergeTextPreviewPatch = (
  current: Parameters<PreviewRuntime['node']['text']['set']>[1],
  patch: Parameters<PreviewRuntime['node']['text']['set']>[1]
) => {
  if (!current && !patch) {
    return undefined
  }

  const next = {
    position: patch?.position ?? current?.position,
    size: patch?.size ?? current?.size,
    fontSize: patch?.fontSize ?? current?.fontSize,
    mode: patch?.mode ?? current?.mode,
    wrapWidth: patch?.wrapWidth ?? current?.wrapWidth,
    handle: patch?.handle ?? current?.handle
  }

  if (
    !next.position
    && !next.size
    && next.fontSize === undefined
    && next.mode === undefined
    && next.wrapWidth === undefined
    && next.handle === undefined
  ) {
    return undefined
  }

  return next
}

export const createPreviewRuntime = ({
  overlay
}: {
  overlay: Pick<EditorOverlay, 'set'>
}): PreviewRuntime => ({
  draw: {
    setPreview: (preview) => {
      overlay.set((current) => (
        current.draw.preview === preview
          ? current
          : {
              ...current,
              draw: {
                ...current.draw,
                preview
              }
            }
      ))
    },
    setHidden: (nodeIds) => {
      overlay.set((current) => ({
        ...current,
        draw: {
          ...current.draw,
          hidden: nodeIds
        }
      }))
    },
    clear: () => {
      overlay.set((current) => (
        current.draw.preview === null
        && current.draw.hidden.length === 0
          ? current
          : {
              ...current,
              draw: {
                preview: null,
                hidden: EMPTY_NODE_IDS
              }
            }
      ))
    }
  },
  node: {
    text: {
      set: (nodeId, patch) => {
        overlay.set((current) => {
          const currentPatch = readTextPreviewEntry(current.node.text.patches, nodeId)
          const nextPatch = mergeTextPreviewPatch(currentPatch, patch)

          if (isTextPreviewPatchEqual(currentPatch, nextPatch)) {
            return current
          }

          return {
            ...current,
            node: {
              ...current.node,
              text: {
                patches: replaceTextPreviewEntry(current.node.text.patches, nodeId, nextPatch)
              }
            }
          }
        })
      },
      clear: (nodeId) => {
        overlay.set((current) => {
          if (!readTextPreviewEntry(current.node.text.patches, nodeId)) {
            return current
          }

          return {
            ...current,
            node: {
              ...current.node,
              text: {
                patches: replaceTextPreviewEntry(current.node.text.patches, nodeId, undefined)
              }
            }
          }
        })
      },
      clearSize: (nodeId) => {
        overlay.set((current) => {
          const patch = readTextPreviewEntry(current.node.text.patches, nodeId)
          if (!patch?.size) {
            return current
          }

          const nextPatch = {
            position: patch.position,
            fontSize: patch.fontSize,
            mode: patch.mode,
            wrapWidth: patch.wrapWidth,
            handle: patch.handle
          }

          return {
            ...current,
            node: {
              ...current.node,
              text: {
                patches: replaceTextPreviewEntry(
                  current.node.text.patches,
                  nodeId,
                  !nextPatch.position
                  && nextPatch.fontSize === undefined
                  && nextPatch.mode === undefined
                  && nextPatch.wrapWidth === undefined
                  && nextPatch.handle === undefined
                    ? undefined
                    : nextPatch
                )
              }
            }
          }
        })
      }
    }
  },
  edge: {
    setInteraction: (entries) => {
      overlay.set((current) => ({
        ...current,
        edge: {
          ...current.edge,
          interaction: entries
        }
      }))
    },
    setGuide: (guide) => {
      overlay.set((current) => (
        current.edge.guide === guide
          ? current
          : {
              ...current,
              edge: {
                ...current.edge,
                guide
              }
            }
      ))
    },
    clearPatches: () => {
      overlay.set((current) => (
        current.edge.interaction.length === 0
          ? current
          : {
              ...current,
              edge: {
                ...current.edge,
                interaction: EMPTY_EDGE_PATCHES
              }
            }
      ))
    },
    clearGuide: () => {
      overlay.set((current) => (
        current.edge.guide === undefined
          ? current
          : {
              ...current,
              edge: {
                ...current.edge,
                guide: undefined
              }
            }
      ))
    },
    clear: () => {
      overlay.set((current) => (
        current.edge.interaction.length === 0
        && current.edge.guide === undefined
          ? current
          : {
              ...current,
              edge: {
                ...current.edge,
                interaction: EMPTY_EDGE_PATCHES,
                guide: undefined
              }
            }
      ))
    }
  },
  mindmap: {
    setDrag: (drag) => {
      overlay.set((current) => ({
        ...current,
        mindmap: {
          drag
        }
      }))
    },
    clear: () => {
      overlay.set((current) => (
        current.mindmap.drag === undefined
          ? current
          : {
              ...current,
              mindmap: {
                drag: undefined
              }
            }
      ))
    }
  }
})
