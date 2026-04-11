import type {
  AppearanceList,
  AppearanceId,
} from './readModels'
import {
  sameOrder
} from '@shared/core'

export interface Placement {
  section: import('./readModels').SectionKey
  before?: AppearanceId
}

interface Plan {
  ids: readonly AppearanceId[]
  target: Placement
  changed: boolean
}

const emptyIds = [] as readonly AppearanceId[]

const normalize = (
  order: readonly AppearanceId[],
  ids: readonly AppearanceId[]
) => {
  if (!ids.length) {
    return emptyIds
  }

  const idSet = new Set(ids)
  return order.filter(id => idSet.has(id))
}

const drag = (
  order: readonly AppearanceId[],
  selected: readonly AppearanceId[],
  active: AppearanceId
) => {
  if (!order.includes(active)) {
    return emptyIds
  }

  const nextSelected = normalize(order, selected)
  return nextSelected.includes(active)
    ? nextSelected
    : [active]
}

const before = (
  order: readonly AppearanceId[],
  targetIndex: number,
  moving: readonly AppearanceId[]
) => {
  const movingIdSet = new Set(normalize(order, moving))

  for (let index = Math.max(0, targetIndex); index < order.length; index += 1) {
    const id = order[index]
    if (id && !movingIdSet.has(id)) {
      return id
    }
  }

  return undefined
}

const apply = (
  order: readonly AppearanceId[],
  moving: readonly AppearanceId[],
  beforeId?: AppearanceId
) => {
  const nextMoving = normalize(order, moving)
  if (!nextMoving.length) {
    return [...order]
  }

  const movingIdSet = new Set(nextMoving)
  const remaining = order.filter(id => !movingIdSet.has(id))
  if (!beforeId) {
    return [...remaining, ...nextMoving]
  }

  const index = remaining.indexOf(beforeId)
  if (index === -1) {
    return [...remaining, ...nextMoving]
  }

  return [
    ...remaining.slice(0, index),
    ...nextMoving,
    ...remaining.slice(index)
  ]
}

const plan = (
  appearances: Pick<AppearanceList, 'ids' | 'idsIn' | 'sectionOf'>,
  ids: readonly AppearanceId[],
  target: Placement
): Plan => {
  const nextIds = normalize(appearances.ids, ids)
  const sectionIds = appearances.idsIn(target.section)
  const nextBefore = (
    target.before
    && sectionIds.includes(target.before)
  )
    ? before(
        sectionIds,
        sectionIds.indexOf(target.before),
        nextIds
      )
    : undefined
  const sameSection = nextIds.every(id => appearances.sectionOf(id) === target.section)

  return {
    ids: nextIds,
    target: {
      section: target.section,
      ...(nextBefore ? { before: nextBefore } : {})
    },
    changed: !sameSection || !sameOrder(
      sectionIds,
      apply(sectionIds, nextIds, nextBefore)
    )
  }
}

export const move = {
  drag,
  before,
  apply,
  plan
} as const
