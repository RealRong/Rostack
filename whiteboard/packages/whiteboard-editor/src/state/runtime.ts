import { record as draftRecord } from '@shared/draft'
import {
  createMutationEngine,
  createMutationWriter,
  type MutationCommit,
  type MutationDelta,
  type MutationDocument,
  type MutationReader,
  type MutationWrite,
} from '@shared/mutation'
import type {
  SelectionTarget,
} from '@whiteboard/core/selection'
import {
  patchDrawStyle,
  setDrawSlot,
  type BrushStylePatch,
  type DrawState,
} from '@whiteboard/editor/schema/draw-state'
import type {
  DrawBrush,
  DrawSlot,
} from '@whiteboard/editor/schema/draw-mode'
import {
  DEFAULT_DRAW_BRUSH,
  hasDrawBrush,
} from '@whiteboard/editor/schema/draw-mode'
import type {
  EditSession,
} from '@whiteboard/editor/schema/edit'
import type { Tool } from '@whiteboard/editor/schema/tool'
import {
  buildEditorStateDocument,
  normalizeEditorStateDocument,
  type EditorHoverState,
  type EditorStableInteractionState,
  type EditorStateDocument,
} from './document'
import {
  editorStateMutationSchema,
} from './model'
import {
  EMPTY_PREVIEW_STATE,
  isDrawPreviewEqual,
  isPreviewEdgeRecordEqual,
  isPreviewMindmapRecordEqual,
  isPreviewNodeRecordEqual,
  isSelectionPreviewEqual,
} from './preview'
import type {
  EdgePreviewValue,
  MindmapPreviewValue,
  NodePreviewValue,
  PreviewInput,
} from '@whiteboard/editor-scene'

type EditorStateEngineIntent = {
  type: '__editor_state__'
}
type EdgeGuideValue = PreviewInput['edgeGuide'] | undefined
type NodePreviewPatchValue = Partial<NodePreviewValue>
type EdgePreviewPatchValue = Partial<EdgePreviewValue>
type MindmapPreviewPatchValue = Partial<MindmapPreviewValue>
type EditorStateMutationDocument = MutationDocument<typeof editorStateMutationSchema>

type InternalEditorStateWriter = {
  state: {
    patch(value: Partial<EditorStateDocument['state']>): void
  }
  hover: {
    patch(value: Partial<EditorHoverState>): void
  }
  preview: {
    node: ((id: string) => {
      patch(value: NodePreviewPatchValue): void
      remove(): void
    }) & {
      create(id: string, value: NodePreviewValue): void
      remove(id: string): void
    }
    edge: ((id: string) => {
      patch(value: EdgePreviewPatchValue): void
      remove(): void
    }) & {
      create(id: string, value: EdgePreviewValue): void
      remove(id: string): void
    }
    mindmap: ((id: string) => {
      patch(value: MindmapPreviewPatchValue): void
      remove(): void
    }) & {
      create(id: string, value: MindmapPreviewValue): void
      remove(id: string): void
    }
    selection: {
      patch(value: Partial<PreviewInput['selection']>): void
    }
    draw: {
      set(value: PreviewInput['draw']): void
    }
    edgeGuide: {
      set(value: EdgeGuideValue): void
    }
  }
}

export type EditorStateSnapshot = EditorStateDocument
export type EditorStateReader = MutationReader<typeof editorStateMutationSchema>
export type EditorStateMutationDelta = MutationDelta<typeof editorStateMutationSchema>
export type EditorStateCommit = MutationCommit<typeof editorStateMutationSchema>

export interface EditorStateWriter {
  tool: {
    set: (tool: Tool) => void
  }
  draw: {
    set: (state: DrawState) => void
    patch: (patch: BrushStylePatch) => void
    slot: (brush: DrawBrush, slot: DrawSlot) => void
  }
  selection: {
    set: (selection: SelectionTarget) => void
    clear: () => void
  }
  edit: {
    set: (edit: EditSession) => void
    clear: () => void
  }
  interaction: {
    set: (interaction: EditorStableInteractionState) => void
    clear: () => void
  }
  hover: {
    set: (hover: EditorHoverState) => void
    clear: () => void
  }
  preview: {
    node: {
      create: (id: string, value: NodePreviewValue) => void
      patch: (id: string, writes: Readonly<Record<string, unknown>>) => void
      delete: (id: string) => void
      replace: (next: PreviewInput['node']) => void
      clear: () => void
    }
    edge: {
      create: (id: string, value: EdgePreviewValue) => void
      patch: (id: string, writes: Readonly<Record<string, unknown>>) => void
      delete: (id: string) => void
      replace: (next: PreviewInput['edge']) => void
      clear: () => void
    }
    mindmap: {
      create: (id: string, value: MindmapPreviewValue) => void
      patch: (id: string, writes: Readonly<Record<string, unknown>>) => void
      delete: (id: string) => void
      replace: (next: PreviewInput['mindmap']) => void
      clear: () => void
    }
    selection: {
      patch: (patch: Partial<PreviewInput['selection']>) => void
      set: (selection: PreviewInput['selection']) => void
      clear: () => void
    }
    draw: {
      set: (draw: PreviewInput['draw']) => void
      clear: () => void
    }
    edgeGuide: {
      set: (edgeGuide: EdgeGuideValue) => void
      clear: () => void
    }
    reset: () => void
  }
}

export interface EditorStateStoreFacade {
  read(): EditorStateSnapshot
  write(
    run: (context: {
      writer: EditorStateWriter
      snapshot: EditorStateSnapshot
    }) => void
  ): void
  subscribe(listener: (commit: EditorStateCommit) => void): () => void
}

const createEditorStateEngine = (input: {
  initialTool: Tool
  initialDrawState: DrawState
}) => createMutationEngine({
  schema: editorStateMutationSchema,
  document: buildEditorStateDocument({
    tool: input.initialTool,
    draw: input.initialDrawState
  }) as unknown as EditorStateMutationDocument,
  normalize: (document) => normalizeEditorStateDocument(
    document as unknown as EditorStateDocument
  ) as unknown as EditorStateMutationDocument,
  compile: {
    handlers: {}
  },
  services: undefined,
  history: false
})

export interface EditorStateRuntime extends EditorStateStoreFacade {
  engine: ReturnType<typeof createEditorStateEngine>
  dispose(): void
}

const applyCollectionReplace = <TId extends string, TValue>(
  input: {
    current: Readonly<Record<TId, TValue | undefined>>
    next: Readonly<Record<TId, TValue | undefined>>
    create: (id: TId, value: TValue) => void
    patch: (id: TId, writes: Readonly<Record<string, unknown>>) => void
    remove: (id: TId) => void
  }
) => {
  const ids = new Set<TId>([
    ...(Object.keys(input.current) as TId[]),
    ...(Object.keys(input.next) as TId[])
  ])

  ids.forEach((id) => {
    const currentValue = input.current[id]
    const nextValue = input.next[id]

    if (currentValue && !nextValue) {
      input.remove(id)
      return
    }
    if (!currentValue && nextValue) {
      input.create(id, nextValue)
      return
    }
    if (!currentValue || !nextValue) {
      return
    }

    const writes = draftRecord.diff(
      currentValue,
      nextValue
    ) as Readonly<Record<string, unknown>>
    if (Object.keys(writes).length === 0) {
      return
    }

    input.patch(id, writes)
  })
}

const createEditorStateWriter = (
  writer: InternalEditorStateWriter,
  readSnapshot: () => EditorStateSnapshot
): EditorStateWriter => ({
  tool: {
    set: (tool) => {
      writer.state.patch({
        tool
      })
    }
  },
  draw: {
    set: (state) => {
      writer.state.patch({
        draw: state
      })
    },
    patch: (patch) => {
      const snapshot = readSnapshot()
      const tool = snapshot.state.tool
      const brush = tool.type === 'draw' && hasDrawBrush(tool.mode)
        ? tool.mode
        : DEFAULT_DRAW_BRUSH
      const slot = snapshot.state.draw[brush].slot
      writer.state.patch({
        draw: patchDrawStyle(
          snapshot.state.draw,
          brush,
          slot,
          patch
        )
      })
    },
    slot: (brush, slot) => {
      const snapshot = readSnapshot()
      writer.state.patch({
        draw: setDrawSlot(
          snapshot.state.draw,
          brush,
          slot
        )
      })
    }
  },
  selection: {
    set: (selection) => {
      writer.state.patch({
        selection
      })
    },
    clear: () => {
      writer.state.patch({
        selection: {
          nodeIds: [],
          edgeIds: []
        }
      })
    }
  },
  edit: {
    set: (edit) => {
      writer.state.patch({
        edit
      })
    },
    clear: () => {
      writer.state.patch({
        edit: null
      })
    }
  },
  interaction: {
    set: (interaction) => {
      writer.state.patch({
        interaction
      })
    },
    clear: () => {
      writer.state.patch({
        interaction: {
          mode: 'idle',
          chrome: false,
          space: false
        }
      })
    }
  },
  hover: {
    set: (hover) => {
      writer.hover.patch(hover)
    },
    clear: () => {
      writer.hover.patch({
        node: null,
        edge: null,
        mindmap: null,
        group: null,
        selectionBox: false
      })
    }
  },
  preview: {
    node: {
      create: (id, value) => {
        writer.preview.node.create(id, value)
      },
      patch: (id, writes) => {
        writer.preview.node(id).patch(
          writes as NodePreviewPatchValue
        )
      },
      delete: (id) => {
        writer.preview.node.remove(id)
      },
      replace: (next) => {
        const current = readSnapshot().preview.node
        if (isPreviewNodeRecordEqual(current, next)) {
          return
        }

        applyCollectionReplace({
          current,
          next,
          create: (id, value) => {
            writer.preview.node.create(id, value)
          },
          patch: (id, writes) => {
            writer.preview.node(id).patch(
              writes as NodePreviewPatchValue
            )
          },
          remove: (id) => {
            writer.preview.node.remove(id)
          }
        })
      },
      clear: () => {
        Object.keys(readSnapshot().preview.node).forEach((id) => {
          writer.preview.node.remove(id)
        })
      }
    },
    edge: {
      create: (id, value) => {
        writer.preview.edge.create(id, value)
      },
      patch: (id, writes) => {
        writer.preview.edge(id).patch(
          writes as EdgePreviewPatchValue
        )
      },
      delete: (id) => {
        writer.preview.edge.remove(id)
      },
      replace: (next) => {
        const current = readSnapshot().preview.edge
        if (isPreviewEdgeRecordEqual(current, next)) {
          return
        }

        applyCollectionReplace({
          current,
          next,
          create: (id, value) => {
            writer.preview.edge.create(id, value)
          },
          patch: (id, writes) => {
            writer.preview.edge(id).patch(
              writes as EdgePreviewPatchValue
            )
          },
          remove: (id) => {
            writer.preview.edge.remove(id)
          }
        })
      },
      clear: () => {
        Object.keys(readSnapshot().preview.edge).forEach((id) => {
          writer.preview.edge.remove(id)
        })
      }
    },
    mindmap: {
      create: (id, value) => {
        writer.preview.mindmap.create(id, value)
      },
      patch: (id, writes) => {
        writer.preview.mindmap(id).patch(
          writes as MindmapPreviewPatchValue
        )
      },
      delete: (id) => {
        writer.preview.mindmap.remove(id)
      },
      replace: (next) => {
        const current = readSnapshot().preview.mindmap
        if (isPreviewMindmapRecordEqual(current, next)) {
          return
        }

        applyCollectionReplace({
          current,
          next,
          create: (id, value) => {
            writer.preview.mindmap.create(id, value)
          },
          patch: (id, writes) => {
            writer.preview.mindmap(id).patch(
              writes as MindmapPreviewPatchValue
            )
          },
          remove: (id) => {
            writer.preview.mindmap.remove(id)
          }
        })
      },
      clear: () => {
        Object.keys(readSnapshot().preview.mindmap).forEach((id) => {
          writer.preview.mindmap.remove(id)
        })
      }
    },
    selection: {
      patch: (patch) => {
        writer.preview.selection.patch(patch)
      },
      set: (selection) => {
        const current = readSnapshot().preview.selection
        if (isSelectionPreviewEqual(current, selection)) {
          return
        }
        writer.preview.selection.patch(
          draftRecord.diff(current, selection)
        )
      },
      clear: () => {
        writer.preview.selection.patch(
          draftRecord.diff(
            readSnapshot().preview.selection,
            EMPTY_PREVIEW_STATE.selection
          )
        )
      }
    },
    draw: {
      set: (draw) => {
        const current = readSnapshot().preview.draw
        if (isDrawPreviewEqual(current, draw)) {
          return
        }
        writer.preview.draw.set(draw)
      },
      clear: () => {
        writer.preview.draw.set(null)
      }
    },
    edgeGuide: {
      set: (edgeGuide) => {
        writer.preview.edgeGuide.set(edgeGuide)
      },
      clear: () => {
        writer.preview.edgeGuide.set(undefined)
      }
    },
    reset: () => {
      Object.keys(readSnapshot().preview.node).forEach((id) => {
        writer.preview.node.remove(id)
      })
      Object.keys(readSnapshot().preview.edge).forEach((id) => {
        writer.preview.edge.remove(id)
      })
      Object.keys(readSnapshot().preview.mindmap).forEach((id) => {
        writer.preview.mindmap.remove(id)
      })
      writer.preview.selection.patch(
        draftRecord.diff(
          readSnapshot().preview.selection,
          EMPTY_PREVIEW_STATE.selection
        )
      )
      writer.preview.draw.set(EMPTY_PREVIEW_STATE.draw)
      writer.preview.edgeGuide.set(EMPTY_PREVIEW_STATE.edgeGuide)
    }
  }
})

export const createEditorStateRuntime = (input: {
  initialTool: Tool
  initialDrawState: DrawState
}): EditorStateRuntime => {
  const engine = createEditorStateEngine(input)

  let currentDocument = engine.document() as unknown as EditorStateDocument
  const listeners = new Set<(commit: EditorStateCommit) => void>()

  engine.subscribe((commit) => {
    currentDocument = commit.document as unknown as EditorStateDocument
    listeners.forEach((listener) => {
      listener(commit)
    })
  })

  const read = () => currentDocument

  const write: EditorStateRuntime['write'] = (run) => {
    const writes: MutationWrite[] = []
    const rawWriter = createMutationWriter(
      editorStateMutationSchema,
      writes
    ) as unknown as InternalEditorStateWriter
    const writer = createEditorStateWriter(
      rawWriter,
      read
    )

    run({
      writer,
      snapshot: currentDocument
    })

    if (writes.length === 0) {
      return
    }

    engine.apply(writes, {
      history: false
    })
    currentDocument = engine.document() as unknown as EditorStateDocument
  }

  return {
    engine,
    read,
    write,
    subscribe: (listener) => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    dispose: () => {}
  }
}
