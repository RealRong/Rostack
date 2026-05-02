import { record as draftRecord } from '@shared/draft'
import {
  MutationEngine,
  type MutationCompileHandlerTable,
  type MutationResult
} from '@shared/mutation/engine'
import type {
  MutationFootprint,
  MutationCommitRecord,
  MutationDeltaOf,
  MutationReader,
  MutationWriter
} from '@shared/mutation'
import {
  createMutationProgramWriter,
  createMutationWriter
} from '@shared/mutation'
import {
  EMPTY_HOVER_STATE,
  type EditorHoverState
} from '@whiteboard/editor/state/document'
import {
  EMPTY_PREVIEW_STATE
} from '@whiteboard/editor/state/preview'
import type {
  DrawState
} from '@whiteboard/editor/schema/draw-state'
import type { Tool } from '@whiteboard/editor/schema/tool'
import {
  buildEditorStateDocument,
  normalizeEditorStateDocument,
  type EditorStateDocument
} from './document'
import {
  editorStateMutationModel
} from './model'
import type {
  EditorCommand,
  EditorDispatchInput,
  EditorDispatchUpdater,
  EditorStateMutationTable
} from './intents'

export type EditorStateReader = MutationReader<typeof editorStateMutationModel>
export type EditorStateProgram = MutationWriter<typeof editorStateMutationModel>
export type EditorStateMutationDelta = MutationDeltaOf<typeof editorStateMutationModel>

type EditorStateOperation = {
  type: string
}

const applyCollectionDiff = <TId extends string, TValue>(
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

    const writes = draftRecord.diff(currentValue, nextValue) as Readonly<Record<string, unknown>>
    if (Object.keys(writes).length === 0) {
      return
    }

    input.patch(id, writes)
  })
}

const compileHandlers: MutationCompileHandlerTable<
  EditorStateMutationTable,
  EditorStateDocument,
  EditorStateProgram,
  EditorStateReader
> = {
  'tool.set': ({ document, intent, program }) => {
    program.state.patch(draftRecord.diff(
      {
        tool: document.state.tool
      },
      {
        tool: intent.tool
      }
    ))
  },
  'draw.set': ({ document, intent, program }) => {
    program.state.patch(draftRecord.diff(
      {
        draw: document.state.draw
      },
      {
        draw: intent.state
      }
    ))
  },
  'selection.set': ({ document, intent, program }) => {
    program.state.patch(draftRecord.diff(
      {
        selection: document.state.selection
      },
      {
        selection: intent.selection
      }
    ))
  },
  'edit.set': ({ document, intent, program }) => {
    program.state.patch(draftRecord.diff(
      {
        edit: document.state.edit
      },
      {
        edit: intent.edit
      }
    ))
  },
  'interaction.set': ({ document, intent, program }) => {
    program.state.patch(draftRecord.diff(
      {
        interaction: document.state.interaction
      },
      {
        interaction: intent.interaction
      }
    ))
  },
  'hover.set': ({ document, intent, program }) => {
    program.hover.patch(draftRecord.diff(
      document.hover,
      intent.hover
    ))
  },
  'preview.node.set': ({ document, intent, program }) => {
    applyCollectionDiff({
      current: document.preview.node,
      next: intent.node,
      create: (id, value) => {
        program.preview.node.create({
          id,
          ...value
        })
      },
      patch: (id, writes) => {
        program.preview.node.patch(id, writes)
      },
      remove: (id) => {
        program.preview.node.delete(id)
      }
    })
  },
  'preview.edge.set': ({ document, intent, program }) => {
    applyCollectionDiff({
      current: document.preview.edge,
      next: intent.edge,
      create: (id, value) => {
        program.preview.edge.create({
          id,
          ...value
        })
      },
      patch: (id, writes) => {
        program.preview.edge.patch(id, writes)
      },
      remove: (id) => {
        program.preview.edge.delete(id)
      }
    })
  },
  'preview.mindmap.set': ({ document, intent, program }) => {
    applyCollectionDiff({
      current: document.preview.mindmap,
      next: intent.mindmap,
      create: (id, value) => {
        program.preview.mindmap.create({
          id,
          ...value
        })
      },
      patch: (id, writes) => {
        program.preview.mindmap.patch(id, writes)
      },
      remove: (id) => {
        program.preview.mindmap.delete(id)
      }
    })
  },
  'preview.selection.set': ({ document, intent, program }) => {
    program.preview.selection.patch(draftRecord.diff(
      document.preview.selection,
      intent.selection
    ))
  },
  'preview.draw.set': ({ document, intent, program }) => {
    program.preview.draw.patch(draftRecord.diff(
      {
        current: document.preview.draw
      },
      {
        current: intent.draw
      }
    ))
  },
  'preview.edgeGuide.set': ({ document, intent, program }) => {
    program.preview.edgeGuide.patch(draftRecord.diff(
      {
        current: document.preview.edgeGuide
      },
      {
        current: intent.edgeGuide
      }
    ))
  },
  'preview.reset': ({ document, program }) => {
    if (document.preview.node !== EMPTY_PREVIEW_STATE.node) {
      Object.keys(document.preview.node).forEach((id) => {
        program.preview.node.delete(id)
      })
    }
    if (document.preview.edge !== EMPTY_PREVIEW_STATE.edge) {
      Object.keys(document.preview.edge).forEach((id) => {
        program.preview.edge.delete(id)
      })
    }
    if (document.preview.mindmap !== EMPTY_PREVIEW_STATE.mindmap) {
      Object.keys(document.preview.mindmap).forEach((id) => {
        program.preview.mindmap.delete(id)
      })
    }
    program.preview.selection.patch(draftRecord.diff(
      document.preview.selection,
      EMPTY_PREVIEW_STATE.selection
    ))
    program.preview.draw.patch(draftRecord.diff(
      {
        current: document.preview.draw
      },
      {
        current: EMPTY_PREVIEW_STATE.draw
      }
    ))
    program.preview.edgeGuide.patch(draftRecord.diff(
      {
        current: document.preview.edgeGuide
      },
      {
        current: EMPTY_PREVIEW_STATE.edgeGuide
      }
    ))
  }
}

const assertEditorStateCommit = <T,>(
  result: MutationResult<T, unknown>
): T => {
  if (!result.ok) {
    throw new Error(result.error.message)
  }

  return result.data
}

const toCommandList = (
  command: EditorCommand | readonly EditorCommand[]
): readonly EditorCommand[] => Array.isArray(command)
  ? command as readonly EditorCommand[]
  : [command as EditorCommand]

const applyPreviewReset = (
  document: EditorStateDocument
): EditorStateDocument => normalizeEditorStateDocument({
  ...document,
  preview: EMPTY_PREVIEW_STATE
})

const applyCommand = (
  document: EditorStateDocument,
  command: EditorCommand
): EditorStateDocument => {
  switch (command.type) {
    case 'tool.set':
      return normalizeEditorStateDocument({
        ...document,
        state: {
          ...document.state,
          tool: command.tool
        }
      })
    case 'draw.set':
      return normalizeEditorStateDocument({
        ...document,
        state: {
          ...document.state,
          draw: command.state
        }
      })
    case 'selection.set':
      return normalizeEditorStateDocument({
        ...document,
        state: {
          ...document.state,
          selection: command.selection
        }
      })
    case 'edit.set':
      return normalizeEditorStateDocument({
        ...document,
        state: {
          ...document.state,
          edit: command.edit
        }
      })
    case 'interaction.set':
      return normalizeEditorStateDocument({
        ...document,
        state: {
          ...document.state,
          interaction: command.interaction
        }
      })
    case 'hover.set':
      return normalizeEditorStateDocument({
        ...document,
        hover: command.hover
      })
    case 'preview.node.set':
      return normalizeEditorStateDocument({
        ...document,
        preview: {
          ...document.preview,
          node: command.node
        }
      })
    case 'preview.edge.set':
      return normalizeEditorStateDocument({
        ...document,
        preview: {
          ...document.preview,
          edge: command.edge
        }
      })
    case 'preview.mindmap.set':
      return normalizeEditorStateDocument({
        ...document,
        preview: {
          ...document.preview,
          mindmap: command.mindmap
        }
      })
    case 'preview.selection.set':
      return normalizeEditorStateDocument({
        ...document,
        preview: {
          ...document.preview,
          selection: command.selection
        }
      })
    case 'preview.draw.set':
      return normalizeEditorStateDocument({
        ...document,
        preview: {
          ...document.preview,
          draw: command.draw
        }
      })
    case 'preview.edgeGuide.set':
      if (command.edgeGuide) {
        return normalizeEditorStateDocument({
          ...document,
          preview: {
            ...document.preview,
            edgeGuide: command.edgeGuide
          }
        })
      }
      return normalizeEditorStateDocument({
        ...document,
        preview: (() => {
          const {
            edgeGuide: _edgeGuide,
            ...preview
          } = document.preview
          return preview
        })()
      })
    case 'preview.reset':
      return applyPreviewReset(document)
    default:
      return document
  }
}

export interface EditorStateRuntime {
  engine: MutationEngine<
    EditorStateDocument,
    EditorStateMutationTable,
    EditorStateOperation,
    EditorStateReader,
    void,
    string,
    EditorStateProgram,
    EditorStateMutationDelta
  >
  snapshot(): EditorStateDocument
  reader(): EditorStateReader
  write: (
    run: (context: {
      writer: EditorStateProgram
      reader: EditorStateReader
      snapshot: EditorStateDocument
    }) => void
  ) => void
  dispatch: (
    command: EditorDispatchInput
  ) => void
  commits: {
    subscribe: (
      listener: (commit: MutationCommitRecord<EditorStateDocument, EditorStateOperation, MutationFootprint, EditorStateMutationDelta>) => void
    ) => () => void
  }
  flush(): void
  dispose(): void
}

export const createEditorStateRuntime = (input: {
  initialTool: Tool
  initialDrawState: DrawState
}): EditorStateRuntime => {
  const engine = new MutationEngine<
    EditorStateDocument,
    EditorStateMutationTable,
    EditorStateOperation,
    EditorStateReader,
    void,
    string,
    EditorStateProgram,
    EditorStateMutationDelta
  >({
    document: buildEditorStateDocument({
      tool: input.initialTool,
      draw: input.initialDrawState
    }),
    normalize: normalizeEditorStateDocument,
    model: editorStateMutationModel,
    compile: compileHandlers,
    history: false
  })

  let stagedDocument = engine.document()
  let pendingCommands: EditorCommand[] = []
  const commitListeners = new Set<(
    commit: MutationCommitRecord<EditorStateDocument, EditorStateOperation, MutationFootprint, EditorStateMutationDelta>
  ) => void>()

  engine.subscribe((commit) => {
    stagedDocument = commit.document
    commitListeners.forEach((listener) => {
      listener(commit)
    })
  })

  const flush = () => {
    if (pendingCommands.length === 0) {
      return
    }

    const commands = pendingCommands
    pendingCommands = []
    stagedDocument = normalizeEditorStateDocument(stagedDocument)
    assertEditorStateCommit(engine.execute(commands))
    stagedDocument = engine.document()
  }

  const dispatch = (
    command: EditorDispatchInput
  ) => {
    const resolved = typeof command === 'function'
      ? (command as EditorDispatchUpdater)(stagedDocument)
      : command
    if (!resolved) {
      return
    }

    toCommandList(resolved).forEach((entry) => {
      stagedDocument = applyCommand(stagedDocument, entry)
      pendingCommands.push(entry)
    })

    flush()
  }

  const write: EditorStateRuntime['write'] = (run) => {
    const program = createMutationProgramWriter<string>()
    const writer = createMutationWriter(
      editorStateMutationModel,
      program
    )
    run({
      writer,
      reader: engine.reader(),
      snapshot: stagedDocument
    })
    const built = program.build()
    if (built.steps.length === 0) {
      return
    }
    assertEditorStateCommit(engine.apply(built))
    stagedDocument = engine.document()
  }

  return {
    engine,
    snapshot: () => stagedDocument,
    reader: () => engine.reader(),
    write,
    dispatch,
    commits: {
      subscribe: (listener) => {
        commitListeners.add(listener)
        return () => {
          commitListeners.delete(listener)
        }
      }
    },
    flush,
    dispose: () => {}
  }
}

export const createResetEditorCommands = (
  hover: EditorHoverState = EMPTY_HOVER_STATE
): readonly EditorCommand[] => ([
  {
    type: 'edit.set',
    edit: null
  },
  {
    type: 'selection.set',
    selection: {
      nodeIds: [],
      edgeIds: []
    }
  },
  {
    type: 'interaction.set',
    interaction: {
      mode: 'idle',
      chrome: false,
      space: false
    }
  },
  {
    type: 'hover.set',
    hover
  },
  {
    type: 'preview.reset'
  }
])
