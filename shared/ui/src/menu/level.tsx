import type { KeyboardEvent } from 'react'
import { useCallback, useEffect, useMemo, useRef } from 'react'
import { Popover } from '@shared/ui/popover'
import { renderListStructuralItem } from '@shared/ui/list-structure'
import { closestTarget } from '@shared/dom'
import { VerticalReorderList, type VerticalReorderItemState } from '@shared/ui/vertical-reorder-list'
import { cn } from '@shared/ui/utils'
import {
  DROPDOWN_SUBMENU_OFFSET,
  ITEM_PATH_ATTR,
  SUBMENU_OFFSET,
  appendPath,
  findAtPath,
  isDirectChildPath,
  isPathPrefix,
  isSamePath,
  parsePath,
  renderContent,
  resolvePresentation,
  resolveSurface
} from '@shared/ui/menu/shared'
import {
  Handle,
  Row,
  checkTrailing,
  handleActivationKey,
  submenuArrow,
  switchTrailing
} from '@shared/ui/menu/row'
import type { Item, LevelProps, MenuItem, SelectionAppearance } from '@shared/ui/menu/types'

const itemTrailing = (
  item: Item,
  selected: boolean,
  selectionAppearance: SelectionAppearance
) => {
  const indicator = item.indicator ?? 'none'
  const selectedVisible = selected && selectionAppearance !== 'none'

  if (indicator === 'switch') {
    return switchTrailing(selected, item.disabled)
  }

  if (item.trailing) {
    return (
      <span className="inline-flex items-center gap-1.5">
        {item.trailing}
        {selectedVisible && indicator === 'check' ? checkTrailing() : null}
      </span>
    )
  }

  return selectedVisible && indicator === 'check'
    ? checkTrailing()
    : undefined
}

export const Level = (props: LevelProps) => {
  const rootRef = useRef<HTMLDivElement | null>(null)
  const didAutoFocusRef = useRef(false)
  const enabledPaths = useMemo(
    () => props.items
      .filter(item => item.kind !== 'divider' && item.kind !== 'label' && item.kind !== 'custom' && !item.disabled)
      .map(item => appendPath(props.parentPath, item.key)),
    [props.items, props.parentPath]
  )
  const firstPath = enabledPaths[0] ?? null
  const hasActiveDescendant = props.controller.activePath.length > props.parentPath.length
    && isPathPrefix(props.parentPath, props.controller.activePath)
  const setActiveKeyboardPath = props.controller.setActiveKeyboardPath

  useEffect(() => {
    if (props.open) {
      return
    }

    didAutoFocusRef.current = false
  }, [props.open])

  useEffect(() => {
    if (!props.open || !props.autoFocus || !firstPath || hasActiveDescendant || didAutoFocusRef.current) {
      return
    }

    didAutoFocusRef.current = true
    setActiveKeyboardPath(firstPath)
  }, [
    firstPath,
    hasActiveDescendant,
    props.autoFocus,
    props.open,
    setActiveKeyboardPath
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

    props.controller.trimOpenPath(props.parentPath)
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
        props.controller.trimOpenPath(props.parentPath)
        if (firstPath) {
          props.controller.setActiveKeyboardPath(firstPath)
        }
        break
      case 'End': {
        event.preventDefault()
        event.stopPropagation()
        props.controller.trimOpenPath(props.parentPath)
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
      props.controller.openPath.length > props.parentPath.length
      && isPathPrefix(props.parentPath, props.controller.openPath)
    ) {
      return
    }

    if (isDirectChildPath(props.controller.activePath, props.parentPath)) {
      props.controller.clearPointerActivePath()
    }
  }, [props.controller, props.parentPath])

  const renderItem = useCallback((
    item: MenuItem,
    drag?: VerticalReorderItemState
  ) => {
    const path = appendPath(props.parentPath, item.key)
    const pathKey = JSON.stringify(path)
    const registerRef = (element: HTMLDivElement | null) => {
      props.controller.registerItemRef(path, element)
    }

    if (item.kind === 'divider' || item.kind === 'label' || item.kind === 'custom') {
      return renderListStructuralItem(item, () => {
        if (props.submenuOpenPolicy === 'hover') {
          props.controller.trimOpenPath(props.parentPath)
        }
        if (props.submenuOpenPolicy === 'hover' && props.controller.activeSource === 'pointer') {
          props.controller.clearPointerActivePath()
        }
      })
    }

    const active = isSamePath(props.controller.activePath, path)
    const selectionEnabled = props.selectionMode !== 'none'
    const selected = selectionEnabled && props.selectedKeys.includes(item.key)
    const start = drag
      ? (
          <Handle
            onActive={() => {
              props.controller.setActivePointerPath(path)
            }}
            attributes={drag.handle.attributes}
            listeners={drag.handle.listeners}
            setActivatorNodeRef={drag.handle.setActivatorNodeRef}
          />
        )
      : undefined

    if (item.kind === 'item') {
      return (
        <Row
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
          trailing={itemTrailing(item, selected, props.selectionAppearance)}
          accessory={item.accessory}
          tone={item.tone}
          disabled={item.disabled}
          active={active}
          activeSource={active ? props.controller.activeSource : null}
          selected={selected}
          selectionAppearance={props.selectionAppearance}
          className={item.className}
          highlightedClassName={item.highlightedClassName}
          start={start}
          dragging={drag?.dragging}
          onMouseEnter={() => {
            if (props.submenuOpenPolicy === 'hover') {
              props.controller.trimOpenPath(props.parentPath)
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
          onKeyDown={event => {
            if (item.disabled || !handleActivationKey(event)) {
              return
            }

            event.preventDefault()
            event.stopPropagation()
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
        <Row
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
          accessory={item.accessory}
          tone={item.tone}
          disabled={item.disabled}
          active={active}
          activeSource={active ? props.controller.activeSource : null}
          selectionAppearance={props.selectionAppearance}
          className={item.className}
          highlightedClassName={item.highlightedClassName}
          start={start}
          dragging={drag?.dragging}
          onMouseEnter={() => {
            if (props.submenuOpenPolicy === 'hover') {
              props.controller.trimOpenPath(props.parentPath)
            }
            props.controller.setActivePointerPath(path)
          }}
          onClick={() => {
            item.onSelect()
            if (item.closeOnSelect !== false) {
              props.onClose?.()
            }
          }}
          onKeyDown={event => {
            if (item.disabled || !handleActivationKey(event)) {
              return
            }

            event.preventDefault()
            event.stopPropagation()
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
        <Row
          key={item.key}
          ref={registerRef}
          {...{
            [ITEM_PATH_ATTR]: pathKey
          }}
          role={item.indicator === 'switch' ? 'switch' : 'menuitemcheckbox'}
          aria-checked={item.checked}
          tabIndex={active ? 0 : -1}
          label={item.label}
          leading={item.leading}
          suffix={item.suffix}
          accessory={item.accessory}
          disabled={item.disabled}
          active={active}
          activeSource={active ? props.controller.activeSource : null}
          selected={item.checked}
          selectionAppearance={props.selectionAppearance}
          className={item.className}
          highlightedClassName={item.highlightedClassName}
          start={start}
          dragging={drag?.dragging}
          trailing={item.indicator === 'switch'
            ? switchTrailing(item.checked, item.disabled)
            : item.checked
              ? checkTrailing()
              : undefined}
          onMouseEnter={() => {
            if (props.submenuOpenPolicy === 'hover') {
              props.controller.trimOpenPath(props.parentPath)
            }
            props.controller.setActivePointerPath(path)
          }}
          onClick={() => {
            item.onSelect()
            props.onItemValueToggle(item.key)
            if (item.closeOnSelect !== false) {
              props.onClose?.()
            }
          }}
          onKeyDown={event => {
            if (item.disabled || !handleActivationKey(event)) {
              return
            }

            event.preventDefault()
            event.stopPropagation()
            item.onSelect()
            props.onItemValueToggle(item.key)
            if (item.closeOnSelect !== false) {
              props.onClose?.()
            }
          }}
        />
      )
    }

    const open = isPathPrefix(path, props.controller.openPath)
      && props.controller.openPath.length === path.length
    const presentation = resolvePresentation(item)

    return (
      <Popover
        key={item.key}
        open={open}
        onOpenChange={nextOpen => {
          if (nextOpen) {
            props.controller.openSubmenuPath(path, item, 'pointer')
            return
          }

          props.controller.closeSubmenuPath(
            path,
            props.controller.consumeTriggerPress(path)
              ? 'trigger'
              : 'outside'
          )
        }}
        kind="menu"
        placement={item.placement ?? (presentation === 'dropdown' ? 'bottom-end' : 'right-start')}
        offset={item.offset ?? (presentation === 'dropdown' ? DROPDOWN_SUBMENU_OFFSET : SUBMENU_OFFSET)}
      >
        <Popover.Trigger>
          <Row
            ref={registerRef}
            {...{
              [ITEM_PATH_ATTR]: pathKey
            }}
            role="menuitem"
            tabIndex={active ? 0 : -1}
            aria-expanded={open}
            label={item.label}
            leading={item.leading}
            suffix={item.suffix}
            trailing={item.trailing ?? submenuArrow({
              presentation,
              open
            })}
            accessory={item.accessory}
            tone={item.tone}
            disabled={item.disabled}
            active={active}
            activeSource={active ? props.controller.activeSource : null}
            selectionAppearance={props.selectionAppearance}
            className={item.className}
            highlightedClassName={item.highlightedClassName}
            start={start}
            dragging={drag?.dragging}
            onPointerDown={event => {
              if (event.button !== 0 || !open) {
                return
              }

              props.controller.markTriggerPress(path)
            }}
            onMouseEnter={() => {
              props.controller.setActivePointerPath(path)
              if (props.submenuOpenPolicy === 'hover' && !item.disabled) {
                props.controller.openSubmenuPath(path, item, 'pointer')
              }
              if (props.submenuOpenPolicy === 'click') {
                props.controller.trimOpenPath(props.parentPath)
              }
            }}
            onClick={() => {
              if (item.disabled) {
                return
              }

              props.controller.setActivePointerPath(path)
              if (open) {
                props.controller.closeSubmenuPath(path, 'trigger')
                return
              }

              props.controller.openSubmenuPath(path, item, 'pointer')
            }}
          />
        </Popover.Trigger>

        <Popover.Content
          padding={item.padding ?? (resolveSurface(item) === 'panel' ? 'none' : 'menu')}
          size={item.size}
          className={cn(resolveSurface(item) === 'panel' && 'min-w-[240px]', item.contentClassName)}
        >
          {item.items?.length ? (
            <Level
              items={item.items}
              parentPath={path}
              open={open}
              autoFocus={props.autoFocus}
              selectedKeys={props.selectedKeys}
              selectionMode={props.selectionMode}
              selectionAppearance={props.selectionAppearance}
              onItemValueToggle={props.onItemValueToggle}
              onClose={props.onClose}
              onRequestClose={() => {
                props.controller.closeSubmenuPath(path, 'keyboard')
              }}
              submenuOpenPolicy={props.submenuOpenPolicy}
              controller={props.controller}
            />
          ) : renderContent(item.content)}
        </Popover.Content>
      </Popover>
    )
  }, [props])

  return (
    <div
      ref={rootRef}
      role="menu"
      className="flex flex-col"
      onKeyDownCapture={onKeyDownCapture}
      onMouseLeave={onMouseLeave}
    >
      {props.reorder && props.parentPath.length === 0 ? (
        <VerticalReorderList
          items={props.items}
          getItemId={item => item.key}
          onMove={props.reorder.onMove}
          className="gap-0.5"
          renderItem={(item, drag) => renderItem(item, drag)}
        />
      ) : (
        <div className="flex flex-col gap-0.5">
          {props.items.map(item => renderItem(item))}
        </div>
      )}
    </div>
  )
}
