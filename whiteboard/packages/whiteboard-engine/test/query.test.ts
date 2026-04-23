import { describe, expect, it } from 'vitest'
import { document as documentApi } from '@whiteboard/core/document'
import { createEngine } from '@whiteboard/engine'

describe('engine query', () => {
  it('exposes committed document query directly on the engine', () => {
    const engine = createEngine({
      document: documentApi.create('doc_engine_query')
    })

    const firstNode = engine.execute({
      type: 'node.create',
      input: {
        id: 'node_query_a',
        type: 'text',
        position: { x: 20, y: 30 },
        data: {
          text: 'A'
        }
      }
    })
    const secondNode = engine.execute({
      type: 'node.create',
      input: {
        id: 'node_query_b',
        type: 'text',
        position: { x: 220, y: 130 },
        data: {
          text: 'B'
        }
      }
    })
    const edge = engine.execute({
      type: 'edge.create',
      input: {
        id: 'edge_query_ab',
        type: 'straight',
        source: {
          kind: 'node',
          nodeId: 'node_query_a'
        },
        target: {
          kind: 'node',
          nodeId: 'node_query_b'
        }
      }
    })

    expect(firstNode.ok).toBe(true)
    expect(secondNode.ok).toBe(true)
    expect(edge.ok).toBe(true)

    const nodeItem = engine.query.node('node_query_a')
    expect(nodeItem?.node.id).toBe('node_query_a')
    expect(nodeItem?.rect.width).toBeGreaterThan(0)
    expect(engine.query.document().nodes.node_query_b?.id).toBe('node_query_b')
    expect(engine.query.nodeIds()).toEqual([
      'node_query_a',
      'node_query_b'
    ])
    expect(engine.query.edgeIds()).toEqual([
      'edge_query_ab'
    ])
    expect(engine.query.edge('edge_query_ab')?.edge.id).toBe('edge_query_ab')
    expect(engine.query.relatedEdges(['node_query_a'])).toEqual([
      'edge_query_ab'
    ])
    expect(
      engine.query.snapCandidatesInRect(nodeItem?.rect ?? {
        x: 0,
        y: 0,
        width: 0,
        height: 0
      }).some((candidate) => candidate.id === 'node_query_a')
    ).toBe(true)
    expect(engine.query.edgeIdsInRect(engine.query.bounds())).toContain('edge_query_ab')
    expect(
      engine.query.scene().some((entry) => (
        entry.kind === 'node' && entry.id === 'node_query_a'
      ))
    ).toBe(true)
  })
})
