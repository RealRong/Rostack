import type {
  ItemId,
  SectionKey
} from '@dataview/engine'

export type TableBlockId =
  | {
      kind: 'row'
      rowId: ItemId
    }
  | {
      kind: 'section-header'
      sectionKey: SectionKey
    }
  | {
      kind: 'column-header'
      sectionKey: SectionKey
    }
  | {
      kind: 'create-record'
      sectionKey: SectionKey
    }
  | {
      kind: 'column-footer'
      sectionKey: SectionKey
    }

export const tableBlockKey = (id: TableBlockId): string => {
  switch (id.kind) {
    case 'row':
      return `row:${id.rowId}`
    case 'section-header':
      return `section-header:${id.sectionKey}`
    case 'column-header':
      return `column-header:${id.sectionKey}`
    case 'create-record':
      return `create-record:${id.sectionKey}`
    case 'column-footer':
      return `column-footer:${id.sectionKey}`
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
      sectionKey: key.slice('section-header:'.length)
    }
  }

  if (key.startsWith('column-header:')) {
    return {
      kind: 'column-header',
      sectionKey: key.slice('column-header:'.length)
    }
  }

  if (key.startsWith('create-record:')) {
    return {
      kind: 'create-record',
      sectionKey: key.slice('create-record:'.length)
    }
  }

  if (key.startsWith('column-footer:')) {
    return {
      kind: 'column-footer',
      sectionKey: key.slice('column-footer:'.length)
    }
  }

  return undefined
}
