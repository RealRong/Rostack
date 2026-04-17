import { describe, expect, it } from 'vitest'
import { projectNodeItem } from '../src/query/node/projection'

describe('projectNodeItem', () => {
  it('applies projected mindmap layout to mindmap-owned nodes', () => {
    const projected = projectNodeItem({
      node: {
        id: 'root-1',
        type: 'text',
        mindmapId: 'mind-1',
        position: {
          x: 100,
          y: 120
        },
        size: {
          width: 144,
          height: 44
        },
        data: {
          text: 'Central topic'
        }
      },
      rect: {
        x: 100,
        y: 120,
        width: 144,
        height: 44
      }
    }, {
      hovered: false,
      hidden: false
    }, null, {
      id: 'mind-1',
      node: {
        id: 'mind-1',
        type: 'mindmap',
        position: {
          x: 180,
          y: 160
        }
      },
      tree: {
        rootNodeId: 'root-1',
        nodes: {
          'root-1': {
            branch: {
              color: '#000',
              line: 'curve',
              width: 2,
              stroke: 'solid'
            }
          }
        },
        children: {
          'root-1': []
        },
        layout: {
          mode: 'tidy',
          side: 'both',
          hGap: 28,
          vGap: 18
        }
      },
      layout: {
        mode: 'tidy',
        side: 'both',
        hGap: 28,
        vGap: 18
      },
      computed: {
        node: {
          'root-1': {
            x: 180,
            y: 160,
            width: 144,
            height: 44
          }
        },
        bbox: {
          x: 180,
          y: 160,
          width: 144,
          height: 44
        }
      },
      childNodeIds: ['root-1'],
      connectors: []
    })

    expect(projected.node.position).toEqual({
      x: 180,
      y: 160
    })
    expect(projected.rect).toEqual({
      x: 180,
      y: 160,
      width: 144,
      height: 44
    })
  })
})
