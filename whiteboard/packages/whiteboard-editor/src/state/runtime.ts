import { record as draftRecord } from '@shared/draft'
import {
  createMutationEngine,
  createMutationWriter,
  type MutationCommit,
  type MutationDelta,
  type MutationDocument,
  type MutationReader,
  type MutationWrite,
  type MutationWriter,
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
import type { PreviewInput } from '@whiteboard/editor-scene'

type InternalEditorStateWriter = MutationWriter<typeof editorStateMutationSchema>
type EditorStateEngineIntent = {
  type: '__editor_state__'
}
type EdgeGuideValue = PreviewInput['edgeGuide'] | undefined

export type EditorStateSnapshot = EditorStateDocument
export type EditorStateReader = MutationReader<typeof editorStateMutationSchema>
export type EditorStateMutationDelta = MutationDelta<typeof editorStateMutationSchema>
export type EditorStateCommit = MutationCommit<typeof editorStateMutationSchema>
type EditorStateMutationDocument = MutationDocument<typeof editorStateMutationSchema>

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
      create: (input: { id: string } & NonNullable<PreviewInput['node'][string]>) => void
      patch: (id: string, writes: Readonly<Record<string, unknown>>) => void
      delete: (id: string) => void
      replace: (next: PreviewInput['node']) => void
      clear: () => void
    }
    edge: {
      create: (input: { id: string } & NonNullable<PreviewInput['edge'][string]>) => void
      patch: (id: string, writes: Readonly<Record<string, unknown>>) => void
      delete: (id: string) => void
      replace: (next: PreviewInput['edge']) => void
      clear: () => void
    }
    mindmap: {
      create: (input: { id: string } & NonNullable<PreviewInput['mindmap'][string]>) => void
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
      patch: (patch: { current: PreviewInput['draw'] }) => void
      set: (draw: PreviewInput['draw']) => void
      clear: () => void
    }
    edgeGuide: {
      patch: (patch: { current: EdgeGuideValue }) => void
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
}) => createMutationEngine<
  typeof editorStateMutationSchema,
  EditorStateEngineIntent,
  undefined
>({
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
      create: (input) => {
        writer.preview.node.create(input)
      },
      patch: (id, writes) => {
        writer.preview.node(id).patch(
          writes as Partial<NonNullable<PreviewInput['node'][string]>>
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
            writer.preview.node.create({
              id,
              ...value
            })
          },
          patch: (id, writes) => {
            writer.preview.node(id).patch(
              writes as Partial<NonNullable<PreviewInput['node'][string]>>
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
      create: (input) => {
        writer.preview.edge.create(input)
      },
      patch: (id, writes) => {
        writer.preview.edge(id).patch(
          writes as Partial<NonNullable<PreviewInput['edge'][string]>>
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
            writer.preview.edge.create({
              id,
              ...value
            })
          },
          patch: (id, writes) => {
            writer.preview.edge(id).patch(
              writes as Partial<NonNullable<PreviewInput['edge'][string]>>
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
      create: (input) => {
        writer.preview.mindmap.create(input)
      },
      patch: (id, writes) => {
        writer.preview.mindmap(id).patch(
          writes as Partial<NonNullable<PreviewInput['mindmap'][string]>>
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
            writer.preview.mindmap.create({
              id,
              ...value
            })
          },
          patch: (id, writes) => {
            writer.preview.mindmap(id).patch(
              writes as Partial<NonNullable<PreviewInput['mindmap'][string]>>
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
      patch: (patch) => {
        writer.preview.draw.patch(patch)
      },
      set: (draw) => {
        const current = readSnapshot().preview.draw
        if (isDrawPreviewEqual(current, draw)) {
          return
        }
        writer.preview.draw.patch({
          current: draw
        })
      },
      clear: () => {
        writer.preview.draw.patch({
          current: null
        })
      }
    },
    edgeGuide: {
      patch: (patch) => {
        writer.preview.edgeGuide.patch(patch)
      },
      set: (edgeGuide) => {
        writer.preview.edgeGuide.patch({
          current: edgeGuide
        })
      },
      clear: () => {
        writer.preview.edgeGuide.patch({
          current: undefined
        })
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
      writer.preview.draw.patch({
        current: EMPTY_PREVIEW_STATE.draw
      })
      writer.preview.edgeGuide.patch({
        current: EMPTY_PREVIEW_STATE.edgeGuide
      })
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
    )
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
