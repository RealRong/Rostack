import type { Guide } from '@whiteboard/core/node'
import type { NodeId, Size } from '@whiteboard/core/types'
import {
  isNodePatchEqual,
  readNodePatchEntry,
  replaceNodePatchEntry,
  type EdgeGuide,
  type EdgeOverlayEntry,
  type EditorOverlay,
  type MarqueeOverlayState,
  type MindmapDragFeedback,
  type NodePatch,
  type NodePatchEntry
} from '../overlay'
import type { DrawPreview } from '../../types/draw'
import type { EditorPreviewWrite } from '../../types/editor'

const EMPTY_EDGE_PATCHES: readonly EdgeOverlayEntry[] = []
const EMPTY_GUIDES: readonly Guide[] = []
const EMPTY_NODE_IDS: readonly NodeId[] = []
const EMPTY_NODE_PATCHES: readonly NodePatchEntry[] = []

const mergeTextPreviewPatch = (
  patch: NodePatch | undefined,
  size?: Size
): NodePatch | undefined => {
  if (!patch && !size) {
    return undefined
  }

  const next: NodePatch = {
    position: patch?.position,
    rotation: patch?.rotation,
    size
  }

  if (!next.position && next.rotation === undefined && !next.size) {
    return undefined
  }

  return next
}

export const createPreviewWrite = ({
  overlay
}: {
  overlay: Pick<EditorOverlay, 'set'>
}): EditorPreviewWrite => ({
  draw: {
    setPreview: (preview: DrawPreview | null) => {
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
      setSize: (nodeId, size) => {
        overlay.set((current) => {
          const patch = readNodePatchEntry(current.node.text.patches, nodeId)
          const nextPatch = mergeTextPreviewPatch(patch, size)

          if (isNodePatchEqual(patch, nextPatch)) {
            return current
          }

          return {
            ...current,
            node: {
              ...current.node,
              text: {
                patches: replaceNodePatchEntry(current.node.text.patches, nodeId, nextPatch)
              }
            }
          }
        })
      },
      clearSize: (nodeId) => {
        overlay.set((current) => {
          const patch = readNodePatchEntry(current.node.text.patches, nodeId)
          if (!patch?.size) {
            return current
          }

          return {
            ...current,
            node: {
              ...current.node,
              text: {
                patches: replaceNodePatchEntry(
                  current.node.text.patches,
                  nodeId,
                  mergeTextPreviewPatch(patch, undefined)
                )
              }
            }
          }
        })
      }
    }
  },
  selection: {
    setNodePatches: (patches) => {
      overlay.set((current) => ({
        ...current,
        selection: {
          ...current.selection,
          node: {
            ...current.selection.node,
            patches
          }
        }
      }))
    },
    setFrameHover: (frameHoverId) => {
      overlay.set((current) => (
        current.selection.node.frameHoverId === frameHoverId
          ? current
          : {
              ...current,
              selection: {
                ...current.selection,
                node: {
                  ...current.selection.node,
                  frameHoverId
                }
              }
            }
      ))
    },
    setEdgePatches: (patches) => {
      overlay.set((current) => ({
        ...current,
        selection: {
          ...current.selection,
          edge: patches
        }
      }))
    },
    setMarquee: (marquee) => {
      overlay.set((current) => (
        current.selection.marquee === marquee
          ? current
          : {
              ...current,
              selection: {
                ...current.selection,
                marquee
              }
            }
      ))
    },
    setGuides: (guides) => {
      overlay.set((current) => ({
        ...current,
        selection: {
          ...current.selection,
          guides
        }
      }))
    },
    clearPreview: () => {
      overlay.set((current) => (
        current.selection.node.patches.length === 0
        && current.selection.node.frameHoverId === undefined
        && current.selection.edge.length === 0
        && current.selection.guides.length === 0
          ? current
          : {
              ...current,
              selection: {
              ...current.selection,
              node: {
                patches: EMPTY_NODE_PATCHES,
                frameHoverId: undefined
              },
              edge: EMPTY_EDGE_PATCHES,
              guides: EMPTY_GUIDES
              }
            }
      ))
    },
    clearTransient: () => {
      overlay.set((current) => (
        current.selection.node.patches.length === 0
        && current.selection.node.frameHoverId === undefined
        && current.selection.edge.length === 0
        && current.selection.marquee === undefined
        && current.selection.guides.length === 0
          ? current
          : {
              ...current,
              selection: {
                node: {
                  patches: EMPTY_NODE_PATCHES,
                  frameHoverId: undefined
                },
                edge: EMPTY_EDGE_PATCHES,
                guides: EMPTY_GUIDES
              }
            }
      ))
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
    setGuide: (guide?: EdgeGuide) => {
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
    setDrag: (drag?: MindmapDragFeedback) => {
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
