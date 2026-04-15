import {
  createKeyedDerivedStore,
  createValueStore,
  read
} from '@shared/core'
import type {
  OrderedSelectionDomain,
  SelectionController,
  SelectionControllerInstance,
  SelectionDomainSource,
  SelectionScope,
  SelectionSnapshot,
  SelectionSummary
} from '@dataview/react/runtime/selection/types'
import {
  selectionSnapshot
} from '@dataview/react/runtime/selection/snapshot'

const resolveSnapshot = <TId,>(
  domain: OrderedSelectionDomain<TId> | undefined,
  current: SelectionSnapshot<TId>,
  recipe: (input: {
    domain: OrderedSelectionDomain<TId>
    current: SelectionSnapshot<TId>
    domainRevision: number
  }) => SelectionSnapshot<TId>
) => {
  if (!domain) {
    return selectionSnapshot.empty<TId>(current.domainRevision)
  }

  return recipe({
    domain,
    current,
    domainRevision: current.domainRevision
  })
}

export const createSelectionController = <TId,>(
  input: {
    domainSource: SelectionDomainSource<TId>
  }
): SelectionControllerInstance<TId> => {
  let currentDomain = input.domainSource.get()
  let domainRevision = 0
  const stateStore = createValueStore<SelectionSnapshot<TId>>({
    initial: selectionSnapshot.empty<TId>(domainRevision),
    isEqual: selectionSnapshot.equal
  })

  const syncDomain = () => {
    currentDomain = input.domainSource.get()
    domainRevision += 1
    stateStore.set(selectionSnapshot.rebase(
      currentDomain,
      stateStore.get(),
      domainRevision
    ))
  }

  syncDomain()
  const unsubscribeDomain = input.domainSource.subscribe(syncDomain)

  const membershipStore = createKeyedDerivedStore<TId, boolean>({
    get: id => selectionSnapshot.contains(
      currentDomain,
      read(stateStore),
      id
    ),
    isEqual: Object.is
  })

  const scopeSummaryStore = createKeyedDerivedStore<SelectionScope<TId>, SelectionSummary>({
    get: scope => selectionSnapshot.summary(
      currentDomain,
      read(stateStore),
      scope
    ),
    isEqual: Object.is
  })

  const commit = (next: SelectionSnapshot<TId>) => {
    stateStore.set(next)
  }

  const controller: SelectionController<TId> = {
    state: {
      store: stateStore,
      getSnapshot: stateStore.get,
      subscribe: stateStore.subscribe
    },
    command: {
      restore: (snapshot: SelectionSnapshot<TId>) => {
        commit(selectionSnapshot.rebase(
          currentDomain,
          snapshot,
          stateStore.get().domainRevision
        ))
      },
      clear: () => {
        commit(selectionSnapshot.empty(stateStore.get().domainRevision))
      },
      selectAll: () => {
        const current = stateStore.get()
        commit(resolveSnapshot(currentDomain, current, ({
          domain,
          domainRevision
        }) => selectionSnapshot.replaceIds(
          domain,
          domain.iterate(),
          domainRevision
        )))
      },
      ids: {
        replace: (
          ids: Iterable<TId>,
          options?: {
            anchor?: TId
            focus?: TId
          }
        ) => {
          const current = stateStore.get()
          commit(resolveSnapshot(currentDomain, current, ({
            domain,
            domainRevision
          }) => selectionSnapshot.replaceIds(
            domain,
            ids,
            domainRevision,
            options
          )))
        },
        add: (ids: Iterable<TId>) => {
          const current = stateStore.get()
          commit(resolveSnapshot(currentDomain, current, ({
            domain,
            current: snapshot,
            domainRevision
          }) => selectionSnapshot.addIds(
            domain,
            snapshot,
            ids,
            domainRevision
          )))
        },
        remove: (ids: Iterable<TId>) => {
          const current = stateStore.get()
          commit(resolveSnapshot(currentDomain, current, ({
            domain,
            current: snapshot,
            domainRevision
          }) => selectionSnapshot.removeIds<TId>(
            domain,
            snapshot,
            ids,
            domainRevision
          )))
        },
        toggle: (ids: Iterable<TId>) => {
          const current = stateStore.get()
          commit(resolveSnapshot(currentDomain, current, ({
            domain,
            current: snapshot,
            domainRevision
          }) => selectionSnapshot.toggleIds(
            domain,
            snapshot,
            ids,
            domainRevision
          )))
        }
      },
      scope: {
        replace: (
          scope: SelectionScope<TId>,
          options?: {
            anchor?: TId
            focus?: TId
          }
        ) => {
          const current = stateStore.get()
          commit(resolveSnapshot(currentDomain, current, ({
            domain,
            domainRevision
          }) => selectionSnapshot.replaceScope(
            domain,
            scope,
            domainRevision,
            options
          )))
        },
        add: (scope: SelectionScope<TId>) => {
          const current = stateStore.get()
          commit(resolveSnapshot(currentDomain, current, ({
            domain,
            current: snapshot,
            domainRevision
          }) => selectionSnapshot.addScope(
            domain,
            snapshot,
            scope,
            domainRevision
          )))
        },
        remove: (scope: SelectionScope<TId>) => {
          const current = stateStore.get()
          commit(resolveSnapshot(currentDomain, current, ({
            domain,
            current: snapshot,
            domainRevision
          }) => selectionSnapshot.removeScope<TId>(
            domain,
            snapshot,
            scope,
            domainRevision
          )))
        },
        toggle: (scope: SelectionScope<TId>) => {
          const current = stateStore.get()
          commit(resolveSnapshot(currentDomain, current, ({
            domain,
            current: snapshot,
            domainRevision
          }) => selectionSnapshot.toggleScope<TId>(
            domain,
            snapshot,
            scope,
            domainRevision
          )))
        }
      },
      range: {
        extendTo: (id: TId) => {
          const current = stateStore.get()
          commit(resolveSnapshot(currentDomain, current, ({
            domain,
            current: snapshot,
            domainRevision
          }) => selectionSnapshot.extendTo(
            domain,
            snapshot,
            id,
            domainRevision
          )))
        },
        step: (
          delta: number,
          options?: {
            extend?: boolean
          }
        ) => {
          const current = stateStore.get()
          if (!currentDomain) {
            return false
          }

          const next = selectionSnapshot.step(
            currentDomain,
            current,
            delta,
            current.domainRevision,
            options
          )
          if (!next) {
            return false
          }

          commit(next)
          return true
        }
      }
    },
    query: {
      contains: id => selectionSnapshot.contains(
        currentDomain,
        stateStore.get(),
        id
      ),
      count: scope => selectionSnapshot.count(
        currentDomain,
        stateStore.get(),
        scope
      ),
      summary: scope => selectionSnapshot.summary(
        currentDomain,
        stateStore.get(),
        scope
      )
    },
    enumerate: {
      iterate: scope => selectionSnapshot.iterate(
        currentDomain,
        stateStore.get(),
        scope
      ),
      materialize: scope => selectionSnapshot.materialize(
        currentDomain,
        stateStore.get(),
        scope
      )
    },
    store: {
      membership: membershipStore,
      scopeSummary: scopeSummaryStore
    }
  }

  return {
    controller,
    dispose: () => {
      unsubscribeDomain()
    }
  }
}
