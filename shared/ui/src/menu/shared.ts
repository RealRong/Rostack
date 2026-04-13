import type { ReactNode } from 'react'
import type {
  ActiveSource,
  MenuItem,
  MenuPopoverContent,
  Path,
  SelectionAppearance,
  SelectionMode,
  SubmenuItem
} from './types'

export const SUBMENU_OFFSET = {
  mainAxis: -8
} as const

export const DROPDOWN_SUBMENU_OFFSET = {
  mainAxis: 4
} as const

export const ITEM_PATH_ATTR = 'data-menu-item-path'

export const isInteractive = (
  item: MenuItem
): item is Exclude<MenuItem, { kind: 'divider' | 'label' | 'custom' }> => (
  item.kind === 'item'
  || item.kind === 'action'
  || item.kind === 'toggle'
  || item.kind === 'submenu'
)

export const renderContent = (content: MenuPopoverContent | undefined): ReactNode => (
  typeof content === 'function' ? content() : content
)

export const resolveSurface = (item: SubmenuItem): 'list' | 'panel' => (
  item.surface ?? (item.items?.length ? 'list' : 'panel')
)

export const resolvePresentation = (item: {
  presentation?: 'cascade' | 'dropdown'
}) => item.presentation ?? 'cascade'

export const normalizeValue = (
  value: string | readonly string[] | null | undefined
) => (
  Array.isArray(value)
    ? value.filter(item => typeof item === 'string' && item.length > 0)
    : typeof value === 'string' && value.length > 0
      ? [value]
      : []
)

export const toValueResult = (
  selectionMode: SelectionMode,
  selectedKeys: readonly string[]
) => selectionMode === 'single'
  ? (selectedKeys[0] ?? '')
  : [...selectedKeys]

export const resolveRowAppearance = (input: {
  active: boolean
  activeSource: ActiveSource
  selected?: boolean
  open?: boolean
  selectionAppearance: SelectionAppearance
  destructive?: boolean
}) => {
  if (input.active) {
    return input.destructive
      ? 'bg-destructive/10 text-destructive'
      : 'bg-hover text-fg'
  }

  if (input.open) {
    return input.destructive
      ? 'bg-destructive/[0.07] text-destructive'
      : 'bg-overlay-subtle text-fg'
  }

  if (input.selected && input.selectionAppearance === 'row') {
    return input.destructive
      ? 'bg-destructive/10 text-destructive'
      : 'bg-pressed text-fg'
  }

  if (input.selected && input.selectionAppearance !== 'none') {
    return input.destructive
      ? 'text-destructive'
      : 'text-fg'
  }

  return input.destructive
    ? 'text-destructive hover:bg-destructive/10'
    : 'hover:bg-hover'
}

export const appendPath = (parentPath: Path, key: string): Path => [
  ...parentPath,
  key
]

export const parentPath = (path: Path): Path => path.slice(0, -1)

export const isSamePath = (left: Path, right: Path) => (
  left.length === right.length
  && left.every((segment, index) => segment === right[index])
)

export const isPathPrefix = (prefix: Path, path: Path) => (
  prefix.length <= path.length
  && prefix.every((segment, index) => segment === path[index])
)

export const isDirectChildPath = (path: Path, parent: Path) => (
  path.length === parent.length + 1 && isPathPrefix(parent, path)
)

export const serializePath = (path: Path) => JSON.stringify(path)

export const parsePath = (value: string | null): Path | null => {
  if (!value) {
    return null
  }

  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) && parsed.every(segment => typeof segment === 'string')
      ? parsed
      : null
  } catch {
    return null
  }
}

export const findInteractiveItem = (
  items: readonly MenuItem[],
  key: string
) => items.find(item => isInteractive(item) && item.key === key)

export const findAtPath = (
  items: readonly MenuItem[],
  path: Path
): MenuItem | null => {
  if (!path.length) {
    return null
  }

  let currentItems = items
  let currentItem: MenuItem | null = null

  for (let index = 0; index < path.length; index += 1) {
    const key = path[index]
    currentItem = findInteractiveItem(currentItems, key) ?? null
    if (!currentItem) {
      return null
    }

    if (index === path.length - 1) {
      return currentItem
    }

    if (currentItem.kind !== 'submenu' || !currentItem.items?.length) {
      return null
    }

    currentItems = currentItem.items
  }

  return null
}

export const firstEnabledPath = (
  items: readonly MenuItem[],
  parent: Path
): Path | null => {
  const firstItem = items.find(item => isInteractive(item) && !item.disabled)
  return firstItem
    ? appendPath(parent, firstItem.key)
    : null
}

export const normalizeExpandedPath = (
  items: readonly MenuItem[],
  expandedPath: Path
): Path => {
  if (!expandedPath.length) {
    return []
  }

  let currentItems = items
  const nextPath: string[] = []

  for (const key of expandedPath) {
    const item = currentItems.find(
      (currentItem): currentItem is SubmenuItem => (
        currentItem.kind === 'submenu' && currentItem.key === key && !currentItem.disabled
      )
    )
    if (!item) {
      break
    }

    nextPath.push(key)
    if (!item.items?.length) {
      break
    }

    currentItems = item.items
  }

  return nextPath
}

export const isVisiblePath = (
  items: readonly MenuItem[],
  path: Path,
  expandedPath: Path
): boolean => {
  if (!path.length) {
    return false
  }

  let currentItems = items

  for (let index = 0; index < path.length; index += 1) {
    const key = path[index]
    const item = findInteractiveItem(currentItems, key)
    if (!item) {
      return false
    }

    if (index === path.length - 1) {
      return true
    }

    const currentPath = path.slice(0, index + 1)
    if (item.kind !== 'submenu' || !isPathPrefix(currentPath, expandedPath) || !item.items?.length) {
      return false
    }

    currentItems = item.items
  }

  return false
}

export const toggleSelection = (
  selectionMode: SelectionMode,
  selectedKeys: readonly string[],
  itemKey: string
) => {
  if (selectionMode === 'none') {
    return selectedKeys
  }

  if (selectionMode === 'single') {
    return [itemKey]
  }

  return selectedKeys.includes(itemKey)
    ? selectedKeys.filter(key => key !== itemKey)
    : [...selectedKeys, itemKey]
}
