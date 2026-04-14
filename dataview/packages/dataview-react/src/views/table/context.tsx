import {
  createContext,
  createElement,
  useEffect,
  useContext,
  useMemo,
  useRef,
  type ReactNode
} from 'react'
import { useDataView } from '@dataview/react/dataview'
import { createNodes } from '@dataview/react/views/table/dom/registry'
import {
  contentBounds,
  type TableLayout
} from '@dataview/react/views/table/layout'
import {
  createTableController,
  type TableController
} from '@dataview/react/views/table/controller'

interface TableProviderProps {
  rowHeight: number
  headerHeight: number
  children?: ReactNode
}

const TableContext = createContext<TableController | null>(null)

export const useTableContext = (): TableController => {
  const value = useContext(TableContext)
  if (!value) {
    throw new Error('Missing table provider.')
  }
  return value
}

export const TableProvider = (props: TableProviderProps) => {
  const dataView = useDataView()
  const engine = dataView.engine
  const containerRef = useRef<HTMLDivElement | null>(null)
  const canvasRef = useRef<HTMLDivElement | null>(null)
  const nodes = useMemo(
    () => createNodes({
      resolveContainer: () => containerRef.current,
      resolveHorizontalBounds: () => contentBounds({
        container: containerRef.current,
        canvas: canvasRef.current
      })
    }),
    [canvasRef, containerRef]
  )
  const layout = useMemo<TableLayout>(() => ({
    rowHeight: props.rowHeight,
    headerHeight: props.headerHeight,
    containerRef,
    canvasRef
  }), [props.headerHeight, props.rowHeight])
  const currentView = engine.active.state
  const table = useMemo(() => createTableController({
    engine,
    pageStore: dataView.page.store,
    currentViewStore: currentView,
    selectionStore: dataView.selection.store,
    marqueeStore: dataView.marquee.store,
    valueEditor: dataView.valueEditor,
    layout,
    nodes
  }), [
    dataView.marquee.store,
    dataView.page.store,
    dataView.selection.store,
    dataView.valueEditor,
    currentView,
    engine,
    layout,
    nodes
  ])

  useEffect(() => table.dispose, [table])

  return createElement(TableContext.Provider, { value: table }, props.children)
}
