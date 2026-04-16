import {
  createFrameNodeInput,
  createShapeNodeInput,
  createStickyNodeInput,
  createTextNodeInput,
  SHAPE_SPECS,
  isShapeKind,
  type ShapeKind
} from '@whiteboard/core/node'
import {
  listMindmapPresets
} from '@whiteboard/core/mindmap'
import type {
  Point,
  SpatialNodeInput
} from '@whiteboard/core/types'
import type {
  InsertPlacement,
  InsertPreset,
  InsertPresetCatalog,
  InsertPresetGroup,
  MindmapInsertPreset,
  NodeInsertPreset
} from '@whiteboard/editor'
import {
  DEFAULT_STICKY_INSERT_OPTION_KEY,
  STICKY_INSERT_OPTIONS
} from '@whiteboard/react/features/palette'

const firstPresetKey = <T extends {
  key: string
}>(
  items: readonly T[],
  fallback: string
) => items[0]?.key ?? fallback

const createNodePreset = ({
  key,
  group,
  label,
  description,
  focus,
  placement,
  input
}: {
  key: string
  group: InsertPresetGroup
  label: string
  description?: string
  focus?: NodeInsertPreset['focus']
  placement?: InsertPlacement
  input: (world: Point) => Omit<SpatialNodeInput, 'position'>
}): NodeInsertPreset => ({
  kind: 'node',
  key,
  group,
  label,
  description,
  focus,
  placement,
  input
})

export const MINDMAP_INSERT_PRESETS: readonly MindmapInsertPreset[] = listMindmapPresets().map((preset) => ({
  kind: 'mindmap',
  key: preset.key,
  group: 'mindmap',
  label: preset.label,
  description: preset.description,
  preset: preset.key
}))

export const TEXT_INSERT_PRESET = createNodePreset({
  key: 'text',
  group: 'text',
  label: 'Text',
  description: 'Empty text block',
  focus: 'text',
  placement: 'point',
  input: () => ({
    ...createTextNodeInput()
  })
})

export const FRAME_INSERT_PRESET = createNodePreset({
  key: 'frame',
  group: 'frame',
  label: 'Frame',
  description: 'Manual frame area',
  focus: 'title',
  input: () => ({
    ...createFrameNodeInput()
  })
})

export const STICKY_INSERT_PRESETS: readonly NodeInsertPreset[] = STICKY_INSERT_OPTIONS.map((option) =>
  createNodePreset({
    key: option.key,
    group: 'sticky',
    label: option.label,
    focus: 'text',
    input: () => createStickyNodeInput({
      fill: option.tone.fillKey,
      size: {
        width: option.format.width,
        height: option.format.height
      }
    })
  })
)

export const SHAPE_INSERT_PRESETS: readonly NodeInsertPreset[] = SHAPE_SPECS.map((spec) =>
  createNodePreset({
    key: `shape.${spec.kind}`,
    group: 'shape',
    label: spec.label,
    focus: 'text',
    input: () => createShapeNodeInput(spec.kind)
  })
)

export const INSERT_PRESETS: readonly InsertPreset[] = [
  TEXT_INSERT_PRESET,
  FRAME_INSERT_PRESET,
  ...STICKY_INSERT_PRESETS,
  ...SHAPE_INSERT_PRESETS,
  ...MINDMAP_INSERT_PRESETS
] as const

const INSERT_PRESET_INDEX = new Map(
  INSERT_PRESETS.map((preset) => [preset.key, preset] as const)
)

export const DEFAULT_STICKY_PRESET_KEY = firstPresetKey(
  STICKY_INSERT_PRESETS,
  DEFAULT_STICKY_INSERT_OPTION_KEY
)

export const DEFAULT_SHAPE_PRESET_KEY = firstPresetKey(
  SHAPE_INSERT_PRESETS,
  'shape.rectangle'
)

export const DEFAULT_MINDMAP_PRESET_KEY = firstPresetKey(
  MINDMAP_INSERT_PRESETS,
  'mindmap.capsule-outline'
)

export const readShapePresetKind = (
  key: string | undefined
): ShapeKind | undefined => {
  if (!key?.startsWith('shape.')) {
    return undefined
  }

  const kind = key.slice('shape.'.length)
  return isShapeKind(kind) ? kind : undefined
}

const CREATE_PRESET_KEY_SET = new Set<string>([
  TEXT_INSERT_PRESET.key,
  FRAME_INSERT_PRESET.key,
  DEFAULT_STICKY_PRESET_KEY,
  ...SHAPE_INSERT_PRESETS.map((preset) => preset.key)
])

export const CREATE_PRESETS: readonly InsertPreset[] = INSERT_PRESETS.filter((preset) =>
  CREATE_PRESET_KEY_SET.has(preset.key)
)

export const getInsertPreset = (
  key: string
) => INSERT_PRESET_INDEX.get(key)

export const readInsertPresetGroup = (
  key: string | undefined
) => key
  ? INSERT_PRESET_INDEX.get(key)?.group
  : undefined

export const INSERT_PRESET_CATALOG: InsertPresetCatalog = {
  get: getInsertPreset,
  defaults: {
    text: TEXT_INSERT_PRESET.key,
    frame: FRAME_INSERT_PRESET.key,
    sticky: DEFAULT_STICKY_PRESET_KEY,
    mindmap: DEFAULT_MINDMAP_PRESET_KEY,
    shape: (kind) => `shape.${kind}`
  }
}

export type {
  InsertPlacement,
  InsertPreset,
  InsertPresetGroup,
  InsertPresetCatalog,
  MindmapInsertPreset,
  NodeInsertPreset
}
