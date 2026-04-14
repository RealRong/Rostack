import {
  createFrameNodeInput,
  createShapeNodeInput,
  createStickyNodeInput,
  createTextNodeInput,
  SHAPE_SPECS,
  isShapeKind,
  type ShapeKind
} from '@whiteboard/core/node'
import type {
  MindmapNodeData,
  Point,
  SpatialNodeInput
} from '@whiteboard/core/types'
import type {
  InsertPlacement,
  InsertPreset,
  InsertPresetCatalog,
  InsertPresetGroup,
  MindmapInsertPreset,
  MindmapTemplate,
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

export const MINDMAP_INSERT_TEMPLATES: readonly MindmapTemplate[] = [
  {
    key: 'mindmap.blank',
    label: 'Blank map',
    description: 'Central topic only',
    root: {
      kind: 'text',
      text: 'Central topic'
    }
  },
  {
    key: 'mindmap.project',
    label: 'Project',
    description: 'Goals, timeline, tasks, notes',
    root: {
      kind: 'text',
      text: 'Project'
    },
    children: [
      { data: { kind: 'text', text: 'Goals' }, side: 'left' },
      { data: { kind: 'text', text: 'Timeline' }, side: 'right' },
      { data: { kind: 'text', text: 'Tasks' }, side: 'left' },
      { data: { kind: 'text', text: 'Notes' }, side: 'right' }
    ]
  },
  {
    key: 'mindmap.research',
    label: 'Research',
    description: 'Question, sources, findings, next',
    root: {
      kind: 'text',
      text: 'Research'
    },
    children: [
      { data: { kind: 'text', text: 'Question' }, side: 'left' },
      { data: { kind: 'text', text: 'Sources' }, side: 'right' },
      { data: { kind: 'text', text: 'Findings' }, side: 'left' },
      { data: { kind: 'text', text: 'Next steps' }, side: 'right' }
    ]
  },
  {
    key: 'mindmap.meeting',
    label: 'Meeting',
    description: 'Agenda, discussion, decisions, actions',
    root: {
      kind: 'text',
      text: 'Meeting'
    },
    children: [
      { data: { kind: 'text', text: 'Agenda' }, side: 'left' },
      { data: { kind: 'text', text: 'Discussion' }, side: 'right' },
      { data: { kind: 'text', text: 'Decisions' }, side: 'left' },
      { data: { kind: 'text', text: 'Action items' }, side: 'right' }
    ]
  }
] as const

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

const createMindmapPreset = (
  template: MindmapTemplate
): MindmapInsertPreset => ({
  kind: 'mindmap',
  key: template.key,
  group: 'mindmap',
  label: template.label,
  description: template.description,
  template
})

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
      stroke: option.tone.borderKey,
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

export const MINDMAP_INSERT_PRESETS: readonly MindmapInsertPreset[] = MINDMAP_INSERT_TEMPLATES.map(createMindmapPreset)

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
  'mindmap.blank'
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
  MindmapTemplate,
  NodeInsertPreset
}
