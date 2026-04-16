import { createId } from '@whiteboard/core/id'
import {
  buildMindmapTextNodeStyle
} from '@whiteboard/core/mindmap/types'
import type {
  MindmapMaterializedCreate,
  MindmapBranchStyle,
  MindmapIdGenerator,
  MindmapLayoutSpec,
  MindmapNodeStyle,
  MindmapNodeId,
  MindmapPreviewModel,
  MindmapPresetKey,
  MindmapSeedKey,
  MindmapTopicData,
  MindmapTree,
  MindmapTreeNodeStyle
} from '@whiteboard/core/mindmap/types'

export type MindmapSeed = {
  key: MindmapSeedKey
  label: string
  description?: string
  root: MindmapTopicData
  children?: readonly {
    data: MindmapTopicData
    side?: 'left' | 'right'
  }[]
}

export type MindmapPresetRule = {
  match?: {
    depth?: number | { min?: number; max?: number }
    side?: 'left' | 'right'
    leaf?: boolean
    root?: boolean
  }
  node?: Partial<MindmapNodeStyle>
  branch?: Partial<MindmapBranchStyle>
}

export type MindmapPreset = {
  key: MindmapPresetKey
  label: string
  description?: string
  seed: MindmapSeedKey
  layout: MindmapLayoutSpec
  rules: readonly MindmapPresetRule[]
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

const cloneNodeStyle = (style: MindmapNodeStyle): MindmapNodeStyle => ({
  ...style,
  frame: {
    ...style.frame
  }
})

const cloneBranchStyle = (style: MindmapBranchStyle): MindmapBranchStyle => ({
  ...style
})

export const cloneMindmapTreeNodeStyle = (
  style: MindmapTreeNodeStyle
): MindmapTreeNodeStyle => ({
  node: cloneNodeStyle(style.node),
  branch: cloneBranchStyle(style.branch)
})

const mergeNodeStyle = (
  base: MindmapNodeStyle,
  patch?: Partial<MindmapNodeStyle>
): MindmapNodeStyle => ({
  ...base,
  ...patch,
  frame: {
    ...base.frame,
    ...patch?.frame
  }
})

const mergeBranchStyle = (
  base: MindmapBranchStyle,
  patch?: Partial<MindmapBranchStyle>
): MindmapBranchStyle => ({
  ...base,
  ...patch
})

const mergeTreeNodeStyle = (
  base: MindmapTreeNodeStyle,
  patch: {
    node?: Partial<MindmapNodeStyle>
    branch?: Partial<MindmapBranchStyle>
  }
): MindmapTreeNodeStyle => ({
  node: mergeNodeStyle(base.node, patch.node),
  branch: mergeBranchStyle(base.branch, patch.branch)
})

const matchesDepth = (
  depth: number,
  target: number | { min?: number; max?: number } | undefined
) => {
  if (target === undefined) return true
  if (typeof target === 'number') return depth === target
  if (typeof target.min === 'number' && depth < target.min) return false
  if (typeof target.max === 'number' && depth > target.max) return false
  return true
}

const matchesRule = (
  rule: MindmapPresetRule,
  input: {
    depth: number
    side?: 'left' | 'right'
    leaf: boolean
    root: boolean
  }
) => {
  const match = rule.match
  if (!match) return true
  if (!matchesDepth(input.depth, match.depth)) return false
  if (match.side && match.side !== input.side) return false
  if (typeof match.leaf === 'boolean' && match.leaf !== input.leaf) return false
  if (typeof match.root === 'boolean' && match.root !== input.root) return false
  return true
}

const DEFAULT_SEEDS: readonly MindmapSeed[] = [
  {
    key: 'blank',
    label: 'Blank',
    description: 'Central topic only',
    root: {
      kind: 'text',
      text: 'Central topic'
    }
  },
  {
    key: 'project',
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
    key: 'research',
    label: 'Research',
    description: 'Question, sources, findings, next steps',
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
    key: 'meeting',
    label: 'Meeting',
    description: 'Agenda, discussion, decisions, action items',
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
]

const DEFAULT_PRESETS: readonly MindmapPreset[] = [
  {
    key: 'mindmap.capsule-outline',
    label: 'Capsule Outline',
    description: 'Outline root and pill branches',
    seed: 'blank',
    layout: DEFAULT_LAYOUT,
    rules: [
      {
        match: { root: true },
        node: {
          frame: { kind: 'ellipse', color: 'var(--ui-text-primary)', width: 2 },
          fill: 'var(--ui-surface)',
          paddingX: 18,
          paddingY: 10,
          minWidth: 132
        },
        branch: {
          color: 'var(--ui-text-primary)',
          line: 'curve',
          width: 2
        }
      },
      {
        match: { depth: { min: 1 } },
        node: {
          frame: { kind: 'ellipse', color: 'var(--ui-text-primary)', width: 1.5 },
          fill: 'var(--ui-surface)',
          paddingX: 14,
          paddingY: 8,
          minWidth: 108
        },
        branch: {
          color: 'var(--ui-text-primary)',
          line: 'curve',
          width: 1.5
        }
      }
    ]
  },
  {
    key: 'mindmap.capsule-solid',
    label: 'Capsule Solid',
    description: 'Solid root with soft branch nodes',
    seed: 'blank',
    layout: DEFAULT_LAYOUT,
    rules: [
      {
        match: { root: true },
        node: {
          frame: { kind: 'ellipse', color: 'var(--ui-accent)', width: 0 },
          fill: 'var(--ui-accent)',
          text: 'var(--ui-on-accent)',
          paddingX: 18,
          paddingY: 10,
          minWidth: 132
        },
        branch: {
          color: 'var(--ui-accent)',
          line: 'curve',
          width: 2
        }
      },
      {
        match: { depth: { min: 1 } },
        node: {
          frame: { kind: 'ellipse', color: 'var(--ui-accent)', width: 1 },
          fill: 'rgb(from var(--ui-accent) r g b / 0.08)',
          paddingX: 14,
          paddingY: 8,
          minWidth: 104
        },
        branch: {
          color: 'rgb(from var(--ui-accent) r g b / 0.9)',
          line: 'curve',
          width: 1.5
        }
      }
    ]
  },
  {
    key: 'mindmap.underline-split',
    label: 'Underline Split',
    description: 'Ellipse root with underline children',
    seed: 'blank',
    layout: DEFAULT_LAYOUT,
    rules: [
      {
        match: { root: true },
        node: {
          frame: { kind: 'ellipse', color: 'var(--ui-accent)', width: 2 },
          fill: 'rgb(from var(--ui-accent) r g b / 0.1)',
          paddingX: 18,
          paddingY: 10,
          minWidth: 132
        },
        branch: {
          color: 'var(--ui-accent)',
          line: 'curve',
          width: 2
        }
      },
      {
        match: { depth: { min: 1 } },
        node: {
          frame: { kind: 'underline', color: 'var(--ui-text-secondary)', width: 2 },
          fill: 'transparent',
          paddingX: 6,
          paddingY: 4,
          minWidth: 84
        },
        branch: {
          color: 'var(--ui-text-secondary)',
          line: 'rail',
          width: 1.5
        }
      }
    ]
  },
  {
    key: 'mindmap.box-outline',
    label: 'Box Outline',
    description: 'Rectangular map with elbow branches',
    seed: 'blank',
    layout: DEFAULT_LAYOUT,
    rules: [
      {
        match: { root: true },
        node: {
          frame: { kind: 'rect', color: 'var(--ui-text-primary)', width: 2 },
          fill: 'var(--ui-surface)',
          paddingX: 18,
          paddingY: 10,
          minWidth: 132
        },
        branch: {
          color: 'var(--ui-text-primary)',
          line: 'elbow',
          width: 2
        }
      },
      {
        match: { depth: { min: 1 } },
        node: {
          frame: { kind: 'rect', color: 'var(--ui-text-primary)', width: 1 },
          fill: 'var(--ui-surface)',
          paddingX: 12,
          paddingY: 8,
          minWidth: 104
        },
        branch: {
          color: 'var(--ui-text-primary)',
          line: 'elbow',
          width: 1.5
        }
      }
    ]
  },
  {
    key: 'mindmap.box-paper',
    label: 'Box Paper',
    description: 'Paper-like boxes with light rails',
    seed: 'blank',
    layout: DEFAULT_LAYOUT,
    rules: [
      {
        match: { root: true },
        node: {
          frame: { kind: 'rect', color: 'var(--ui-text-primary)', width: 0 },
          fill: 'var(--ui-yellow-surface)',
          paddingX: 18,
          paddingY: 10,
          minWidth: 132
        },
        branch: {
          color: 'var(--ui-text-primary)',
          line: 'rail',
          width: 2
        }
      },
      {
        match: { depth: { min: 1 } },
        node: {
          frame: { kind: 'rect', color: 'var(--ui-text-primary)', width: 1 },
          fill: 'var(--ui-surface)',
          paddingX: 12,
          paddingY: 8,
          minWidth: 104
        },
        branch: {
          color: 'var(--ui-text-secondary)',
          line: 'rail',
          width: 1.5
        }
      }
    ]
  },
  {
    key: 'mindmap.minimal-rail',
    label: 'Minimal Rail',
    description: 'Underline nodes with clean rails',
    seed: 'blank',
    layout: DEFAULT_LAYOUT,
    rules: [
      {
        match: { root: true },
        node: {
          frame: { kind: 'underline', color: 'var(--ui-text-primary)', width: 2 },
          fill: 'transparent',
          paddingX: 6,
          paddingY: 6,
          minWidth: 112
        },
        branch: {
          color: 'var(--ui-text-primary)',
          line: 'rail',
          width: 2
        }
      },
      {
        match: { depth: { min: 1 } },
        node: {
          frame: { kind: 'underline', color: 'var(--ui-text-secondary)', width: 1.5 },
          fill: 'transparent',
          paddingX: 6,
          paddingY: 4,
          minWidth: 84
        },
        branch: {
          color: 'var(--ui-text-secondary)',
          line: 'rail',
          width: 1.25
        }
      }
    ]
  }
] as const

const MINDMAP_SEED_INDEX = new Map(
  DEFAULT_SEEDS.map((seed) => [seed.key, seed] as const)
)

const MINDMAP_PRESET_INDEX = new Map(
  DEFAULT_PRESETS.map((preset) => [preset.key, preset] as const)
)

const getDefaultNodeId = () => createId('mnode')

const getDepth = (
  tree: MindmapTree,
  nodeId: MindmapNodeId
): number => {
  let depth = 0
  let current = tree.nodes[nodeId]?.parentId
  while (current) {
    depth += 1
    current = tree.nodes[current]?.parentId
  }
  return depth
}

const getBranchSide = (
  tree: MindmapTree,
  nodeId: MindmapNodeId
): 'left' | 'right' | undefined => {
  if (nodeId === tree.rootNodeId) {
    return undefined
  }

  let current: MindmapNodeId | undefined = nodeId
  while (current) {
    const node: MindmapTree['nodes'][MindmapNodeId] | undefined = tree.nodes[current]
    const parentId: MindmapNodeId | undefined = node?.parentId
    if (!parentId) {
      return undefined
    }
    if (parentId === tree.rootNodeId) {
      return node?.side
    }
    current = parentId
  }

  return undefined
}

const createBaseStyle = (): MindmapTreeNodeStyle => ({
  node: cloneNodeStyle(DEFAULT_NODE_STYLE),
  branch: cloneBranchStyle(DEFAULT_BRANCH_STYLE)
})

const resolvePresetStyle = ({
  preset,
  tree,
  nodeId,
  leaf
}: {
  preset: MindmapPreset
  tree: MindmapTree
  nodeId: MindmapNodeId
  leaf: boolean
}): MindmapTreeNodeStyle => {
  const depth = getDepth(tree, nodeId)
  const side = getBranchSide(tree, nodeId)
  const root = nodeId === tree.rootNodeId

  return preset.rules.reduce<MindmapTreeNodeStyle>((style, rule) => {
    if (!matchesRule(rule, {
      depth,
      side,
      leaf,
      root
    })) {
      return style
    }

    return mergeTreeNodeStyle(style, {
      node: rule.node,
      branch: rule.branch
    })
  }, createBaseStyle())
}

const normalizeSeedKey = (
  preset: MindmapPreset,
  seed?: MindmapSeedKey
) => seed ?? preset.seed

const createRootTree = ({
  rootId,
  rootBranch
}: {
  rootId: MindmapNodeId
  rootBranch: MindmapBranchStyle
}): MindmapTree => {
  const now = new Date().toISOString()
  return {
    rootNodeId: rootId,
    nodes: {
      [rootId]: {
        branch: cloneBranchStyle(rootBranch)
      }
    },
    children: {
      [rootId]: []
    },
    layout: {
      ...DEFAULT_LAYOUT
    },
    meta: {
      createdAt: now,
      updatedAt: now
    }
  }
}

export const listMindmapSeeds = () => DEFAULT_SEEDS

export const readMindmapSeed = (
  key: MindmapSeedKey
): MindmapSeed | undefined => MINDMAP_SEED_INDEX.get(key)

export const listMindmapPresets = () => DEFAULT_PRESETS

export const readMindmapPreset = (
  key: MindmapPresetKey
): MindmapPreset | undefined => MINDMAP_PRESET_INDEX.get(key)

export const readDefaultMindmapPreset = () => DEFAULT_PRESETS[0]

export const getMindmapTopicLabel = (
  topic: MindmapTopicData | undefined
) => {
  if (!topic || typeof topic !== 'object' || !('kind' in topic)) {
    return 'Topic'
  }

  switch (topic.kind) {
    case 'text':
      return topic.text?.trim() ? topic.text : 'Topic'
    case 'file':
      return topic.name?.trim() ? topic.name : 'File'
    case 'link':
      return topic.title?.trim() ? topic.title : topic.url ?? 'Link'
    case 'ref':
      return topic.title?.trim() ? topic.title : 'Ref'
    default:
      return 'Topic'
  }
}

export const resolveMindmapTreeNodeStyle = (input: {
  preset: MindmapPresetKey
  tree: MindmapTree
  nodeId: MindmapNodeId
}): MindmapTreeNodeStyle => {
  const preset = readMindmapPreset(input.preset)

  if (!preset) {
    return createBaseStyle()
  }

  return resolvePresetStyle({
    preset,
    tree: input.tree,
    nodeId: input.nodeId,
    leaf: (input.tree.children[input.nodeId] ?? []).length === 0
  })
}

const createTextNodeFromTopic = (
  topic: MindmapTopicData,
  style: MindmapNodeStyle
) => ({
  type: 'text' as const,
  data: {
    text: getMindmapTopicLabel(topic)
  },
  style: buildMindmapTextNodeStyle(style)
})

const createTreeWithSeed = (input: {
  preset?: MindmapPresetKey
  seed?: MindmapSeedKey
  rootId?: MindmapNodeId
  idGenerator?: MindmapIdGenerator
} = {}): {
  preset: MindmapPreset
  seed: MindmapSeed
  tree: MindmapTree
} => {
  const preset = input.preset
    ? readMindmapPreset(input.preset)
    : readDefaultMindmapPreset()
  if (!preset) {
    throw new Error('Default mindmap preset is missing.')
  }

  const seedKey = normalizeSeedKey(preset, input.seed)
  const seed = readMindmapSeed(seedKey)
  if (!seed) {
    throw new Error(`Mindmap seed "${seedKey}" not found.`)
  }

  const createNodeId = input.idGenerator?.nodeId ?? getDefaultNodeId
  const rootId = input.rootId ?? createNodeId()
  const rootSeedTree: MindmapTree = {
    rootNodeId: rootId,
    nodes: {
      [rootId]: {
        branch: cloneBranchStyle(DEFAULT_BRANCH_STYLE)
      }
    },
    children: {
      [rootId]: []
    },
    layout: {
      ...preset.layout
    }
  }
  const rootStyle = resolveMindmapTreeNodeStyle({
    preset: preset.key,
    tree: rootSeedTree,
    nodeId: rootId
  })
  let tree = createRootTree({
    rootId,
    rootBranch: rootStyle.branch
  })

  for (const child of seed.children ?? []) {
    const nodeId = createNodeId()
    const candidate: MindmapTree = {
      ...tree,
      nodes: {
        ...tree.nodes,
        [nodeId]: {
          parentId: rootId,
          side: child.side ?? 'right',
          branch: cloneBranchStyle(DEFAULT_BRANCH_STYLE)
        }
      },
      children: {
        ...tree.children,
        [rootId]: [
          ...(tree.children[rootId] ?? []),
          nodeId
        ],
        [nodeId]: []
      }
    }
    const style = resolveMindmapTreeNodeStyle({
      preset: preset.key,
      tree: candidate,
      nodeId
    })
    tree = {
      ...candidate,
      nodes: {
        ...candidate.nodes,
        [nodeId]: {
          parentId: rootId,
          side: child.side ?? 'right',
          branch: style.branch
        }
      }
    }
  }

  return {
    preset,
    seed,
    tree: {
      ...tree,
      layout: {
        ...preset.layout
      }
    }
  }
}

export const createMindmapTree = (input: {
  preset?: MindmapPresetKey
  seed?: MindmapSeedKey
  rootId?: MindmapNodeId
  idGenerator?: MindmapIdGenerator
} = {}): MindmapTree => createTreeWithSeed(input).tree

export const createMindmapPreviewModel = (input: {
  preset?: MindmapPresetKey
  seed?: MindmapSeedKey
  rootId?: MindmapNodeId
  idGenerator?: MindmapIdGenerator
} = {}): MindmapPreviewModel => {
  const created = createTreeWithSeed(input)
  const labels: Record<MindmapNodeId, string> = {
    [created.tree.rootNodeId]: getMindmapTopicLabel(created.seed.root)
  }
  const nodeStyles: Record<MindmapNodeId, MindmapNodeStyle> = {
    [created.tree.rootNodeId]: resolveMindmapTreeNodeStyle({
      preset: created.preset.key,
      tree: created.tree,
      nodeId: created.tree.rootNodeId
    }).node
  }

  const rootChildren = created.tree.children[created.tree.rootNodeId] ?? []
  rootChildren.forEach((childId, index) => {
    const child = created.seed.children?.[index]
    if (!child) {
      return
    }
    labels[childId] = getMindmapTopicLabel(child.data)
    nodeStyles[childId] = resolveMindmapTreeNodeStyle({
      preset: created.preset.key,
      tree: created.tree,
      nodeId: childId
    }).node
  })

  return {
    tree: created.tree,
    labels,
    nodeStyles
  }
}

export const materializeMindmapCreate = (input: {
  preset?: MindmapPresetKey
  seed?: MindmapSeedKey
  rootId?: MindmapNodeId
  idGenerator?: MindmapIdGenerator
} = {}): MindmapMaterializedCreate => {
  const created = createTreeWithSeed(input)
  const nodeInputs: MindmapMaterializedCreate['nodeInputs'] = {
    [created.tree.rootNodeId]: createTextNodeFromTopic(
      created.seed.root,
      resolveMindmapTreeNodeStyle({
        preset: created.preset.key,
        tree: created.tree,
        nodeId: created.tree.rootNodeId
      }).node
    )
  }

  const rootChildren = created.tree.children[created.tree.rootNodeId] ?? []
  rootChildren.forEach((childId, index) => {
    const child = created.seed.children?.[index]
    if (!child) {
      return
    }
    nodeInputs[childId] = createTextNodeFromTopic(
      child.data,
      resolveMindmapTreeNodeStyle({
        preset: created.preset.key,
        tree: created.tree,
        nodeId: childId
      }).node
    )
  })

  return {
    tree: created.tree,
    nodeInputs
  }
}
