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
  NodeInsertPreset,
  StickyTone
} from '@whiteboard/editor/insert'

const firstPresetKey = <T extends {
  key: string
}>(
  items: readonly T[],
  fallback: string
) => items[0]?.key ?? fallback

const STICKY_TONES: readonly StickyTone[] = [
  {
    key: 'sticky.yellow',
    label: 'Yellow',
    fill: 'hsl(var(--tag-yellow-background, 47.6 70.7% 92%))'
  },
  {
    key: 'sticky.blue',
    label: 'Blue',
    fill: 'hsl(var(--tag-blue-background, 206.1 79.3% 94.3%))'
  },
  {
    key: 'sticky.green',
    label: 'Green',
    fill: 'hsl(var(--tag-green-background, 146.7 24.3% 92.7%))'
  },
  {
    key: 'sticky.pink',
    label: 'Pink',
    fill: 'hsl(var(--tag-pink-background, 331.8 63% 94.7%))'
  },
  {
    key: 'sticky.purple',
    label: 'Purple',
    fill: 'hsl(var(--tag-purple-background, 274.3 53.8% 94.9%))'
  },
  {
    key: 'sticky.red',
    label: 'Red',
    fill: 'hsl(var(--tag-red-background, 5.7 77.8% 94.7%))'
  },
  {
    key: 'sticky.orange',
    label: 'Orange',
    fill: 'hsl(var(--tag-orange-background, 26.9 78.4% 92.7%))'
  },
  {
    key: 'sticky.gray',
    label: 'Gray',
    fill: 'hsl(var(--tag-gray-background, 40 9.1% 93.5%))'
  }
] as const

export const STICKY_INSERT_OPTIONS = STICKY_TONES

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
  canNest: false,
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
  description: 'Manual container area',
  focus: 'title',
  input: () => ({
    ...createFrameNodeInput()
  })
})

export const STICKY_INSERT_PRESETS: readonly NodeInsertPreset[] = STICKY_TONES.map((tone) =>
  createNodePreset({
    key: tone.key,
    group: 'sticky',
    label: tone.label,
    focus: 'text',
    input: () => createStickyNodeInput(tone.fill)
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

const STICKY_TONE_INDEX = new Map(
  STICKY_TONES.map((tone) => [tone.key, tone] as const)
)

export const DEFAULT_STICKY_PRESET_KEY = firstPresetKey(
  STICKY_INSERT_PRESETS,
  'sticky.yellow'
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

export const readStickyInsertTone = (
  key: string | undefined
) => key
  ? STICKY_TONE_INDEX.get(key)
  : undefined

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
  NodeInsertPreset,
  StickyTone
}
