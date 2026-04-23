import type { ItemId } from '@dataview/engine'
import type {
  Box,
  Point
} from '@shared/dom'
import {
  rectFromPoints
} from '@shared/dom'
import { equal, store as coreStore } from '@shared/core'
import type {
  ItemSelectionController,
  ItemSelectionSnapshot,
  OrderedSelectionDomain,
  SelectionScope,
  SelectionSummary
} from '@dataview/runtime/selection'
import {
  selectionSnapshot
} from '@dataview/runtime/selection'
import {
  createNullableControllerStore
} from '@dataview/runtime/session/controller'

export type MarqueeMode = 'replace' | 'add' | 'toggle'

export interface MarqueeSessionState {
  mode: MarqueeMode
  start: Point
  current: Point
  rect: Box
  hitIds: readonly ItemId[]
  baseSelection: ItemSelectionSnapshot
}

export interface MarqueeSessionApi {
  store: coreStore.ReadStore<MarqueeSessionState | null>
  activeStore: coreStore.ReadStore<boolean>
  preview: {
    membership: coreStore.KeyedReadStore<ItemId, boolean | null>
    scopeSummary: coreStore.KeyedReadStore<SelectionScope<ItemId>, SelectionSummary | null>
  }
  get(): MarqueeSessionState | null
}

export interface MarqueeIntentApi {
  start(input: {
    mode: MarqueeMode
    start: Point
    baseSelection: ItemSelectionSnapshot
  }): void
  update(input: {
    current: Point
    rect: Box
    hitIds: readonly ItemId[]
  }): void
  commit(): void
  cancel(): void
  clear(): void
}

export interface MarqueeController extends MarqueeSessionApi, MarqueeIntentApi {}

const sameHitIds = (
  left: readonly ItemId[],
  right: readonly ItemId[]
) => left.length === right.length
  && left.every((id, index) => id === right[index])

const sameSession = (
  left: MarqueeSessionState | null,
  right: MarqueeSessionState | null
) => {
  if (left === right) {
    return true
  }

  if (!left || !right) {
    return false
  }

  return left.mode === right.mode
    && equal.samePoint(left.start, right.start)
    && equal.samePoint(left.current, right.current)
    && equal.sameBox(left.rect, right.rect)
    && left.baseSelection === right.baseSelection
    && sameHitIds(left.hitIds, right.hitIds)
}

const resolvePreviewSelected = (input: {
  mode: MarqueeSessionState['mode']
  baseSelected: boolean
  hit: boolean
}) => {
  switch (input.mode) {
    case 'replace':
      return input.hit
    case 'add':
      return input.baseSelected || input.hit
    case 'toggle':
      return input.hit
        ? !input.baseSelected
        : input.baseSelected
  }
}

const resolvePreviewOverride = (input: {
  mode: MarqueeSessionState['mode']
  baseSelected: boolean
  hit: boolean
}): boolean | null => {
  const previewSelected = resolvePreviewSelected(input)
  return previewSelected === input.baseSelected
    ? null
    : previewSelected
}

const resolveBaseSelected = (input: {
  domain: OrderedSelectionDomain<ItemId> | undefined
  session: MarqueeSessionState
  id: ItemId
}) => selectionSnapshot.contains(
  input.domain,
  input.session.baseSelection,
  input.id
)

const summarizePreviewScope = (input: {
  domain: OrderedSelectionDomain<ItemId> | undefined
  session: MarqueeSessionState
  scope: SelectionScope<ItemId>
  membership: {
    get: (id: ItemId) => boolean | null
  }
}): SelectionSummary => {
  if (!input.scope.count || !input.domain) {
    return 'none'
  }

  let count = 0
  for (const id of input.scope.iterate()) {
    const previewSelected = input.membership.get(id)
    if (previewSelected ?? resolveBaseSelected({
      domain: input.domain,
      session: input.session,
      id
    })) {
      count += 1
    }
  }

  if (!count) {
    return 'none'
  }

  return count >= input.scope.count
    ? 'all'
    : 'some'
}

export const createMarqueeController = (input: {
  selection: ItemSelectionController
  resolveDomain: () => OrderedSelectionDomain<ItemId> | undefined
}): MarqueeController => {
  const {
    store: sessionStore,
    get,
    clear,
    openStore
  } = createNullableControllerStore<MarqueeSessionState>({
    isEqual: sameSession
  })
  const previewMembershipStore = coreStore.createKeyedStore<ItemId, boolean | null>({
    emptyValue: null,
    isEqual: Object.is
  })
  const previewSummaryStore = coreStore.createKeyedDerivedStore<SelectionScope<ItemId>, SelectionSummary | null>({
    get: scope => {
      const session = coreStore.read(sessionStore)
      if (!session) {
        return null
      }

      return summarizePreviewScope({
        domain: input.resolveDomain(),
        session,
        scope,
        membership: {
          get: id => coreStore.read(previewMembershipStore, id)
        }
      })
    },
    isEqual: Object.is
  })

  const resolveNextSelection = (
    session: MarqueeSessionState
  ) => {
    const domain = input.resolveDomain()
    return domain
      ? selectionSnapshot.applyIds(
          domain,
          session.baseSelection,
          session.mode,
          session.hitIds,
          input.selection.state.getSnapshot().domainRevision
        )
      : session.baseSelection
  }

  const clearPreviewMembership = () => {
    previewMembershipStore.clear()
  }

  const seedPreviewMembership = (
    session: MarqueeSessionState
  ) => {
    if (
      session.mode !== 'replace'
      || !session.baseSelection.selectedCount
    ) {
      return
    }

    const domain = input.resolveDomain()
    if (!domain) {
      return
    }

    previewMembershipStore.patch({
      set: Array.from(
        selectionSnapshot.iterate(
          domain,
          session.baseSelection
        ),
        id => [id, false] as const
      )
    })
  }

  const syncPreviewMembership = (inputValue: {
    previous: MarqueeSessionState
    next: MarqueeSessionState
  }) => {
    const domain = input.resolveDomain()
    const previousHitSet = new Set(inputValue.previous.hitIds)
    const nextHitSet = new Set(inputValue.next.hitIds)
    const changedIds = new Set<ItemId>()

    inputValue.previous.hitIds.forEach(id => {
      if (!nextHitSet.has(id)) {
        changedIds.add(id)
      }
    })
    inputValue.next.hitIds.forEach(id => {
      if (!previousHitSet.has(id)) {
        changedIds.add(id)
      }
    })

    if (!changedIds.size) {
      return
    }

    const setEntries: Array<readonly [ItemId, boolean | null]> = []
    const deleteEntries: ItemId[] = []

    changedIds.forEach(id => {
      const nextOverride = resolvePreviewOverride({
        mode: inputValue.next.mode,
        baseSelected: resolveBaseSelected({
          domain,
          session: inputValue.next,
          id
        }),
        hit: nextHitSet.has(id)
      })
      if (nextOverride === null) {
        deleteEntries.push(id)
        return
      }

      setEntries.push([id, nextOverride])
    })

    previewMembershipStore.patch({
      ...(setEntries.length
        ? {
            set: setEntries
          }
        : {}),
      ...(deleteEntries.length
        ? {
            delete: deleteEntries
          }
        : {})
    })
  }

  const clearSession = () => {
    clearPreviewMembership()
    clear()
  }

  return {
    store: sessionStore,
    activeStore: openStore,
    preview: {
      membership: previewMembershipStore,
      scopeSummary: previewSummaryStore
    },
    get,
    start: session => {
      const nextSession = {
        mode: session.mode,
        start: session.start,
        current: session.start,
        rect: rectFromPoints(session.start, session.start),
        hitIds: [],
        baseSelection: session.baseSelection
      } satisfies MarqueeSessionState
      clearPreviewMembership()
      sessionStore.set(nextSession)
      seedPreviewMembership(nextSession)
    },
    update: next => {
      const current = get()
      if (!current) {
        return
      }

      const nextSession = {
        ...current,
        current: next.current,
        rect: next.rect,
        hitIds: next.hitIds
      } satisfies MarqueeSessionState

      sessionStore.set(nextSession)
      syncPreviewMembership({
        previous: current,
        next: nextSession
      })
    },
    commit: () => {
      const session = get()
      if (!session) {
        return
      }

      input.selection.command.restore(resolveNextSelection(session))
      clearSession()
    },
    cancel: () => {
      clearSession()
    },
    clear: clearSession
  }
}
