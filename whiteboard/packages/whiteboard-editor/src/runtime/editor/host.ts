import type { EngineInstance } from '@engine-types/instance'
import {
  applySelectionTarget,
  isSelectionTargetEqual,
  normalizeSelectionTarget,
  type SelectionTarget
} from '@whiteboard/core/selection'
import type { NodeId } from '@whiteboard/core/types'
import type { PointerSample } from '../../types/input'
import type { Tool } from '../../types/tool'
import type { EditorRead } from '../../types/editor'
import type {
  DocumentRuntime,
  PreviewRuntime,
  EditorRuntime,
  SessionRuntime,
  ViewRuntime
} from '../../internal/types'
import type { EditorViewportRuntime } from './types'
import type { RuntimeStateController } from '../state'
import type { EditorOverlay } from '../overlay'
import {
  isTextPreviewPatchEqual,
  readTextPreviewEntry,
  replaceTextPreviewEntry
} from '../overlay/node'
import {
  createMindmapRuntime
} from '../commands/mindmap'
import { createNodeAppearanceMutations } from '../commands/node/appearance'
import { createNodePatchWriter } from '../commands/node/document'
import { createNodeLockMutations } from '../commands/node/lock'
import { createNodeShapeMutations } from '../commands/node/shape'
import { createNodeTextMutations } from '../commands/node/text'
import { isSameTool } from '../../tool/model'

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
    handle: patch?.handle ?? current?.handle
  }

  if (
    !next.position
    && !next.size
    && next.fontSize === undefined
    && next.mode === undefined
    && next.handle === undefined
  ) {
    return undefined
  }

  return next
}

const createPreviewHost = ({
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

const createSessionHost = ({
  engine,
  runtime
}: {
  engine: EngineInstance
  runtime: Pick<RuntimeStateController, 'state'>
}): SessionRuntime => {
  const writeSelection = (input: {
    next: SelectionTarget
    apply: () => void
  }) => {
    if (isSelectionTargetEqual(runtime.state.selection.source.get(), input.next)) {
      return
    }

    runtime.state.edit.mutate.clear()
    input.apply()
  }

  return {
    tool: {
      set: (nextTool: Tool) => {
        if (nextTool.type === 'draw') {
          runtime.state.edit.mutate.clear()
          runtime.state.selection.mutate.clear()
        }
        if (isSameTool(runtime.state.tool.get(), nextTool)) {
          return
        }
        runtime.state.tool.set(nextTool)
      }
    },
    selection: {
      replace: (input) => {
        writeSelection({
          next: normalizeSelectionTarget(input),
          apply: () => {
            runtime.state.selection.mutate.replace(input)
          }
        })
      },
      add: (input) => {
        writeSelection({
          next: applySelectionTarget(runtime.state.selection.source.get(), input, 'add'),
          apply: () => {
            runtime.state.selection.mutate.add(input)
          }
        })
      },
      remove: (input) => {
        writeSelection({
          next: applySelectionTarget(runtime.state.selection.source.get(), input, 'subtract'),
          apply: () => {
            runtime.state.selection.mutate.remove(input)
          }
        })
      },
      toggle: (input) => {
        writeSelection({
          next: applySelectionTarget(runtime.state.selection.source.get(), input, 'toggle'),
          apply: () => {
            runtime.state.selection.mutate.toggle(input)
          }
        })
      },
      selectAll: () => {
        const next = normalizeSelectionTarget({
          nodeIds: [...engine.read.node.list.get()],
          edgeIds: [...engine.read.edge.list.get()]
        })
        writeSelection({
          next,
          apply: () => {
            runtime.state.selection.mutate.replace(next)
          }
        })
      },
      clear: () => {
        writeSelection({
          next: normalizeSelectionTarget({}),
          apply: () => {
            runtime.state.selection.mutate.clear()
          }
        })
      }
    },
    edit: runtime.state.edit.mutate
  }
}

const createViewHost = ({
  runtime,
  viewport
}: {
  runtime: RuntimeStateController
  viewport: EditorViewportRuntime
}): ViewRuntime => ({
  viewport: {
    ...viewport.commands,
    ...viewport.input,
    setRect: viewport.setRect,
    setLimits: viewport.setLimits
  },
  pointer: {
    set: (sample: PointerSample) => {
      runtime.state.pointer.set(sample)
    },
    clear: () => {
      runtime.state.pointer.set(null)
    }
  },
  space: {
    set: (value) => {
      runtime.state.space.set(value)
    }
  },
  draw: {
    set: (preferences) => {
      runtime.state.draw.commands.set(preferences)
    },
    slot: (slot) => {
      const tool = runtime.state.tool.get()
      const kind = tool.type === 'draw' && tool.kind !== 'eraser'
        ? tool.kind
        : 'pen'
      runtime.state.draw.commands.slot(kind, slot)
    },
    patch: (patch) => {
      const tool = runtime.state.tool.get()
      const kind = tool.type === 'draw' && tool.kind !== 'eraser'
        ? tool.kind
        : 'pen'
      const slot = runtime.state.draw.store.get()[kind].slot
      runtime.state.draw.commands.patch(kind, slot, patch)
    }
  }
})

const createDocumentHost = ({
  engine,
  read,
  session,
  preview
}: {
  engine: EngineInstance
  read: EditorRead
  session: Pick<SessionRuntime, 'edit' | 'selection'>
  preview: Pick<PreviewRuntime, 'node'>
}): DocumentRuntime => {
  const nodePatch = createNodePatchWriter(engine)
  const nodeAppearance = createNodeAppearanceMutations({
    engine,
    document: nodePatch
  })
  const nodeLock = createNodeLockMutations({
    engine,
    document: nodePatch
  })
  const nodeShape = createNodeShapeMutations({
    engine,
    document: nodePatch
  })
  const nodeText = createNodeTextMutations({
    read,
    committedNode: engine.read.node.item,
    preview,
    session,
    deleteCascade: (ids) => engine.execute({
      type: 'node.deleteCascade',
      ids
    }),
    document: nodePatch,
    appearance: nodeAppearance
  })

  const node = {
    create: (payload) => engine.execute({
      type: 'node.create',
      payload
    }),
    move: (input) => engine.execute({
      type: 'node.move',
      ids: input.ids,
      delta: input.delta
    }),
    align: (ids, mode) => engine.execute({
      type: 'node.align',
      ids,
      mode
    }),
    distribute: (ids, mode) => engine.execute({
      type: 'node.distribute',
      ids,
      mode
    }),
    delete: (ids) => engine.execute({
      type: 'node.delete',
      ids
    }),
    deleteCascade: (ids) => engine.execute({
      type: 'node.deleteCascade',
      ids
    }),
    duplicate: (ids) => engine.execute({
      type: 'node.duplicate',
      ids
    }),
    update: nodePatch.update,
    updateMany: nodePatch.updateMany,
    lock: nodeLock,
    shape: nodeShape,
    appearance: nodeAppearance,
    text: {
      commit: nodeText.commit,
      setColor: nodeText.setColor,
      setSize: nodeText.setSize,
      setWeight: nodeText.setWeight,
      setItalic: nodeText.setItalic,
      setAlign: nodeText.setAlign
    }
  } satisfies DocumentRuntime['node']

  const mindmap = createMindmapRuntime({
    engine,
    runtimeHost: {
      read,
      document: {
        mindmap: {
          create: (payload) => engine.execute({
            type: 'mindmap.create',
            payload
          }),
          delete: (ids) => engine.execute({
            type: 'mindmap.delete',
            ids
          }),
          insert: (id, input) => engine.execute({
            type: 'mindmap.insert',
            id,
            input
          }),
          moveSubtree: (id, input) => engine.execute({
            type: 'mindmap.move',
            id,
            input
          }),
          removeSubtree: (id, input) => engine.execute({
            type: 'mindmap.remove',
            id,
            input
          }),
          cloneSubtree: (id, input) => engine.execute({
            type: 'mindmap.clone',
            id,
            input
          }),
          updateNode: (id, input) => engine.execute({
            type: 'mindmap.patchNode',
            id,
            input
          })
        },
        node: {
          update: nodePatch.update
        }
      }
    }
  })

  return {
    replace: (document) => engine.execute({
      type: 'document.replace',
      document
    }),
    insert: (slice, options) => engine.execute({
      type: 'document.insert',
      slice,
      options
    }),
    delete: (refs) => engine.execute({
      type: 'document.delete',
      refs
    }),
    duplicate: (refs) => engine.execute({
      type: 'document.duplicate',
      refs
    }),
    order: (refs, mode) => engine.execute({
      type: 'document.order',
      refs,
      mode
    }),
    background: {
      set: (background) => engine.execute({
        type: 'document.background.set',
        background
      })
    },
    history: {
      get: engine.history.get,
      undo: engine.history.undo,
      redo: engine.history.redo,
      clear: engine.history.clear
    },
    group: {
      merge: (target) => engine.execute({
        type: 'group.merge',
        target
      }),
      order: {
        set: (ids) => engine.execute({
          type: 'group.order',
          mode: 'set',
          ids
        }),
        bringToFront: (ids) => engine.execute({
          type: 'group.order',
          mode: 'front',
          ids
        }),
        sendToBack: (ids) => engine.execute({
          type: 'group.order',
          mode: 'back',
          ids
        }),
        bringForward: (ids) => engine.execute({
          type: 'group.order',
          mode: 'forward',
          ids
        }),
        sendBackward: (ids) => engine.execute({
          type: 'group.order',
          mode: 'backward',
          ids
        })
      },
      ungroup: (id) => engine.execute({
        type: 'group.ungroup',
        id
      }),
      ungroupMany: (ids) => engine.execute({
        type: 'group.ungroupMany',
        ids
      })
    },
    edge: {
      create: (payload) => engine.execute({
        type: 'edge.create',
        payload
      }),
      move: (edgeId, delta) => engine.execute({
        type: 'edge.move',
        edgeId,
        delta
      }),
      reconnect: (edgeId, end, target) => engine.execute({
        type: 'edge.reconnect',
        edgeId,
        end,
        target
      }),
      update: (id, patch) => engine.execute({
        type: 'edge.patch',
        updates: [{
          id,
          patch
        }]
      }),
      updateMany: (updates) => engine.execute({
        type: 'edge.patch',
        updates
      }),
      delete: (ids) => engine.execute({
        type: 'edge.delete',
        ids
      }),
      route: {
        insert: (edgeId, point) => engine.execute({
          type: 'edge.route.insert',
          edgeId,
          point
        }),
        move: (edgeId, index, point) => engine.execute({
          type: 'edge.route.move',
          edgeId,
          index,
          point
        }),
        remove: (edgeId, index) => engine.execute({
          type: 'edge.route.remove',
          edgeId,
          index
        }),
        clear: (edgeId) => engine.execute({
          type: 'edge.route.clear',
          edgeId
        })
      }
    },
    node,
    mindmap
  }
}

export const createEditorRuntime = ({
  engine,
  read,
  runtime,
  overlay,
  viewport
}: {
  engine: EngineInstance
  read: EditorRead
  runtime: RuntimeStateController
  overlay: Pick<EditorOverlay, 'set'>
  viewport: EditorViewportRuntime
}): EditorRuntime => {
  const preview = createPreviewHost({
    overlay
  })
  const session = createSessionHost({
    engine,
    runtime
  })
  const view = createViewHost({
    runtime,
    viewport
  })
  const document = createDocumentHost({
    engine,
    read,
    session,
    preview
  })

  return {
    document,
    session,
    view,
    preview,
    batch: (recipe) => recipe({
      document,
      session,
      view,
      preview
    })
  }
}
