import {
  ArrowUpDown,
  Filter,
  Search,
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type {
  GroupView
} from '@dataview/core/contracts'
import {
  getDocumentProperties,
  getDocumentViews
} from '@dataview/core/document'
import { Button } from '@ui/button'
import { Input } from '@ui/input'
import { Popover } from '@ui/popover'
import { cn } from '@ui/utils'
import { CreateViewPopover } from '@dataview/react/page/features/createView'
import { getAvailableFilterProperties } from '@dataview/react/page/features/filter/filterUi'
import { getAvailableSorterProperties } from '@dataview/react/page/features/sort'
import { PropertyPicker } from '@dataview/react/page/features/viewQuery/PropertyPicker'
import { ViewSettingsPopover } from '@dataview/react/page/features/viewSettings'
import {
  useCurrentView,
  useDataView,
  useDocument,
  usePageValue,
} from '@dataview/react/dataview'
import { meta, renderMessage } from '@dataview/meta'

interface ViewTabProps {
  view: GroupView
  active: boolean
  onClick: () => void
}

const ViewTab = (props: ViewTabProps) => {
  const viewType = meta.view.get(props.view.type)
  const Icon = viewType.Icon

  return (
    <button
      type="button"
      onClick={props.onClick}
      className={cn(
        'ui-view-tab inline-flex h-9 shrink-0 items-center gap-2 rounded-3xl font-semibold px-4 transition-colors',
        props.active && 'ui-view-tab--active'
      )}
    >
      <Icon className="shrink-0" size={16} strokeWidth={1.5} />
      <span className="truncate">{props.view.name}</span>
    </button>
  )
}

export interface PageToolbarProps { }

export const PageToolbar = () => {
  const dataView = useDataView()
  const engine = dataView.engine
  const page = dataView.page
  const document = useDocument()
  const queryBar = usePageValue(state => state.query)
  const properties = getDocumentProperties(document)
  const views = getDocumentViews(document)
  const currentView = useCurrentView(view => view?.view)
  const currentViewDomain = currentView
    ? engine.view(currentView.id)
    : undefined
  const searchInputRef = useRef<HTMLInputElement | null>(null)
  const searchQuery = currentView?.query.search.query ?? ''
  const filterRules = currentView?.query.filter.rules ?? []
  const sorters = currentView?.query.sorters ?? []
  const availableFilterProperties = getAvailableFilterProperties(properties, filterRules)
  const availableSorterProperties = getAvailableSorterProperties(properties, sorters)
  const filterCount = filterRules.length
  const sortCount = sorters.length
  const [searchExpanded, setSearchExpanded] = useState(() => Boolean(searchQuery.trim()))
  const [toolbarRoute, setToolbarRoute] = useState<null | 'addFilter' | 'addSort'>(null)

  useEffect(() => {
    setSearchExpanded(Boolean(currentView?.query.search.query.trim()))
  }, [currentView?.id, currentView?.query.search.query])

  useEffect(() => {
    setToolbarRoute(null)
  }, [currentView?.id])

  return (
    <section className="text-card-foreground">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto pr-2">
          {views.map(view => (
            <ViewTab
              key={view.id}
              view={view}
              active={view.id === currentView?.id}
              onClick={() => page.setActiveViewId(view.id)}
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
              <Input
                ref={searchInputRef}
                value={searchQuery}
                onChange={event => {
                  currentViewDomain?.search.setQuery(event.target.value)
                }}
                onBlur={() => {
                  if (!searchQuery.trim()) {
                    setSearchExpanded(false)
                  }
                }}
                placeholder={renderMessage(meta.ui.toolbar.search)}
                className="h-9 w-full border-0 bg-transparent px-0 shadow-none"
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
              initialFocus={-1}
              surface="blocking"
              backdrop="transparent"
              trigger={(
                <Button
                  size="icon"
                  pressed={toolbarRoute === 'addFilter'}
                  title={renderMessage(meta.ui.toolbar.filter)}
                  aria-label={renderMessage(meta.ui.toolbar.filter)}
                  disabled={!currentView}
                >
                  <Filter className="size-4" size={15} strokeWidth={1} />
                </Button>
              )}
              contentClassName="w-[280px] p-0"
            >
              <div className="flex max-h-[72vh] flex-col">
                <PropertyPicker
                  properties={availableFilterProperties}
                  emptyMessage={meta.ui.fieldPicker.allFiltered}
                  onSelect={propertyId => {
                    currentViewDomain?.filters.add(propertyId)
                    setToolbarRoute(null)
                  }}
                />
              </div>
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
              initialFocus={-1}
              surface="blocking"
              backdrop="transparent"
              trigger={(
                <Button
                  size="icon"
                  pressed={toolbarRoute === 'addSort'}
                  title={renderMessage(meta.ui.toolbar.sort)}
                  aria-label={renderMessage(meta.ui.toolbar.sort)}
                  disabled={!currentView}
                >
                  <ArrowUpDown className="size-4" size={15} strokeWidth={1} />
                </Button>
              )}
              contentClassName="w-[280px] p-0"
            >
              <div className="flex max-h-[72vh] flex-col">
                <PropertyPicker
                  properties={availableSorterProperties}
                  emptyMessage={meta.ui.fieldPicker.allSorted}
                  onSelect={propertyId => {
                    currentViewDomain?.sorters.add(propertyId)
                    setToolbarRoute(null)
                  }}
                />
              </div>
            </Popover>
          )}
          <ViewSettingsPopover />
        </div>
      </div>
    </section>
  )
}
