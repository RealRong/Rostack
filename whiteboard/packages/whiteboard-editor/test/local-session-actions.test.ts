import { describe, expect, it } from 'vitest'
import { createValueStore } from '@shared/core'
import { createLocalSessionActions } from '../src/local/actions/session'
import { createEditState } from '../src/local/session/edit'
import { createSelectionState } from '../src/local/session/selection'
import type { Tool } from '../src/types/tool'

const createState = (
  tool: Tool = { type: 'select' }
) => ({
  tool: createValueStore<Tool>(tool),
  selection: createSelectionState(),
  edit: createEditState()
})

const seedEditSession = (
  state: ReturnType<typeof createState>
) => {
  state.edit.mutate.set({
    kind: 'node',
    nodeId: 'node-1',
    field: 'text',
    initial: { text: 'hello' },
    draft: { text: 'hello' },
    layout: {
      composing: false
    },
    caret: { kind: 'end' },
    status: 'active',
    capabilities: {
      multiline: false,
      empty: 'keep'
    }
  })
}

describe('createLocalSessionActions.tool.set', () => {
  it('clears selection and edit state when switching tools', () => {
    const state = createState()
    const actions = createLocalSessionActions({
      state,
      getRead: () => null
    })

    state.selection.mutate.replace({
      nodeIds: ['node-1']
    })
    seedEditSession(state)

    actions.tool.set({
      type: 'edge',
      preset: 'edge.straight'
    })

    expect(state.tool.get()).toEqual({
      type: 'edge',
      preset: 'edge.straight'
    })
    expect(state.selection.source.get()).toEqual({
      nodeIds: [],
      edgeIds: []
    })
    expect(state.edit.source.get()).toBeNull()

    state.selection.mutate.replace({
      edgeIds: ['edge-1']
    })

    actions.tool.set({
      type: 'select'
    })

    expect(state.tool.get()).toEqual({
      type: 'select'
    })
    expect(state.selection.source.get()).toEqual({
      nodeIds: [],
      edgeIds: []
    })
  })

  it('preserves selection when re-setting the same select tool', () => {
    const state = createState()
    const actions = createLocalSessionActions({
      state,
      getRead: () => null
    })

    state.selection.mutate.replace({
      nodeIds: ['node-1']
    })

    actions.tool.set({
      type: 'select'
    })

    expect(state.selection.source.get()).toEqual({
      nodeIds: ['node-1'],
      edgeIds: []
    })
  })
})
