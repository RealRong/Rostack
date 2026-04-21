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
import type { Draft } from '@whiteboard/engine/types/internal/draft'
import { store } from '@shared/core'
import type { EngineWrite } from '@whiteboard/engine/types/engineWrite'
import { success } from '@whiteboard/engine/result'

export const createEngine = ({
  registries,
  document,
  onDocumentChange,
  config: overrides
}: CreateEngineOptions): Engine => {
  const config = resolveBoardConfig(overrides)
  const resolvedRegistries = registries ?? createRegistries()
  const documentSource = createDocumentSource(normalizeDocument(document, config))
  const writeStore = store.createValueStore<EngineWrite | null>(null)

  const readControl = createRead({
    document: documentSource,
    config
  })

  const writer = createWrite({
    document: documentSource,
    config,
    registries: resolvedRegistries
  })

  const commitDraft = <T,>(draft: Draft<T>): CommandResult<T> => {
    if (!draft.ok) {
      return draft
    }

    const rev = (writeStore.get()?.rev ?? 0) + 1
    const write: EngineWrite = {
      rev,
      at: Date.now(),
      origin: draft.origin,
      doc: draft.doc,
      changes: draft.changes,
      forward: draft.ops,
      inverse: draft.inverse,
      footprint: draft.history.footprint
    }

    documentSource.commit(draft.doc)
    readControl.invalidate(draft.invalidation)
    writeStore.set(write)
    onDocumentChange?.(draft.doc)
    return success(write, draft.value)
  }

  const apply: Engine['apply'] = (
    ops,
    options
  ) => commitDraft(
    writer.apply(
      ops,
      options?.origin ?? 'user'
    )
  )

  const execute = <C extends Command>(
    command: C,
    options?: ExecuteOptions
  ): ExecuteResult<C> => {
    const origin = options?.origin ?? ('origin' in command ? command.origin : undefined) ?? 'user'
    return commitDraft(
      writer.execute(command, origin)
    ) as ExecuteResult<C>
  }

  return {
    config,
    document: {
      get: documentSource.get
    },
    read: readControl.read,
    write: writeStore,
    execute,
    apply,
    configure: (_config: EngineRuntimeOptions) => {},
    dispose: () => {}
  } satisfies Engine
}
