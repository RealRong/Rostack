import { selection as selectionApi, type SelectionInput, type SelectionTarget } from '@whiteboard/core/selection'
import type { SelectionMode } from '@whiteboard/core/node'
import { equal, store as sharedStore } from '@shared/core'
import type { EditorQuery } from '@whiteboard/editor/query'

type SelectionReadSource = Pick<EditorQuery, 'node' | 'edge'>

const readNextSelectionTarget = (
  current: SelectionTarget,
  input: SelectionInput,
  mode: SelectionMode
) => (
  mode === 'replace'
    ? selectionApi.target.normalize(input)
    : selectionApi.target.apply(current, input, mode)
)

const readSelectionTargetByStore = (
  read: SelectionReadSource
): SelectionTarget => selectionApi.target.normalize({
  nodeIds: read.node.list.get(),
  edgeIds: read.edge.list.get()
})

const reconcileSelectionTarget = (
  read: SelectionReadSource,
  target: SelectionTarget
): SelectionTarget => selectionApi.target.normalize({
  nodeIds: target.nodeIds.filter((nodeId) => Boolean(read.node.item.get(nodeId))),
  edgeIds: target.edgeIds.filter((edgeId) => Boolean(read.edge.item.get(edgeId)))
})

export type SelectionMutate = {
  replace: (input: SelectionInput) => boolean
  apply: (mode: SelectionMode, input: SelectionInput) => boolean
  add: (input: SelectionInput) => boolean
  remove: (input: SelectionInput) => boolean
  toggle: (input: SelectionInput) => boolean
  selectAll: (read: SelectionReadSource) => boolean
  reconcile: (read: SelectionReadSource) => boolean
  clear: () => boolean
}

export type SelectionState = {
  source: sharedStore.ValueStore<SelectionTarget>
  mutate: SelectionMutate
}

export const createSelectionState = (): SelectionState => {
  const state = sharedStore.createNormalizedValue<SelectionTarget>({
    initial: selectionApi.target.empty,
    isEqual: selectionApi.target.equal
  })
  const source = state.store
  const setTarget = (
    next: SelectionTarget
  ) => {
    if (selectionApi.target.equal(state.read(), next)) {
      return false
    }

    state.set(next)
    return true
  }
  const applyMode = (
    mode: SelectionMode,
    input: SelectionInput
  ) => setTarget(
    readNextSelectionTarget(state.read(), input, mode)
  )

  return {
    source,
    mutate: {
      replace: (input: SelectionInput) => {
        return setTarget(
          selectionApi.target.normalize(input)
        )
      },
      apply: (mode, input) => {
        return applyMode(mode, input)
      },
      add: (input: SelectionInput) => applyMode('add', input),
      remove: (input: SelectionInput) => applyMode('subtract', input),
      toggle: (input: SelectionInput) => applyMode('toggle', input),
      selectAll: (read) => {
        return setTarget(
          readSelectionTargetByStore(read)
        )
      },
      reconcile: (read) => {
        const current = state.read()
        const next = reconcileSelectionTarget(read, current)

        if (
          equal.sameOrder(next.nodeIds, current.nodeIds)
          && equal.sameOrder(next.edgeIds, current.edgeIds)
        ) {
          return false
        }

        state.set(next)
        return true
      },
      clear: () => {
        return setTarget(selectionApi.target.empty)
      }
    }
  }
}
