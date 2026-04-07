import type { KeyboardEvent } from 'react'
import { useCallback, useEffect, useMemo, useRef } from 'react'
import { Popover } from '../popover'
import { renderListStructuralItem } from '../list-structure'
import { closestTarget } from '../dom'
import { cn } from '../utils'
import {
  DROPDOWN_SUBMENU_OFFSET,
  ITEM_PATH_ATTR,
  SUBMENU_OFFSET,
  appendPath,
  findAtPath,
  firstEnabledPath,
  isDirectChildPath,
  isPathPrefix,
  isSamePath,
  parsePath,
  renderContent,
  resolvePresentation,
  resolveSurface
} from './shared'
import { submenuArrow, ButtonRow, checkTrailing, switchTrailing } from './row'
import type { Item, LevelProps } from './types'

const itemTrailing = (item: Item, selected: boolean) => {
  const indicator = item.indicator ?? 'none'

  if (indicator === 'switch') {
    return switchTrailing(selected, item.disabled)
  }

  if (item.trailing) {
    return (
      <span className="inline-flex items-center gap-1.5">
        {item.trailing}
        {selected && indicator === 'check' ? checkTrailing() : null}
      </span>
    )
  }

  return selected && indicator === 'check'
    ? checkTrailing()
    : undefined
}

export const Level = (props: LevelProps) => {
  const rootRef = useRef<HTMLDivElement | null>(null)
  const enabledPaths = useMemo(
    () => props.items
      .filter(item => item.kind !== 'divider' && item.kind !== 'label' && item.kind !== 'custom' && !item.disabled)
      .map(item => appendPath(props.parentPath, item.key)),
    [props.items, props.parentPath]
  )
  const firstPath = enabledPaths[0] ?? null
  const hasActiveDescendant = props.controller.activePath.length > props.parentPath.length
    && isPathPrefix(props.parentPath, props.controller.activePath)

  useEffect(() => {
    if (!props.open || !props.autoFocus || !firstPath || hasActiveDescendant) {
      return
    }

    props.controller.setActiveKeyboardPath(firstPath)
  }, [
    firstPath,
    hasActiveDescendant,
    props.autoFocus,
    props.controller,
    props.open
  ])

  const moveActive = useCallback((currentPath: readonly string[], delta: number) => {
    if (!enabledPaths.length) {
      return
    }

    const currentIndex = enabledPaths.findIndex(path => isSamePath(path, currentPath))
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

  const onKeyDownCapture = useCallback((event: KeyboardEvent<HTMLDivElement>) => {
    if (!(event.target instanceof HTMLElement) || !rootRef.current?.contains(event.target)) {
      return
    }

    const target = closestTarget<HTMLElement>(event.target, `[${ITEM_PATH_ATTR}]`)
    const currentPath = parsePath(target?.getAttribute(ITEM_PATH_ATTR) ?? null)
    if (!currentPath || !isDirectChildPath(currentPath, props.parentPath)) {
      return
    }

    const currentItem = findAtPath(props.items, currentPath)
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault()
        event.stopPropagation()
        moveActive(currentPath, 1)
        break
      case 'ArrowUp':
        event.preventDefault()
        event.stopPropagation()
        moveActive(currentPath, -1)
        break
      case 'Home':
        event.preventDefault()
        event.stopPropagation()
        props.controller.trimExpandedPath(props.parentPath)
        if (firstPath) {
          props.controller.setActiveKeyboardPath(firstPath)
        }
        break
      case 'End': {
        event.preventDefault()
        event.stopPropagation()
        props.controller.trimExpandedPath(props.parentPath)
        const lastPath = enabledPaths[enabledPaths.length - 1] ?? null
        if (lastPath) {
          props.controller.setActiveKeyboardPath(lastPath)
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
    firstPath,
    moveActive,
    props.controller,
    props.items,
    props.onClose,
    props.onRequestClose,
    props.parentPath
  ])

  const onMouseLeave = useCallback(() => {
    if (props.controller.activeSource !== 'pointer') {
      return
    }

    if (
      props.controller.expandedPath.length > props.parentPath.length
      && isPathPrefix(props.parentPath, props.controller.expandedPath)
    ) {
      return
    }

    if (isDirectChildPath(props.controller.activePath, props.parentPath)) {
      props.controller.clearPointerActivePath()
    }
  }, [props.controller, props.parentPath])

  return (
    <div
      ref={rootRef}
      role="menu"
      className="flex flex-col gap-0.5"
      onKeyDownCapture={onKeyDownCapture}
      onMouseLeave={onMouseLeave}
    >
      {props.items.map(item => {
        const path = appendPath(props.parentPath, item.key)
        const pathKey = JSON.stringify(path)
        const registerRef = (element: HTMLButtonElement | null) => {
          props.controller.registerItemRef(path, element)
        }

        if (item.kind === 'divider' || item.kind === 'label' || item.kind === 'custom') {
          return renderListStructuralItem(item, () => {
            if (props.submenuOpenPolicy === 'hover') {
              props.controller.trimExpandedPath(props.parentPath)
            }
            if (props.submenuOpenPolicy === 'hover' && props.controller.activeSource === 'pointer') {
              props.controller.clearPointerActivePath()
            }
          })
        }

        const active = isSamePath(props.controller.activePath, path)

        if (item.kind === 'item') {
          const selectionEnabled = props.selectionMode !== 'none'
          const selected = selectionEnabled && props.selectedKeys.includes(item.key)

          return (
            <ButtonRow
              key={item.key}
              ref={registerRef}
              {...{
                [ITEM_PATH_ATTR]: pathKey
              }}
              role={props.selectionMode === 'multiple'
                ? 'menuitemcheckbox'
                : props.selectionMode === 'single'
                  ? 'menuitemradio'
                  : 'menuitem'}
              aria-checked={selectionEnabled ? selected : undefined}
              tabIndex={active ? 0 : -1}
              label={item.label}
              leading={item.leading}
              suffix={item.suffix}
              trailing={itemTrailing(item, selected)}
              tone={item.tone}
              disabled={item.disabled}
              active={active || selected}
              className={item.className}
              highlightedClassName={item.highlightedClassName}
              onMouseEnter={() => {
                if (props.submenuOpenPolicy === 'hover') {
                  props.controller.trimExpandedPath(props.parentPath)
                }
                props.controller.setActivePointerPath(path)
              }}
              onClick={() => {
                props.onItemValueToggle(item.key)
                item.onSelect?.()
                if (item.closeOnSelect !== false) {
                  props.onClose?.()
                }
              }}
            />
          )
        }

        if (item.kind === 'action') {
          return (
            <ButtonRow
              key={item.key}
              ref={registerRef}
              {...{
                [ITEM_PATH_ATTR]: pathKey
              }}
              role="menuitem"
              tabIndex={active ? 0 : -1}
              label={item.label}
              leading={item.leading}
              suffix={item.suffix}
              trailing={item.trailing}
              tone={item.tone}
              disabled={item.disabled}
              active={active}
              onMouseEnter={() => {
                if (props.submenuOpenPolicy === 'hover') {
                  props.controller.trimExpandedPath(props.parentPath)
                }
                props.controller.setActivePointerPath(path)
              }}
              onClick={() => {
                item.onSelect()
                if (item.closeOnSelect !== false) {
                  props.onClose?.()
                }
              }}
            />
          )
        }

        if (item.kind === 'toggle') {
          return (
            <ButtonRow
              key={item.key}
              ref={registerRef}
              {...{
                [ITEM_PATH_ATTR]: pathKey
              }}
              role="menuitemcheckbox"
              aria-checked={item.checked}
              tabIndex={active ? 0 : -1}
              label={item.label}
              leading={item.leading}
              suffix={item.suffix}
              trailing={item.indicator === 'switch'
                ? switchTrailing(item.checked, item.disabled)
                : item.checked
                  ? checkTrailing()
                  : undefined}
              disabled={item.disabled}
              active={active}
              onMouseEnter={() => {
                if (props.submenuOpenPolicy === 'hover') {
                  props.controller.trimExpandedPath(props.parentPath)
                }
                props.controller.setActivePointerPath(path)
              }}
              onClick={() => {
                item.onSelect()
                if (item.closeOnSelect !== false) {
                  props.onClose?.()
                }
              }}
            />
          )
        }

        const surface = resolveSurface(item)
        const presentation = resolvePresentation(item)
        const open = isPathPrefix(path, props.controller.expandedPath)
        const arrow = submenuArrow({
          presentation,
          open
        })

        return (
          <Popover
            key={item.key}
            open={open}
            onOpenChange={nextOpen => {
              if (nextOpen) {
                props.controller.openSubmenuPath(path, item, 'click')
                return
              }

              props.controller.dismissSubmenuPath(path)
            }}
            kind="menu"
            placement={item.placement ?? (presentation === 'dropdown' ? 'bottom-end' : 'right-start')}
            offset={item.offset ?? (presentation === 'dropdown' ? DROPDOWN_SUBMENU_OFFSET : SUBMENU_OFFSET)}
            initialFocus={surface === 'list' ? -1 : 0}
            size={item.size ?? (surface === 'list' ? 'sm' : undefined)}
            padding={surface === 'list' ? 'menu' : 'panel'}
            contentClassName={cn('min-w-0', item.contentClassName)}
            trigger={(
              <ButtonRow
                ref={registerRef}
                {...{
                  [ITEM_PATH_ATTR]: pathKey
                }}
                role="menuitem"
                aria-haspopup="menu"
                aria-expanded={open}
                tabIndex={active ? 0 : -1}
                label={item.label}
                leading={item.leading}
                suffix={item.suffix}
                trailing={item.trailing
                  ? (
                      <span className="inline-flex items-center gap-1.5">
                        {item.trailing}
                        {arrow}
                      </span>
                    )
                  : arrow}
                disabled={item.disabled}
                active={active}
                onMouseEnter={() => {
                  props.controller.setActivePointerPath(path)
                  if (
                    !item.disabled
                    && presentation !== 'dropdown'
                    && props.submenuOpenPolicy === 'hover'
                  ) {
                    props.controller.openSubmenuPath(path, item, 'pointer')
                  } else if (
                    props.submenuOpenPolicy === 'hover'
                    && !(presentation === 'dropdown' && open)
                  ) {
                    props.controller.trimExpandedPath(props.parentPath)
                  }
                }}
              />
            )}
          >
            <div className="flex max-h-[72vh] flex-col">
              {item.items?.length ? (
                <Level
                  items={item.items}
                  parentPath={path}
                  open={open}
                  selectedKeys={props.selectedKeys}
                  selectionMode={props.selectionMode}
                  onItemValueToggle={props.onItemValueToggle}
                  onClose={() => {
                    props.controller.dismissSubmenuPath(path)
                    props.onClose?.()
                  }}
                  onRequestClose={() => {
                    props.controller.collapseSubmenuPathToTrigger(path)
                  }}
                  autoFocus={open && props.controller.activeSource !== 'pointer'}
                  submenuOpenPolicy={props.submenuOpenPolicy}
                  controller={props.controller}
                />
              ) : renderContent(item.content)}
            </div>
          </Popover>
        )
      })}
    </div>
  )
}

