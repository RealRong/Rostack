import type {
  CurrentView,
  FieldId,
  ViewFieldRef
} from '@dataview/react/view'
import {
  createPropertyEditOpener,
  type PropertyEditApi,
  type ValueEditorResult,
  type PropertyEditTarget,
  resolveOpenAnchor
} from '@dataview/react/propertyEdit'
import {
  fieldId,
  fieldOf,
  stepViewFieldByIntent,
  type FieldScope
} from '@dataview/react/view/field'
import type { GridSelectionStore } from './gridSelection'
import type { Dom } from './dom'

export interface CellOpenInput {
  cell: FieldId
  element?: Element | null
  seedDraft?: string
}

interface OpenTarget extends PropertyEditTarget {
  cell: CellOpenInput['cell']
}

export const finishCellEdit = (input: {
  currentView?: Pick<CurrentView, 'appearances' | 'properties'>
  field: ViewFieldRef
  result: ValueEditorResult
  gridSelection: {
    set: (cell: FieldId, anchor?: FieldId) => void
  }
  revealSelection: () => void
  focus: () => void
  reopen: (field: ViewFieldRef) => boolean
}) => {
  if (
    input.currentView
    && input.result.kind === 'commit'
    && input.result.intent !== 'done'
  ) {
    const field = stepViewFieldByIntent({
      field: input.field,
      scope: {
        appearanceIds: input.currentView.appearances.ids,
        propertyIds: input.currentView.properties.ids
      },
      appearances: input.currentView.appearances,
      intent: input.result.intent
    })

    if (field && input.reopen(field)) {
      return
    }
  }

  input.gridSelection.set(fieldId(input.field))
  input.revealSelection()
  input.focus()
}

export const createCellOpener = (options: {
  propertyEdit: PropertyEditApi
  currentView: () => CurrentView | undefined
  gridSelection: GridSelectionStore
  dom: Dom
  revealCursor: () => void
  focus: () => void
}) => {
  const syncTarget = (target: OpenTarget) => {
    options.gridSelection.set(target.cell)
    options.revealCursor()
  }
  const nextScope = (
    currentView: Pick<CurrentView, 'appearances' | 'properties'>
  ): FieldScope => ({
    appearanceIds: currentView.appearances.ids,
    propertyIds: currentView.properties.ids
  })

  const open = createPropertyEditOpener<OpenTarget>({
    propertyEdit: options.propertyEdit,
    anchor: target => resolveOpenAnchor({
      field: target.field,
      element: target.element ?? options.dom.cell(target.cell)
    }),
    next: (target, intent) => {
      const currentView = options.currentView()
      if (!currentView) {
        return null
      }

      const field = stepViewFieldByIntent({
        field: target.field,
        scope: nextScope(currentView),
        appearances: currentView.appearances,
        intent
      })
      if (!field) {
        return null
      }

      return {
        cell: fieldId(field),
        field,
        element: options.dom.cell(fieldId(field))
      }
    },
    done: ({ target, result }) => {
      finishCellEdit({
        currentView: options.currentView(),
        field: target.field,
        result,
        gridSelection: options.gridSelection,
        revealSelection: options.revealCursor,
        focus: options.focus,
        reopen: field => openTarget({
          cell: fieldId(field),
          field
        })
      })
    },
    afterOpen: syncTarget
  })

  const openTarget = (
    target: OpenTarget,
    attempt = 0
  ): boolean => {
    syncTarget(target)

    if (open(target)) {
      return true
    }

    if (typeof window === 'undefined' || attempt >= 2) {
      options.focus()
      return false
    }

    window.requestAnimationFrame(() => {
      openTarget(target, attempt + 1)
    })
    return true
  }

  return (input: CellOpenInput) => {
    const currentView = options.currentView()
    if (!currentView) {
      return false
    }

    const field = fieldOf({
      viewId: currentView.view.id,
      field: input.cell,
      appearances: currentView.appearances
    })
    if (!field) {
      return false
    }

    return openTarget({
      cell: input.cell,
      field,
      element: input.element,
      seedDraft: input.seedDraft
    })
  }
}
