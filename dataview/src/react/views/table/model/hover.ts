import type {
  AppearanceId,
  FieldId
} from '@dataview/react/view'

export type TableHoverTarget =
  | {
      type: 'cell'
      cell: FieldId
    }
  | {
      type: 'row-rail'
      rowId: AppearanceId
    }

export const sameHoverTarget = (
  left: TableHoverTarget | null,
  right: TableHoverTarget | null
) => {
  if (!left || !right) {
    return left === right
  }

  if (left.type !== right.type) {
    return false
  }

  if (left.type === 'cell' && right.type === 'cell') {
    return (
      left.cell.appearanceId === right.cell.appearanceId
      && left.cell.propertyId === right.cell.propertyId
    )
  }

  if (left.type === 'row-rail' && right.type === 'row-rail') {
    return left.rowId === right.rowId
  }

  return false
}

export const hoveredRowIdOf = (
  target: TableHoverTarget | null
): AppearanceId | null => {
  if (!target) {
    return null
  }

  return target.type === 'cell'
    ? target.cell.appearanceId
    : target.rowId
}

export const hoveredCellOf = (
  target: TableHoverTarget | null
): FieldId | null => target?.type === 'cell'
  ? target.cell
  : null
