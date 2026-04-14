import {
  createDerivedStore,
  read,
  type ReadStore
} from '@shared/core'
import type {
  ActiveViewApi,
  GalleryState,
  KanbanState,
  ViewState
} from '@dataview/engine/contracts/public'
import { selectActiveSnapshot } from '@dataview/engine/runtime/selectors/active'
import type { RuntimeStore } from '@dataview/engine/runtime/store'

const usesOptionGroupingColors = (
  field?: Pick<import('@dataview/core/contracts').Field, 'kind'>
) => {
  if (!field || field.kind === 'title') {
    return false
  }

  return (
    field.kind === 'select'
    || field.kind === 'multiSelect'
    || field.kind === 'status'
  )
}

const sameViewState = (
  left: ViewState | undefined,
  right: ViewState | undefined
) => left === right || (
  !!left
  && !!right
  && left.view === right.view
  && left.query === right.query
  && left.records === right.records
  && left.sections === right.sections
  && left.items === right.items
  && left.fields === right.fields
  && left.summaries === right.summaries
)

const sameGalleryState = (
  left: GalleryState | undefined,
  right: GalleryState | undefined
) => left === right || (
  !!left
  && !!right
  && left.groupUsesOptionColors === right.groupUsesOptionColors
  && left.canReorder === right.canReorder
  && left.cardSize === right.cardSize
)

const sameKanbanState = (
  left: KanbanState | undefined,
  right: KanbanState | undefined
) => left === right || (
  !!left
  && !!right
  && left.groupUsesOptionColors === right.groupUsesOptionColors
  && left.cardsPerColumn === right.cardsPerColumn
  && left.fillColumnColor === right.fillColumnColor
  && left.canReorder === right.canReorder
)

export const createActiveSelect = (
  state: ReadStore<ViewState | undefined>
): ActiveViewApi['select'] => (
  selector,
  isEqual
) => createDerivedStore({
  get: () => selector(read(state)),
  ...(isEqual ? { isEqual } : {})
})

export const createActiveStateStore = (
  store: RuntimeStore
) => selectActiveSnapshot({
  store,
  read: snapshot => snapshot,
  isEqual: sameViewState
})

export const createGalleryStateStore = (
  state: ReadStore<ViewState | undefined>
) => createDerivedStore<GalleryState | undefined>({
  get: () => {
    const current = read(state)
    if (!current || current.view.type !== 'gallery') {
      return undefined
    }

    const groupField = current.query.group.field
    const groupUsesOptionColors = usesOptionGroupingColors(groupField)
    const canReorder = !current.query.group.active && current.query.sort.rules.length === 0

    return {
      groupUsesOptionColors,
      canReorder,
      cardSize: current.view.options.gallery.cardSize
    }
  },
  isEqual: sameGalleryState
})

export const createKanbanStateStore = (
  state: ReadStore<ViewState | undefined>
) => createDerivedStore<KanbanState | undefined>({
  get: () => {
    const current = read(state)
    if (!current || current.view.type !== 'kanban') {
      return undefined
    }

    const groupField = current.query.group.field
    const groupUsesOptionColors = usesOptionGroupingColors(groupField)

    return {
      groupUsesOptionColors,
      cardsPerColumn: current.view.options.kanban.cardsPerColumn,
      fillColumnColor: groupUsesOptionColors && current.view.options.kanban.fillColumnColor,
      canReorder: current.query.group.active && current.query.sort.rules.length === 0
    }
  },
  isEqual: sameKanbanState
})
