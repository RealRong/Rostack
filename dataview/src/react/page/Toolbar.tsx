import {
  ArrowUpDown,
  Filter,
  Plus,
  Search,
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type {
  GroupView,
  GroupViewType
} from '@dataview/core/contracts'
import { Button } from '@ui/button'
import { Input } from '@ui/input'
import { Label } from '@ui/label'
import { Popover } from '@ui/popover'
import { Select } from '@ui/select'
import { cn } from '@ui/utils'
import { getAvailableFilterProperties } from '@dataview/react/page/features/filter/filterUi'
import { getAvailableSorterProperties } from '@dataview/react/page/features/sort'
import { PropertyPicker } from '@dataview/react/page/features/viewQuery/PropertyPicker'
import { ViewSettingsPopover } from '@dataview/react/page/features/viewSettings'
import {
  useActiveView,
  useEngine,
  usePageActions,
  usePageValue,
  useProperties,
  useViews
} from '@dataview/react/editor'
import { meta, renderMessage } from '@dataview/meta'

interface CreateViewPopoverProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

const CreateViewPopover = (props: CreateViewPopoverProps) => {
  const engine = useEngine()
  const page = usePageActions()
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [name, setName] = useState('')
  const [type, setType] = useState<GroupViewType>('table')

  return (
    <Popover
      open={props.open}
      onOpenChange={open => {
        props.onOpenChange(open)
        if (!open) {
          setName('')
          setType('table')
        }
      }}
      initialFocus={inputRef}
      surface="blocking"
      backdrop="transparent"
      trigger={(
        <Button
          size="icon"
          pressed={props.open}
          aria-label={renderMessage(meta.ui.toolbar.newView)}
        >
          <Plus className="size-4" size={15} strokeWidth={1} />
        </Button>
      )}
      contentClassName="w-[320px]"
    >
      <div className="flex flex-col gap-4">
        <div className="space-y-1">
          <h3 className="text-sm font-semibold">
            {renderMessage(meta.ui.toolbar.createView.title)}
          </h3>
          <p className="text-xs text-muted-foreground">
            {renderMessage(meta.ui.toolbar.createView.description)}
          </p>
        </div>

        <div className="space-y-2">
          <Label>{renderMessage(meta.ui.toolbar.createView.nameLabel)}</Label>
          <Input
            ref={inputRef}
            value={name}
            onChange={event => setName(event.target.value)}
            placeholder={renderMessage(meta.ui.toolbar.createView.namePlaceholder)}
          />
        </div>

        <div className="space-y-2">
          <Label>{renderMessage(meta.ui.toolbar.createView.typeLabel)}</Label>
          <Select
            value={type}
            onChange={event => setType(event.target.value as GroupViewType)}
          >
            {meta.view.list.map(item => (
              <option key={item.id} value={item.id}>{renderMessage(item.message)}</option>
            ))}
          </Select>
        </div>

        <div className="flex items-center justify-end gap-2">
          <Button
            type="button"
            variant="secondary"
            onClick={() => props.onOpenChange(false)}
          >
            {renderMessage(meta.ui.toolbar.createView.close)}
          </Button>
          <Button
            type="button"
            disabled={!name.trim()}
            onClick={() => {
              const viewId = engine.views.create({
                name,
                type
              })
              if (!viewId) {
                return
              }

              page.setActiveViewId(viewId)

              setName('')
              setType('table')
              props.onOpenChange(false)
            }}
          >
            {renderMessage(meta.ui.toolbar.createView.create)}
          </Button>
        </div>
      </div>
    </Popover>
  )
}

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
  const engine = useEngine()
  const page = usePageActions()
  const queryBar = usePageValue(state => state.query)
  const properties = useProperties()
  const views = useViews()
  const currentView = useActiveView()
  const currentViewDomain = currentView
    ? engine.view(currentView.id)
    : undefined
  const [createOpen, setCreateOpen] = useState(false)
  const searchInputRef = useRef<HTMLInputElement | null>(null)
  const searchQuery = currentView?.query.search.query ?? ''
  const filterRules = currentView?.query.filter.rules ?? []
  const sorters = currentView?.query.sorters ?? []
  const availableFilterProperties = getAvailableFilterProperties(properties, filterRules)
  const availableSorterProperties = getAvailableSorterProperties(properties, sorters)
  const filterCount = filterRules.length
  const sortCount = sorters.length
  const [searchExpanded, setSearchExpanded] = useState(() => Boolean(searchQuery.trim()))

  useEffect(() => {
    setSearchExpanded(Boolean(currentView?.query.search.query.trim()))
  }, [currentView?.id, currentView?.query.search.query])

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
          <CreateViewPopover
            open={createOpen}
            onOpenChange={setCreateOpen}
          />
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
              open={queryBar.route?.kind === 'addFilter'}
              onOpenChange={open => {
                if (open) {
                  page.query.open({
                    kind: 'addFilter'
                  })
                  return
                }

                page.query.close()
              }}
              initialFocus={-1}
              surface="blocking"
              backdrop="transparent"
              trigger={(
                <Button
                  size="icon"
                  pressed={queryBar.route?.kind === 'addFilter'}
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
                    page.query.open({
                      kind: 'filter',
                      propertyId
                    })
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
              open={queryBar.route?.kind === 'addSort'}
              onOpenChange={open => {
                if (open) {
                  page.query.open({
                    kind: 'addSort'
                  })
                  return
                }

                page.query.close()
              }}
              initialFocus={-1}
              surface="blocking"
              backdrop="transparent"
              trigger={(
                <Button
                  size="icon"
                  pressed={queryBar.route?.kind === 'addSort'}
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
                    page.query.open({
                      kind: 'sort'
                    })
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
