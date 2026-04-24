import { changeSet, json, record } from '@shared/core'
import type { ReducerTx } from '@whiteboard/core/kernel/reduce/types'
import { getEdge } from '@whiteboard/core/kernel/reduce/runtime'

const getLabels = (
  tx: ReducerTx,
  edgeId: import('@whiteboard/core/types').EdgeId
) => getEdge(tx._runtime.draft, edgeId)?.labels ?? []

const findIndex = (
  labels: readonly import('@whiteboard/core/types').EdgeLabel[],
  labelId: string
) => labels.findIndex((label) => label.id === labelId)

export const createEdgeLabelsCollectionApi = (
  tx: ReducerTx,
  edgeId: import('@whiteboard/core/types').EdgeId
) => ({
  read: {
    list: () => getLabels(tx, edgeId),
    has: (itemId: string) => findIndex(getLabels(tx, edgeId), itemId) >= 0,
    get: (itemId: string) => getLabels(tx, edgeId).find((label) => label.id === itemId)
  },
  structure: {
    insert: (item: import('@whiteboard/core/types').EdgeLabel, anchor: import('@whiteboard/core/kernel/reduce/types').OrderedAnchor) => {
      const current = getEdge(tx._runtime.draft, edgeId)
      if (!current) {
        throw new Error(`Edge ${edgeId} not found.`)
      }
      const labels = [...(current.labels ?? []).filter((label) => label.id !== item.id)]
      const insertAt = anchor.kind === 'start'
        ? 0
        : anchor.kind === 'end'
          ? labels.length
          : (() => {
              const anchorIndex = labels.findIndex((label) => label.id === anchor.itemId)
              if (anchorIndex < 0) {
                return anchor.kind === 'before' ? 0 : labels.length
              }
              return anchor.kind === 'before' ? anchorIndex : anchorIndex + 1
            })()
      labels.splice(insertAt, 0, item)
      tx._runtime.inverse.unshift({
        type: 'edge.label.delete',
        edgeId,
        labelId: item.id
      })
      tx._runtime.draft.edges.set(edgeId, {
        ...current,
        labels
      })
      changeSet.markUpdated(tx._runtime.changes.edges, edgeId)
      tx.dirty.edge.value(edgeId)
    },
    delete: (itemId: string) => {
      const current = getEdge(tx._runtime.draft, edgeId)
      const labels = current?.labels ?? []
      const index = findIndex(labels, itemId)
      if (!current || index < 0) {
        return
      }
      const label = labels[index]!
      tx._runtime.inverse.unshift({
        type: 'edge.label.insert',
        edgeId,
        label: json.clone(label),
        to: index === 0
          ? { kind: 'start' }
          : { kind: 'after', labelId: labels[index - 1]!.id }
      })
      tx._runtime.draft.edges.set(edgeId, {
        ...current,
        labels: labels.filter((entry) => entry.id !== itemId)
      })
      changeSet.markUpdated(tx._runtime.changes.edges, edgeId)
      tx.dirty.edge.value(edgeId)
    },
    move: (itemId: string, anchor: import('@whiteboard/core/kernel/reduce/types').OrderedAnchor) => {
      const current = getEdge(tx._runtime.draft, edgeId)
      const labels = [...(current?.labels ?? [])]
      const index = findIndex(labels, itemId)
      if (!current || index < 0) {
        return
      }
      const label = labels[index]!
      const inverseTo: Extract<import('@whiteboard/core/types').Operation, { type: 'edge.label.move' }>['to'] = index === 0
        ? { kind: 'start' }
        : { kind: 'after', labelId: labels[index - 1]!.id }
      labels.splice(index, 1)
      const insertAt = anchor.kind === 'start'
        ? 0
        : anchor.kind === 'end'
          ? labels.length
          : (() => {
              const anchorIndex = labels.findIndex((entry) => entry.id === anchor.itemId)
              if (anchorIndex < 0) {
                return anchor.kind === 'before' ? 0 : labels.length
              }
              return anchor.kind === 'before' ? anchorIndex : anchorIndex + 1
            })()
      labels.splice(insertAt, 0, label)
      tx._runtime.inverse.unshift({
        type: 'edge.label.move',
        edgeId,
        labelId: itemId,
        to: inverseTo
      })
      tx._runtime.draft.edges.set(edgeId, {
        ...current,
        labels
      })
      changeSet.markUpdated(tx._runtime.changes.edges, edgeId)
      tx.dirty.edge.value(edgeId)
    }
  },
  field: {
    set: (labelId: string, field: import('@whiteboard/core/types').EdgeLabelField, value: unknown) => {
      const current = getEdge(tx._runtime.draft, edgeId)
      const labels = [...(current?.labels ?? [])]
      const index = findIndex(labels, labelId)
      if (!current || index < 0) {
        throw new Error(`Edge label ${labelId} not found.`)
      }
      const label = labels[index]!
      const previous = (label as Record<string, unknown>)[field]
      tx._runtime.inverse.unshift(previous === undefined
        ? { type: 'edge.label.field.unset', edgeId, labelId, field }
        : { type: 'edge.label.field.set', edgeId, labelId, field, value: json.clone(previous) })
      labels[index] = {
        ...label,
        [field]: json.clone(value) as never
      }
      tx._runtime.draft.edges.set(edgeId, { ...current, labels })
      changeSet.markUpdated(tx._runtime.changes.edges, edgeId)
      tx.dirty.edge.value(edgeId)
    },
    unset: (labelId: string, field: import('@whiteboard/core/types').EdgeLabelField) => {
      const current = getEdge(tx._runtime.draft, edgeId)
      const labels = [...(current?.labels ?? [])]
      const index = findIndex(labels, labelId)
      if (!current || index < 0) {
        throw new Error(`Edge label ${labelId} not found.`)
      }
      const label = labels[index]!
      tx._runtime.inverse.unshift({
        type: 'edge.label.field.set',
        edgeId,
        labelId,
        field,
        value: json.clone((label as Record<string, unknown>)[field])
      })
      const nextLabel = { ...label } as import('@whiteboard/core/types').EdgeLabel & Record<string, unknown>
      delete nextLabel[field]
      labels[index] = nextLabel
      tx._runtime.draft.edges.set(edgeId, { ...current, labels })
      changeSet.markUpdated(tx._runtime.changes.edges, edgeId)
      tx.dirty.edge.value(edgeId)
    }
  },
  record: {
    set: (labelId: string, scope: import('@whiteboard/core/types').EdgeLabelRecordScope, path: string, value: unknown) => {
      const current = getEdge(tx._runtime.draft, edgeId)
      const labels = [...(current?.labels ?? [])]
      const index = findIndex(labels, labelId)
      if (!current || index < 0) {
        throw new Error(`Edge label ${labelId} not found.`)
      }
      const label = labels[index]!
      const currentRoot = scope === 'data' ? label.data : label.style
      const previous = tx.read.record.path(currentRoot, path)
      tx._runtime.inverse.unshift(previous === undefined
        ? { type: 'edge.label.record.unset', edgeId, labelId, scope, path }
        : { type: 'edge.label.record.set', edgeId, labelId, scope, path, value: json.clone(previous) })
      const result = record.apply(currentRoot, { op: 'set', path, value })
      if (!result.ok) {
        throw new Error(result.message)
      }
      labels[index] = {
        ...label,
        ...(scope === 'data'
          ? { data: result.value as NonNullable<typeof label.data> }
          : { style: result.value as NonNullable<typeof label.style> })
      }
      tx._runtime.draft.edges.set(edgeId, { ...current, labels })
      changeSet.markUpdated(tx._runtime.changes.edges, edgeId)
      tx.dirty.edge.value(edgeId)
    },
    unset: (labelId: string, scope: import('@whiteboard/core/types').EdgeLabelRecordScope, path: string) => {
      const current = getEdge(tx._runtime.draft, edgeId)
      const labels = [...(current?.labels ?? [])]
      const index = findIndex(labels, labelId)
      if (!current || index < 0) {
        throw new Error(`Edge label ${labelId} not found.`)
      }
      const label = labels[index]!
      const currentRoot = scope === 'data' ? label.data : label.style
      tx._runtime.inverse.unshift({
        type: 'edge.label.record.set',
        edgeId,
        labelId,
        scope,
        path,
        value: json.clone(tx.read.record.path(currentRoot, path))
      })
      const result = record.apply(currentRoot, { op: 'unset', path })
      if (!result.ok) {
        throw new Error(result.message)
      }
      labels[index] = {
        ...label,
        ...(scope === 'data'
          ? { data: result.value as NonNullable<typeof label.data> }
          : { style: result.value as NonNullable<typeof label.style> })
      }
      tx._runtime.draft.edges.set(edgeId, { ...current, labels })
      changeSet.markUpdated(tx._runtime.changes.edges, edgeId)
      tx.dirty.edge.value(edgeId)
    }
  }
})
