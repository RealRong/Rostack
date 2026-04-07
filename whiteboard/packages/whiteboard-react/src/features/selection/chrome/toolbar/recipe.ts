import type { ToolbarSummaryContext } from './context'
import type {
  ToolbarItemKey,
  ToolbarRecipeItem
} from './types'

const DIVIDER = { kind: 'divider' } as const

const shapeRecipe = [
  { kind: 'item', key: 'shape-kind' },
  DIVIDER,
  { kind: 'item', key: 'font-size' },
  DIVIDER,
  { kind: 'item', key: 'bold' },
  { kind: 'item', key: 'italic' },
  { kind: 'item', key: 'text-align' },
  { kind: 'item', key: 'text-color' },
  DIVIDER,
  { kind: 'item', key: 'stroke' },
  { kind: 'item', key: 'fill' },
  DIVIDER,
  { kind: 'item', key: 'lock' },
  { kind: 'item', key: 'more' }
] satisfies readonly ToolbarRecipeItem[]

const textRecipe = [
  { kind: 'item', key: 'font-size' },
  DIVIDER,
  { kind: 'item', key: 'bold' },
  { kind: 'item', key: 'italic' },
  { kind: 'item', key: 'text-align' },
  { kind: 'item', key: 'text-color' },
  DIVIDER,
  { kind: 'item', key: 'lock' },
  { kind: 'item', key: 'more' }
] satisfies readonly ToolbarRecipeItem[]

const stickyRecipe = [
  { kind: 'item', key: 'text-color' },
  { kind: 'item', key: 'fill' },
  DIVIDER,
  { kind: 'item', key: 'lock' },
  { kind: 'item', key: 'more' }
] satisfies readonly ToolbarRecipeItem[]

const frameRecipe = [
  { kind: 'item', key: 'text-color' },
  DIVIDER,
  { kind: 'item', key: 'stroke' },
  { kind: 'item', key: 'fill' },
  DIVIDER,
  { kind: 'item', key: 'lock' },
  { kind: 'item', key: 'more' }
] satisfies readonly ToolbarRecipeItem[]

const drawRecipe = [
  { kind: 'item', key: 'stroke' },
  DIVIDER,
  { kind: 'item', key: 'lock' },
  { kind: 'item', key: 'more' }
] satisfies readonly ToolbarRecipeItem[]

const groupRecipe = [
  { kind: 'item', key: 'lock' },
  { kind: 'item', key: 'more' }
] satisfies readonly ToolbarRecipeItem[]

const mixedRecipe = [
  { kind: 'item', key: 'lock' },
  { kind: 'item', key: 'more' }
] satisfies readonly ToolbarRecipeItem[]

const isItemVisible = (
  context: ToolbarSummaryContext,
  key: ToolbarItemKey
) => {
  switch (key) {
    case 'shape-kind':
      return context.canChangeShapeKind
    case 'font-size':
      return context.canEditFontSize
    case 'bold':
      return context.canEditFontWeight
    case 'italic':
      return context.canEditFontStyle
    case 'text-align':
      return context.canEditTextAlign
    case 'text-color':
      return context.canEditTextColor
    case 'stroke':
      return context.canEditStroke
    case 'fill':
      return context.canEditFill
    case 'lock':
      return context.nodeIds.length > 0
    case 'more':
      return context.menuSections.length > 0
    case 'align':
      return false
    case 'distribute':
      return false
    case 'order':
      return false
    case 'group':
      return false
  }
}

const normalizeRecipe = (
  recipe: readonly ToolbarRecipeItem[],
  context: ToolbarSummaryContext
) => {
  const normalized: ToolbarRecipeItem[] = []

  recipe.forEach((entry) => {
    if (entry.kind === 'item') {
      if (isItemVisible(context, entry.key)) {
        normalized.push(entry)
      }
      return
    }

    if (!normalized.length || normalized[normalized.length - 1]?.kind === 'divider') {
      return
    }

    normalized.push(entry)
  })

  while (normalized[normalized.length - 1]?.kind === 'divider') {
    normalized.pop()
  }

  return normalized
}

const resolveTemplate = (
  context: ToolbarSummaryContext
) => {
  switch (context.selectionKind) {
    case 'shape':
      return shapeRecipe
    case 'text':
      return textRecipe
    case 'sticky':
      return stickyRecipe
    case 'frame':
      return frameRecipe
    case 'draw':
      return drawRecipe
    case 'group':
      return groupRecipe
    case 'mixed':
      return mixedRecipe
    case 'none':
      return []
  }
}

export const resolveToolbarRecipe = (
  context: ToolbarSummaryContext
): readonly ToolbarRecipeItem[] => (
  context.visible
    ? normalizeRecipe(resolveTemplate(context), context)
    : []
)
