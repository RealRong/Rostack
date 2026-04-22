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
  const nodes = useMemo(() => createNodes(), [])
  const layout = useMemo<TableLayout>(() => ({
    rowHeight: props.rowHeight,
    headerHeight: props.headerHeight,
    containerRef,
    canvasRef
  }), [props.headerHeight, props.rowHeight])
  const table = useMemo(() => createTableController({
    engine,
    tableRuntime: dataView.table,
    pageStore: dataView.session.page.store,
    model: dataView.model.table,
    selection: dataView.session.selection,
    selectionMembershipStore: dataView.session.selection.store.membership,
    previewSelectionMembershipStore: dataView.session.marquee.preview.membership,
    marqueeActiveStore: dataView.session.marquee.activeStore,
    valueEditor: dataView.session.editing.valueEditor,
    layout,
    nodes
  }), [
    dataView.session.page.store,
    dataView.model.table,
    dataView.session.selection.store.membership,
    dataView.session.marquee.preview.membership,
    dataView.session.marquee.activeStore,
    dataView.session.selection,
    dataView.session.editing.valueEditor,
    dataView.table,
    engine,
    layout,
    nodes
  ])

  useEffect(() => table.dispose, [table])

  return createElement(TableContext.Provider, { value: table }, props.children)
}
