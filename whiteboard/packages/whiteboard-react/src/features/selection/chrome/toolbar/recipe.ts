import type {
  SelectionToolbarContext,
  SelectionToolbarScope
} from '@whiteboard/editor'
import type { SelectionCan } from '@whiteboard/react/features/selection/capability'
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
    case 'edge-line':
      return Boolean(activeScope.edge)
    case 'edge-markers':
      return Boolean(activeScope.edge)
    case 'edge-text':
      return Boolean(activeScope.edge?.single)
    case 'lock':
      return context.target.nodeIds.length > 0
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
  const styleKeys = activeScope.node
    ? ([
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
    : ([
        'edge-line',
        'edge-markers',
        'edge-text'
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
  appendSection(recipe, structureKeys)
  appendSection(recipe, styleKeys)
  appendSection(recipe, utilityKeys)

  return recipe
}
