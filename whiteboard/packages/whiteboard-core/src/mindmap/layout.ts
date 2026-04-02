import type { GetNodeSize, MindmapLayout, MindmapLayoutOptions, MindmapNodeId, MindmapTree } from './types'

type LayoutNode = { x: number; y: number; width: number; height: number }
type Size = { width: number; height: number }

const getChildren = (tree: MindmapTree, nodeId: MindmapNodeId) => tree.children[nodeId] ?? []

export const layoutMindmap = (
  tree: MindmapTree,
  getNodeSize: GetNodeSize,
  options: MindmapLayoutOptions = {}
): MindmapLayout => {
  const hGap = options.hGap ?? 100
  const vGap = options.vGap ?? 12
  const sideOption = options.side ?? 'both'

  const layout: Record<MindmapNodeId, LayoutNode> = {}
  const sizeCache = new Map<MindmapNodeId, Size>()
  const measureCache = new Map<string, Size>()

  const getSize = (nodeId: MindmapNodeId) => {
    const cached = sizeCache.get(nodeId)
    if (cached) return cached
    const size = getNodeSize(nodeId)
    sizeCache.set(nodeId, size)
    return size
  }

  const measure = (nodeId: MindmapNodeId, side: 'left' | 'right'): Size => {
    const key = `${nodeId}:${side}`
    const cached = measureCache.get(key)
    if (cached) return cached
    const node = tree.nodes[nodeId]
    const { width, height } = getSize(nodeId)
    if (!node || node.collapsed) {
      const size = { width, height }
      measureCache.set(key, size)
      return size
    }
    const children = getChildren(tree, nodeId)
    if (children.length === 0) {
      const size = { width, height }
      measureCache.set(key, size)
      return size
    }
    const childSizes = children.map((childId) => measure(childId, side))
    const totalHeight = childSizes.reduce((sum, child) => sum + child.height, 0) + vGap * (childSizes.length - 1)
    const maxChildWidth = childSizes.reduce((max, child) => Math.max(max, child.width), 0)
    const size = {
      width: width + hGap + maxChildWidth,
      height: Math.max(height, totalHeight)
    }
    measureCache.set(key, size)
    return size
  }

  const layoutSubtree = (nodeId: MindmapNodeId, x: number, y: number, side: 'left' | 'right') => {
    const node = tree.nodes[nodeId]
    const { width, height } = getSize(nodeId)
    layout[nodeId] = { x, y, width, height }
    if (!node || node.collapsed) return
    const children = getChildren(tree, nodeId)
    if (children.length === 0) return

    const childSizes = children.map((childId) => measure(childId, side))
    if (children.length === 1) {
      const childId = children[0]
      const childNodeSize = getSize(childId)
      const childSize = childSizes[0]
      const childX = side === 'right' ? x + width + hGap : x - hGap - childSize.width
      const childY = y + (height - childNodeSize.height) / 2
      layoutSubtree(childId, childX, childY, side)
      return
    }
    const totalHeight = childSizes.reduce((sum, child) => sum + child.height, 0) + vGap * (childSizes.length - 1)
    let cursorY = y + (height - totalHeight) / 2

    children.forEach((childId, index) => {
      const childSize = childSizes[index]
      const childX = side === 'right' ? x + width + hGap : x - hGap - childSize.width
      const childY = cursorY
      layoutSubtree(childId, childX, childY, side)
      cursorY += childSize.height + vGap
    })
  }

  const rootId = tree.rootId
  const rootSize = getSize(rootId)
  layout[rootId] = { x: 0, y: 0, width: rootSize.width, height: rootSize.height }

  const sidesToLayout: Array<'left' | 'right'> =
    sideOption === 'both' ? ['left', 'right'] : sideOption === 'left' ? ['left'] : ['right']

  sidesToLayout.forEach((side) => {
    const rootChildren = getChildren(tree, rootId).filter((childId) => {
      const child = tree.nodes[childId]
      const childSide = child?.side ?? 'right'
      return childSide === side
    })

    if (rootChildren.length === 0) return
    const childSizes = rootChildren.map((childId) => measure(childId, side))
    if (rootChildren.length === 1) {
      const childId = rootChildren[0]
      const childNodeSize = getSize(childId)
      const childSize = childSizes[0]
      const childX = side === 'right' ? 0 + rootSize.width + hGap : 0 - hGap - childSize.width
      const childY = 0 + (rootSize.height - childNodeSize.height) / 2
      layoutSubtree(childId, childX, childY, side)
      return
    }
    const totalHeight = childSizes.reduce((sum, child) => sum + child.height, 0) + vGap * (childSizes.length - 1)
    let cursorY = 0 + (rootSize.height - totalHeight) / 2

    rootChildren.forEach((childId, index) => {
      const childSize = childSizes[index]
      const childX = side === 'right' ? 0 + rootSize.width + hGap : 0 - hGap - childSize.width
      const childY = cursorY
      layoutSubtree(childId, childX, childY, side)
      cursorY += childSize.height + vGap
    })
  })

  let minX = Number.POSITIVE_INFINITY
  let minY = Number.POSITIVE_INFINITY
  let maxX = Number.NEGATIVE_INFINITY
  let maxY = Number.NEGATIVE_INFINITY

  Object.values(layout).forEach((node) => {
    minX = Math.min(minX, node.x)
    minY = Math.min(minY, node.y)
    maxX = Math.max(maxX, node.x + node.width)
    maxY = Math.max(maxY, node.y + node.height)
  })

  if (!Object.keys(layout).length) {
    return {
      node: {},
      bbox: { x: 0, y: 0, width: 0, height: 0 }
    }
  }

  return {
    node: layout,
    bbox: {
      x: minX,
      y: minY,
      width: maxX - minX,
      height: maxY - minY
    }
  }
}

type TidyNode = {
  id: MindmapNodeId
  parent?: TidyNode
  children: TidyNode[]
  number: number
  prelim: number
  mod: number
  shift: number
  change: number
  ancestor: TidyNode
  thread?: TidyNode
  height: number
}

const nextLeft = (node: TidyNode) => (node.children.length ? node.children[0] : node.thread)
const nextRight = (node: TidyNode) => (node.children.length ? node.children[node.children.length - 1] : node.thread)
const leftSibling = (node: TidyNode) => (node.parent && node.number > 0 ? node.parent.children[node.number - 1] : undefined)
const leftmostSibling = (node: TidyNode) => (node.parent ? node.parent.children[0] : undefined)

const moveSubtree = (wl: TidyNode, wr: TidyNode, shift: number) => {
  const subtrees = wr.number - wl.number
  if (subtrees <= 0) return
  wr.change -= shift / subtrees
  wr.shift += shift
  wl.change += shift / subtrees
  wr.prelim += shift
  wr.mod += shift
}

const executeShifts = (node: TidyNode) => {
  let shift = 0
  let change = 0
  for (let i = node.children.length - 1; i >= 0; i -= 1) {
    const child = node.children[i]
    child.prelim += shift
    child.mod += shift
    change += child.change
    shift += child.shift + change
  }
}

const ancestor = (vil: TidyNode, v: TidyNode, defaultAncestor: TidyNode) =>
  vil.ancestor.parent === v.parent ? vil.ancestor : defaultAncestor

const apportion = (
  v: TidyNode,
  defaultAncestor: TidyNode,
  separation: (a: TidyNode, b: TidyNode) => number
) => {
  const w = leftSibling(v)
  if (!w) return defaultAncestor

  let vir: TidyNode = v
  let vor: TidyNode = v
  let vil: TidyNode = w
  let vol: TidyNode = leftmostSibling(v) as TidyNode
  let sir = v.mod
  let sor = v.mod
  let sil = vil.mod
  let sol = vol.mod

  while (nextRight(vil) && nextLeft(vir)) {
    vil = nextRight(vil) as TidyNode
    vir = nextLeft(vir) as TidyNode
    vol = nextLeft(vol) as TidyNode
    vor = nextRight(vor) as TidyNode
    vor.ancestor = v
    const shift = vil.prelim + sil - (vir.prelim + sir) + separation(vil, vir)
    if (shift > 0) {
      moveSubtree(ancestor(vil, v, defaultAncestor), v, shift)
      sir += shift
      sor += shift
    }
    sil += vil.mod
    sir += vir.mod
    sol += vol.mod
    sor += vor.mod
  }

  if (nextRight(vil) && !nextRight(vor)) {
    vor.thread = nextRight(vil)
    vor.mod += sil - sor
  } else if (nextLeft(vir) && !nextLeft(vol)) {
    vol.thread = nextLeft(vir)
    vol.mod += sir - sol
  }

  return defaultAncestor
}

const firstWalk = (v: TidyNode, separation: (a: TidyNode, b: TidyNode) => number) => {
  if (v.children.length === 0) {
    const w = leftSibling(v)
    v.prelim = w ? w.prelim + separation(v, w) : 0
    return
  }

  let defaultAncestor = v.children[0]
  v.children.forEach((child) => {
    firstWalk(child, separation)
    defaultAncestor = apportion(child, defaultAncestor, separation)
  })
  executeShifts(v)
  const firstChild = v.children[0]
  const lastChild = v.children[v.children.length - 1]
  const midpoint = (firstChild.prelim + lastChild.prelim) / 2
  const w = leftSibling(v)
  if (w) {
    v.prelim = w.prelim + separation(v, w)
    v.mod = v.prelim - midpoint
  } else {
    v.prelim = midpoint
  }
}

const collectY = (v: TidyNode, modSum: number, positions: Record<MindmapNodeId, number>) => {
  positions[v.id] = v.prelim + modSum
  v.children.forEach((child) => collectY(child, modSum + v.mod, positions))
}

const buildTidyTree = (
  tree: MindmapTree,
  nodeId: MindmapNodeId,
  getNodeSize: GetNodeSize,
  side: 'left' | 'right',
  parent?: TidyNode,
  number = 0
): TidyNode | undefined => {
  const node = tree.nodes[nodeId]
  if (!node) return
  const size = getNodeSize(nodeId)
  const tidyNode: TidyNode = {
    id: nodeId,
    parent,
    children: [],
    number,
    prelim: 0,
    mod: 0,
    shift: 0,
    change: 0,
    ancestor: undefined as unknown as TidyNode,
    height: size.height
  }
  tidyNode.ancestor = tidyNode
  if (node.collapsed) {
    return tidyNode
  }
  const rawChildren = getChildren(tree, nodeId)
  const children =
    nodeId === tree.rootId
      ? rawChildren.filter((childId) => {
          const child = tree.nodes[childId]
          const childSide = child?.side ?? 'right'
          return childSide === side
        })
      : rawChildren
  children.forEach((childId, index) => {
    const childNode = buildTidyTree(tree, childId, getNodeSize, side, tidyNode, index)
    if (childNode) tidyNode.children.push(childNode)
  })
  return tidyNode
}

const buildCenterY = (
  tree: MindmapTree,
  getNodeSize: GetNodeSize,
  side: 'left' | 'right',
  vGap: number
) => {
  const root = buildTidyTree(tree, tree.rootId, getNodeSize, side)
  if (!root) return {}
  const separation = (a: TidyNode, b: TidyNode) => a.height / 2 + b.height / 2 + vGap
  firstWalk(root, separation)
  const positions: Record<MindmapNodeId, number> = {}
  collectY(root, 0, positions)
  const rootY = positions[root.id] ?? 0
  Object.keys(positions).forEach((id) => {
    positions[id] -= rootY
  })

  const shiftSubtree = (nodeId: MindmapNodeId, delta: number) => {
    if (delta === 0) return
    if (positions[nodeId] !== undefined) {
      positions[nodeId] += delta
    }
    const children = getChildren(tree, nodeId).filter((childId) => positions[childId] !== undefined)
    children.forEach((childId) => shiftSubtree(childId, delta))
  }

  const alignChain = (nodeId: MindmapNodeId) => {
    const children = getChildren(tree, nodeId).filter((childId) => positions[childId] !== undefined)
    if (children.length === 1) {
      const childId = children[0]
      const parentY = positions[nodeId]
      const childY = positions[childId]
      if (parentY !== undefined && childY !== undefined) {
        shiftSubtree(childId, parentY - childY)
      }
      alignChain(childId)
      return
    }
    children.forEach((childId) => alignChain(childId))
  }

  alignChain(tree.rootId)
  return positions
}

const applyHorizontal = (
  tree: MindmapTree,
  nodeId: MindmapNodeId,
  getNodeSize: GetNodeSize,
  hGap: number,
  direction: 'left' | 'right',
  centerX: Record<MindmapNodeId, number>,
  parentId?: MindmapNodeId
) => {
  const node = tree.nodes[nodeId]
  if (!node) return
  const size = getNodeSize(nodeId)
  if (!parentId) {
    centerX[nodeId] = 0
  } else {
    const parentSize = getNodeSize(parentId)
    const parentCenter = centerX[parentId] ?? 0
    const offset = parentSize.width / 2 + hGap + size.width / 2
    centerX[nodeId] = direction === 'right' ? parentCenter + offset : parentCenter - offset
  }
  if (node.collapsed) return
  const children = getChildren(tree, nodeId)
  children.forEach((childId) => {
    applyHorizontal(tree, childId, getNodeSize, hGap, direction, centerX, nodeId)
  })
}

export const layoutMindmapTidy = (
  tree: MindmapTree,
  getNodeSize: GetNodeSize,
  options: MindmapLayoutOptions = {}
): MindmapLayout => {
  const hGap = options.hGap ?? 100
  const vGap = options.vGap ?? 12
  const sideOption = options.side ?? 'both'

  const sides: Array<'left' | 'right'> =
    sideOption === 'both' ? ['left', 'right'] : sideOption === 'left' ? ['left'] : ['right']

  const centerY: Record<MindmapNodeId, number> = {}
  sides.forEach((side) => {
    const yPositions = buildCenterY(tree, getNodeSize, side, vGap)
    Object.entries(yPositions).forEach(([id, y]) => {
      if (centerY[id] === undefined) {
        centerY[id] = y
      }
    })
  })
  centerY[tree.rootId] = 0

  const centerX: Record<MindmapNodeId, number> = {}
  centerX[tree.rootId] = 0
  const rootChildren = getChildren(tree, tree.rootId)
  sides.forEach((side) => {
    rootChildren
      .filter((childId) => {
        const child = tree.nodes[childId]
        const childSide = child?.side ?? 'right'
        return childSide === side
      })
      .forEach((childId) => {
        applyHorizontal(tree, childId, getNodeSize, hGap, side, centerX, tree.rootId)
      })
  })

  const layout: Record<MindmapNodeId, LayoutNode> = {}
  Object.keys(centerY).forEach((id) => {
    const nodeId = id as MindmapNodeId
    const y = centerY[nodeId]
    const x = centerX[nodeId]
    if (y === undefined || x === undefined) return
    const size = getNodeSize(nodeId)
    layout[nodeId] = {
      x: x - size.width / 2,
      y: y - size.height / 2,
      width: size.width,
      height: size.height
    }
  })

  if (!Object.keys(layout).length) {
    return {
      node: {},
      bbox: { x: 0, y: 0, width: 0, height: 0 }
    }
  }

  let minX = Number.POSITIVE_INFINITY
  let minY = Number.POSITIVE_INFINITY
  let maxX = Number.NEGATIVE_INFINITY
  let maxY = Number.NEGATIVE_INFINITY
  Object.values(layout).forEach((node) => {
    minX = Math.min(minX, node.x)
    minY = Math.min(minY, node.y)
    maxX = Math.max(maxX, node.x + node.width)
    maxY = Math.max(maxY, node.y + node.height)
  })

  return {
    node: layout,
    bbox: {
      x: minX,
      y: minY,
      width: maxX - minX,
      height: maxY - minY
    }
  }
}
