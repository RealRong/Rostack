import {
  ArrowUpDown,
  Copy,
  Filter,
  Settings2,
  Search,
  SquarePen,
  Trash2,
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type {
  View,
  ViewId
} from '@dataview/core/contracts'
import {
  getDocumentFields,
  getDocumentViews
} from '@dataview/core/document'
import { Button } from '@ui/button'
import { Menu, type MenuItem } from '@ui/menu'
import { Popover } from '@ui/popover'
import { cn } from '@ui/utils'
import { FieldPicker } from '@dataview/react/field/picker'
import { CreateViewPopover } from '@dataview/react/page/features/createView'
import { getAvailableFilterFields } from '@dataview/react/page/features/filter/filterUi'
import { getAvailableSorterFields } from '@dataview/react/page/features/sort'
import { ViewSettingsPopover } from '@dataview/react/page/features/viewSettings'
import {
  useDataView,
  useDataViewValue,
} from '@dataview/react/dataview'
import { meta, renderMessage } from '@dataview/meta'

interface ViewTabProps {
  view: View
  active: boolean
  onClick: () => void
  menuOpen: boolean
  canRemove: boolean
  onOpenMenu: () => void
  onCloseMenu: () => void
  onRename: () => void
  onEdit: () => void
  onDuplicate: () => void
  onRemove: () => void
}

const ViewTab = (props: ViewTabProps) => {
  const viewType = meta.view.get(props.view.type)
  const Icon = viewType.Icon
  const items: readonly MenuItem[] = [
    {
      kind: 'action',
      key: 'rename',
      label: '重命名',
      leading: <SquarePen className="size-4" size={16} strokeWidth={1.8} />,
      onSelect: props.onRename
    },
    {
      kind: 'action',
      key: 'edit',
      label: '编辑视图',
      leading: <Settings2 className="size-4" size={16} strokeWidth={1.8} />,
      onSelect: props.onEdit
    },
    {
      kind: 'divider',
      key: 'divider-actions'
    },
    {
      kind: 'action',
      key: 'duplicate',
      label: '创建视图副本',
      leading: <Copy className="size-4" size={16} strokeWidth={1.8} />,
      onSelect: props.onDuplicate
    },
    {
      kind: 'action',
      key: 'remove',
      label: '删除视图',
      leading: <Trash2 className="size-4" size={16} strokeWidth={1.8} />,
      tone: 'destructive',
      disabled: !props.canRemove,
      onSelect: props.onRemove
    }
  ]

  return (
    <div className="relative shrink-0">
      <Menu.Dropdown
        open={props.menuOpen}
        onOpenChange={open => {
          if (open) {
            props.onOpenMenu()
            return
          }

          props.onCloseMenu()
        }}
        initialFocus={0}
        placement="bottom-start"
        mode="blocking"
        backdrop="transparent"
        items={items}
        autoFocus={false}
        size="md"
        trigger={(
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-0"
          />
        )}
      />
      <button
        type="button"
        onClick={props.onClick}
        onContextMenu={event => {
          event.preventDefault()
          event.stopPropagation()
          props.onOpenMenu()
        }}
        className={cn(
          'inline-flex h-9 shrink-0 select-none items-center gap-2 rounded-3xl bg-transparent px-4 font-semibold text-fg-muted transition-[background-color,color] hover:bg-hover hover:text-fg',
          props.active && 'bg-pressed text-fg hover:bg-pressed'
        )}
      >
        <Icon className="shrink-0" size={16} strokeWidth={1.5} />
        <span className="truncate">{props.view.name}</span>
      </button>
    </div>
  )
}

export interface PageToolbarProps { }

export const PageToolbar = () => {
  const dataView = useDataView()
  const engine = dataView.engine
  const page = dataView.page
  const document = useDataViewValue(dataView => dataView.engine.read.document)
  const queryBar = useDataViewValue(
    dataView => dataView.page.store,
    state => state.query
  )
  const fields = getDocumentFields(document)
  const views = getDocumentViews(document)
  const currentView = useDataViewValue(
    dataView => dataView.engine.active.view
  )
  const searchProjection = useDataViewValue(
    dataView => dataView.engine.active.state,
    state => state?.query.search
  )
  const filterProjection = useDataViewValue(
    dataView => dataView.engine.active.state,
    state => state?.query.filter
  )
  const sortProjection = useDataViewValue(
    dataView => dataView.engine.active.state,
    state => state?.query.sort
  )
  const currentViewDomain = currentView
    ? engine.active
    : undefined
  const searchInputRef = useRef<HTMLInputElement | null>(null)
  const searchQuery = searchProjection?.query ?? ''
  const filterRules = filterProjection?.rules ?? []
  const sorters = sortProjection?.rules ?? []
  const availableFilterFields = getAvailableFilterFields(
    fields,
    filterRules.map(entry => entry.rule)
  )
  const availableSorterFields = getAvailableSorterFields(
    fields,
    sorters.map(entry => entry.sorter)
  )
  const filterCount = filterRules.length
  const sortCount = sorters.length
  const [searchExpanded, setSearchExpanded] = useState(() => Boolean(searchQuery.trim()))
  const [toolbarRoute, setToolbarRoute] = useState<null | 'addFilter' | 'addSort'>(null)
  const [tabMenuViewId, setTabMenuViewId] = useState<ViewId | null>(null)

  useEffect(() => {
    setSearchExpanded(Boolean(searchQuery.trim()))
  }, [currentView?.id])

  useEffect(() => {
    setToolbarRoute(null)
  }, [currentView?.id])

  useEffect(() => {
    if (tabMenuViewId && !views.some(view => view.id === tabMenuViewId)) {
      setTabMenuViewId(null)
    }
  }, [tabMenuViewId, views])

  return (
    <section className="text-card-foreground">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto pr-2">
          {views.map(view => (
            <ViewTab
              key={view.id}
              view={view}
              active={view.id === currentView?.id}
              menuOpen={tabMenuViewId === view.id}
              canRemove={views.length > 1}
              onClick={() => engine.views.open(view.id)}
              onOpenMenu={() => setTabMenuViewId(view.id)}
              onCloseMenu={() => {
                setTabMenuViewId(current => (
                  current === view.id
                    ? null
                    : current
                ))
              }}
              onRename={() => {
                setTabMenuViewId(null)
                engine.views.open(view.id)
                page.settings.open({
                  kind: 'root',
                  focusTarget: 'viewName'
                })
              }}
              onEdit={() => {
                setTabMenuViewId(null)
                engine.views.open(view.id)
                page.settings.open({
                  kind: 'root'
                })
              }}
              onDuplicate={() => {
                setTabMenuViewId(null)
                engine.views.duplicate(view.id)
              }}
              onRemove={() => {
                if (views.length <= 1) {
                  return
                }

                setTabMenuViewId(null)
                engine.views.remove(view.id)
              }}
            />
          ))}
          <CreateViewPopover />
        </div>

        <div className="flex shrink-0 items-center gap-1">
          <div className="flex items-center overflow-hidden">
            <Button
              size="icon"
              aria-label={renderMessage(meta.ui.toolbar.search)}
              onClick={() => {
                setSearchExpanded(true)
                window.requestAnimationFrame(() => {
                  searchInputRef.current?.focus()
                  searchInputRef.current?.select()
                })
              }}
            >
              <Search className="size-4" size={15} strokeWidth={1} />
            </Button>
            <div
              className={cn(
                'overflow-hidden transition-[width,margin,opacity] duration-150 ease-out',
                searchExpanded ? 'ml-1 w-[180px] opacity-100' : 'pointer-events-none w-0 opacity-0'
              )}
            >
              <input
                ref={searchInputRef}
                value={searchQuery}
                onChange={event => {
                  currentViewDomain?.search.set(event.target.value)
                }}
                onKeyDown={event => {
                  if (event.key !== 'Escape') {
                    return
                  }

                  event.preventDefault()
                  event.stopPropagation()
                  setSearchExpanded(false)
                  event.currentTarget.blur()
                }}
                onBlur={() => {
                  setSearchExpanded(false)
                }}
                placeholder={renderMessage(meta.ui.toolbar.search)}
                className="h-9 w-full outline-none border-0 bg-transparent px-0 shadow-none"
              />
            </div>
          </div>
          {filterCount ? (
            <Button
              size="icon"
              pressed={Boolean(filterCount)}
              title={renderMessage(meta.ui.toolbar.filterButton(filterCount))}
              aria-label={renderMessage(meta.ui.toolbar.filterButton(filterCount))}
              disabled={!currentView}
              onClick={() => {
                if (queryBar.visible) {
                  page.query.hide()
                  return
                }

                page.query.show()
              }}
            >
              <Filter className="size-4" size={15} strokeWidth={1} />
            </Button>
          ) : (
            <Popover
              open={toolbarRoute === 'addFilter'}
              onOpenChange={open => {
                if (open) {
                  setToolbarRoute('addFilter')
                  return
                }

                setToolbarRoute(current => (
                  current === 'addFilter'
                    ? null
                    : current
                ))
              }}
              mode="blocking"
              backdrop="transparent"
            >
              <Popover.Trigger>
                <Button
                  size="icon"
                  pressed={toolbarRoute === 'addFilter'}
                  title={renderMessage(meta.ui.toolbar.filter)}
                  aria-label={renderMessage(meta.ui.toolbar.filter)}
                  disabled={!currentView}
                >
                  <Filter className="size-4" size={15} strokeWidth={1} />
                </Button>
              </Popover.Trigger>
              <Popover.Content
                initialFocus={-1}
                size="xl"
                padding="none"
              >
                <div className="flex max-h-[72vh] flex-col">
                  <FieldPicker
                    fields={availableFilterFields}
                    emptyMessage={meta.ui.fieldPicker.allFiltered}
                    onSelect={fieldId => {
                      currentViewDomain?.filter.add(fieldId)
                      setToolbarRoute(null)
                      page.query.open({
                        kind: 'filter',
                        fieldId
                      })
                    }}
                  />
                </div>
              </Popover.Content>
            </Popover>
          )}
          {sortCount ? (
            <Button
              size="icon"
              pressed={Boolean(sortCount)}
              title={renderMessage(meta.ui.toolbar.sortButton(sortCount))}
              aria-label={renderMessage(meta.ui.toolbar.sortButton(sortCount))}
              disabled={!currentView}
              onClick={() => {
                if (queryBar.visible) {
                  page.query.hide()
                  return
                }

                page.query.show()
              }}
            >
              <ArrowUpDown className="size-4" size={15} strokeWidth={1} />
            </Button>
          ) : (
            <Popover
              open={toolbarRoute === 'addSort'}
              onOpenChange={open => {
                if (open) {
                  setToolbarRoute('addSort')
                  return
                }

                setToolbarRoute(current => (
                  current === 'addSort'
                    ? null
                    : current
                ))
              }}
              mode="blocking"
              backdrop="transparent"
            >
              <Popover.Trigger>
                <Button
                  size="icon"
                  pressed={toolbarRoute === 'addSort'}
                  title={renderMessage(meta.ui.toolbar.sort)}
                  aria-label={renderMessage(meta.ui.toolbar.sort)}
                  disabled={!currentView}
                >
                  <ArrowUpDown className="size-4" size={15} strokeWidth={1} />
                </Button>
              </Popover.Trigger>
              <Popover.Content
                initialFocus={-1}
                size="xl"
                padding="none"
              >
                <div className="flex max-h-[72vh] flex-col">
                  <FieldPicker
                    fields={availableSorterFields}
                    emptyMessage={meta.ui.fieldPicker.allSorted}
                    onSelect={fieldId => {
                      currentViewDomain?.sort.add(fieldId)
                      setToolbarRoute(null)
                      page.query.open({
                        kind: 'sort'
                      })
                    }}
                  />
                </div>
              </Popover.Content>
            </Popover>
          )}
          <ViewSettingsPopover />
        </div>
      </div>
    </section>
  )
}
