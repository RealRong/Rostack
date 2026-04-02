import type { ReadStore } from '@whiteboard/engine'
import type {
  DrawKind,
  EdgePresetKey,
  InsertPresetKey,
  Tool
} from '../../types/tool'

export type ToolRead = {
  get: () => Tool
  type: () => Tool['type']
  preset: () => EdgePresetKey | InsertPresetKey | DrawKind | undefined
  is: (type: Tool['type'], preset?: string) => boolean
}

const readPreset = (
  tool: Tool
) => (
  'preset' in tool
    ? tool.preset
    : 'kind' in tool
      ? tool.kind
      : undefined
)

const isTool = (
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

  switch (tool.type) {
    case 'edge':
    case 'insert':
      return tool.preset === value
    case 'draw':
      return tool.kind === value
    default:
      return false
  }
}

export const createToolRead = ({
  tool
}: {
  tool: ReadStore<Tool>
}): ToolRead => ({
  get: () => tool.get(),
  type: () => tool.get().type,
  preset: () => readPreset(tool.get()),
  is: (type, preset) => isTool(tool.get(), type, preset)
})
