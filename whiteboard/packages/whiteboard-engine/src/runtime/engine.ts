import { createRegistries } from '@whiteboard/core/kernel'
import type {
  Document,
  Origin,
  Operation
} from '@whiteboard/core/types'
import { resolveBoardConfig } from '../config'
import { createDocumentSnapshot } from '../document/create'
import { normalizeDocument } from '../document/normalize'
import type {
  CreateEngineOptions,
  Engine
} from '../contracts/document'
import { buildFacts } from '../facts/build'
import { createDocumentSource } from './document'
import { success } from '../result'
import { createWrite } from '../write'
import { buildChange } from '../change/build'
import type { EngineState } from './state'
import { publishSnapshot } from './publish'

const createInitialChange = (
  document: Document
) => buildChange({
  document: true,
  background: true,
  canvasOrder: true,
  nodes: {
    add: new Set(Object.keys(document.nodes)),
    update: new Set(),
    delete: new Set()
  },
  edges: {
    add: new Set(Object.keys(document.edges)),
    update: new Set(),
    delete: new Set()
  },
  groups: {
    add: new Set(Object.keys(document.groups)),
    update: new Set(),
    delete: new Set()
  },
  mindmaps: {
    add: new Set(Object.keys(document.mindmaps)),
    update: new Set(),
    delete: new Set()
  }
})

export const createEngine = ({
  registries,
  document,
  onDocumentChange,
  config: overrides
}: CreateEngineOptions): Engine => {
  const config = resolveBoardConfig(overrides)
  const resolvedRegistries = registries ?? createRegistries()
  const initialDocument = normalizeDocument(document, config)
  const initialFacts = buildFacts(initialDocument)
  const documentSource = createDocumentSource(initialDocument)
  const writer = createWrite({
    document: documentSource,
    config,
    registries: resolvedRegistries
  })

  const state: EngineState = {
    snapshot: createDocumentSnapshot({
      revision: 0,
      document: initialDocument,
      facts: initialFacts,
      change: createInitialChange(initialDocument)
    }),
    listeners: new Set()
  }

  const commit = <T,>(
    draft: ReturnType<typeof writer.execute> | ReturnType<typeof writer.apply>
  ) => {
    if (!draft.ok) {
      return draft
    }

    const nextDocument = normalizeDocument(draft.doc, config)
    const nextFacts = buildFacts(nextDocument)
    documentSource.commit(nextDocument)
    const nextSnapshot = createDocumentSnapshot({
      revision: state.snapshot.revision + 1,
      document: nextDocument,
      facts: nextFacts,
      change: buildChange(draft.changes)
    })
    publishSnapshot(state, nextSnapshot)
    onDocumentChange?.(nextDocument)
    return success({
      rev: nextSnapshot.revision,
      at: Date.now(),
      origin: draft.origin,
      doc: nextDocument,
      changes: draft.changes,
      forward: draft.ops,
      inverse: draft.inverse,
      footprint: draft.history.footprint
    }, draft.value as T)
  }

  return {
    snapshot: () => state.snapshot,
    subscribe: (listener) => {
      state.listeners.add(listener)
      return () => {
        state.listeners.delete(listener)
      }
    },
    execute: (command, options) => {
      const origin = options?.origin ?? ('origin' in command ? command.origin : undefined) ?? 'user'
      return commit(writer.execute(command, origin))
    },
    apply: (
      ops: readonly Operation[],
      options?: {
        origin?: Origin
      }
    ) => commit(writer.apply(ops, options?.origin ?? 'user'))
  }
}
