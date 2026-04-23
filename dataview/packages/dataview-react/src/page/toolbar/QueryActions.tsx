import {
  ArrowUpDown,
  Filter,
  Search,
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Button } from '@shared/ui/button'
import { Popover } from '@shared/ui/popover'
import { cn } from '@shared/ui/utils'
import { FieldPicker } from '@dataview/react/field/picker'
import { ViewSettingsPopover } from '@dataview/react/page/features/viewSettings'
import {
  useDataView,
  usePageRuntime
} from '@dataview/react/dataview'
import { meta } from '@dataview/meta'
import { useTranslation } from '@shared/i18n/react'
import {
  useStoreValue
} from '@shared/react'

type ToolbarRoute = null | 'addFilter' | 'addSort'

export const ToolbarQueryActions = () => {
  const { t } = useTranslation()
  const dataView = useDataView()
  const engine = dataView.engine
  const page = dataView.session.page
  const pageRuntime = usePageRuntime()
  const toolbar = useStoreValue(pageRuntime.toolbar)
  const sortPanel = useStoreValue(pageRuntime.sortPanel)
  const currentView = toolbar.activeView
  const currentViewDomain = currentView
    ? engine.active
    : undefined
  const searchInputRef = useRef<HTMLInputElement | null>(null)
  const searchQuery = toolbar.search
  const filterCount = toolbar.filterCount
  const sortCount = toolbar.sortCount
  const queryBar = toolbar.queryBar
  const [searchExpanded, setSearchExpanded] = useState(() => Boolean(searchQuery.trim()))
  const [toolbarRoute, setToolbarRoute] = useState<ToolbarRoute>(null)

  useEffect(() => {
    setSearchExpanded(Boolean(searchQuery.trim()))
  }, [currentView?.id])

  useEffect(() => {
    setToolbarRoute(null)
  }, [currentView?.id])

  return (
    <div className="flex shrink-0 items-center gap-1">
      <div className="flex items-center overflow-hidden">
        <Button
          size="icon"
          aria-label={t(meta.ui.toolbar.search)}
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
            placeholder={t(meta.ui.toolbar.search)}
            className="h-9 w-full border-0 bg-transparent px-0 shadow-none outline-none"
          />
        </div>
      </div>

      {filterCount ? (
        <Button
          size="icon"
          pressed
          title={t(meta.ui.toolbar.filterButton(filterCount))}
          aria-label={t(meta.ui.toolbar.filterButton(filterCount))}
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
              title={t(meta.ui.toolbar.filter)}
              aria-label={t(meta.ui.toolbar.filter)}
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
                fields={toolbar.availableFilterFields}
                emptyMessage={meta.ui.fieldPicker.allFiltered}
                onSelect={fieldId => {
                  if (!currentViewDomain) {
                    return
                  }

                  const id = currentViewDomain.filters.create(fieldId)
                  setToolbarRoute(null)
                  page.query.open({
                    kind: 'filter',
                    id
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
          pressed
          title={t(meta.ui.toolbar.sortButton(sortCount))}
          aria-label={t(meta.ui.toolbar.sortButton(sortCount))}
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
              title={t(meta.ui.toolbar.sort)}
              aria-label={t(meta.ui.toolbar.sort)}
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
                fields={sortPanel.availableFields}
                emptyMessage={meta.ui.fieldPicker.allSorted}
                onSelect={fieldId => {
                  if (!currentViewDomain) {
                    return
                  }

                  const id = currentViewDomain.sort.create(fieldId)
                  setToolbarRoute(null)
                  page.query.open({
                    kind: 'sort',
                    id
                  })
                }}
              />
            </div>
          </Popover.Content>
        </Popover>
      )}

      <ViewSettingsPopover />
    </div>
  )
}
