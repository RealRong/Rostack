import type {
  CreateEngineOptions,
  Engine,
  EngineRuntimeOptions
} from '@engine-types/instance'
import type {
  EngineCommand,
  ExecuteOptions,
  ExecuteResult,
  WriteCommandMap,
  WriteDomain,
  WriteInput,
  WriteOutput
} from '@engine-types/command'
import type { MindmapLayoutConfig } from '@whiteboard/core/mindmap'
import type { Write, WriteResult } from '@engine-types/write'
import { createRegistries } from '@whiteboard/core/kernel'
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
}: CreateEngineOptions): Engine => {
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
    }),
    undo: replay(writer.history.undo, 'undo'),
    redo: replay(writer.history.redo, 'redo'),
    clear: writer.history.clear
  }

  const applyOperations: Engine['applyOperations'] = (
    operations,
    options
  ) => publish(
    writer.applyOperations(
      operations,
      options?.origin ?? 'user'
    ),
    'apply'
  )

  const execute = <C extends EngineCommand>(
    command: C,
    options?: ExecuteOptions
  ): ExecuteResult<C> => {
    const origin = options?.origin ?? ('origin' in command ? command.origin : undefined) ?? 'user'

    switch (command.type) {
      case 'document.replace':
        return publish(writer.replace(command.document), 'replace') as ExecuteResult<C>
      case 'document.insert':
        return write.apply({
          domain: 'document',
          command: {
            type: 'insert',
            slice: command.slice,
            options: command.options
          },
          origin
        }) as ExecuteResult<C>
      case 'document.delete':
        return write.apply({
          domain: 'document',
          command: {
            type: 'delete',
            refs: command.refs
          },
          origin
        }) as ExecuteResult<C>
      case 'document.duplicate':
        return write.apply({
          domain: 'document',
          command: {
            type: 'duplicate',
            refs: command.refs
          },
          origin
        }) as ExecuteResult<C>
      case 'document.background.set':
        return write.apply({
          domain: 'document',
          command: {
            type: 'background',
            background: command.background
          },
          origin
        }) as ExecuteResult<C>
      case 'document.order':
        return write.apply({
          domain: 'document',
          command: {
            type: 'order',
            mode: command.mode,
            refs: command.refs
          },
          origin
        }) as ExecuteResult<C>
      case 'node.create':
        return write.apply({
          domain: 'node',
          command: {
            type: 'create',
            payload: command.payload
          },
          origin
        }) as ExecuteResult<C>
      case 'node.move':
        return write.apply({
          domain: 'node',
          command: {
            type: 'move',
            ids: command.ids,
            delta: command.delta
          },
          origin
        }) as ExecuteResult<C>
      case 'node.patch':
        return write.apply({
          domain: 'node',
          command: {
            type: 'updateMany',
            updates: command.updates
          },
          origin
        }) as ExecuteResult<C>
      case 'node.align':
        return write.apply({
          domain: 'node',
          command: {
            type: 'align',
            ids: command.ids,
            mode: command.mode
          },
          origin
        }) as ExecuteResult<C>
      case 'node.distribute':
        return write.apply({
          domain: 'node',
          command: {
            type: 'distribute',
            ids: command.ids,
            mode: command.mode
          },
          origin
        }) as ExecuteResult<C>
      case 'node.delete':
        return write.apply({
          domain: 'node',
          command: {
            type: 'delete',
            ids: command.ids
          },
          origin
        }) as ExecuteResult<C>
      case 'node.deleteCascade':
        return write.apply({
          domain: 'node',
          command: {
            type: 'deleteCascade',
            ids: command.ids
          },
          origin
        }) as ExecuteResult<C>
      case 'node.duplicate':
        return write.apply({
          domain: 'node',
          command: {
            type: 'duplicate',
            ids: command.ids
          },
          origin
        }) as ExecuteResult<C>
      case 'group.merge':
        return write.apply({
          domain: 'group',
          command: {
            type: 'merge',
            target: command.target
          },
          origin
        }) as ExecuteResult<C>
      case 'group.order':
        return write.apply({
          domain: 'group',
          command: {
            type: 'order',
            mode: command.mode,
            ids: command.ids
          },
          origin
        }) as ExecuteResult<C>
      case 'group.ungroup':
        return write.apply({
          domain: 'group',
          command: {
            type: 'ungroup',
            id: command.id
          },
          origin
        }) as ExecuteResult<C>
      case 'group.ungroupMany':
        return write.apply({
          domain: 'group',
          command: {
            type: 'ungroupMany',
            ids: command.ids
          },
          origin
        }) as ExecuteResult<C>
      case 'edge.create':
        return write.apply({
          domain: 'edge',
          command: {
            type: 'create',
            payload: command.payload
          },
          origin
        }) as ExecuteResult<C>
      case 'edge.move':
        return write.apply({
          domain: 'edge',
          command: {
            type: 'move',
            edgeId: command.edgeId,
            delta: command.delta
          },
          origin
        }) as ExecuteResult<C>
      case 'edge.reconnect':
        return write.apply({
          domain: 'edge',
          command: {
            type: 'updateMany',
            updates: [{
              id: command.edgeId,
              patch: command.end === 'source'
                ? { source: command.target }
                : { target: command.target }
            }]
          },
          origin
        }) as ExecuteResult<C>
      case 'edge.patch':
        return write.apply({
          domain: 'edge',
          command: {
            type: 'updateMany',
            updates: command.updates
          },
          origin
        }) as ExecuteResult<C>
      case 'edge.delete':
        return write.apply({
          domain: 'edge',
          command: {
            type: 'delete',
            ids: command.ids
          },
          origin
        }) as ExecuteResult<C>
      case 'edge.route.insert':
        return write.apply({
          domain: 'edge',
          command: {
            type: 'route',
            mode: 'insert',
            edgeId: command.edgeId,
            point: command.point
          },
          origin
        }) as ExecuteResult<C>
      case 'edge.route.move':
        return write.apply({
          domain: 'edge',
          command: {
            type: 'route',
            mode: 'move',
            edgeId: command.edgeId,
            index: command.index,
            point: command.point
          },
          origin
        }) as ExecuteResult<C>
      case 'edge.route.remove':
        return write.apply({
          domain: 'edge',
          command: {
            type: 'route',
            mode: 'remove',
            edgeId: command.edgeId,
            index: command.index
          },
          origin
        }) as ExecuteResult<C>
      case 'edge.route.clear':
        return write.apply({
          domain: 'edge',
          command: {
            type: 'route',
            mode: 'clear',
            edgeId: command.edgeId
          },
          origin
        }) as ExecuteResult<C>
      case 'mindmap.create':
        return write.apply({
          domain: 'mindmap',
          command: {
            type: 'create',
            payload: command.payload
          },
          origin
        }) as ExecuteResult<C>
      case 'mindmap.delete':
        return write.apply({
          domain: 'mindmap',
          command: {
            type: 'delete',
            ids: command.ids
          },
          origin
        }) as ExecuteResult<C>
      case 'mindmap.insert':
        return write.apply({
          domain: 'mindmap',
          command: {
            type: 'insert',
            id: command.id,
            input: command.input
          },
          origin
        }) as ExecuteResult<C>
      case 'mindmap.move':
        return write.apply({
          domain: 'mindmap',
          command: {
            type: 'move.subtree',
            id: command.id,
            input: command.input
          },
          origin
        }) as ExecuteResult<C>
      case 'mindmap.remove':
        return write.apply({
          domain: 'mindmap',
          command: {
            type: 'remove',
            id: command.id,
            input: command.input
          },
          origin
        }) as ExecuteResult<C>
      case 'mindmap.clone':
        return write.apply({
          domain: 'mindmap',
          command: {
            type: 'clone.subtree',
            id: command.id,
            input: command.input
          },
          origin
        }) as ExecuteResult<C>
      case 'mindmap.patchNode':
        return write.apply({
          domain: 'mindmap',
          command: {
            type: 'update.node',
            id: command.id,
            input: command.input
          },
          origin
        }) as ExecuteResult<C>
    }

    throw new Error(`Unsupported command: ${(command as EngineCommand).type}`)
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
    commit,
    execute,
    applyOperations,
    configure,
    dispose
  } satisfies Engine

  return engine
}
