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
import { createNodes } from './dom/registry'
import type { TableLayout } from './layout'
import {
  createTableController,
  type TableController
} from './controller'

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
    () => createNodes(),
    []
  )
  const layout = useMemo<TableLayout>(() => ({
    rowHeight: props.rowHeight,
    headerHeight: props.headerHeight,
    containerRef,
    canvasRef
  }), [props.headerHeight, props.rowHeight])
  const table = useMemo(() => createTableController({
    engine,
    pageStore: dataView.page.store,
    currentViewStore: dataView.currentView.store,
    valueEditor: dataView.valueEditor,
    layout,
    nodes
  }), [
    dataView.currentView.store,
    dataView.page.store,
    dataView.valueEditor,
    engine,
    layout,
    nodes
  ])

  useEffect(() => table.dispose, [table])

  return createElement(TableContext.Provider, { value: table }, props.children)
}
