import { createId } from '@shared/core'
import type {
  MindmapBranchStyle,
  MindmapIdGenerator,
  MindmapLayoutSpec,
  MindmapNodeId,
  MindmapTree
} from '@whiteboard/core/mindmap/types'
import type {
  MindmapTemplate,
  MindmapTemplateNode,
  NodeTemplate
} from '@whiteboard/core/types/template'

const DEFAULT_LAYOUT: MindmapLayoutSpec = {
  side: 'both',
  mode: 'tidy',
  hGap: 28,
  vGap: 18
}

export const DEFAULT_MINDMAP_BRANCH_STYLE: MindmapBranchStyle = {
  color: 'var(--ui-text-primary)',
  line: 'curve',
  width: 2,
  stroke: 'solid'
}

const cloneBranchStyle = (
  branch: MindmapBranchStyle
): MindmapBranchStyle => ({
  ...branch
})

const cloneNodeTemplate = (
  template: NodeTemplate
): NodeTemplate => ({
  ...template,
  size: template.size
    ? {
        ...template.size
      }
    : undefined,
  data: template.data
    ? {
        ...template.data
      }
    : undefined,
  style: template.style
    ? {
        ...template.style
      }
    : undefined
})

const cloneMindmapTemplateNode = (
  node: MindmapTemplateNode
): MindmapTemplateNode => ({
  node: cloneNodeTemplate(node.node),
  side: node.side,
  branch: node.branch
    ? cloneBranchStyle(node.branch)
    : undefined,
  children: node.children?.map(cloneMindmapTemplateNode)
})

export const cloneMindmapTemplate = (
  template: MindmapTemplate
): MindmapTemplate => ({
  layout: {
    ...template.layout
  },
  root: cloneMindmapTemplateNode(template.root)
})

const getDefaultNodeId = () => createId('mnode')

const resolveNodeIdFactory = (
  idGenerator?: MindmapIdGenerator
) => idGenerator?.nodeId ?? getDefaultNodeId

export const createMindmapTree = (input: {
  rootId?: MindmapNodeId
  layout?: Partial<MindmapLayoutSpec>
} = {}): MindmapTree => {
  const rootNodeId = input.rootId ?? getDefaultNodeId()

  return {
    rootNodeId,
    nodes: {
      [rootNodeId]: {
        branch: cloneBranchStyle(DEFAULT_MINDMAP_BRANCH_STYLE)
      }
    },
    children: {
      [rootNodeId]: []
    },
    layout: {
      ...DEFAULT_LAYOUT,
      ...input.layout
    }
  }
}

export type InstantiatedMindmapTemplate = {
  tree: MindmapTree
  nodes: Record<MindmapNodeId, NodeTemplate>
}

export const instantiateMindmapTemplate = (input: {
  template: MindmapTemplate
  rootId?: MindmapNodeId
  createNodeId: () => MindmapNodeId
}): InstantiatedMindmapTemplate => {
  const tree = createMindmapTree({
    rootId: input.rootId,
    layout: input.template.layout
  })
  const nodes: Record<MindmapNodeId, NodeTemplate> = {}

  const visit = (
    current: MindmapTemplateNode,
    currentId: MindmapNodeId,
    parentId?: MindmapNodeId,
    inheritedBranch?: MindmapBranchStyle
  ) => {
    const branch = cloneBranchStyle(
      current.branch
        ?? inheritedBranch
        ?? DEFAULT_MINDMAP_BRANCH_STYLE
    )

    tree.nodes[currentId] = {
      parentId,
      side: parentId === tree.rootNodeId
        ? current.side
        : undefined,
      branch
    }
    tree.children[currentId] = []
    nodes[currentId] = cloneNodeTemplate(current.node)

    current.children?.forEach((child) => {
      const childId = input.createNodeId()
      tree.children[currentId]!.push(childId)
      visit(child, childId, currentId, branch)
    })
  }

  visit(
    input.template.root,
    input.rootId ?? tree.rootNodeId,
    undefined,
    input.template.root.branch
  )

  return {
    tree,
    nodes
  }
}

export const createBlankMindmapTemplate = (): MindmapTemplate => ({
  layout: {
    ...DEFAULT_LAYOUT
  },
  root: {
    node: {
      type: 'text',
      data: {
        text: 'Central topic'
      }
    }
  }
})

export const instantiateBlankMindmap = (
  input: {
    rootId?: MindmapNodeId
    idGenerator?: MindmapIdGenerator
  } = {}
): InstantiatedMindmapTemplate => instantiateMindmapTemplate({
  template: createBlankMindmapTemplate(),
  rootId: input.rootId,
  createNodeId: resolveNodeIdFactory(input.idGenerator)
})
