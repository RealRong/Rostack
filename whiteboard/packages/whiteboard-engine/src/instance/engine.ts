import type {
  CreateEngineOptions,
  Engine,
  EngineRuntimeOptions
} from '@whiteboard/engine/types/instance'
import type {
  Command,
  ExecuteOptions,
  ExecuteResult
} from '@whiteboard/engine/types/command'
import { createRegistries } from '@whiteboard/core/kernel'
import { resolveBoardConfig } from '@whiteboard/engine/config'
import { createRead } from '@whiteboard/engine/read'
import { createWrite } from '@whiteboard/engine/write'
import { createDocumentSource } from '@whiteboard/engine/instance/document'
import { normalizeDocument } from '@whiteboard/engine/document/normalize'
import type { CommandResult } from '@whiteboard/engine/types/result'
import type { Draft } from '@whiteboard/engine/types/write'
import { createValueStore } from '@shared/core'
import {
  applyCommitHistoryEffect,
  createCommit,
  createWriteRecord
} from '@whiteboard/engine/write/commit'
import type { CommitHistoryEffect } from '@whiteboard/engine/write/types'

export const createEngine = ({
  registries,
  document,
  onDocumentChange,
  config: overrides
}: CreateEngineOptions): Engine => {
  const config = resolveBoardConfig(overrides)
  const resolvedRegistries = registries ?? createRegistries()
  const documentSource = createDocumentSource(normalizeDocument(document, config))
  const commitStore = createValueStore<import('@whiteboard/engine/types/commit').Commit | null>(null)
  const writeRecordStore = createValueStore<import('@whiteboard/engine/types/writeRecord').WriteRecord | null>(null)

  const readControl = createRead({
    document: documentSource,
    config
  })

  const writer = createWrite({
    document: documentSource,
    config,
    registries: resolvedRegistries
  })

  const commitDraft = <T,>(
    draft: Draft<T>,
    effect: CommitHistoryEffect
  ): CommandResult<T> => {
    if (!draft.ok) {
      return draft
    }

    const rev = (commitStore.get()?.rev ?? 0) + 1
    documentSource.commit(draft.doc)
    readControl.invalidate(draft.invalidation)
    applyCommitHistoryEffect(draft, effect, writer.history)
    writeRecordStore.set(createWriteRecord(draft, rev))

    const result = createCommit(
      draft,
      rev
    )
    if (result.ok) {
      commitStore.set(result.commit)
      onDocumentChange?.(draft.doc)
    }
    return result
  }

  const apply: Engine['apply'] = (
    ops,
    options
  ) => commitDraft(
    writer.apply(
      ops,
      options?.origin ?? 'user'
    ),
    'skip'
  )

  const execute = <C extends Command>(
    command: C,
    options?: ExecuteOptions
  ): ExecuteResult<C> => {
    const origin = options?.origin ?? ('origin' in command ? command.origin : undefined) ?? 'user'
    const effect: CommitHistoryEffect = origin === 'remote'
      ? 'skip'
      : command.type === 'document.replace'
        ? 'reset'
        : 'record'
    return commitDraft(
      writer.execute(command, origin),
      effect
    ) as ExecuteResult<C>
  }

  const undo = () => commitDraft(writer.undo(), 'skip')
  const redo = () => commitDraft(writer.redo(), 'skip')

  const configure = ({
    history
  }: EngineRuntimeOptions) => {
    if (history) {
      writer.history.configure(history)
    }
  }

  return {
    config,
    document: {
      get: documentSource.get
    },
    read: readControl.read,
    history: {
      get: writer.history.get,
      subscribe: (listener) => writer.history.subscribe(() => {
        listener()
      }),
      undo,
      redo,
      clear: writer.history.clear
    },
    commit: commitStore,
    writeRecord: writeRecordStore,
    execute,
    apply,
    configure,
    dispose: () => {}
  } satisfies Engine
}
