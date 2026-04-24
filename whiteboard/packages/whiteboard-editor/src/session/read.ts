import { store } from '@shared/core'
import type {
  DrawState
} from '@whiteboard/editor/session/draw/state'
import type { DrawMode } from '@whiteboard/editor/session/draw/model'
import type { EditorInputPreview } from '@whiteboard/editor/session/preview'
import type { EditorSession } from '@whiteboard/editor/session/runtime'
import type { Tool } from '@whiteboard/editor/types/tool'

export type ToolRead = {
  get: () => Tool
  type: () => Tool['type']
  value: () => DrawMode | undefined
  is: (type: Tool['type'], value?: string) => boolean
}

export type SessionRead = {
  tool: ToolRead
  draw: store.ReadStore<DrawState>
  space: store.ReadStore<boolean>
  viewport: {
    get: EditorSession['viewport']['read']['get']
    subscribe: EditorSession['viewport']['read']['subscribe']
    pointer: EditorSession['viewport']['read']['pointer']
    worldToScreen: EditorSession['viewport']['read']['worldToScreen']
    worldRect: EditorSession['viewport']['read']['worldRect']
    screenPoint: EditorSession['viewport']['input']['screenPoint']
    size: EditorSession['viewport']['input']['size']
  }
  chrome: {
    draw: EditorInputPreview['selectors']['draw']
    marquee: EditorInputPreview['selectors']['marquee']
    edgeGuide: EditorInputPreview['selectors']['edgeGuide']
    snap: EditorInputPreview['selectors']['snap']
  }
}

const readToolValue = (
  tool: Tool
) => (
  'mode' in tool
    ? tool.mode
    : undefined
)

const isToolMatch = (
  tool: Tool,
  type: Tool['type'],
  value?: string
) => {
  if (tool.type !== type) {
    return false
  }

  if (value === undefined) {
    return true
  }

  return tool.type === 'draw'
    ? tool.mode === value
    : false
}

export const createToolRead = (
  source: store.ReadStore<Tool>
): ToolRead => ({
  get: () => store.read(source),
  type: () => store.read(source).type,
  value: () => readToolValue(store.read(source)),
  is: (type, value) => isToolMatch(store.read(source), type, value)
})

export const createSessionRead = (
  session: Pick<EditorSession, 'state' | 'interaction' | 'viewport' | 'preview'>
): SessionRead => ({
  tool: createToolRead(session.state.tool),
  draw: session.state.draw,
  space: session.interaction.read.space,
  viewport: {
    get: session.viewport.read.get,
    subscribe: session.viewport.read.subscribe,
    pointer: session.viewport.read.pointer,
    worldToScreen: session.viewport.read.worldToScreen,
    worldRect: session.viewport.read.worldRect,
    screenPoint: session.viewport.input.screenPoint,
    size: session.viewport.input.size
  },
  chrome: {
    draw: session.preview.selectors.draw,
    marquee: session.preview.selectors.marquee,
    edgeGuide: session.preview.selectors.edgeGuide,
    snap: session.preview.selectors.snap
  }
})
