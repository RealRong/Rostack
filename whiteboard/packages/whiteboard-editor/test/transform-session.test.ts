import { describe, expect, it } from 'vitest'
import {
  path as mutationPath,
  type Path
} from '@shared/mutation'
import type { Node } from '@whiteboard/core/types'
import { createTransformSession } from '../src/input/features/transform'

const createTextNode = (
  overrides: Partial<Node> = {}
): Node => ({
  id: 'text-1',
  type: 'text',
  position: {
    x: 0,
    y: 0
  },
  size: {
    width: 100,
    height: 24
  },
  data: {
    text: 'hello world'
  },
  ...overrides
})

const createPointerInput = (
  phase: 'move' | 'up',
  x: number,
  y = 0
) => ({
  phase,
  pointerId: 1,
  button: 0,
  buttons: 1,
  detail: 1,
  client: {
    x,
    y
  },
  screen: {
    x,
    y
  },
  world: {
    x,
    y
  },
  samples: [],
  modifiers: {
    alt: false,
    shift: false,
    ctrl: false,
    meta: false
  },
  pick: {
    kind: 'background'
  } as const,
  editable: false,
  ignoreInput: false,
  ignoreSelection: false,
  ignoreContextMenu: false
})

const createTransformContext = ({
  node,
  projectedRect,
  updates,
  measure = () => ({
    kind: 'size' as const,
    size: {
      width: projectedRect.width,
      height: projectedRect.height
    }
  })
}: {
  node: Node
  projectedRect: {
    x: number
    y: number
    width: number
    height: number
  }
  updates: {
    id: string
    input: {
      fields?: {
        position?: {
          x: number
          y: number
        }
        size?: {
          width: number
          height: number
        }
      }
      records?: readonly {
        scope: string
        op: string
        path: Path
        value: unknown
      }[]
    }
  }[]
  measure?: () => {
    kind: 'size'
    size: {
      width: number
      height: number
    }
  }
}) => ({
  projection: {
    query: {
      document: {
        node: () => node,
        nodeGeometry: () => ({
          rect: {
            x: 0,
            y: 0,
            width: 100,
            height: 24
          }
        })
      }
    }
  },
  sessionRead: {
    viewport: {
      get: () => ({
        zoom: 1
      }),
      screenPoint: (screenX: number, screenY: number) => ({
        x: screenX,
        y: screenY
      }),
      pointer: (pointer: {
        clientX: number
        clientY: number
      }) => ({
        world: {
          x: pointer.clientX,
          y: pointer.clientY
        }
      })
    }
  },
  measure,
  nodes: {
    get: (type: string) => type === 'text'
      ? {
          layout: {
            kind: 'size' as const
          }
        }
      : undefined
  },
  write: {
    node: {
      updateMany: (nextUpdates: typeof updates) => {
        updates.push(...nextUpdates)
      }
    }
  },
  snap: {
    node: {
      resize: (input: {
        rect: typeof projectedRect
      }) => ({
        update: {
          position: {
            x: input.rect.x,
            y: input.rect.y
          },
          size: {
            width: input.rect.width,
            height: input.rect.height
          }
        },
        guides: []
      })
    }
  }
}) as any

describe('createTransformSession', () => {
  it('commits text geometry from the resolved layout preview rect', () => {
    const node = createTextNode()
    const updates: {
      id: string
      input: {
        fields?: {
          position?: {
            x: number
            y: number
          }
          size?: {
            width: number
            height: number
          }
        }
        records?: readonly {
          scope: string
          op: string
          path: Path
          value: unknown
        }[]
      }
    }[] = []
    const projectedRect = {
      x: 0,
      y: 0,
      width: 180,
      height: 72
    }
    const ctx = createTransformContext({
      node,
      projectedRect,
      updates
    })

    const session = createTransformSession(
      ctx,
      {
        kind: 'single-resize',
        pointerId: 1,
        target: {
          id: node.id,
          node,
          rect: {
            x: 0,
            y: 0,
            width: 100,
            height: 24
          }
        },
        rotation: 0,
        handle: 'e',
        startScreen: {
          x: 0,
          y: 0
        }
      },
      {
        modifiers: {
          alt: false,
          shift: false,
          ctrl: false,
          meta: false
        }
      }
    )

    session.move?.(createPointerInput('move', 80))
    session.up?.(createPointerInput('up', 80))

    expect(updates).toHaveLength(1)
    expect(updates[0]).toMatchObject({
      id: 'text-1',
      input: {
        fields: {
          size: {
            width: 180,
            height: 72
          }
        },
        records: [
          {
            scope: 'data',
            op: 'set',
            path: mutationPath.of('widthMode'),
            value: 'wrap'
          },
          {
            scope: 'data',
            op: 'set',
            path: mutationPath.of('wrapWidth'),
            value: 180
          }
        ]
      }
    })
  })

  it('keeps scale text commits on the raw transform geometry', () => {
    const node = createTextNode({
      style: {
        fontSize: 14
      }
    })
    const updates: {
      id: string
      input: {
        fields?: {
          position?: {
            x: number
            y: number
          }
          size?: {
            width: number
            height: number
          }
        }
        records?: readonly {
          scope: string
          op: string
          path: Path
          value: unknown
        }[]
      }
    }[] = []
    const projectedRect = {
      x: 0,
      y: 0,
      width: 180,
      height: 72
    }
    const ctx = createTransformContext({
      node,
      projectedRect,
      updates
    })

    const session = createTransformSession(
      ctx,
      {
        kind: 'single-resize',
        pointerId: 1,
        target: {
          id: node.id,
          node,
          rect: {
            x: 0,
            y: 0,
            width: 100,
            height: 24
          }
        },
        rotation: 0,
        handle: 'se',
        startScreen: {
          x: 0,
          y: 0
        }
      },
      {
        modifiers: {
          alt: false,
          shift: false,
          ctrl: false,
          meta: false
        }
      }
    )

    session.move?.(createPointerInput('move', 80))
    session.up?.(createPointerInput('up', 80))

    expect(updates).toHaveLength(1)
    expect(updates[0]?.id).toBe('text-1')
    expect(updates[0]?.input.records).toMatchObject([
      {
        scope: 'style',
        op: 'set',
        path: mutationPath.of('fontSize'),
        value: 25
      }
    ])
    expect(updates[0]?.input.fields?.size?.width).not.toBe(projectedRect.width)
    expect(updates[0]?.input.fields?.size?.height).not.toBe(projectedRect.height)
    expect(
      (updates[0]?.input.fields?.size?.width ?? 0)
      / (updates[0]?.input.fields?.size?.height ?? 1)
    ).toBeCloseTo(100 / 24)
  })
})
