import { useCallback, useMemo, useState } from 'react'
import { Popover } from '../popover'
import { VerticalReorderList } from '../vertical-reorder-list'
import {
  DROPDOWN_SUBMENU_OFFSET,
  SUBMENU_OFFSET,
  normalizeValue,
  renderContent,
  resolvePresentation,
  toValueResult,
  toggleSelection
} from './shared'
import {
  ButtonRow,
  Handle,
  SurfaceRow,
  handleActivationKey
} from './row'
import type { ReorderProps } from './types'

export const Reorder = (props: ReorderProps) => {
  const selectionMode = props.selectionMode ?? 'none'
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
          const active = activeKey === item.key || selected || open
          const presentation = resolvePresentation(item)
          const hasContent = item.content !== undefined

          const row = (
            <SurfaceRow
              role="button"
              tabIndex={item.disabled ? -1 : 0}
              aria-expanded={hasContent ? open : undefined}
              active={active}
              tone={item.tone}
              dragging={drag.dragging}
              disabled={item.disabled}
              className={item.className}
              onMouseEnter={() => {
                setActiveKey(item.key)
              }}
              onFocus={() => {
                setActiveKey(item.key)
              }}
              onClick={() => {
                setActiveKey(item.key)

                if (hasContent) {
                  return
                }

                toggleValue(item.key)
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

                if (hasContent) {
                  setOpenItemKey(open ? null : item.key)
                  return
                }

                toggleValue(item.key)
                item.onSelect?.()
                if (item.closeOnSelect !== false) {
                  props.onClose?.()
                }
              }}
            >
              <Handle
                ariaLabel={item.handleAriaLabel}
                icon={item.handleIcon}
                onActive={() => setActiveKey(item.key)}
                attributes={drag.handle.attributes}
                listeners={drag.handle.listeners}
                setActivatorNodeRef={drag.handle.setActivatorNodeRef}
              />

              <div className="min-w-0 flex-1">
                <ButtonRow
                  label={item.label}
                  leading={item.leading}
                  suffix={item.suffix}
                  trailing={item.trailing}
                  tone={item.tone}
                  disabled={item.disabled}
                  active={active}
                  surface="ghost"
                  className="bg-transparent px-1.5 hover:bg-transparent"
                  onMouseEnter={() => {
                    setActiveKey(item.key)
                  }}
                  onFocus={() => {
                    setActiveKey(item.key)
                  }}
                />
              </div>
            </SurfaceRow>
          )

          if (!hasContent) {
            return row
          }

          return (
            <Popover
              open={open}
              onOpenChange={nextOpen => {
                setOpenItemKey(nextOpen ? item.key : null)
              }}
              kind="menu"
              placement={item.placement ?? (presentation === 'dropdown' ? 'bottom-end' : 'right-start')}
              offset={item.offset ?? (presentation === 'dropdown' ? DROPDOWN_SUBMENU_OFFSET : SUBMENU_OFFSET)}
              initialFocus={-1}
              size={item.size ?? 'md'}
              padding={item.padding ?? 'panel'}
              contentClassName={item.contentClassName}
              trigger={row}
            >
              <div className="flex max-h-[72vh] flex-col">
                {renderContent(item.content)}
              </div>
            </Popover>
          )
        }}
      />
    </div>
  )
}

