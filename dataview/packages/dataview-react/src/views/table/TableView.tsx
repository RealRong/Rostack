import { TableProvider } from '#react/views/table/context.tsx'
import { Body } from '#react/views/table/components/body/Body.tsx'

const DEFAULT_ROW_HEIGHT = 36
const DEFAULT_HEADER_HEIGHT = 32

export interface TableViewProps {
  rowHeight?: number
}

export const TableView = (props: TableViewProps) => {
  const rowHeight = props.rowHeight ?? DEFAULT_ROW_HEIGHT
  const headerHeight = DEFAULT_HEADER_HEIGHT

  return (
    <TableProvider
      rowHeight={rowHeight}
      headerHeight={headerHeight}
    >
      <Body />
    </TableProvider>
  )
}
