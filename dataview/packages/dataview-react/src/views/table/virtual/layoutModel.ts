import type { ViewState as CurrentView, ItemId } from '@dataview/engine'
import {
  createItemArraySelectionScope,
  createItemListSelectionScope,
  type SelectionScope
} from '@dataview/react/runtime/selection'
import type {
  TableBlock,
  TableColumnFooterBlock,
  TableColumnHeaderBlock,
  TableRowBlock,
  TableSectionHeaderBlock
} from '@dataview/react/views/table/virtual/types'

interface TableBlockDescriptorBase {
  key: string
  kind: TableBlock['kind']
  estimatedHeight: number
}

interface TableRowDescriptor extends TableBlockDescriptorBase {
  kind: 'row'
  rowId: ItemId
}

interface TableColumnHeaderDescriptor extends TableBlockDescriptorBase {
  kind: 'column-header'
  scopeId: string
  scope: SelectionScope<ItemId>
  label?: string
}

interface TableColumnFooterDescriptor extends TableBlockDescriptorBase {
  kind: 'column-footer'
  scopeId: string
}

interface TableSectionHeaderDescriptor extends TableBlockDescriptorBase {
  kind: 'section-header'
  section: CurrentView['sections']['all'][number]
}

export type TableBlockDescriptor =
  | TableRowDescriptor
  | TableColumnHeaderDescriptor
  | TableColumnFooterDescriptor
  | TableSectionHeaderDescriptor

export interface TableWindowProjection {
  items: readonly TableBlock[]
  totalHeight: number
  startIndex: number
  endIndex: number
  startTop: number
}

class FenwickTree {
  private readonly values: number[]
  private readonly tree: number[]

  constructor(values: readonly number[]) {
    this.values = [...values]
    this.tree = new Array(values.length + 1).fill(0)

    values.forEach((value, index) => {
      this.add(index, value)
    })
  }

  valueAt(index: number) {
    return this.values[index] ?? 0
  }

  prefixSum(count: number) {
    let sum = 0
    let cursor = Math.max(0, Math.min(count, this.values.length))

    while (cursor > 0) {
      sum += this.tree[cursor] ?? 0
      cursor -= cursor & -cursor
    }

    return sum
  }

  total() {
    return this.prefixSum(this.values.length)
  }

  set(index: number, next: number) {
    const previous = this.values[index]
    if (previous === undefined || previous === next) {
      return false
    }

    this.values[index] = next
    this.add(index, next - previous)
    return true
  }

  lowerBound(target: number) {
    if (target <= 0) {
      return 0
    }

    let index = 0
    let accumulated = 0
    let bit = 1

    while (bit < this.tree.length) {
      bit <<= 1
    }

    for (let step = bit >> 1; step > 0; step >>= 1) {
      const next = index + step
      if (
        next < this.tree.length
        && accumulated + (this.tree[next] ?? 0) < target
      ) {
        index = next
        accumulated += this.tree[next] ?? 0
      }
    }

    return Math.min(index, this.values.length)
  }

  private add(index: number, delta: number) {
    for (let cursor = index + 1; cursor < this.tree.length; cursor += cursor & -cursor) {
      this.tree[cursor] = (this.tree[cursor] ?? 0) + delta
    }
  }
}

const materializeBlock = (input: {
  descriptor: TableBlockDescriptor
  top: number
  height: number
}): TableBlock => {
  const measuredHeight = input.height !== input.descriptor.estimatedHeight
    ? input.height
    : undefined

  switch (input.descriptor.kind) {
    case 'row': {
      const block: TableRowBlock = {
        key: input.descriptor.key,
        kind: 'row',
        top: input.top,
        height: input.height,
        estimatedHeight: input.descriptor.estimatedHeight,
        measuredHeight,
        rowId: input.descriptor.rowId
      }
      return block
    }
    case 'column-header': {
      const block: TableColumnHeaderBlock = {
        key: input.descriptor.key,
        kind: 'column-header',
        top: input.top,
        height: input.height,
        estimatedHeight: input.descriptor.estimatedHeight,
        measuredHeight,
        scopeId: input.descriptor.scopeId,
        scope: input.descriptor.scope,
        ...(input.descriptor.label
          ? {
              label: input.descriptor.label
            }
          : {})
      }
      return block
    }
    case 'column-footer': {
      const block: TableColumnFooterBlock = {
        key: input.descriptor.key,
        kind: 'column-footer',
        top: input.top,
        height: input.height,
        estimatedHeight: input.descriptor.estimatedHeight,
        measuredHeight,
        scopeId: input.descriptor.scopeId
      }
      return block
    }
    case 'section-header': {
      const block: TableSectionHeaderBlock = {
        key: input.descriptor.key,
        kind: 'section-header',
        top: input.top,
        height: input.height,
        estimatedHeight: input.descriptor.estimatedHeight,
        measuredHeight,
        section: input.descriptor.section
      }
      return block
    }
  }
}

const buildDescriptors = (input: {
  currentView: CurrentView
  rowHeight: number
  headerHeight: number
}) => {
  const descriptors: TableBlockDescriptor[] = []
  const blockIndexByKey = new Map<string, number>()
  const rowBlockIndexById = new Map<ItemId, number>()

  const push = (descriptor: TableBlockDescriptor) => {
    const index = descriptors.length
    descriptors.push(descriptor)
    blockIndexByKey.set(descriptor.key, index)
    if (descriptor.kind === 'row') {
      rowBlockIndexById.set(descriptor.rowId, index)
    }
  }

  if (!input.currentView.view.group) {
    const scopeId = input.currentView.sections.all[0]?.key ?? 'root'
    push({
      key: 'column-header:flat',
      kind: 'column-header',
      estimatedHeight: input.headerHeight,
      scopeId,
      scope: createItemListSelectionScope({
        key: scopeId,
        items: input.currentView.items
      })
    })
    input.currentView.items.ids.forEach(rowId => {
      push({
        key: `row:${rowId}`,
        kind: 'row',
        estimatedHeight: input.rowHeight,
        rowId
      })
    })
    push({
      key: 'column-footer:flat',
      kind: 'column-footer',
      estimatedHeight: input.headerHeight,
      scopeId
    })
  } else {
    input.currentView.sections.all.forEach(section => {
      push({
        key: `section-header:${section.key}`,
        kind: 'section-header',
        estimatedHeight: input.headerHeight,
        section
      })

      if (section.collapsed) {
        return
      }

      push({
        key: `column-header:${section.key}`,
        kind: 'column-header',
        estimatedHeight: input.headerHeight,
        scopeId: section.key,
        scope: createItemArraySelectionScope({
          key: section.key,
          ids: section.itemIds
        }),
        label: `Select rows in ${section.title}`
      })

      section.itemIds.forEach(rowId => {
        push({
          key: `row:${rowId}`,
          kind: 'row',
          estimatedHeight: input.rowHeight,
          rowId
        })
      })

      push({
        key: `column-footer:${section.key}`,
        kind: 'column-footer',
        estimatedHeight: input.headerHeight,
        scopeId: section.key
      })
    })
  }

  return {
    descriptors,
    blockIndexByKey,
    rowBlockIndexById
  }
}

export class TableLayoutModel {
  readonly descriptors: readonly TableBlockDescriptor[]
  readonly blockIndexByKey: ReadonlyMap<string, number>
  readonly rowBlockIndexById: ReadonlyMap<ItemId, number>

  private readonly defaultHeights: readonly number[]
  private readonly heightTree: FenwickTree

  static fromCurrentView(input: {
    currentView: CurrentView
    rowHeight: number
    headerHeight: number
    measuredHeights?: ReadonlyMap<string, number>
  }) {
    const {
      descriptors,
      blockIndexByKey,
      rowBlockIndexById
    } = buildDescriptors(input)

    const defaultHeights = descriptors.map(descriptor => descriptor.estimatedHeight)
    const resolvedHeights = descriptors.map((descriptor, index) => (
      input.measuredHeights?.get(descriptor.key)
      ?? defaultHeights[index]
      ?? descriptor.estimatedHeight
    ))

    return new TableLayoutModel({
      descriptors,
      blockIndexByKey,
      rowBlockIndexById,
      defaultHeights,
      resolvedHeights
    })
  }

  constructor(input: {
    descriptors: readonly TableBlockDescriptor[]
    blockIndexByKey: ReadonlyMap<string, number>
    rowBlockIndexById: ReadonlyMap<ItemId, number>
    defaultHeights: readonly number[]
    resolvedHeights: readonly number[]
  }) {
    this.descriptors = input.descriptors
    this.blockIndexByKey = input.blockIndexByKey
    this.rowBlockIndexById = input.rowBlockIndexById
    this.defaultHeights = input.defaultHeights
    this.heightTree = new FenwickTree(input.resolvedHeights)
  }

  get totalHeight() {
    return this.heightTree.total()
  }

  materializeWindow(input: {
    start: number
    end: number
  }): TableWindowProjection {
    if (!this.descriptors.length) {
      return {
        items: [],
        totalHeight: 0,
        startIndex: 0,
        endIndex: 0,
        startTop: 0
      }
    }

    const startIndex = this.findStartIndex(input.start)
    if (startIndex >= this.descriptors.length) {
      return {
        items: [],
        totalHeight: this.totalHeight,
        startIndex,
        endIndex: startIndex,
        startTop: this.totalHeight
      }
    }

    const items: TableBlock[] = []
    let top = this.topOfIndex(startIndex)
    let index = startIndex

    for (; index < this.descriptors.length; index += 1) {
      if (index > startIndex && top > input.end) {
        break
      }

      const descriptor = this.descriptors[index]
      if (!descriptor) {
        break
      }

      const height = this.heightTree.valueAt(index)
      items.push(materializeBlock({
        descriptor,
        top,
        height
      }))
      top += height
    }

    return {
      items,
      totalHeight: this.totalHeight,
      startIndex,
      endIndex: index,
      startTop: items[0]?.top ?? this.totalHeight
    }
  }

  locateRow(rowId: ItemId) {
    const index = this.rowBlockIndexById.get(rowId)
    if (index === undefined) {
      return null
    }

    const top = this.topOfIndex(index)
    const height = this.heightTree.valueAt(index)
    return {
      rowId,
      top,
      bottom: top + height
    }
  }

  topOfKey(key: string) {
    const index = this.blockIndexByKey.get(key)
    return index === undefined
      ? null
      : this.topOfIndex(index)
  }

  replaceMeasuredHeights(heightByKey: ReadonlyMap<string, number>) {
    let changed = false

    this.descriptors.forEach((descriptor, index) => {
      changed = this.setResolvedHeight(
        index,
        heightByKey.get(descriptor.key)
      ) || changed
    })

    return changed
  }

  applyMeasuredHeightPatches(input: {
    changedHeights?: ReadonlyMap<string, number>
    removedKeys?: readonly string[]
  }) {
    let changed = false

    input.changedHeights?.forEach((height, key) => {
      const index = this.blockIndexByKey.get(key)
      if (index === undefined) {
        return
      }

      changed = this.setResolvedHeight(index, height) || changed
    })

    input.removedKeys?.forEach(key => {
      const index = this.blockIndexByKey.get(key)
      if (index === undefined) {
        return
      }

      changed = this.setResolvedHeight(index, undefined) || changed
    })

    return changed
  }

  private findStartIndex(start: number) {
    if (!this.descriptors.length || start <= 0) {
      return 0
    }

    return Math.min(
      this.heightTree.lowerBound(start),
      this.descriptors.length
    )
  }

  private topOfIndex(index: number) {
    return this.heightTree.prefixSum(index)
  }

  private setResolvedHeight(index: number, measuredHeight: number | undefined) {
    const fallback = this.defaultHeights[index] ?? 0
    return this.heightTree.set(index, measuredHeight ?? fallback)
  }
}
