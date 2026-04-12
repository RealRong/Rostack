import type {
  Field
} from '@dataview/core/contracts'
import {
  getDocumentActiveView
} from '@dataview/core/document'
import type {
  ActiveGalleryState,
  ActiveKanbanState,
  ActiveViewState
} from '../../api/public'
import {
  createStoreSelector
} from '../base'
import type {
  State,
  Store
} from '../state'

const usesOptionGroupingColors = (
  field?: Pick<Field, 'kind'>
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

const sameActiveState = (
  left: ActiveViewState | undefined,
  right: ActiveViewState | undefined
) => left === right || (
  !!left
  && !!right
  && left.view === right.view
  && left.query === right.query
  && left.records === right.records
  && left.sections === right.sections
  && left.appearances === right.appearances
  && left.fields === right.fields
  && left.calculations === right.calculations
)

const sameActiveGalleryState = (
  left: ActiveGalleryState | undefined,
  right: ActiveGalleryState | undefined
) => left === right || (
  !!left
  && !!right
  && left.groupUsesOptionColors === right.groupUsesOptionColors
  && left.canReorder === right.canReorder
  && left.cardSize === right.cardSize
)

const sameActiveKanbanState = (
  left: ActiveKanbanState | undefined,
  right: ActiveKanbanState | undefined
) => left === right || (
  !!left
  && !!right
  && left.groupUsesOptionColors === right.groupUsesOptionColors
  && left.cardsPerColumn === right.cardsPerColumn
  && left.fillColumnColor === right.fillColumnColor
  && left.canReorder === right.canReorder
)

const readActiveState = (
  current: State
): ActiveViewState | undefined => {
  const activeView = getDocumentActiveView(current.doc)
  const query = current.project.query
  const records = current.project.records
  const sections = current.project.sections
  const appearances = current.project.appearances
  const fields = current.project.fields
  const calculations = current.project.calculations

  if (
    !activeView
    || !query
    || !records
    || !sections
    || !appearances
    || !fields
    || !calculations
  ) {
    return undefined
  }

  return {
    view: activeView,
    query,
    records,
    sections,
    appearances,
    fields,
    calculations
  }
}

export const createActiveStateStore = (
  store: Store
) => createStoreSelector<ActiveViewState | undefined>({
  store,
  read: readActiveState,
  isEqual: sameActiveState
})

export const createActiveGalleryStateStore = (
  store: Store
) => createStoreSelector<ActiveGalleryState | undefined>({
  store,
  read: current => {
    const state = readActiveState(current)
    if (!state || state.view.type !== 'gallery') {
      return undefined
    }

    const groupField = state.query.group.field
    const groupUsesOptionColors = usesOptionGroupingColors(groupField)
    const canReorder = !state.query.group.active && !state.query.sort.active

    return {
      groupUsesOptionColors,
      canReorder,
      cardSize: state.view.options.gallery.cardSize
    }
  },
  isEqual: sameActiveGalleryState
})

export const createActiveKanbanStateStore = (
  store: Store
) => createStoreSelector<ActiveKanbanState | undefined>({
  store,
  read: current => {
    const state = readActiveState(current)
    if (!state || state.view.type !== 'kanban') {
      return undefined
    }

    const groupField = state.query.group.field
    const groupUsesOptionColors = usesOptionGroupingColors(groupField)

    return {
      groupUsesOptionColors,
      cardsPerColumn: state.view.options.kanban.cardsPerColumn,
      fillColumnColor: groupUsesOptionColors && state.view.options.kanban.fillColumnColor,
      canReorder: state.query.group.active && !state.query.sort.active
    }
  },
  isEqual: sameActiveKanbanState
})
