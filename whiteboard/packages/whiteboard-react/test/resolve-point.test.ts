import { beforeEach, describe, expect, it, vi } from 'vitest'

const domMocks = vi.hoisted(() => ({
  elementFromPointWithin: vi.fn(),
  elementsFromPointWithin: vi.fn(),
  readClientPoint: vi.fn((input: { clientX: number, clientY: number }) => ({
    x: input.clientX,
    y: input.clientY
  })),
  readCoalescedPointerEvents: vi.fn(() => []),
  readModifierKeys: vi.fn(() => ({
    alt: false,
    shift: false,
    ctrl: false,
    meta: false
  })),
  resolveContainedElement: vi.fn((target: EventTarget | null) => (
    target as Element | null
  ))
}))

const targetMocks = vi.hoisted(() => ({
  isContextMenuIgnoredTarget: vi.fn(() => false),
  isEditableTarget: vi.fn(() => false),
  isInputIgnoredTarget: vi.fn(() => false),
  isSelectionIgnoredTarget: vi.fn(() => false)
}))

vi.mock('@shared/dom', () => domMocks)
vi.mock('@whiteboard/react/dom/host/targets', () => targetMocks)

import { resolvePoint } from '../src/dom/host/input'

type ResolvePointInput = Parameters<typeof resolvePoint>[0]
type ResolvePointEditor = ResolvePointInput['editor']
type ResolvePointPick = ResolvePointInput['pick']

describe('resolvePoint', () => {
  beforeEach(() => {
    domMocks.elementFromPointWithin.mockReset()
    domMocks.elementsFromPointWithin.mockReset()
    domMocks.readClientPoint.mockClear()
    domMocks.resolveContainedElement.mockClear()
    targetMocks.isContextMenuIgnoredTarget.mockClear()
    targetMocks.isEditableTarget.mockClear()
    targetMocks.isInputIgnoredTarget.mockClear()
    targetMocks.isSelectionIgnoredTarget.mockClear()
  })

  it('avoids resolving the full DOM stack for regular picks', () => {
    const container = {} as Element
    const primaryElement = {} as Element
    const event = {
      clientX: 120,
      clientY: 80,
      target: primaryElement
    } as MouseEvent
    const pick: ResolvePointPick = {
      element: vi.fn((element: Element | null) => (
        element === primaryElement
          ? {
              kind: 'node' as const,
              id: 'node-1',
              part: 'body' as const
            }
          : undefined
      ))
    }
    const editor: ResolvePointEditor = {
      state: {
        viewport: {
          pointer: vi.fn((input: { clientX: number, clientY: number }) => ({
            screen: {
              x: input.clientX,
              y: input.clientY
            },
            world: {
              x: input.clientX / 2,
              y: input.clientY / 2
            }
          })),
          get: () => ({
            center: { x: 0, y: 0 },
            zoom: 1
          })
        },
        selection: {
          get: () => ({
            nodeIds: [],
            edgeIds: []
          })
        }
      },
      scene: {
        query: {
          hit: {
            edge: vi.fn(() => undefined)
          }
        }
      }
    }

    domMocks.elementFromPointWithin.mockReturnValue(primaryElement)

    const resolved = resolvePoint({
      editor,
      pick,
      container,
      event
    })

    expect(resolved.pick).toEqual({
      kind: 'node',
      id: 'node-1',
      part: 'body'
    })
    expect(domMocks.elementsFromPointWithin).not.toHaveBeenCalled()
  })

  it('resolves the full DOM stack when a selection box needs passthrough picking', () => {
    const container = {} as Element
    const selectionBoxElement = {} as Element
    const selectedNodeElement = {} as Element
    const event = {
      clientX: 180,
      clientY: 90,
      target: selectionBoxElement
    } as MouseEvent
    const pick: ResolvePointPick = {
      element: vi.fn((element: Element | null) => {
        if (element === selectionBoxElement) {
          return {
            kind: 'selection-box' as const,
            part: 'body' as const
          }
        }

        if (element === selectedNodeElement) {
          return {
            kind: 'node' as const,
            id: 'node-1',
            part: 'body' as const
          }
        }

        return undefined
      })
    }
    const editor: ResolvePointEditor = {
      state: {
        viewport: {
          pointer: vi.fn((input: { clientX: number, clientY: number }) => ({
            screen: {
              x: input.clientX,
              y: input.clientY
            },
            world: {
              x: input.clientX,
              y: input.clientY
            }
          })),
          get: () => ({
            center: { x: 0, y: 0 },
            zoom: 1
          })
        },
        selection: {
          get: () => ({
            nodeIds: ['node-1'],
            edgeIds: []
          })
        }
      },
      scene: {
        query: {
          hit: {
            edge: vi.fn(() => undefined)
          }
        }
      }
    }

    domMocks.elementFromPointWithin.mockReturnValue(selectionBoxElement)
    domMocks.elementsFromPointWithin.mockReturnValue([
      selectionBoxElement,
      selectedNodeElement
    ])

    const resolved = resolvePoint({
      editor,
      pick,
      container,
      event
    })

    expect(resolved.pick).toEqual({
      kind: 'node',
      id: 'node-1',
      part: 'body'
    })
    expect(domMocks.elementsFromPointWithin).toHaveBeenCalledTimes(1)
  })
})
