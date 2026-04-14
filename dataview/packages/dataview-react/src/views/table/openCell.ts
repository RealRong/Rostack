import type { ViewState as CurrentView } from '@dataview/engine'
import type {
  CellRef,
  ViewFieldRef
} from '@dataview/engine'
import type {
  ValueEditorApi,
} from '@dataview/react/runtime/valueEditor'
import type { GridSelectionStore } from '@dataview/react/views/table/gridSelection'
import type { Dom } from '@dataview/react/views/table/dom'
import {
  createFocusOwnerSessionPolicy,
  openFieldValueEditor
} from '@dataview/react/views/shared/valueEditor'

export interface CellOpenInput {
  cell: CellRef
  element?: Element | null
  seedDraft?: string
}

interface OpenTarget {
  cell: CellOpenInput['cell']
  field: ViewFieldRef
  element?: Element | null
  seedDraft?: string
}

export const resolveTableCloseAction = (trigger: 'enter' | 'tab-next' | 'tab-previous' | 'outside' | 'programmatic') => {
  switch (trigger) {
    case 'enter':
      return {
        kind: 'move-next-item'
      } as const
    case 'tab-next':
      return {
        kind: 'move-next-field'
      } as const
    case 'tab-previous':
      return {
        kind: 'move-previous-field'
      } as const
    case 'outside':
    case 'programmatic':
    default:
      return {
        kind: 'focus-owner'
      } as const
  }
}

const createTableSessionPolicy = (input: {
  cell: CellRef
  gridSelection: GridSelectionStore
  revealSelection: () => void
  focus: () => void
}) => {
  const finish = () => {
    input.revealSelection()
    input.focus()
  }

  const focusOwner = () => {
    input.gridSelection.set(input.cell)
    finish()
    return true
  }

  const moveSelection = (
    rowDelta: number,
    columnDelta: number,
    options?: {
      wrap?: boolean
    }
  ) => {
    input.gridSelection.move(rowDelta, columnDelta, options)
    finish()
    return true
  }

  return createFocusOwnerSessionPolicy({
    focusOwner: () => {
      input.gridSelection.set(input.cell)
      finish()
    },
    resolveOnCommit: resolveTableCloseAction,
    applyCloseAction: action => {
      switch (action.kind) {
        case 'move-next-item':
          return moveSelection(1, 0)
        case 'move-next-field':
          return moveSelection(0, 1, {
            wrap: true
          })
        case 'move-previous-field':
          return moveSelection(0, -1, {
            wrap: true
          })
        case 'focus-owner':
        default:
          return focusOwner()
      }
    },
  })
}

export const createCellOpener = (options: {
  valueEditor: ValueEditorApi
  resolveCell: (cell: CellRef) => {
    recordId: string
    fieldId: string
  } | undefined
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

  const openTarget = (
    target: OpenTarget
  ): boolean => {
    return openFieldValueEditor({
      valueEditor: options.valueEditor,
      field: target.field,
      element: target.element ?? options.dom.cell(target.cell),
      seedDraft: target.seedDraft,
      policy: createTableSessionPolicy({
        cell: target.cell,
        gridSelection: options.gridSelection,
        revealSelection: options.revealCursor,
        focus: options.focus
      }),
      beforeResolve: () => {
        syncTarget(target)
      },
      retryFrames: 2,
      onFailure: options.focus
    })
  }

  return (input: CellOpenInput) => {
    const currentView = options.currentView()
    if (!currentView) {
      return false
    }

    const resolved = options.resolveCell(input.cell)
    if (!resolved) {
      return false
    }

    return openTarget({
      cell: input.cell,
      field: {
        viewId: currentView.view.id,
        itemId: input.cell.itemId,
        recordId: resolved.recordId,
        fieldId: resolved.fieldId
      },
      element: input.element,
      seedDraft: input.seedDraft
    })
  }
}
