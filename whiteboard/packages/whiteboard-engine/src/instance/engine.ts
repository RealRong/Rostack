import type {
  CreateEngineOptions,
  Engine,
  EngineRuntimeOptions
} from '#types/instance'
import type {
  EngineCommand,
  ExecuteOptions,
  ExecuteResult,
  TranslateCommand
} from '#types/command'
import type { MindmapLayoutConfig } from '@whiteboard/core/mindmap'
import { createRegistries } from '@whiteboard/core/kernel'
import { resolveBoardConfig } from '../config'
import { createRead } from '../read'
import { MINDMAP_LAYOUT_READ_IMPACT, RESET_READ_IMPACT } from '../read/impacts'
import { createWrite } from '../write'
import { createDocumentSource } from './document'
import { normalizeDocument } from '../document/normalize'
import type { Commit } from '#types/commit'
import type { CommandResult } from '#types/result'
import type { Draft } from '#types/write'
import { success } from '../result'
import { createValueStore } from '@shared/core'

const EMPTY_MINDMAP_LAYOUT: MindmapLayoutConfig = {}
const readCommitAt = (): number => Date.now()

export const createEngine = ({
  registries,
  document,
  onDocumentChange,
  config: overrides
}: CreateEngineOptions): Engine => {
  const config = resolveBoardConfig(overrides)
  const resolvedRegistries = registries ?? createRegistries()
  const documentSource = createDocumentSource(normalizeDocument(document, config))
  const commitStore = createValueStore<Commit | null>(null)
  let mindmapLayout = EMPTY_MINDMAP_LAYOUT

  const readControl = createRead({
    document: documentSource,
    mindmapLayout: () => mindmapLayout,
    config
  })

  const writer = createWrite({
    document: documentSource,
    config,
    registries: resolvedRegistries
  })

  const commit = <T,>(
    draft: Draft<T>
  ): CommandResult<T> => {
    if (!draft.ok) {
      return draft
    }

    documentSource.commit(draft.doc)
    readControl.invalidate(
      draft.kind === 'replace'
        ? RESET_READ_IMPACT
        : draft.impact
    )

    if (draft.kind === 'replace') {
      writer.history.clear()
    } else if (draft.kind === 'apply' && draft.inverse) {
      writer.history.capture(draft)
    }

    const nextCommit: Commit = (
      draft.kind === 'replace'
        ? {
            kind: draft.kind,
            rev: (commitStore.get()?.rev ?? 0) + 1,
            at: readCommitAt(),
            doc: draft.doc,
            changes: draft.changes
          }
        : {
            kind: draft.kind,
            rev: (commitStore.get()?.rev ?? 0) + 1,
            at: readCommitAt(),
            doc: draft.doc,
            changes: draft.changes,
            impact: draft.impact
          }
    )
    commitStore.set(nextCommit)
    onDocumentChange?.(draft.doc)
    return success(nextCommit, draft.value)
  }

  const apply = <C extends TranslateCommand>(
    command: C,
    origin: Parameters<typeof writer.run>[1]
  ) => commit(writer.run(command, origin))

  const replace = (nextDocument: Parameters<typeof writer.replace>[0]) =>
    commit(writer.replace(nextDocument))

  const undo = () => commit(writer.undo())
  const redo = () => commit(writer.redo())

  const history = {
    get: writer.history.get,
    subscribe: (listener: () => void) => writer.history.subscribe(() => {
      listener()
    }),
    undo,
    redo,
    clear: writer.history.clear
  }

  const applyOperations: Engine['applyOperations'] = (
    operations,
    options
  ) => commit(
    writer.ops(
      operations,
      options?.origin ?? 'user'
    )
  )

  const execute = <C extends EngineCommand>(
    command: C,
    options?: ExecuteOptions
  ): ExecuteResult<C> => {
    const origin = options?.origin ?? ('origin' in command ? command.origin : undefined) ?? 'user'

    if (command.type === 'document.replace') {
      return replace(command.document) as ExecuteResult<C>
    }

    return apply(command, origin) as ExecuteResult<C>
  }

  const configure = ({
    history,
    mindmapLayout: nextMindmapLayout = EMPTY_MINDMAP_LAYOUT
  }: EngineRuntimeOptions) => {
    if (history) {
      writer.history.configure(history)
    }

    if (Object.is(mindmapLayout, nextMindmapLayout)) return
    mindmapLayout = nextMindmapLayout
    readControl.invalidate(MINDMAP_LAYOUT_READ_IMPACT)
  }

  const dispose = () => {}

  const engine = {
    config,
    document: {
      get: documentSource.get
    },
    read: readControl.read,
    history,
    commit: commitStore,
    execute,
    applyOperations,
    configure,
    dispose
  } satisfies Engine

  return engine
}
