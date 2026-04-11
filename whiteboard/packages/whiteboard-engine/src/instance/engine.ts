import type {
  CreateEngineOptions,
  Engine,
  EngineRuntimeOptions
} from '@engine-types/instance'
import type {
  EngineCommand,
  ExecuteOptions,
  ExecuteResult
} from '@engine-types/command'
import type { MindmapLayoutConfig } from '@whiteboard/core/mindmap'
import { createRegistries } from '@whiteboard/core/kernel'
import { resolveBoardConfig } from '../config'
import { createRead } from '../read'
import { MINDMAP_LAYOUT_READ_IMPACT, RESET_READ_IMPACT } from '../read/impacts'
import { createWrite } from '../write'
import { createDocumentSource } from './document'
import { normalizeDocument } from '../document/normalize'
import type { Commit } from '@engine-types/commit'
import type { CommandResult } from '@engine-types/result'
import type { Draft } from '@engine-types/write'
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

  const apply = (input: Parameters<typeof writer.run>[0]) =>
    commit(writer.run(input))

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

    switch (command.type) {
      case 'document.replace':
        return replace(command.document) as ExecuteResult<C>
      case 'document.insert':
        return apply({
          domain: 'document',
          command: {
            type: 'insert',
            slice: command.slice,
            options: command.options
          },
          origin
        }) as ExecuteResult<C>
      case 'document.delete':
        return apply({
          domain: 'document',
          command: {
            type: 'delete',
            refs: command.refs
          },
          origin
        }) as ExecuteResult<C>
      case 'document.duplicate':
        return apply({
          domain: 'document',
          command: {
            type: 'duplicate',
            refs: command.refs
          },
          origin
        }) as ExecuteResult<C>
      case 'document.background.set':
        return apply({
          domain: 'document',
          command: {
            type: 'background',
            background: command.background
          },
          origin
        }) as ExecuteResult<C>
      case 'document.order':
        return apply({
          domain: 'document',
          command: {
            type: 'order',
            mode: command.mode,
            refs: command.refs
          },
          origin
        }) as ExecuteResult<C>
      case 'node.create':
        return apply({
          domain: 'node',
          command: {
            type: 'create',
            payload: command.payload
          },
          origin
        }) as ExecuteResult<C>
      case 'node.move':
        return apply({
          domain: 'node',
          command: {
            type: 'move',
            ids: command.ids,
            delta: command.delta
          },
          origin
        }) as ExecuteResult<C>
      case 'node.patch':
        return apply({
          domain: 'node',
          command: {
            type: 'updateMany',
            updates: command.updates
          },
          origin
        }) as ExecuteResult<C>
      case 'node.align':
        return apply({
          domain: 'node',
          command: {
            type: 'align',
            ids: command.ids,
            mode: command.mode
          },
          origin
        }) as ExecuteResult<C>
      case 'node.distribute':
        return apply({
          domain: 'node',
          command: {
            type: 'distribute',
            ids: command.ids,
            mode: command.mode
          },
          origin
        }) as ExecuteResult<C>
      case 'node.delete':
        return apply({
          domain: 'node',
          command: {
            type: 'delete',
            ids: command.ids
          },
          origin
        }) as ExecuteResult<C>
      case 'node.deleteCascade':
        return apply({
          domain: 'node',
          command: {
            type: 'deleteCascade',
            ids: command.ids
          },
          origin
        }) as ExecuteResult<C>
      case 'node.duplicate':
        return apply({
          domain: 'node',
          command: {
            type: 'duplicate',
            ids: command.ids
          },
          origin
        }) as ExecuteResult<C>
      case 'group.merge':
        return apply({
          domain: 'group',
          command: {
            type: 'merge',
            target: command.target
          },
          origin
        }) as ExecuteResult<C>
      case 'group.order':
        return apply({
          domain: 'group',
          command: {
            type: 'order',
            mode: command.mode,
            ids: command.ids
          },
          origin
        }) as ExecuteResult<C>
      case 'group.ungroup':
        return apply({
          domain: 'group',
          command: {
            type: 'ungroup',
            id: command.id
          },
          origin
        }) as ExecuteResult<C>
      case 'group.ungroupMany':
        return apply({
          domain: 'group',
          command: {
            type: 'ungroupMany',
            ids: command.ids
          },
          origin
        }) as ExecuteResult<C>
      case 'edge.create':
        return apply({
          domain: 'edge',
          command: {
            type: 'create',
            payload: command.payload
          },
          origin
        }) as ExecuteResult<C>
      case 'edge.move':
        return apply({
          domain: 'edge',
          command: {
            type: 'move',
            edgeId: command.edgeId,
            delta: command.delta
          },
          origin
        }) as ExecuteResult<C>
      case 'edge.reconnect':
        return apply({
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
        return apply({
          domain: 'edge',
          command: {
            type: 'updateMany',
            updates: command.updates
          },
          origin
        }) as ExecuteResult<C>
      case 'edge.delete':
        return apply({
          domain: 'edge',
          command: {
            type: 'delete',
            ids: command.ids
          },
          origin
        }) as ExecuteResult<C>
      case 'edge.route.insert':
        return apply({
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
        return apply({
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
        return apply({
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
        return apply({
          domain: 'edge',
          command: {
            type: 'route',
            mode: 'clear',
            edgeId: command.edgeId
          },
          origin
        }) as ExecuteResult<C>
      case 'mindmap.create':
        return apply({
          domain: 'mindmap',
          command: {
            type: 'create',
            payload: command.payload
          },
          origin
        }) as ExecuteResult<C>
      case 'mindmap.delete':
        return apply({
          domain: 'mindmap',
          command: {
            type: 'delete',
            ids: command.ids
          },
          origin
        }) as ExecuteResult<C>
      case 'mindmap.insert':
        return apply({
          domain: 'mindmap',
          command: {
            type: 'insert',
            id: command.id,
            input: command.input
          },
          origin
        }) as ExecuteResult<C>
      case 'mindmap.move':
        return apply({
          domain: 'mindmap',
          command: {
            type: 'move.subtree',
            id: command.id,
            input: command.input
          },
          origin
        }) as ExecuteResult<C>
      case 'mindmap.remove':
        return apply({
          domain: 'mindmap',
          command: {
            type: 'remove',
            id: command.id,
            input: command.input
          },
          origin
        }) as ExecuteResult<C>
      case 'mindmap.clone':
        return apply({
          domain: 'mindmap',
          command: {
            type: 'clone.subtree',
            id: command.id,
            input: command.input
          },
          origin
        }) as ExecuteResult<C>
      case 'mindmap.patchNode':
        return apply({
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
    commit: commitStore,
    execute,
    applyOperations,
    configure,
    dispose
  } satisfies Engine

  return engine
}
