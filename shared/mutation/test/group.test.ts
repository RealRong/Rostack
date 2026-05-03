import { describe, expect, test } from 'vitest'
import {
  createMutationDelta,
  createMutationProgramWriter,
  createMutationReader,
  createMutationWriter,
  defineMutationSchema,
  namespace,
  collection,
  singleton,
  value
} from '@shared/mutation'

type NodeId = `node_${number}`

type GroupedDoc = {
  preview: {
    node: Record<NodeId, {
      value: number
    } | undefined>
    selection: {
      marquee?: string
      guides: string[]
    }
  }
}

const groupedMutationSchema = defineMutationSchema<GroupedDoc>()({
  preview: namespace({
    node: collection<GroupedDoc, NodeId, {
      id: NodeId
      value: number
    }>()({
      access: {
        read: (document) => Object.fromEntries(
          Object.entries(document.preview.node).map(([id, node]) => [
            id,
            node
              ? {
                  id: id as NodeId,
                  value: node.value
                }
              : undefined
          ])
        ),
        write: (document, next) => ({
          ...document,
          preview: {
            ...document.preview,
            node: Object.fromEntries(
              Object.entries(next as Readonly<Record<NodeId, {
                id: NodeId
                value: number
              } | undefined>>).map(([id, node]) => [
                id,
                node
                  ? {
                      value: node.value
                    }
                  : undefined
              ])
            ) as GroupedDoc['preview']['node']
          }
        })
      },
      members: {
        value: value<number>()
      },
      changes: ({ value }) => ({
        value: [value('value')]
      })
    }),
    selection: singleton<GroupedDoc, GroupedDoc['preview']['selection']>()({
      access: {
        read: (document) => document.preview.selection,
        write: (document, next) => ({
          ...document,
          preview: {
            ...document.preview,
            selection: next as GroupedDoc['preview']['selection']
          }
        })
      },
      members: {
        marquee: value<string | undefined>(),
        guides: value<string[]>()
      },
      changes: ({ value }) => ({
        marquee: [value('marquee')],
        guides: [value('guides')]
      })
    })
  })
})

describe('namespace mutation schema', () => {
  test('creates nested writer and reader APIs from groups', () => {
    const program = createMutationProgramWriter()
    const writer = createMutationWriter(groupedMutationSchema, program)
    const reader = createMutationReader(groupedMutationSchema, () => ({
      preview: {
        node: {
          node_1: {
            value: 2
          }
        },
        selection: {
          marquee: 'active',
          guides: ['g1']
        }
      }
    }))

    writer.preview.node.create({
      id: 'node_1',
      value: 1
    })
    writer.preview.selection.patch({
      marquee: undefined,
      guides: []
    })

    expect(reader.preview.node.get('node_1')).toEqual({
      id: 'node_1',
      value: 2
    })
    expect(reader.preview.selection.value()).toEqual({
      marquee: 'active',
      guides: ['g1']
    })

    expect(program.build().steps).toEqual([{
      type: 'entity.create',
      entity: {
        kind: 'entity',
        type: 'preview.node',
        id: 'node_1'
      },
      value: {
        id: 'node_1',
        value: 1
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
    }])
  })

  test('creates nested delta APIs from groups', () => {
    const delta = createMutationDelta(groupedMutationSchema, {
      reset: true
    })

    expect(delta.preview.node.changed()).toBe(true)
    expect(delta.preview.node('node_1').changed()).toBe(true)
    expect(delta.preview.selection.changed()).toBe(true)
    expect(delta.preview.selection.marquee.changed()).toBe(true)
    expect(delta.preview.selection.guides.changed()).toBe(true)
  })
})
