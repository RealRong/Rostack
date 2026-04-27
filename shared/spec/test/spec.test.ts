import {
  describe,
  expect,
  it
} from 'vitest'
import {
  key,
  spec
} from '../src'

describe('@shared/spec', () => {
  it('builds stable table indexes', () => {
    const index = spec.table({
      text: {
        label: 'Text'
      },
      number: {
        label: 'Number'
      }
    } as const)

    expect(index.keys).toEqual(['text', 'number'])
    expect(index.get('text')).toEqual({
      label: 'Text'
    })
    expect(index.project(([, value]) => value.label)).toEqual({
      text: 'Text',
      number: 'Number'
    })
  })

  it('builds tree leaf indexes', () => {
    const tree = spec.tree({
      node: {
        lifecycle: 'ids',
        content: 'ids'
      },
      chrome: {
        scene: 'flag'
      }
    } as const)

    expect(tree.has('node.lifecycle')).toBe(true)
    expect(tree.get('node.lifecycle')).toEqual({
      key: 'node.lifecycle',
      parts: ['node', 'lifecycle'],
      kind: 'ids',
      parentKey: 'node'
    })
    expect(tree.prefix('node').map((entry) => entry.key)).toEqual([
      'node.lifecycle',
      'node.content'
    ])
  })

  it('encodes tuple keys without delimiter collisions', () => {
    const codec = key.tuple(['fieldId', 'mode', 'interval'] as const)
    const encoded = codec.write({
      fieldId: 'field|id',
      mode: 'a:b',
      interval: undefined
    })

    expect(codec.read(encoded)).toEqual({
      fieldId: 'field|id',
      mode: 'a:b',
      interval: undefined
    })
  })

  it('encodes tagged keys', () => {
    const codec = key.tagged(['node', 'edge', 'mindmap'] as const)
    const encoded = codec.write({
      kind: 'edge',
      id: 'edge:1'
    })

    expect(encoded).toBe('edge:edge:1')
    expect(codec.read(encoded)).toEqual({
      kind: 'edge',
      id: 'edge:1'
    })
  })

  it('encodes escaped path keys and detects conflicts', () => {
    const codec = key.path()
    const encoded = codec.write(['records', 'a.b', 'values', 'title'])

    expect(encoded).toBe('records.a\\.b.values.title')
    expect(codec.read(encoded)).toEqual(['records', 'a.b', 'values', 'title'])
    expect(codec.conflicts('records.a', 'records.a.values.title')).toBe(true)
    expect(codec.conflicts('records.a', 'fields.title')).toBe(false)
  })
})
