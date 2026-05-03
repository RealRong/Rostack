import { record as draftRecord } from '@shared/draft'
import { MutationEngine, type MutationResult } from '@shared/mutation'
import type {
  MutationCommitRecord,
  MutationDeltaOf,
  MutationFootprint,
  MutationReader,
  MutationWriter
} from '@shared/mutation'
import {
  createMutationProgramWriter,
  createMutationWriter
} from '@shared/mutation'
import type {
  SelectionTarget
} from '@whiteboard/core/selection'
import {
  patchDrawStyle,
  setDrawSlot,
  type BrushStylePatch,
  type DrawState
} from '@whiteboard/editor/schema/draw-state'
import type {
  DrawBrush,
  DrawSlot
} from '@whiteboard/editor/schema/draw-mode'
import {
  DEFAULT_DRAW_BRUSH,
  hasDrawBrush
} from '@whiteboard/editor/schema/draw-mode'
import type {
  EditSession
} from '@whiteboard/editor/schema/edit'
import type { Tool } from '@whiteboard/editor/schema/tool'
import {
  buildEditorStateDocument,
  normalizeEditorStateDocument,
  type EditorHoverState,
  type EditorStableInteractionState,
  type EditorStateDocument
} from './document'
import {
  editorStateMutationSchema
} from './model'
import {
  EMPTY_PREVIEW_STATE,
  isDrawPreviewEqual,
  isPreviewEdgeRecordEqual,
  isPreviewMindmapRecordEqual,
  isPreviewNodeRecordEqual,
  isSelectionPreviewEqual
} from './preview'
import type { PreviewInput } from '@whiteboard/editor-scene'

type InternalEditorStateWriter = MutationWriter<typeof editorStateMutationSchema>
type EdgeGuideValue = PreviewInput['edgeGuide'] | undefined

export type EditorStateSnapshot = EditorStateDocument
export type EditorStateReader = MutationReader<typeof editorStateMutationSchema>
export type EditorStateProgram = InternalEditorStateWriter
export type EditorStateMutationDelta = MutationDeltaOf<typeof editorStateMutationSchema>
export type EditorStateCommit = MutationCommitRecord<
  EditorStateDocument,
  MutationFootprint,
  EditorStateMutationDelta
>

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

export interface EditorStateRuntime extends EditorStateStoreFacade {
  engine: MutationEngine<
    EditorStateDocument,
    never,
    EditorStateReader,
    void,
    string,
    EditorStateProgram,
    EditorStateMutationDelta
  >
  dispose(): void
}

const assertEditorStateCommit = <T,>(
  result: MutationResult<T, unknown>
): T => {
  if (!result.ok) {
    throw new Error(result.error.message)
  }

  return result.data
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
        writer.preview.node.create(input as any)
      },
      patch: (id, writes) => {
        writer.preview.node.patch(id, writes)
      },
      delete: (id) => {
        writer.preview.node.delete(id)
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
            writer.preview.node.patch(id, writes)
          },
          remove: (id) => {
            writer.preview.node.delete(id)
          }
        })
      },
      clear: () => {
        Object.keys(readSnapshot().preview.node).forEach((id) => {
          writer.preview.node.delete(id)
        })
      }
    },
    edge: {
      create: (input) => {
        writer.preview.edge.create(input as any)
      },
      patch: (id, writes) => {
        writer.preview.edge.patch(id, writes)
      },
      delete: (id) => {
        writer.preview.edge.delete(id)
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
            writer.preview.edge.patch(id, writes)
          },
          remove: (id) => {
            writer.preview.edge.delete(id)
          }
        })
      },
      clear: () => {
        Object.keys(readSnapshot().preview.edge).forEach((id) => {
          writer.preview.edge.delete(id)
        })
      }
    },
    mindmap: {
      create: (input) => {
        writer.preview.mindmap.create(input as any)
      },
      patch: (id, writes) => {
        writer.preview.mindmap.patch(id, writes)
      },
      delete: (id) => {
        writer.preview.mindmap.delete(id)
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
            writer.preview.mindmap.patch(id, writes)
          },
          remove: (id) => {
            writer.preview.mindmap.delete(id)
          }
        })
      },
      clear: () => {
        Object.keys(readSnapshot().preview.mindmap).forEach((id) => {
          writer.preview.mindmap.delete(id)
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
        writer.preview.node.delete(id)
      })
      Object.keys(readSnapshot().preview.edge).forEach((id) => {
        writer.preview.edge.delete(id)
      })
      Object.keys(readSnapshot().preview.mindmap).forEach((id) => {
        writer.preview.mindmap.delete(id)
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
  const engine = new MutationEngine<
    EditorStateDocument,
    never,
    EditorStateReader,
    void,
    string,
    EditorStateProgram,
    EditorStateMutationDelta
  >({
    schema: editorStateMutationSchema,
    document: buildEditorStateDocument({
      tool: input.initialTool,
      draw: input.initialDrawState
    }),
    normalize: normalizeEditorStateDocument,
    history: false
  })

  let currentDocument = engine.document()
  const listeners = new Set<(commit: EditorStateCommit) => void>()

  engine.subscribe((commit) => {
    currentDocument = commit.document
    listeners.forEach((listener) => {
      listener(commit)
    })
  })

  const read = () => currentDocument

  const write: EditorStateRuntime['write'] = (run) => {
    const program = createMutationProgramWriter()
    const rawWriter = createMutationWriter(
      editorStateMutationSchema,
      program
    )
    const writer = createEditorStateWriter(
      rawWriter,
      read
    )

    run({
      writer,
      snapshot: currentDocument
    })

    const built = program.build()
    if (built.steps.length === 0) {
      return
    }

    assertEditorStateCommit(engine.apply(built))
    currentDocument = engine.document()
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
