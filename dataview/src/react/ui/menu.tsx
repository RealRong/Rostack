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
import { closestTarget } from '@/react/dom/interactive'
import { Button } from './button'
import { Popover, PopoverScope, type PopoverOffset } from './popover'
import { Switch } from './switch'
import { cn } from './utils'

const MENU_SUBMENU_OFFSET: PopoverOffset = {
  mainAxis: -8
}

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
  scopeId?: string
  submenuOpenPolicy?: MenuSubmenuOpenPolicy
}

interface MenuListProps {
  items: readonly MenuItem[]
  onClose?: () => void
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

const MenuList = (props: MenuListProps) => {
  const itemRefs = useRef<Record<string, HTMLButtonElement | null>>({})
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
  const [activeKey, setActiveKey] = useState<string | null>(enabledItemKeys[0] ?? null)
  const [openSubmenuKey, setOpenSubmenuKey] = useState<string | null>(null)

  const focusKey = useCallback((nextKey: string | null) => {
    if (!nextKey) {
      return
    }

    setActiveKey(nextKey)
    window.requestAnimationFrame(() => {
      itemRefs.current[nextKey]?.focus()
    })
  }, [])

  useEffect(() => {
    if (!activeKey || !enabledItemKeys.includes(activeKey)) {
      setActiveKey(enabledItemKeys[0] ?? null)
    }
  }, [activeKey, enabledItemKey, enabledItemKeys])

  useEffect(() => {
    if (openSubmenuKey && !props.items.some(item => item.kind === 'submenu' && item.key === openSubmenuKey)) {
      setOpenSubmenuKey(null)
    }
  }, [openSubmenuKey, props.items])

  useEffect(() => {
    if (!props.autoFocus) {
      return
    }

    focusKey(enabledItemKeys[0] ?? null)
  }, [enabledItemKey, enabledItemKeys, focusKey, props.autoFocus])

  const moveFocus = useCallback((delta: number) => {
    if (!enabledItemKeys.length) {
      return
    }

    const currentIndex = activeKey
      ? enabledItemKeys.indexOf(activeKey)
      : -1
    const baseIndex = currentIndex === -1
      ? (delta > 0 ? -1 : 0)
      : currentIndex
    const nextIndex = (baseIndex + delta + enabledItemKeys.length) % enabledItemKeys.length
    setOpenSubmenuKey(null)
    focusKey(enabledItemKeys[nextIndex] ?? null)
  }, [activeKey, enabledItemKeys, focusKey])
  const collapseSubmenu = useCallback(() => {
    setOpenSubmenuKey(null)
  }, [])

  const handleKeyDownCapture = useCallback((event: KeyboardEvent<HTMLDivElement>) => {
    const target = closestTarget<HTMLElement>(event.target, '[data-menu-item-key]')
    if (!target) {
      return
    }

    const currentKey = target.dataset.menuItemKey
    if (!currentKey) {
      return
    }

    const currentItem = itemMap.get(currentKey)
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault()
        moveFocus(1)
        break
      case 'ArrowUp':
        event.preventDefault()
        moveFocus(-1)
        break
      case 'Home':
        event.preventDefault()
        setOpenSubmenuKey(null)
        focusKey(enabledItemKeys[0] ?? null)
        break
      case 'End':
        event.preventDefault()
        setOpenSubmenuKey(null)
        focusKey(enabledItemKeys[enabledItemKeys.length - 1] ?? null)
        break
      case 'ArrowRight':
        if (currentItem?.kind !== 'submenu' || currentItem.disabled) {
          return
        }

        event.preventDefault()
        setOpenSubmenuKey(currentItem.key)
        break
      case 'ArrowLeft':
      case 'Escape':
        if (props.onRequestClose) {
          event.preventDefault()
          event.stopPropagation()
          setOpenSubmenuKey(null)
          props.onRequestClose()
          props.focusTrigger?.()
          return
        }

        if (event.key === 'Escape' && props.onClose) {
          event.preventDefault()
          event.stopPropagation()
          props.onClose()
        }
        break
      default:
        break
    }
  }, [enabledItemKeys, focusKey, itemMap, moveFocus, props])

  return (
    <div
      role="menu"
      className="flex flex-col gap-0.5"
      onKeyDownCapture={handleKeyDownCapture}
    >
      {props.items.map(item => {
        if (item.kind === 'divider') {
          return (
            <div
              key={item.key}
              className="ui-divider-top my-1"
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
          return (
            <Button
              key={item.key}
              ref={ref}
              data-menu-item-key={item.key}
              role="menuitem"
              tabIndex={activeKey === item.key ? 0 : -1}
              layout="row"
              variant={item.tone === 'destructive' ? 'ghostDestructive' : undefined}
              leading={item.leading}
              suffix={item.suffix}
              disabled={item.disabled}
              onFocus={() => {
                setActiveKey(item.key)
                collapseSubmenu()
              }}
              onMouseEnter={() => {
                setActiveKey(item.key)
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
          return (
            <Button
              key={item.key}
              ref={ref}
              data-menu-item-key={item.key}
              role="menuitemcheckbox"
              aria-checked={item.checked}
              tabIndex={activeKey === item.key ? 0 : -1}
              layout="row"
              leading={item.leading}
              suffix={item.suffix}
              disabled={item.disabled}
              pressed={indicator === 'check' ? item.checked : undefined}
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
                setActiveKey(item.key)
                collapseSubmenu()
              }}
              onMouseEnter={() => {
                setActiveKey(item.key)
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

        const open = openSubmenuKey === item.key
        return (
          <Popover
            key={item.key}
            open={open}
            onOpenChange={nextOpen => setOpenSubmenuKey(nextOpen ? item.key : null)}
            placement={item.placement ?? 'right-start'}
            offset={item.offset ?? MENU_SUBMENU_OFFSET}
            initialFocus={-1}
            surface="scoped"
            closeOnEscape={false}
            contentClassName={cn(
              'min-w-0',
              item.contentClassName ?? (item.items ? 'w-[180px] p-1.5' : 'p-0')
            )}
            trigger={(
              <Button
                ref={ref}
                data-menu-item-key={item.key}
                role="menuitem"
                aria-haspopup="menu"
                aria-expanded={open}
                tabIndex={activeKey === item.key ? 0 : -1}
                layout="row"
                leading={item.leading}
                suffix={item.suffix}
                disabled={item.disabled}
                pressed={open}
                trailing={<ChevronRight className="size-4" size={16} strokeWidth={1.8} />}
                onFocus={() => setActiveKey(item.key)}
                onMouseEnter={() => {
                  setActiveKey(item.key)
                  if (!item.disabled && props.submenuOpenPolicy === 'hover') {
                    setOpenSubmenuKey(item.key)
                  }
                }}
              >
                {item.label}
              </Button>
            )}
          >
            <div
              className="flex max-h-[72vh] flex-col"
              onKeyDownCapture={event => {
                if (event.key !== 'ArrowLeft' && event.key !== 'Escape') {
                  return
                }

                event.preventDefault()
                event.stopPropagation()
                setOpenSubmenuKey(null)
                focusKey(item.key)
              }}
            >
              {item.items?.length ? (
                <MenuList
                  items={item.items}
                  onClose={() => {
                    setOpenSubmenuKey(null)
                    props.onClose?.()
                  }}
                  autoFocus
                  onRequestClose={() => setOpenSubmenuKey(null)}
                  focusTrigger={() => focusKey(item.key)}
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
  const generatedScopeId = useId()
  const scopeId = props.scopeId ?? generatedScopeId
  const submenuOpenPolicy = props.submenuOpenPolicy ?? 'hover'
  return (
    <PopoverScope id={scopeId}>
      <div className="flex max-h-[72vh] flex-col">
        <MenuList
          items={props.items}
          onClose={props.onClose}
          autoFocus={props.autoFocus ?? true}
          submenuOpenPolicy={submenuOpenPolicy}
        />
      </div>
    </PopoverScope>
  )
}
