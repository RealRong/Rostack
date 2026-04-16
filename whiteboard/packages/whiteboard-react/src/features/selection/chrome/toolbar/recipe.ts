import type {
  SelectionToolbarContext,
  SelectionToolbarScope
} from '@whiteboard/editor'
import type { SelectionCan } from '@whiteboard/react/features/selection/capability'
import { EDGE_TOOLBAR_RECIPE } from '@whiteboard/react/features/edge/ui/toolbar'
import type {
  ToolbarItemKey,
  ToolbarRecipeItem
} from '@whiteboard/react/features/selection/chrome/toolbar/types'

const appendSection = (
  recipe: ToolbarRecipeItem[],
  keys: readonly ToolbarItemKey[]
) => {
  if (!keys.length) {
    return
  }

  if (recipe.length) {
    recipe.push({ kind: 'divider' })
  }

  keys.forEach((key) => {
    recipe.push({
      kind: 'item',
      key
    })
  })
}

const appendRecipeSection = (
  recipe: ToolbarRecipeItem[],
  items: readonly ToolbarRecipeItem[]
) => {
  const normalized: ToolbarRecipeItem[] = []

  items.forEach((entry) => {
    if (
      entry.kind === 'divider'
      && (!normalized.length || normalized[normalized.length - 1]?.kind === 'divider')
    ) {
      return
    }

    normalized.push(entry)
  })

  while (normalized[normalized.length - 1]?.kind === 'divider') {
    normalized.pop()
  }

  if (!normalized.length) {
    return
  }

  if (recipe.length) {
    recipe.push({ kind: 'divider' })
  }

  recipe.push(...normalized)
}

const isItemVisible = ({
  context,
  activeScope,
  selectionCan,
  scopeCan,
  key
}: {
  context: SelectionToolbarContext
  activeScope: SelectionToolbarScope
  selectionCan: SelectionCan
  scopeCan: SelectionCan
  key: ToolbarItemKey
}) => {
  switch (key) {
    case 'scope':
      return context.scopes.length > 1
    case 'align':
      return Boolean(activeScope.node) && scopeCan.align
    case 'group':
      return selectionCan.makeGroup || selectionCan.ungroup
    case 'shape-kind':
      return activeScope.node?.canChangeShapeKind ?? false
    case 'font-size':
      return activeScope.node?.canEditFontSize ?? false
    case 'bold':
      return activeScope.node?.canEditFontWeight ?? false
    case 'italic':
      return activeScope.node?.canEditFontStyle ?? false
    case 'text-align':
      return activeScope.node?.canEditTextAlign ?? false
    case 'text-color':
      return activeScope.node?.canEditTextColor ?? false
    case 'stroke':
      return activeScope.node?.canEditStroke ?? false
    case 'fill':
      return activeScope.node?.canEditFill ?? false
    case 'edge-stroke':
      return Boolean(activeScope.edge)
    case 'edge-geometry':
      return Boolean(activeScope.edge)
    case 'edge-marker-start':
      return Boolean(activeScope.edge)
    case 'edge-marker-swap':
      return Boolean(activeScope.edge?.single)
    case 'edge-marker-end':
      return Boolean(activeScope.edge)
    case 'edge-add-label':
      return Boolean(activeScope.edge?.single)
    case 'edge-text-mode':
      return Boolean(activeScope.edge)
    case 'lock':
      return Boolean(activeScope.node || activeScope.edge)
    case 'more':
      return context.target.nodeIds.length + context.target.edgeIds.length > 0
  }
}

export const resolveToolbarRecipe = ({
  context,
  activeScope,
  selectionCan,
  scopeCan
}: {
  context: SelectionToolbarContext
  activeScope: SelectionToolbarScope
  selectionCan: SelectionCan
  scopeCan: SelectionCan
}): readonly ToolbarRecipeItem[] => {
  const recipe: ToolbarRecipeItem[] = []
  const selectionKeys = ([
    'scope'
  ] as const).filter((key) => isItemVisible({
    context,
    activeScope,
    selectionCan,
    scopeCan,
    key
  }))
  const structureKeys = ([
    'align',
    'group'
  ] as const).filter((key) => isItemVisible({
    context,
    activeScope,
    selectionCan,
    scopeCan,
    key
  }))
  const nodeStyleKeys = ([
    'shape-kind',
    'font-size',
    'bold',
    'italic',
    'text-align',
    'text-color',
    'stroke',
    'fill'
  ] as const).filter((key) => isItemVisible({
    context,
    activeScope,
    selectionCan,
    scopeCan,
    key
  }))
  const utilityKeys = ([
    'lock',
    'more'
  ] as const).filter((key) => isItemVisible({
    context,
    activeScope,
    selectionCan,
    scopeCan,
    key
  }))

  appendSection(recipe, selectionKeys)
  if (activeScope.node) {
    appendSection(recipe, structureKeys)
    appendSection(recipe, nodeStyleKeys)
    appendSection(recipe, utilityKeys)
    return recipe
  }

  const edgeRecipe = EDGE_TOOLBAR_RECIPE.filter((entry) => {
    if (entry.kind === 'divider') {
      return true
    }

    return isItemVisible({
      context,
      activeScope,
      selectionCan,
      scopeCan,
      key: entry.key
    })
  })

  appendRecipeSection(recipe, edgeRecipe)

  return recipe
}
