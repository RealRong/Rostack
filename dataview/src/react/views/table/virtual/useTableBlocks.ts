import { useMemo } from 'react'
import type {
  AppearanceId,
  Section
} from '@dataview/react/runtime/currentView'
import {
  useVirtualBlocks
} from '@dataview/react/virtual'
import { useTableContext } from '../context'
import {
  buildTableBlocks
} from './buildBlocks'

export const useTableBlocks = (input: {
  grouped: boolean
  rowIds: readonly AppearanceId[]
  sections: readonly Section[]
  overscan?: number
}) => {
  const table = useTableContext()
  const blocks = useMemo(() => buildTableBlocks({
    grouped: input.grouped,
    rowIds: input.rowIds,
    sections: input.sections,
    rowHeight: table.layout.rowHeight,
    headerHeight: table.layout.headerHeight
  }), [
    input.grouped,
    input.rowIds,
    input.sections,
    table.layout.headerHeight,
    table.layout.rowHeight
  ])

  return useVirtualBlocks({
    blocks,
    canvasRef: table.layout.canvasRef,
    overscan: input.overscan
  })
}
