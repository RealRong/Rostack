import type { Token } from '@shared/i18n'
import { mindmap as mindmapApi } from '@whiteboard/core/mindmap'
import {
  type MindmapBranchStyle,
  type MindmapLayoutSpec,
  type MindmapNodeStyle,
  type MindmapPreviewModel,
  type MindmapTemplate,
  type MindmapTemplateNode,
  type MindmapTreeNodeStyle
} from '@whiteboard/core/mindmap'
import type { NodeTemplate } from '@whiteboard/core/types'
import {
  whiteboardMindmapPresetDescriptionToken,
  whiteboardMindmapPresetLabelToken,
  whiteboardMindmapSeedDescriptionToken,
  whiteboardMindmapSeedLabelToken
} from '@whiteboard/product/i18n/tokens'

export type WhiteboardMindmapSeedKey = string
export type WhiteboardMindmapPresetKey = string

export type WhiteboardMindmapSeed = {
  key: WhiteboardMindmapSeedKey
  label: string
  labelToken: Token
  description?: string
  descriptionToken?: Token
  root: string
  children?: readonly {
    text: string
    side?: 'left' | 'right'
  }[]
}

export type WhiteboardMindmapPreset = {
  key: WhiteboardMindmapPresetKey
  label: string
  labelToken: Token
  description?: string
  descriptionToken?: Token
  seed: WhiteboardMindmapSeedKey
  layout: MindmapLayoutSpec
  root: MindmapTreeNodeStyle
  child: MindmapTreeNodeStyle
}

const DEFAULT_LAYOUT: MindmapLayoutSpec = {
  side: 'both',
  mode: 'tidy',
  hGap: 28,
  vGap: 18
}

const DEFAULT_NODE_STYLE: MindmapNodeStyle = {
  frame: {
    kind: 'rect',
    color: 'var(--ui-text-primary)',
    width: 1
  },
  fill: 'var(--ui-surface)',
  text: 'var(--ui-text-primary)',
  paddingX: 12,
  paddingY: 8,
  minWidth: 120
}

const DEFAULT_BRANCH_STYLE: MindmapBranchStyle = {
  color: 'var(--ui-text-primary)',
  line: 'curve',
  width: 2,
  stroke: 'solid'
}

const cloneNodeStyle = (
  style: MindmapNodeStyle
): MindmapNodeStyle => ({
  ...style,
  frame: {
    ...style.frame
  }
})

const cloneBranchStyle = (
  style: MindmapBranchStyle
): MindmapBranchStyle => ({
  ...style
})

const cloneTreeNodeStyle = (
  style: MindmapTreeNodeStyle
): MindmapTreeNodeStyle => ({
  node: cloneNodeStyle(style.node),
  branch: cloneBranchStyle(style.branch)
})

const toTextTemplate = (
  text: string,
  style: MindmapNodeStyle
): NodeTemplate => ({
  type: 'text',
  data: {
    text
  },
  style: mindmapApi.template.textNodeStyle(style)
})

const createTemplateNode = (input: {
  text: string
  side?: 'left' | 'right'
  style: MindmapTreeNodeStyle
  children?: readonly MindmapTemplateNode[]
}): MindmapTemplateNode => ({
  node: toTextTemplate(input.text, input.style.node),
  side: input.side,
  branch: cloneBranchStyle(input.style.branch),
  children: input.children
})

const WHITEBOARD_MINDMAP_SEEDS: readonly WhiteboardMindmapSeed[] = [
  {
    key: 'blank',
    label: 'Blank',
    labelToken: whiteboardMindmapSeedLabelToken('blank', 'Blank'),
    description: 'Central topic only',
    descriptionToken: whiteboardMindmapSeedDescriptionToken('blank', 'Central topic only'),
    root: 'Central topic'
  },
  {
    key: 'project',
    label: 'Project',
    labelToken: whiteboardMindmapSeedLabelToken('project', 'Project'),
    description: 'Goals, timeline, tasks, notes',
    descriptionToken: whiteboardMindmapSeedDescriptionToken('project', 'Goals, timeline, tasks, notes'),
    root: 'Project',
    children: [
      { text: 'Goals', side: 'left' },
      { text: 'Timeline', side: 'right' },
      { text: 'Tasks', side: 'left' },
      { text: 'Notes', side: 'right' }
    ]
  },
  {
    key: 'research',
    label: 'Research',
    labelToken: whiteboardMindmapSeedLabelToken('research', 'Research'),
    description: 'Question, sources, findings, next steps',
    descriptionToken: whiteboardMindmapSeedDescriptionToken('research', 'Question, sources, findings, next steps'),
    root: 'Research',
    children: [
      { text: 'Question', side: 'left' },
      { text: 'Sources', side: 'right' },
      { text: 'Findings', side: 'left' },
      { text: 'Next steps', side: 'right' }
    ]
  },
  {
    key: 'meeting',
    label: 'Meeting',
    labelToken: whiteboardMindmapSeedLabelToken('meeting', 'Meeting'),
    description: 'Agenda, discussion, decisions, action items',
    descriptionToken: whiteboardMindmapSeedDescriptionToken('meeting', 'Agenda, discussion, decisions, action items'),
    root: 'Meeting',
    children: [
      { text: 'Agenda', side: 'left' },
      { text: 'Discussion', side: 'right' },
      { text: 'Decisions', side: 'left' },
      { text: 'Action items', side: 'right' }
    ]
  }
]

const WHITEBOARD_MINDMAP_PRESETS: readonly WhiteboardMindmapPreset[] = [
  {
    key: 'mindmap.capsule-outline',
    label: 'Capsule Outline',
    labelToken: whiteboardMindmapPresetLabelToken('mindmap.capsule-outline', 'Capsule Outline'),
    description: 'Outline root and pill branches',
    descriptionToken: whiteboardMindmapPresetDescriptionToken('mindmap.capsule-outline', 'Outline root and pill branches'),
    seed: 'blank',
    layout: DEFAULT_LAYOUT,
    root: {
      node: {
        frame: { kind: 'ellipse', color: 'var(--ui-text-primary)', width: 2 },
        fill: 'var(--ui-surface)',
        text: 'var(--ui-text-primary)',
        paddingX: 18,
        paddingY: 10,
        minWidth: 132
      },
      branch: DEFAULT_BRANCH_STYLE
    },
    child: {
      node: {
        frame: { kind: 'ellipse', color: 'var(--ui-text-primary)', width: 1.5 },
        fill: 'var(--ui-surface)',
        text: 'var(--ui-text-primary)',
        paddingX: 14,
        paddingY: 8,
        minWidth: 108
      },
      branch: {
        color: 'var(--ui-text-primary)',
        line: 'curve',
        width: 1.5,
        stroke: 'solid'
      }
    }
  },
  {
    key: 'mindmap.capsule-solid',
    label: 'Capsule Solid',
    labelToken: whiteboardMindmapPresetLabelToken('mindmap.capsule-solid', 'Capsule Solid'),
    description: 'Solid root with soft branch nodes',
    descriptionToken: whiteboardMindmapPresetDescriptionToken('mindmap.capsule-solid', 'Solid root with soft branch nodes'),
    seed: 'blank',
    layout: DEFAULT_LAYOUT,
    root: {
      node: {
        frame: { kind: 'ellipse', color: 'var(--ui-accent)', width: 2 },
        fill: 'var(--ui-accent)',
        text: 'var(--ui-on-accent)',
        paddingX: 18,
        paddingY: 10,
        minWidth: 132
      },
      branch: {
        color: 'var(--ui-accent)',
        line: 'curve',
        width: 2,
        stroke: 'solid'
      }
    },
    child: {
      node: {
        frame: { kind: 'ellipse', color: 'var(--ui-accent)', width: 1.5 },
        fill: 'rgb(from var(--ui-accent) r g b / 0.08)',
        text: 'var(--ui-text-primary)',
        paddingX: 14,
        paddingY: 8,
        minWidth: 108
      },
      branch: {
        color: 'var(--ui-accent)',
        line: 'curve',
        width: 1.5,
        stroke: 'solid'
      }
    }
  },
  {
    key: 'mindmap.underline-split',
    label: 'Underline Split',
    labelToken: whiteboardMindmapPresetLabelToken('mindmap.underline-split', 'Underline Split'),
    description: 'Underline nodes with split branches',
    descriptionToken: whiteboardMindmapPresetDescriptionToken('mindmap.underline-split', 'Underline nodes with split branches'),
    seed: 'blank',
    layout: {
      ...DEFAULT_LAYOUT,
      hGap: 32,
      vGap: 22
    },
    root: {
      node: {
        frame: { kind: 'underline', color: 'var(--ui-text-primary)', width: 3 },
        fill: 'transparent',
        text: 'var(--ui-text-primary)',
        paddingX: 8,
        paddingY: 8,
        minWidth: 120
      },
      branch: {
        color: 'var(--ui-text-primary)',
        line: 'curve',
        width: 2,
        stroke: 'solid'
      }
    },
    child: {
      node: {
        frame: { kind: 'underline', color: 'var(--ui-text-primary)', width: 2 },
        fill: 'transparent',
        text: 'var(--ui-text-primary)',
        paddingX: 6,
        paddingY: 6,
        minWidth: 96
      },
      branch: {
        color: 'var(--ui-text-primary)',
        line: 'curve',
        width: 1.5,
        stroke: 'solid'
      }
    }
  },
  {
    key: 'mindmap.tree-balanced',
    label: 'Tree Balanced',
    labelToken: whiteboardMindmapPresetLabelToken('mindmap.tree-balanced', 'Tree Balanced'),
    description: 'Balanced tree with rectangular topics',
    descriptionToken: whiteboardMindmapPresetDescriptionToken('mindmap.tree-balanced', 'Balanced tree with rectangular topics'),
    seed: 'blank',
    layout: {
      ...DEFAULT_LAYOUT,
      hGap: 36,
      vGap: 20
    },
    root: {
      node: {
        frame: { kind: 'rect', color: 'var(--ui-text-primary)', width: 2 },
        fill: 'var(--ui-surface)',
        text: 'var(--ui-text-primary)',
        paddingX: 16,
        paddingY: 10,
        minWidth: 132
      },
      branch: {
        color: 'var(--ui-text-primary)',
        line: 'elbow',
        width: 2,
        stroke: 'solid'
      }
    },
    child: {
      node: {
        ...DEFAULT_NODE_STYLE
      },
      branch: {
        color: 'var(--ui-text-primary)',
        line: 'elbow',
        width: 1.5,
        stroke: 'solid'
      }
    }
  }
]

const SEED_INDEX = new Map(
  WHITEBOARD_MINDMAP_SEEDS.map((seed) => [seed.key, seed] as const)
)

const PRESET_INDEX = new Map(
  WHITEBOARD_MINDMAP_PRESETS.map((preset) => [preset.key, preset] as const)
)

export const DEFAULT_WHITEBOARD_MINDMAP_PRESET_KEY =
  WHITEBOARD_MINDMAP_PRESETS[0]?.key ?? 'mindmap.capsule-outline'

export const listWhiteboardMindmapSeeds = () => WHITEBOARD_MINDMAP_SEEDS

export const getWhiteboardMindmapSeed = (
  key: string
) => SEED_INDEX.get(key)

export const listWhiteboardMindmapPresets = () => WHITEBOARD_MINDMAP_PRESETS

export const getWhiteboardMindmapPreset = (
  key: string
) => PRESET_INDEX.get(key)

export const readDefaultWhiteboardMindmapPreset = () =>
  getWhiteboardMindmapPreset(DEFAULT_WHITEBOARD_MINDMAP_PRESET_KEY)

export const buildWhiteboardMindmapTemplate = (input: {
  preset?: string
  seed?: string
} = {}): MindmapTemplate => {
  const preset = getWhiteboardMindmapPreset(
    input.preset ?? DEFAULT_WHITEBOARD_MINDMAP_PRESET_KEY
  ) ?? readDefaultWhiteboardMindmapPreset()
  const seed = getWhiteboardMindmapSeed(
    input.seed ?? preset?.seed ?? 'blank'
  ) ?? getWhiteboardMindmapSeed('blank')

  const rootStyle = cloneTreeNodeStyle(preset?.root ?? {
    node: DEFAULT_NODE_STYLE,
    branch: DEFAULT_BRANCH_STYLE
  })
  const childStyle = cloneTreeNodeStyle(preset?.child ?? {
    node: DEFAULT_NODE_STYLE,
    branch: DEFAULT_BRANCH_STYLE
  })

  return {
    layout: {
      ...(preset?.layout ?? DEFAULT_LAYOUT)
    },
    root: createTemplateNode({
      text: seed?.root ?? 'Central topic',
      style: rootStyle,
      children: seed?.children?.map((child) => createTemplateNode({
        text: child.text,
        side: child.side,
        style: childStyle
      }))
    })
  }
}

const readNodeStyle = (
  node: MindmapTemplateNode
): MindmapNodeStyle => {
  const style = node.node.style ?? {}
  return {
    frame: {
      kind: (style.frameKind as MindmapNodeStyle['frame']['kind']) ?? 'rect',
      color: (style.stroke as string) ?? 'var(--ui-text-primary)',
      width: (style.strokeWidth as number) ?? 1
    },
    fill: (style.fill as string) ?? 'var(--ui-surface)',
    text: (style.color as string) ?? 'var(--ui-text-primary)',
    paddingX: (style.paddingX as number) ?? 12,
    paddingY: (style.paddingY as number) ?? 8,
    minWidth: typeof style.minWidth === 'number'
      ? style.minWidth
      : undefined
  }
}

export const createWhiteboardMindmapPreview = (input: {
  preset?: string
  seed?: string
} = {}): MindmapPreviewModel => {
  const template = buildWhiteboardMindmapTemplate(input)
  const created = mindmapApi.template.instantiate({
    template,
    rootId: 'root',
    createNodeId: (() => {
      let index = 0
      return () => `node_${++index}`
    })()
  })
  const labels: Record<string, string> = {}
  const nodeStyles: Record<string, MindmapNodeStyle> = {}

  const visit = (
    node: MindmapTemplateNode,
    nodeId: string
  ) => {
    labels[nodeId] = typeof node.node.data?.text === 'string'
      ? node.node.data.text
      : ''
    nodeStyles[nodeId] = readNodeStyle(node)

    node.children?.forEach((child, index) => {
      const childId = created.tree.children[nodeId]?.[index]
      if (childId) {
        visit(child, childId)
      }
    })
  }

  visit(template.root, created.tree.rootNodeId)

  return {
    tree: created.tree,
    labels,
    nodeStyles
  }
}
