import type {
  CurrentView,
} from '@dataview/react/currentView'
import type {
  FieldId,
  ViewFieldRef
} from '@dataview/engine/projection/view'
import type { PropertyEditApi, ValueEditorResult } from '@dataview/react/page/valueEditor'
import { ownerDocumentOf, resolveFieldAnchor } from '@dataview/dom/field'
import {
  fieldId,
  fieldOf
} from '@dataview/engine/projection/view'
import {
  stepViewFieldByIntent,
  type FieldScope
} from '@dataview/react/field/navigation'
import type { GridSelectionStore } from './gridSelection'
import type { Dom } from './dom'

export interface CellOpenInput {
  cell: FieldId
  element?: Element | null
  seedDraft?: string
}

interface OpenTarget {
  cell: CellOpenInput['cell']
  field: ViewFieldRef
  element?: Element | null
  seedDraft?: string
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

  const resolveAnchor = (target: OpenTarget) => resolveFieldAnchor(
    ownerDocumentOf(target.element ?? options.dom.cell(target.cell)),
    target.field
  )

  const openTarget = (
    target: OpenTarget,
    attempt = 0
  ): boolean => {
    syncTarget(target)

    const anchor = resolveAnchor(target)
    if (anchor) {
      const opened = options.propertyEdit.open({
        field: target.field,
        anchor,
        seedDraft: target.seedDraft,
        onResolve: result => {
          if (result.kind === 'commit' && result.intent !== 'done') {
            const currentView = options.currentView()
            if (currentView) {
              const nextField = stepViewFieldByIntent({
                field: target.field,
                scope: nextScope(currentView),
                appearances: currentView.appearances,
                intent: result.intent
              })

              if (nextField && openTarget({
                cell: fieldId(nextField),
                field: nextField,
                element: options.dom.cell(fieldId(nextField))
              })) {
                return
              }
            }
          }

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
        }
      })

      if (opened) {
        return true
      }
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
