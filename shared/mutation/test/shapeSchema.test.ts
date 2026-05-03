import { describe, expect, test } from 'vitest'
import {
  createMutationDelta,
  createMutationQuery,
  createMutationProgramWriter,
  createMutationReader,
  createMutationWriter,
  field,
  map,
  schema,
  sequence,
  singleton,
  table,
} from '@shared/mutation'

type ItemId = `item_${number}`

type Item = {
  id: ItemId
  title: string
}

type ShapeDoc = {
  activeItemId?: ItemId
  order: ItemId[]
  items: {
    ids: ItemId[]
    byId: Partial<Record<ItemId, Item>>
  }
  preview: {
    selection: {
      marquee?: string
      guides: string[]
    }
  }
  overlays: Record<string, {
    visible: boolean
  } | undefined>
}

const shapeMutationSchema = schema<ShapeDoc>({
  activeItemId: field<ItemId | undefined>(),
  order: sequence<ItemId>(),
  items: table<ShapeDoc, ItemId, Item>({
    title: field<Item['title']>()
  }),
  preview: {
    selection: singleton<ShapeDoc, ShapeDoc['preview']['selection']>({
      marquee: field<string | undefined>(),
      guides: field<string[]>(),
    }),
  },
  overlays: map<ShapeDoc, string, {
    id: string
    visible: boolean
  }>({
    visible: field<boolean>()
  }).from({
    read: (document) => Object.fromEntries(
      Object.entries(document.overlays).map(([id, overlay]) => [
        id,
        overlay
          ? {
              id,
              visible: overlay.visible
            }
          : undefined
      ])
    ),
    write: (document, next) => ({
      ...document,
      overlays: Object.fromEntries(
        Object.entries(next as Readonly<Record<string, {
          id: string
          visible: boolean
        } | undefined>>).map(([id, overlay]) => [
          id,
          overlay
            ? {
                visible: overlay.visible
              }
            : undefined
        ])
      )
    })
  })
})

describe('shape-first schema surface', () => {
  test('infers a document singleton from root members and structures', () => {
    const program = createMutationProgramWriter()
    const writer = createMutationWriter(shapeMutationSchema, program)
    const reader = createMutationReader(shapeMutationSchema, () => ({
      activeItemId: 'item_1',
      order: ['item_1'],
      items: {
        ids: ['item_1'],
        byId: {
          item_1: {
            id: 'item_1',
            title: 'First'
          }
        }
      },
      preview: {
        selection: {
          marquee: 'active',
          guides: ['g1']
        }
      },
      overlays: {}
    }))

    writer.document.patch({
      activeItemId: 'item_1'
    })
    writer.document.order.insert('item_2')
    writer.items.create({
      id: 'item_2',
      title: 'Second'
    })
    writer.preview.selection.patch({
      marquee: undefined,
      guides: []
    })
    writer.overlays.create({
      id: 'overlay-1',
      visible: true
    })

    expect(reader.document.activeItemId()).toBe('item_1')
    expect(reader.document.order.items()).toEqual(['item_1'])
    expect(reader.items.get('item_1')).toEqual({
      id: 'item_1',
      title: 'First'
    })
    expect(reader.preview.selection.value()).toEqual({
      marquee: 'active',
      guides: ['g1']
    })

    expect(program.build().steps).toEqual([{
      type: 'entity.patch',
      entity: {
        kind: 'entity',
        type: 'document',
        id: 'document'
      },
      writes: {
        activeItemId: 'item_1'
      }
    }, {
      type: 'ordered.insert',
      target: {
        kind: 'ordered',
        type: 'document.order'
      },
      itemId: 'item_2',
      value: 'item_2',
      to: {
        kind: 'end'
      }
    }, {
      type: 'entity.create',
      entity: {
        kind: 'entity',
        type: 'items',
        id: 'item_2'
      },
      value: {
        id: 'item_2',
        title: 'Second'
      }
    }, {
      type: 'entity.patch',
      entity: {
        kind: 'entity',
        type: 'preview.selection',
        id: 'preview.selection'
      },
      writes: {
        marquee: {
          kind: 'draft.record.unset'
        },
        guides: []
      }
    }, {
      type: 'entity.create',
      entity: {
        kind: 'entity',
        type: 'overlays',
        id: 'overlay-1'
      },
      value: {
        id: 'overlay-1',
        visible: true
      }
    }])
  })

  test('builds delta APIs from inferred families and root document members', () => {
    const delta = createMutationDelta(shapeMutationSchema, {
      changes: {
        'document.activeItemId': true,
        'document.order': {
          order: true,
          ids: ['item_1']
        },
        'items.create': ['item_2'],
        'preview.selection.marquee': true,
        'overlays.visible': ['overlay-1']
      }
    })

    expect(delta.document.changed()).toBe(true)
    expect(delta.document.activeItemId.changed()).toBe(true)
    expect(delta.document.order.changed()).toBe(true)
    expect(delta.document.order.contains('item_1')).toBe(true)
    expect(delta.items.create.changed('item_2')).toBe(true)
    expect(delta.preview.selection.marquee.changed()).toBe(true)
    expect(delta.overlays('overlay-1').visible.changed()).toBe(true)
  })

  test('builds query APIs from inferred families and root document members', () => {
    const query = createMutationQuery(shapeMutationSchema, () => ({
      activeItemId: 'item_1',
      order: ['item_1'],
      items: {
        ids: ['item_1'],
        byId: {
          item_1: {
            id: 'item_1',
            title: 'First'
          }
        }
      },
      preview: {
        selection: {
          marquee: 'active',
          guides: ['g1']
        }
      },
      overlays: {}
    }))

    expect(query.document.order.contains('item_1')).toBe(true)
    expect(query.document.order.indexOf('item_1')).toBe(0)
    expect(query.items('item_1').title()).toBe('First')
    expect(query.changes({
      changes: {
        'document.order': {
          ids: ['item_1']
        }
      }
    }).document.order.contains('item_1')).toBe(true)
  })
})
