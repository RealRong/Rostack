import type {
  ItemId,
  SectionId
} from '@dataview/engine'

export type TableBlockId =
  | {
      kind: 'row'
      rowId: ItemId
    }
  | {
      kind: 'section-header'
      sectionId: SectionId
    }
  | {
      kind: 'column-header'
      sectionId: SectionId
    }
  | {
      kind: 'create-record'
      sectionId: SectionId
    }
  | {
      kind: 'column-footer'
      sectionId: SectionId
    }

export const tableBlockKey = (id: TableBlockId): string => {
  switch (id.kind) {
    case 'row':
      return `row:${id.rowId}`
    case 'section-header':
      return `section-header:${id.sectionId}`
    case 'column-header':
      return `column-header:${id.sectionId}`
    case 'create-record':
      return `create-record:${id.sectionId}`
    case 'column-footer':
      return `column-footer:${id.sectionId}`
  }
}

export const parseTableBlockKey = (
  key: string
): TableBlockId | undefined => {
  if (key.startsWith('row:')) {
    const rowId = Number(key.slice(4))
    return Number.isFinite(rowId)
      ? {
          kind: 'row',
          rowId
        }
      : undefined
  }

  if (key.startsWith('section-header:')) {
    return {
      kind: 'section-header',
      sectionId: key.slice('section-header:'.length)
    }
  }

  if (key.startsWith('column-header:')) {
    return {
      kind: 'column-header',
      sectionId: key.slice('column-header:'.length)
    }
  }

  if (key.startsWith('create-record:')) {
    return {
      kind: 'create-record',
      sectionId: key.slice('create-record:'.length)
    }
  }

  if (key.startsWith('column-footer:')) {
    return {
      kind: 'column-footer',
      sectionId: key.slice('column-footer:'.length)
    }
  }

  return undefined
}
