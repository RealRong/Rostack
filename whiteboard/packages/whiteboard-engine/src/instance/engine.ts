import type {
  CreateEngineOptions,
  EngineInstance,
  EngineRuntimeOptions
} from '@engine-types/instance'
import type {
  WriteCommandMap,
  WriteDomain,
  WriteInput,
  WriteOutput
} from '@engine-types/command'
import type { MindmapLayoutConfig } from '@whiteboard/core/mindmap'
import type { Write, WriteResult } from '@engine-types/write'
import { createRegistries } from '@whiteboard/core/kernel'
import { createCommands } from '../commands'
import { resolveBoardConfig } from '../config'
import { createRead } from '../read'
import { MINDMAP_LAYOUT_READ_IMPACT, RESET_READ_IMPACT } from '../read/impacts'
import { createWrite } from '../write'
import { createDocumentSource } from './document'
import { normalizeDocument } from '../document/normalize'
import type { Commit } from '@engine-types/commit'
import type { CommandResult } from '@engine-types/result'
import { cancelled, success } from '../result'
import { createValueStore } from '@shared/store'

const EMPTY_MINDMAP_LAYOUT: MindmapLayoutConfig = {}

export const createEngine = ({
  registries,
  document,
  onDocumentChange,
  config: overrides
}: CreateEngineOptions): EngineInstance => {
  const config = resolveBoardConfig(overrides)
  const resolvedRegistries = registries ?? createRegistries()
  const documentSource = createDocumentSource(normalizeDocument(document, config))
  const commit = createValueStore<Commit | null>(null)
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

  const toCommit = (
    committed: Extract<WriteResult<unknown>, { ok: true }>,
    kind: Commit['kind']
  ): Commit => (
    committed.kind === 'operations'
      ? {
          kind,
          document: committed.doc,
          changes: committed.changes,
          impact: committed.impact
        }
      : {
          kind,
          document: committed.doc,
          changes: committed.changes
        }
  )

  const publish = <T>(
    committed: WriteResult<T>,
    kind: Commit['kind']
  ): CommandResult<T> => {
    if (!committed.ok) return committed

    if (committed.kind === 'replace') {
      readControl.invalidate(RESET_READ_IMPACT)
    } else {
      readControl.invalidate(committed.impact)
    }

    const nextCommit = toCommit(committed, kind)
    commit.set(nextCommit)
    onDocumentChange?.(committed.doc)
    return success(nextCommit, committed.data)
  }

  const replay = (
    run: () => WriteResult<void> | false,
    kind: Extract<Commit['kind'], 'undo' | 'redo'>
  ): (() => CommandResult) => () => {
    const committed = run()
    if (!committed) {
      return cancelled(
        kind === 'undo' ? 'Nothing to undo.' : 'Nothing to redo.'
      )
    }
    return publish(committed, kind)
  }

  const write: Write = {
    apply: <
      D extends WriteDomain,
      C extends WriteCommandMap[D]
    >(payload: WriteInput<D, C>): CommandResult<WriteOutput<D, C>> =>
      publish(writer.apply(payload), 'apply'),
    replace: (document) => publish(writer.replace(document), 'replace'),
    history: {
      get: writer.history.get,
      clear: writer.history.clear,
      undo: replay(writer.history.undo, 'undo'),
      redo: replay(writer.history.redo, 'redo')
    }
  }

  const history = {
    get: writer.history.get,
    subscribe: (listener: () => void) => writer.history.subscribe(() => {
      listener()
    })
  }

  const applyOperations: EngineInstance['applyOperations'] = (
    operations,
    options
  ) => publish(
    writer.applyOperations(
      operations,
      options?.origin ?? 'user'
    ),
    'apply'
  )

  const commands = createCommands({
    write
  })

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

  return {
    config,
    document: {
      get: documentSource.get
    },
    read: readControl.read,
    history,
    commit,
    commands,
    applyOperations,
    configure,
    dispose
  }
}
