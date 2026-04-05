import { Check, ChevronRight } from 'lucide-react'
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode
} from 'react'
import type { Placement } from '@floating-ui/react'
import { Button } from './button'
import { closestTarget } from './dom'
import { Popover, type PopoverOffset } from './popover'
import { Switch } from './switch'
import { cn } from './utils'

const MENU_SUBMENU_OFFSET: PopoverOffset = {
  mainAxis: -8
}

const MENU_ROOT_ATTR = 'data-menu-root-id'
const MENU_ITEM_KEY_ATTR = 'data-menu-item-key'

export interface MenuActionItem {
  kind: 'action'
  key: string
  label: ReactNode
  leading?: ReactNode
  suffix?: ReactNode
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
  disabled?: boolean
  items?: readonly MenuItem[]
  content?: ReactNode | (() => ReactNode)
  contentClassName?: string
  placement?: Placement
  offset?: PopoverOffset
}

export interface MenuDividerItem {
  kind: 'divider'
  key: string
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
  | MenuCustomItem

export type MenuSubmenuOpenPolicy = 'hover' | 'click'

export interface MenuProps {
  items: readonly MenuItem[]
  onClose?: () => void
  autoFocus?: boolean
  submenuOpenPolicy?: MenuSubmenuOpenPolicy
  open?: boolean
}

interface MenuListProps {
  items: readonly MenuItem[]
  onClose?: () => void
  open?: boolean
  autoFocus?: boolean
  onRequestClose?: () => void
  focusTrigger?: () => void
  submenuOpenPolicy: MenuSubmenuOpenPolicy
}

const isInteractive = (item: MenuItem): item is MenuActionItem | MenuToggleItem | MenuSubmenuItem => (
  item.kind === 'action' || item.kind === 'toggle' || item.kind === 'submenu'
)

const getEnabledItemKeys = (items: readonly MenuItem[]) => items
  .filter(isInteractive)
  .filter(item => !item.disabled)
  .map(item => item.key)

const renderSubmenuContent = (content: MenuSubmenuItem['content']) => (
  typeof content === 'function' ? content() : content
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

const MenuList = (props: MenuListProps) => {
  const rootId = useId()
  const itemRefs = useRef<Record<string, HTMLButtonElement | null>>({})
  const parentOpen = props.open ?? true
  const enabledItemKeys = useMemo(
    () => getEnabledItemKeys(props.items),
    [props.items]
  )
  const enabledItemKey = enabledItemKeys.join('\0')
  const itemMap = useMemo(
    () => new Map(
      props.items
        .filter(isInteractive)
        .map(item => [item.key, item] as const)
    ),
    [props.items]
  )
  const [focusKey, setFocusKey] = useState<string | null>(enabledItemKeys[0] ?? null)
  const [openSubmenuKey, setOpenSubmenuKey] = useState<string | null>(null)
  const requestClose = useCallback(() => {
    setOpenSubmenuKey(null)
    props.onRequestClose?.()
    props.focusTrigger?.()
  }, [props])
  const focusItem = useCallback((nextKey: string | null) => {
    if (!nextKey) {
      return
    }

    setFocusKey(nextKey)
    itemRefs.current[nextKey]?.focus({ preventScroll: true })
  }, [])

  useEffect(() => {
    if (!focusKey || !enabledItemKeys.includes(focusKey)) {
      setFocusKey(enabledItemKeys[0] ?? null)
    }
  }, [enabledItemKey, enabledItemKeys, focusKey])

  useEffect(() => {
    if (openSubmenuKey && !props.items.some(item => item.kind === 'submenu' && item.key === openSubmenuKey)) {
      setOpenSubmenuKey(null)
    }
  }, [openSubmenuKey, props.items])

  useEffect(() => {
    if (props.open === false && openSubmenuKey !== null) {
      setOpenSubmenuKey(null)
    }
  }, [openSubmenuKey, props.open])

  useEffect(() => {
    if (!props.autoFocus) {
      return
    }

    focusItem(enabledItemKeys[0] ?? null)
  }, [enabledItemKey, enabledItemKeys, focusItem, props.autoFocus])

  const moveFocus = useCallback((delta: number) => {
    if (!enabledItemKeys.length) {
      return
    }

    const currentIndex = focusKey
      ? enabledItemKeys.indexOf(focusKey)
      : -1
    const baseIndex = currentIndex === -1
      ? (delta > 0 ? -1 : 0)
      : currentIndex
    const nextIndex = (baseIndex + delta + enabledItemKeys.length) % enabledItemKeys.length

    setOpenSubmenuKey(null)
    focusItem(enabledItemKeys[nextIndex] ?? null)
  }, [enabledItemKeys, focusItem, focusKey])

  const collapseSubmenu = useCallback(() => {
    setOpenSubmenuKey(null)
  }, [])

  const handleKeyDownCapture = useCallback((event: KeyboardEvent<HTMLDivElement>) => {
    const menuRoot = closestTarget<HTMLElement>(event.target, `[${MENU_ROOT_ATTR}]`)
    if (menuRoot?.getAttribute(MENU_ROOT_ATTR) !== rootId) {
      return
    }

    const target = closestTarget<HTMLElement>(event.target, `[${MENU_ITEM_KEY_ATTR}]`)
    if (!target) {
      return
    }

    const currentKey = target.getAttribute(MENU_ITEM_KEY_ATTR)
    if (!currentKey) {
      return
    }

    const currentItem = itemMap.get(currentKey)
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault()
        event.stopPropagation()
        moveFocus(1)
        break
      case 'ArrowUp':
        event.preventDefault()
        event.stopPropagation()
        moveFocus(-1)
        break
      case 'Home':
        event.preventDefault()
        event.stopPropagation()
        setOpenSubmenuKey(null)
        focusItem(enabledItemKeys[0] ?? null)
        break
      case 'End':
        event.preventDefault()
        event.stopPropagation()
        setOpenSubmenuKey(null)
        focusItem(enabledItemKeys[enabledItemKeys.length - 1] ?? null)
        break
      case 'ArrowRight':
        event.preventDefault()
        event.stopPropagation()
        if (currentItem?.kind === 'submenu' && !currentItem.disabled) {
          setOpenSubmenuKey(currentItem.key)
        }
        break
      case 'ArrowLeft':
        event.preventDefault()
        event.stopPropagation()
        if (props.onRequestClose) {
          requestClose()
        }
        break
      case 'Escape':
        if (props.onRequestClose) {
          event.preventDefault()
          event.stopPropagation()
          requestClose()
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
  }, [enabledItemKeys, focusItem, itemMap, moveFocus, props.onClose, props.onRequestClose, requestClose, rootId])

  return (
    <div
      role="menu"
      {...{
        [MENU_ROOT_ATTR]: rootId
      }}
      className="flex flex-col gap-0.5"
      onKeyDownCapture={handleKeyDownCapture}
    >
      {props.items.map(item => {
        if (item.kind === 'divider') {
          return (
            <div
              key={item.key}
              className="my-1 border-t border-divider"
              onMouseEnter={collapseSubmenu}
            />
          )
        }

        if (item.kind === 'custom') {
          return (
            <div
              key={item.key}
              onMouseEnter={collapseSubmenu}
            >
              {item.render()}
            </div>
          )
        }

        const ref = (element: HTMLButtonElement | null) => {
          itemRefs.current[item.key] = element
        }

        if (item.kind === 'action') {
          const active = focusKey === item.key
          return (
            <Button
              key={item.key}
              ref={ref}
              {...{
                [MENU_ITEM_KEY_ATTR]: item.key
              }}
              role="menuitem"
              tabIndex={focusKey === item.key ? 0 : -1}
              layout="row"
              variant={item.tone === 'destructive' ? 'ghostDestructive' : undefined}
              focusRing={false}
              leading={item.leading}
              suffix={item.suffix}
              disabled={item.disabled}
              className={resolveMenuItemActiveClassName({
                active,
                destructive: item.tone === 'destructive'
              })}
              onFocus={() => {
                setFocusKey(item.key)
                collapseSubmenu()
              }}
              onMouseEnter={() => {
                focusItem(item.key)
                collapseSubmenu()
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
          const active = focusKey === item.key
          return (
            <Button
              key={item.key}
              ref={ref}
              {...{
                [MENU_ITEM_KEY_ATTR]: item.key
              }}
              role="menuitemcheckbox"
              aria-checked={item.checked}
              tabIndex={focusKey === item.key ? 0 : -1}
              layout="row"
              focusRing={false}
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
              onFocus={() => {
                setFocusKey(item.key)
                collapseSubmenu()
              }}
              onMouseEnter={() => {
                focusItem(item.key)
                collapseSubmenu()
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

        const open = parentOpen && openSubmenuKey === item.key
        const active = focusKey === item.key || open

        return (
          <Popover
            key={item.key}
            open={open}
            onOpenChange={nextOpen => setOpenSubmenuKey(nextOpen ? item.key : null)}
            kind="menu"
            placement={item.placement ?? 'right-start'}
            offset={item.offset ?? MENU_SUBMENU_OFFSET}
            initialFocus={0}
            contentClassName={cn(
              'min-w-0',
              item.contentClassName ?? (item.items ? 'w-[180px] p-1.5' : 'p-0')
            )}
            trigger={(
              <Button
                ref={ref}
                {...{
                  [MENU_ITEM_KEY_ATTR]: item.key
                }}
                role="menuitem"
                aria-haspopup="menu"
                aria-expanded={open}
                tabIndex={focusKey === item.key ? 0 : -1}
                layout="row"
                focusRing={false}
                leading={item.leading}
                suffix={item.suffix}
                disabled={item.disabled}
                className={resolveMenuItemActiveClassName({
                  active
                })}
                trailing={<ChevronRight className="size-4" size={16} strokeWidth={1.8} />}
                onFocus={() => {
                  setFocusKey(item.key)
                }}
                onMouseEnter={() => {
                  focusItem(item.key)
                  if (!item.disabled && props.submenuOpenPolicy === 'hover') {
                    setOpenSubmenuKey(item.key)
                  }
                }}
              >
                {item.label}
              </Button>
            )}
          >
            <div className="flex max-h-[72vh] flex-col">
              {item.items?.length ? (
                <MenuList
                  items={item.items}
                  open={open}
                  onClose={() => {
                    setOpenSubmenuKey(null)
                    props.onClose?.()
                  }}
                  autoFocus={false}
                  onRequestClose={() => setOpenSubmenuKey(null)}
                  focusTrigger={() => focusItem(item.key)}
                  submenuOpenPolicy={props.submenuOpenPolicy}
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

  return (
    <div className="flex max-h-[72vh] flex-col">
      <MenuList
        items={props.items}
        open={props.open ?? true}
        onClose={props.onClose}
        autoFocus={props.autoFocus ?? true}
        submenuOpenPolicy={submenuOpenPolicy}
      />
    </div>
  )
}
