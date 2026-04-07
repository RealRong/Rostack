import { Check, ChevronRight } from 'lucide-react'
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode
} from 'react'
import type { Placement } from '@floating-ui/react'
import { Button } from './button'
import { closestTarget } from './dom'
import {
  Popover,
  type PopoverOffset,
  type PopoverSurfaceSize
} from './popover'
import { Switch } from './switch'
import { cn } from './utils'

const MENU_SUBMENU_OFFSET: PopoverOffset = {
  mainAxis: -8
}

const MENU_ITEM_PATH_ATTR = 'data-menu-item-path'

type MenuPath = readonly string[]
type MenuActiveSource = 'pointer' | 'keyboard' | null

export interface MenuActionItem {
  kind: 'action'
  key: string
  label: ReactNode
  leading?: ReactNode
  suffix?: ReactNode
  trailing?: ReactNode
  disabled?: boolean
  tone?: 'default' | 'destructive'
  closeOnSelect?: boolean
  onSelect: () => void
}

export interface MenuToggleItem {
  kind: 'toggle'
  key: string
  label: ReactNode
  leading?: ReactNode
  suffix?: ReactNode
  checked: boolean
  indicator?: 'check' | 'switch'
  disabled?: boolean
  closeOnSelect?: boolean
  onSelect: () => void
}

export interface MenuSubmenuItem {
  kind: 'submenu'
  key: string
  label: ReactNode
  leading?: ReactNode
  suffix?: ReactNode
  trailing?: ReactNode
  disabled?: boolean
  items?: readonly MenuItem[]
  content?: ReactNode | (() => ReactNode)
  size?: PopoverSurfaceSize
  surface?: 'list' | 'panel'
  contentClassName?: string
  placement?: Placement
  offset?: PopoverOffset
}

export interface MenuDividerItem {
  kind: 'divider'
  key: string
}

export interface MenuLabelItem {
  kind: 'label'
  key: string
  label: ReactNode
}

export interface MenuCustomItem {
  kind: 'custom'
  key: string
  render: () => ReactNode
}

export type MenuItem =
  | MenuActionItem
  | MenuToggleItem
  | MenuSubmenuItem
  | MenuDividerItem
  | MenuLabelItem
  | MenuCustomItem

export type MenuSubmenuOpenPolicy = 'hover' | 'click'
export type MenuSurfaceSize = PopoverSurfaceSize

export interface MenuProps {
  items: readonly MenuItem[]
  onClose?: () => void
  autoFocus?: boolean
  className?: string
  submenuOpenPolicy?: MenuSubmenuOpenPolicy
  open?: boolean
  openSubmenuKey?: string | null
  onOpenSubmenuChange?: (key: string | null) => void
}

interface MenuLevelProps {
  items: readonly MenuItem[]
  parentPath: MenuPath
  open: boolean
  autoFocus: boolean
  onClose?: () => void
  onRequestClose?: () => void
  submenuOpenPolicy: MenuSubmenuOpenPolicy
  controller: MenuController
}

interface MenuController {
  activePath: MenuPath
  activeSource: MenuActiveSource
  expandedPath: MenuPath
  registerItemRef: (path: MenuPath, element: HTMLButtonElement | null) => void
  setActivePointerPath: (path: MenuPath) => void
  setActiveKeyboardPath: (path: MenuPath) => void
  clearPointerActivePath: () => void
  trimExpandedPath: (path: MenuPath) => void
  dismissSubmenuPath: (path: MenuPath) => void
  collapseSubmenuPathToTrigger: (path: MenuPath) => void
  openSubmenuPath: (path: MenuPath, item: MenuSubmenuItem, source: 'pointer' | 'keyboard' | 'click') => void
}

const isInteractive = (item: MenuItem): item is MenuActionItem | MenuToggleItem | MenuSubmenuItem => (
  item.kind === 'action' || item.kind === 'toggle' || item.kind === 'submenu'
)

const renderSubmenuContent = (content: MenuSubmenuItem['content']) => (
  typeof content === 'function' ? content() : content
)

const resolveSubmenuSurface = (item: MenuSubmenuItem): 'list' | 'panel' => (
  item.surface ?? (item.items?.length ? 'list' : 'panel')
)

const resolveMenuItemActiveClassName = (input: {
  active: boolean
  destructive?: boolean
}) => {
  if (input.active) {
    return input.destructive
      ? 'bg-destructive/10 text-destructive'
      : 'bg-hover text-fg'
  }

  return input.destructive
    ? 'hover:bg-transparent'
    : 'hover:bg-transparent hover:text-fg'
}

const appendMenuPath = (parentPath: MenuPath, key: string): MenuPath => [
  ...parentPath,
  key
]

const parentMenuPath = (path: MenuPath): MenuPath => path.slice(0, -1)

const areMenuPathsEqual = (left: MenuPath, right: MenuPath) => (
  left.length === right.length
  && left.every((segment, index) => segment === right[index])
)

const isMenuPathPrefix = (prefix: MenuPath, path: MenuPath) => (
  prefix.length <= path.length
  && prefix.every((segment, index) => segment === path[index])
)

const isMenuPathDirectChild = (path: MenuPath, parentPath: MenuPath) => (
  path.length === parentPath.length + 1 && isMenuPathPrefix(parentPath, path)
)

const serializeMenuPath = (path: MenuPath) => JSON.stringify(path)

const parseMenuPath = (value: string | null): MenuPath | null => {
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

const findInteractiveItem = (
  items: readonly MenuItem[],
  key: string
) => items.find(item => isInteractive(item) && item.key === key)

const findMenuItemAtPath = (
  items: readonly MenuItem[],
  path: MenuPath
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

const getFirstEnabledPath = (
  items: readonly MenuItem[],
  parentPath: MenuPath
): MenuPath | null => {
  const firstInteractiveItem = items.find(item => isInteractive(item) && !item.disabled)
  return firstInteractiveItem
    ? appendMenuPath(parentPath, firstInteractiveItem.key)
    : null
}

const normalizeExpandedPath = (
  items: readonly MenuItem[],
  expandedPath: MenuPath
): MenuPath => {
  if (!expandedPath.length) {
    return []
  }

  let currentItems = items
  const nextExpandedPath: string[] = []

  for (const key of expandedPath) {
    const item = currentItems.find(
      (currentItem): currentItem is MenuSubmenuItem => (
        currentItem.kind === 'submenu' && currentItem.key === key && !currentItem.disabled
      )
    )
    if (!item) {
      break
    }

    nextExpandedPath.push(key)
    if (!item.items?.length) {
      break
    }

    currentItems = item.items
  }

  return nextExpandedPath
}

const isVisibleMenuPath = (
  items: readonly MenuItem[],
  path: MenuPath,
  expandedPath: MenuPath
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
    if (item.kind !== 'submenu' || !isMenuPathPrefix(currentPath, expandedPath) || !item.items?.length) {
      return false
    }

    currentItems = item.items
  }

  return false
}

const MenuLevel = (props: MenuLevelProps) => {
  const rootRef = useRef<HTMLDivElement | null>(null)
  const enabledPaths = useMemo(
    () => props.items
      .filter(item => isInteractive(item) && !item.disabled)
      .map(item => appendMenuPath(props.parentPath, item.key)),
    [props.items, props.parentPath]
  )
  const firstEnabledPath = enabledPaths[0] ?? null
  const hasActiveDescendant = props.controller.activePath.length > props.parentPath.length
    && isMenuPathPrefix(props.parentPath, props.controller.activePath)

  useEffect(() => {
    if (!props.open || !props.autoFocus || !firstEnabledPath) {
      return
    }

    if (hasActiveDescendant) {
      return
    }

    props.controller.setActiveKeyboardPath(firstEnabledPath)
  }, [
    firstEnabledPath,
    hasActiveDescendant,
    props.autoFocus,
    props.controller,
    props.open,
    props.parentPath
  ])

  const moveKeyboardActive = useCallback((currentPath: MenuPath, delta: number) => {
    if (!enabledPaths.length) {
      return
    }

    const currentIndex = enabledPaths.findIndex(path => areMenuPathsEqual(path, currentPath))
    const baseIndex = currentIndex === -1
      ? (delta > 0 ? -1 : 0)
      : currentIndex
    const nextIndex = (baseIndex + delta + enabledPaths.length) % enabledPaths.length
    const nextPath = enabledPaths[nextIndex] ?? null

    if (!nextPath) {
      return
    }

    props.controller.trimExpandedPath(props.parentPath)
    props.controller.setActiveKeyboardPath(nextPath)
  }, [enabledPaths, props.controller, props.parentPath])

  const handleKeyDownCapture = useCallback((event: KeyboardEvent<HTMLDivElement>) => {
    if (!(event.target instanceof HTMLElement) || !rootRef.current?.contains(event.target)) {
      return
    }

    const target = closestTarget<HTMLElement>(event.target, `[${MENU_ITEM_PATH_ATTR}]`)
    const currentPath = parseMenuPath(target?.getAttribute(MENU_ITEM_PATH_ATTR) ?? null)
    if (!currentPath || !isMenuPathDirectChild(currentPath, props.parentPath)) {
      return
    }

    const currentItem = findMenuItemAtPath(props.items, currentPath)
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault()
        event.stopPropagation()
        moveKeyboardActive(currentPath, 1)
        break
      case 'ArrowUp':
        event.preventDefault()
        event.stopPropagation()
        moveKeyboardActive(currentPath, -1)
        break
      case 'Home':
        event.preventDefault()
        event.stopPropagation()
        props.controller.trimExpandedPath(props.parentPath)
        if (firstEnabledPath) {
          props.controller.setActiveKeyboardPath(firstEnabledPath)
        }
        break
      case 'End': {
        event.preventDefault()
        event.stopPropagation()
        props.controller.trimExpandedPath(props.parentPath)
        const lastEnabledPath = enabledPaths[enabledPaths.length - 1] ?? null
        if (lastEnabledPath) {
          props.controller.setActiveKeyboardPath(lastEnabledPath)
        }
        break
      }
      case 'ArrowRight':
        event.preventDefault()
        event.stopPropagation()
        if (currentItem?.kind === 'submenu' && !currentItem.disabled) {
          props.controller.openSubmenuPath(currentPath, currentItem, 'keyboard')
        }
        break
      case 'ArrowLeft':
        if (!props.onRequestClose) {
          return
        }

        event.preventDefault()
        event.stopPropagation()
        props.onRequestClose()
        break
      case 'Escape':
        if (props.onRequestClose) {
          event.preventDefault()
          event.stopPropagation()
          props.onRequestClose()
          return
        }

        if (props.onClose) {
          event.preventDefault()
          event.stopPropagation()
          props.onClose()
        }
        break
      default:
        break
    }
  }, [
    enabledPaths,
    firstEnabledPath,
    moveKeyboardActive,
    props.controller,
    props.items,
    props.onClose,
    props.onRequestClose,
    props.parentPath
  ])

  const handleMouseLeave = useCallback(() => {
    if (props.controller.activeSource !== 'pointer') {
      return
    }

    if (props.controller.expandedPath.length > props.parentPath.length
      && isMenuPathPrefix(props.parentPath, props.controller.expandedPath)) {
      return
    }

    if (isMenuPathDirectChild(props.controller.activePath, props.parentPath)) {
      props.controller.clearPointerActivePath()
    }
  }, [props.controller, props.parentPath])

  return (
    <div
      ref={rootRef}
      role="menu"
      className="flex flex-col gap-0.5"
      onKeyDownCapture={handleKeyDownCapture}
      onMouseLeave={handleMouseLeave}
    >
      {props.items.map(item => {
        const itemPath = appendMenuPath(props.parentPath, item.key)
        const itemPathKey = serializeMenuPath(itemPath)
        const registerRef = (element: HTMLButtonElement | null) => {
          props.controller.registerItemRef(itemPath, element)
        }

        if (item.kind === 'divider') {
          return (
            <div
              key={item.key}
              className="my-1 border-t border-divider"
              onMouseEnter={() => {
                props.controller.trimExpandedPath(props.parentPath)
                if (props.controller.activeSource === 'pointer') {
                  props.controller.clearPointerActivePath()
                }
              }}
            />
          )
        }

        if (item.kind === 'label') {
          return (
            <div
              key={item.key}
              className="px-2.5 pb-1 pt-1 text-[11px] font-medium text-muted-foreground"
              onMouseEnter={() => {
                props.controller.trimExpandedPath(props.parentPath)
                if (props.controller.activeSource === 'pointer') {
                  props.controller.clearPointerActivePath()
                }
              }}
            >
              {item.label}
            </div>
          )
        }

        if (item.kind === 'custom') {
          return (
            <div
              key={item.key}
              onMouseEnter={() => {
                props.controller.trimExpandedPath(props.parentPath)
                if (props.controller.activeSource === 'pointer') {
                  props.controller.clearPointerActivePath()
                }
              }}
            >
              {item.render()}
            </div>
          )
        }

        const active = areMenuPathsEqual(props.controller.activePath, itemPath)

        if (item.kind === 'action') {
          return (
            <Button
              key={item.key}
              ref={registerRef}
              {...{
                [MENU_ITEM_PATH_ATTR]: itemPathKey
              }}
              role="menuitem"
              tabIndex={active ? 0 : -1}
              layout="row"
              variant={item.tone === 'destructive' ? 'ghostDestructive' : undefined}
              leading={item.leading}
              suffix={item.suffix}
              trailing={item.trailing}
              disabled={item.disabled}
              className={resolveMenuItemActiveClassName({
                active,
                destructive: item.tone === 'destructive'
              })}
              onMouseEnter={() => {
                props.controller.trimExpandedPath(props.parentPath)
                props.controller.setActivePointerPath(itemPath)
              }}
              onClick={() => {
                item.onSelect()
                if (item.closeOnSelect !== false) {
                  props.onClose?.()
                }
              }}
            >
              {item.label}
            </Button>
          )
        }

        if (item.kind === 'toggle') {
          const indicator = item.indicator ?? 'check'
          return (
            <Button
              key={item.key}
              ref={registerRef}
              {...{
                [MENU_ITEM_PATH_ATTR]: itemPathKey
              }}
              role="menuitemcheckbox"
              aria-checked={item.checked}
              tabIndex={active ? 0 : -1}
              layout="row"
              leading={item.leading}
              suffix={item.suffix}
              disabled={item.disabled}
              className={resolveMenuItemActiveClassName({
                active
              })}
              trailing={indicator === 'switch'
                ? (
                    <Switch
                      checked={item.checked}
                      onCheckedChange={() => undefined}
                      disabled={item.disabled}
                      interactive={false}
                    />
                  )
                : item.checked
                  ? <Check className="size-4 text-foreground" size={16} strokeWidth={1.8} />
                  : undefined}
              onMouseEnter={() => {
                props.controller.trimExpandedPath(props.parentPath)
                props.controller.setActivePointerPath(itemPath)
              }}
              onClick={() => {
                item.onSelect()
                if (item.closeOnSelect !== false) {
                  props.onClose?.()
                }
              }}
            >
              {item.label}
            </Button>
          )
        }

        const submenuSurface = resolveSubmenuSurface(item)
        const open = isMenuPathPrefix(itemPath, props.controller.expandedPath)

        return (
          <Popover
            key={item.key}
            open={open}
            onOpenChange={nextOpen => {
              if (nextOpen) {
                props.controller.openSubmenuPath(itemPath, item, 'click')
                return
              }

              props.controller.dismissSubmenuPath(itemPath)
            }}
            kind="menu"
            placement={item.placement ?? 'right-start'}
            offset={item.offset ?? MENU_SUBMENU_OFFSET}
            initialFocus={submenuSurface === 'list' ? -1 : 0}
            size={item.size ?? (submenuSurface === 'list' ? 'sm' : undefined)}
            padding={submenuSurface === 'list' ? 'menu' : 'panel'}
            contentClassName={cn(
              'min-w-0',
              item.contentClassName
            )}
            trigger={(
              <Button
                ref={registerRef}
                {...{
                  [MENU_ITEM_PATH_ATTR]: itemPathKey
                }}
                role="menuitem"
                aria-haspopup="menu"
                aria-expanded={open}
                tabIndex={active ? 0 : -1}
                layout="row"
                leading={item.leading}
                suffix={item.suffix}
                disabled={item.disabled}
                className={resolveMenuItemActiveClassName({
                  active
                })}
                trailing={item.trailing
                  ? (
                      <span className="inline-flex items-center gap-1.5">
                        {item.trailing}
                        <ChevronRight className="size-4" size={16} strokeWidth={1.8} />
                      </span>
                    )
                  : <ChevronRight className="size-4" size={16} strokeWidth={1.8} />}
                onMouseEnter={() => {
                  props.controller.setActivePointerPath(itemPath)
                  if (!item.disabled && props.submenuOpenPolicy === 'hover') {
                    props.controller.openSubmenuPath(itemPath, item, 'pointer')
                  } else {
                    props.controller.trimExpandedPath(props.parentPath)
                  }
                }}
              >
                {item.label}
              </Button>
            )}
          >
            <div className="flex max-h-[72vh] flex-col">
              {item.items?.length ? (
                <MenuLevel
                  items={item.items}
                  parentPath={itemPath}
                  open={open}
                  onClose={() => {
                    props.controller.dismissSubmenuPath(itemPath)
                    props.onClose?.()
                  }}
                  onRequestClose={() => {
                    props.controller.collapseSubmenuPathToTrigger(itemPath)
                  }}
                  autoFocus={open && props.controller.activeSource !== 'pointer'}
                  submenuOpenPolicy={props.submenuOpenPolicy}
                  controller={props.controller}
                />
              ) : renderSubmenuContent(item.content)}
            </div>
          </Popover>
        )
      })}
    </div>
  )
}

export const Menu = (props: MenuProps) => {
  const submenuOpenPolicy = props.submenuOpenPolicy ?? 'hover'
  const open = props.open ?? true
  const itemRefs = useRef<Record<string, HTMLButtonElement | null>>({})
  const [activePath, setActivePath] = useState<MenuPath>([])
  const [activeSource, setActiveSource] = useState<MenuActiveSource>(null)
  const [pendingFocusPath, setPendingFocusPath] = useState<MenuPath | null>(null)
  const [uncontrolledExpandedRootKey, setUncontrolledExpandedRootKey] = useState<string | null>(
    props.openSubmenuKey ?? null
  )
  const [expandedTail, setExpandedTail] = useState<string[]>([])
  const rootExpandedKey = props.openSubmenuKey !== undefined
    ? props.openSubmenuKey
    : uncontrolledExpandedRootKey
  const rawExpandedPath = useMemo<MenuPath>(() => (
    rootExpandedKey
      ? [rootExpandedKey, ...expandedTail]
      : []
  ), [expandedTail, rootExpandedKey])
  const expandedPath = useMemo(
    () => normalizeExpandedPath(props.items, rawExpandedPath),
    [props.items, rawExpandedPath]
  )

  useEffect(() => {
    if (props.openSubmenuKey !== undefined) {
      setExpandedTail([])
    }
  }, [props.openSubmenuKey])

  useEffect(() => {
    if (props.openSubmenuKey !== undefined || areMenuPathsEqual(rawExpandedPath, expandedPath)) {
      return
    }

    setUncontrolledExpandedRootKey(expandedPath[0] ?? null)
    setExpandedTail(expandedPath.slice(1))
  }, [expandedPath, props.openSubmenuKey, rawExpandedPath])

  useEffect(() => {
    if (!activePath.length) {
      return
    }

    if (!isVisibleMenuPath(props.items, activePath, expandedPath)) {
      setActivePath([])
      setActiveSource(null)
    }
  }, [activePath, expandedPath, props.items])

  useEffect(() => {
    if (open) {
      return
    }

    setActivePath([])
    setActiveSource(null)
    setPendingFocusPath(null)
    if (props.openSubmenuKey === undefined) {
      setUncontrolledExpandedRootKey(null)
      setExpandedTail([])
    }
  }, [open, props.openSubmenuKey])

  const setExpandedPath = useCallback((nextPath: MenuPath) => {
    const nextRootKey = nextPath[0] ?? null
    const nextTail = nextRootKey
      ? nextPath.slice(1)
      : []

    if (props.openSubmenuKey === undefined) {
      setUncontrolledExpandedRootKey(nextRootKey)
    }
    setExpandedTail(nextTail)
    props.onOpenSubmenuChange?.(nextRootKey)
  }, [props.onOpenSubmenuChange, props.openSubmenuKey])

  const focusItemPath = useCallback((path: MenuPath) => {
    const element = itemRefs.current[serializeMenuPath(path)]
    if (!element) {
      setPendingFocusPath(path)
      return
    }

    setPendingFocusPath(null)
    element.focus({ preventScroll: true })
    element.scrollIntoView({
      block: 'nearest'
    })
  }, [])

  const registerItemRef = useCallback((path: MenuPath, element: HTMLButtonElement | null) => {
    const pathKey = serializeMenuPath(path)
    itemRefs.current[pathKey] = element

    if (element && pendingFocusPath && areMenuPathsEqual(path, pendingFocusPath)) {
      element.focus({ preventScroll: true })
      element.scrollIntoView({
        block: 'nearest'
      })
      setPendingFocusPath(null)
    }
  }, [pendingFocusPath])

  const setActivePointerPath = useCallback((path: MenuPath) => {
    setActivePath(path)
    setActiveSource('pointer')
  }, [])

  const setActiveKeyboardPath = useCallback((path: MenuPath) => {
    setActivePath(path)
    setActiveSource('keyboard')
    focusItemPath(path)
  }, [focusItemPath])

  const clearPointerActivePath = useCallback(() => {
    if (activeSource !== 'pointer') {
      return
    }

    setActivePath([])
    setActiveSource(null)
  }, [activeSource])

  const trimExpandedPath = useCallback((path: MenuPath) => {
    if (!isMenuPathPrefix(path, expandedPath) || areMenuPathsEqual(path, expandedPath)) {
      return
    }

    setExpandedPath(path)
  }, [expandedPath, setExpandedPath])

  const dismissSubmenuPath = useCallback((path: MenuPath) => {
    setExpandedPath(parentMenuPath(path))
    setActiveKeyboardPath(path)
  }, [setActiveKeyboardPath, setExpandedPath])

  const collapseSubmenuPathToTrigger = useCallback((path: MenuPath) => {
    setExpandedPath(parentMenuPath(path))
    setActiveKeyboardPath(path)
  }, [setActiveKeyboardPath, setExpandedPath])

  const openSubmenuPath = useCallback((path: MenuPath, item: MenuSubmenuItem, source: 'pointer' | 'keyboard' | 'click') => {
    setExpandedPath(path)

    if (source === 'pointer') {
      setActivePointerPath(path)
      return
    }

    const firstChildPath = item.items?.length
      ? getFirstEnabledPath(item.items, path)
      : null
    if (firstChildPath) {
      setActiveKeyboardPath(firstChildPath)
      return
    }

    setActivePointerPath(path)
  }, [setActiveKeyboardPath, setActivePointerPath, setExpandedPath])

  const controller = useMemo<MenuController>(() => ({
    activePath,
    activeSource,
    expandedPath,
    registerItemRef,
    setActivePointerPath,
    setActiveKeyboardPath,
    clearPointerActivePath,
    trimExpandedPath,
    dismissSubmenuPath,
    collapseSubmenuPathToTrigger,
    openSubmenuPath
  }), [
    activePath,
    activeSource,
    expandedPath,
    registerItemRef,
    setActivePointerPath,
    setActiveKeyboardPath,
    clearPointerActivePath,
    trimExpandedPath,
    dismissSubmenuPath,
    collapseSubmenuPathToTrigger,
    openSubmenuPath
  ])

  return (
    <div className={cn('flex max-h-[72vh] flex-col', props.className)}>
      <MenuLevel
        items={props.items}
        parentPath={[]}
        open={open}
        onClose={props.onClose}
        autoFocus={props.autoFocus ?? true}
        submenuOpenPolicy={submenuOpenPolicy}
        controller={controller}
      />
    </div>
  )
}
