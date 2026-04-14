import { useCallback, useMemo, useRef, useState } from 'react'
import { Popover } from '@shared/ui/popover'
import { VerticalReorderList } from '@shared/ui/vertical-reorder-list'
import {
  DROPDOWN_SUBMENU_OFFSET,
  SUBMENU_OFFSET,
  normalizeValue,
  renderContent,
  resolvePresentation,
  toValueResult,
  toggleSelection
} from '@shared/ui/menu/shared'
import {
  Handle,
  Row,
  handleActivationKey
} from '@shared/ui/menu/row'
import type { ReorderProps, SubmenuCloseReason } from '@shared/ui/menu/types'

export const Reorder = (props: ReorderProps) => {
  const selectionMode = props.selectionMode ?? 'none'
  const selectionAppearance = props.selectionAppearance ?? 'row'
  const pendingTriggerPressKeyRef = useRef<string | null>(null)
  const [uncontrolledValue, setUncontrolledValue] = useState<string | readonly string[]>(
    props.defaultValue ?? (selectionMode === 'multiple' ? [] : '')
  )
  const [activeKey, setActiveKey] = useState<string | null>(null)
  const [uncontrolledOpenItemKey, setUncontrolledOpenItemKey] = useState<string | null>(
    props.openItemKey ?? null
  )
  const selectedKeys = useMemo(
    () => normalizeValue(props.value ?? uncontrolledValue),
    [props.value, uncontrolledValue]
  )
  const openItemKey = props.openItemKey !== undefined
    ? props.openItemKey
    : uncontrolledOpenItemKey

  const setOpenItemKey = useCallback((key: string | null) => {
    if (props.openItemKey === undefined) {
      setUncontrolledOpenItemKey(key)
    }

    props.onOpenItemChange?.(key)
  }, [props.onOpenItemChange, props.openItemKey])

  const closeItem = useCallback((itemKey: string, reason: SubmenuCloseReason) => {
    pendingTriggerPressKeyRef.current = null
    setOpenItemKey(null)
    switch (reason) {
      case 'trigger':
      case 'keyboard':
        setActiveKey(itemKey)
        return
      case 'outside':
      default:
        setActiveKey(null)
    }
  }, [setOpenItemKey])

  const toggleValue = useCallback((itemKey: string) => {
    if (selectionMode === 'none') {
      return
    }

    const nextSelectedKeys = toggleSelection(selectionMode, selectedKeys, itemKey)
    const nextValue = toValueResult(selectionMode, nextSelectedKeys)
    if (props.value === undefined) {
      setUncontrolledValue(nextValue)
    }
    props.onValueChange?.(nextValue)
  }, [props.onValueChange, props.value, selectedKeys, selectionMode])

  return (
    <div onMouseLeave={() => setActiveKey(null)}>
      <VerticalReorderList
        items={props.items}
        getItemId={item => item.key}
        className={props.className}
        onMove={props.onMove}
        renderItem={(item, drag) => {
          const selectionEnabled = selectionMode !== 'none'
          const selected = selectionEnabled && selectedKeys.includes(item.key)
          const open = openItemKey === item.key
          const active = activeKey === item.key
          const presentation = resolvePresentation(item)
          const hasContent = item.content !== undefined

          if (!hasContent) {
            return (
              <Row
                role="button"
                tabIndex={item.disabled ? -1 : 0}
                active={active}
                activeSource={active ? 'pointer' : null}
                selected={selected}
                selectionAppearance={selectionAppearance}
                open={open}
                tone={item.tone}
                dragging={drag.dragging}
                disabled={item.disabled}
                highlightedClassName={item.highlightedClassName}
                accessory={item.accessory}
                start={(
                  <Handle
                    ariaLabel={item.handleAriaLabel}
                    icon={item.handleIcon}
                    onActive={() => setActiveKey(item.key)}
                    attributes={drag.handle.attributes}
                    listeners={drag.handle.listeners}
                    setActivatorNodeRef={drag.handle.setActivatorNodeRef}
                  />
                )}
                label={item.label}
                leading={item.leading}
                suffix={item.suffix}
                trailing={item.trailing}
                className={item.className}
                onMouseEnter={() => {
                  setActiveKey(item.key)
                }}
                onFocusCapture={() => {
                  setActiveKey(item.key)
                }}
                onClick={() => {
                  setActiveKey(item.key)
                  toggleValue(item.key)
                  item.onSelect?.()
                  setActiveKey(null)
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
                  toggleValue(item.key)
                  item.onSelect?.()
                  if (item.closeOnSelect !== false) {
                    props.onClose?.()
                  }
                }}
              />
            )
          }

          return (
            <Popover
              open={open}
              onOpenChange={nextOpen => {
                if (nextOpen) {
                  pendingTriggerPressKeyRef.current = null
                  setOpenItemKey(item.key)
                  return
                }

                closeItem(
                  item.key,
                  pendingTriggerPressKeyRef.current === item.key
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
                  role="button"
                  tabIndex={item.disabled ? -1 : 0}
                  aria-expanded={open}
                  active={active}
                  activeSource={active ? 'pointer' : null}
                  selected={selected}
                  selectionAppearance={selectionAppearance}
                  open={open}
                  tone={item.tone}
                  dragging={drag.dragging}
                  disabled={item.disabled}
                  highlightedClassName={item.highlightedClassName}
                  accessory={item.accessory}
                  start={(
                    <Handle
                      ariaLabel={item.handleAriaLabel}
                      icon={item.handleIcon}
                      onActive={() => setActiveKey(item.key)}
                      attributes={drag.handle.attributes}
                      listeners={drag.handle.listeners}
                      setActivatorNodeRef={drag.handle.setActivatorNodeRef}
                    />
                  )}
                  label={item.label}
                  leading={item.leading}
                  suffix={item.suffix}
                  trailing={item.trailing}
                  className={item.className}
                  onPointerDown={event => {
                    if (event.button !== 0 || !open) {
                      return
                    }

                    pendingTriggerPressKeyRef.current = item.key
                  }}
                  onMouseEnter={() => {
                    setActiveKey(item.key)
                  }}
                  onFocusCapture={() => {
                    setActiveKey(item.key)
                  }}
                  onClick={() => {
                    setActiveKey(item.key)
                  }}
                  onKeyDown={event => {
                    if (item.disabled || !handleActivationKey(event)) {
                      return
                    }

                    event.preventDefault()
                    event.stopPropagation()

                    if (open) {
                      closeItem(item.key, 'keyboard')
                      return
                    }

                    setOpenItemKey(item.key)
                  }}
                />
              </Popover.Trigger>
              <Popover.Content
                initialFocus={-1}
                size={item.size ?? 'md'}
                padding={item.padding ?? 'panel'}
                contentClassName={item.contentClassName}
              >
                <div className="flex max-h-[72vh] flex-col">
                  {renderContent(item.content)}
                </div>
              </Popover.Content>
            </Popover>
          )
        }}
      />
    </div>
  )
}
