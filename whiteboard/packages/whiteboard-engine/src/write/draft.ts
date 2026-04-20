import type {
  Document,
  Operation,
  Origin
} from '@whiteboard/core/types'
import type { KernelReduceResult } from '@whiteboard/core/kernel'
import type { Draft } from '@whiteboard/engine/types/write'

export const createWriteDraft = <T>(
  reduced: Extract<KernelReduceResult, { ok: true }>,
  input: {
    origin: Origin
    ops: readonly Operation[]
    value: T
  }
): Draft<T> => ({
  ok: true,
  origin: input.origin,
  doc: reduced.data.doc,
  ops: input.ops,
  inverse: reduced.data.inverse,
  changes: reduced.data.changes,
  invalidation: reduced.data.invalidation,
  history: reduced.data.history,
  value: input.value
})

export const createReplayDraft = <T>(
  doc: Document,
  input: {
    origin: Origin
    value: T
  }
): Draft<T> => ({
  ok: true,
  origin: input.origin,
  doc,
  ops: [],
  inverse: [],
  changes: {
    document: true,
    background: true,
    canvasOrder: true,
    nodes: {
      add: new Set(),
      update: new Set(),
      delete: new Set()
    },
    edges: {
      add: new Set(),
      update: new Set(),
      delete: new Set()
    },
    groups: {
      add: new Set(),
      update: new Set(),
      delete: new Set()
    },
    mindmaps: {
      add: new Set(),
      update: new Set(),
      delete: new Set()
    }
  },
  invalidation: {
    document: true,
    background: true,
    canvasOrder: true,
    nodes: new Set(),
    edges: new Set(),
    groups: new Set(),
    mindmaps: new Set(),
    projections: new Set([
      'node',
      'edge',
      'mindmap'
    ])
  },
  history: {
    footprint: []
  },
  value: input.value
})
