import type {
  ItemId,
  SectionKey
} from '@dataview/engine'
import {
  createItemArraySelectionScope,
  type SelectionScope
} from '@dataview/runtime/selection'
import type {
  TableBlock,
  TableColumnFooterBlock,
  TableColumnHeaderBlock,
  TableCreateRecordBlock,
  TableRowBlock,
  TableSectionHeaderBlock
} from '@dataview/react/views/table/virtual/types'
import type {
  TableLayoutSectionState,
  TableLayoutState
} from '@dataview/react/views/table/virtual/layoutState'

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

interface TableCreateRecordDescriptor extends TableBlockDescriptorBase {
  kind: 'create-record'
  sectionKey: string
}

interface TableSectionHeaderDescriptor extends TableBlockDescriptorBase {
  kind: 'section-header'
  sectionKey: SectionKey
}

type TableBlockDescriptor =
  | TableRowDescriptor
  | TableColumnHeaderDescriptor
  | TableColumnFooterDescriptor
  | TableCreateRecordDescriptor
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
          ? { label: input.descriptor.label }
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
    case 'create-record': {
      const block: TableCreateRecordBlock = {
        key: input.descriptor.key,
        kind: 'create-record',
        top: input.top,
        height: input.height,
        estimatedHeight: input.descriptor.estimatedHeight,
        measuredHeight,
        sectionKey: input.descriptor.sectionKey
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
        sectionKey: input.descriptor.sectionKey
      }
      return block
    }
  }
}

const rowKeyOf = (rowId: ItemId) => `row:${rowId}`
const sectionHeaderKeyOf = (sectionKey: SectionKey) => `section-header:${sectionKey}`
const columnHeaderKeyOf = (sectionKey: SectionKey) => `column-header:${sectionKey}`
const createRecordKeyOf = (sectionKey: SectionKey) => `create-record:${sectionKey}`
const columnFooterKeyOf = (sectionKey: SectionKey) => `column-footer:${sectionKey}`

const buildSectionMeasurementIds = (input: {
  grouped: boolean
  sectionKey: SectionKey
  collapsed: boolean
  itemIds: readonly ItemId[]
}) => input.grouped
  ? (
      input.collapsed
        ? [sectionHeaderKeyOf(input.sectionKey)]
        : [
            sectionHeaderKeyOf(input.sectionKey),
            columnHeaderKeyOf(input.sectionKey),
            ...input.itemIds.map(rowId => rowKeyOf(rowId)),
            createRecordKeyOf(input.sectionKey),
            columnFooterKeyOf(input.sectionKey)
          ]
    )
  : [
      columnHeaderKeyOf(input.sectionKey),
      ...input.itemIds.map(rowId => rowKeyOf(rowId)),
      createRecordKeyOf(input.sectionKey),
      columnFooterKeyOf(input.sectionKey)
    ]

const sameSectionState = (
  left: TableLayoutSectionState,
  right: TableLayoutSectionState
) => left.key === right.key
  && left.collapsed === right.collapsed
  && left.itemIds === right.itemIds

class TableLayoutSectionModel {
  readonly key: SectionKey
  readonly grouped: boolean
  readonly collapsed: boolean
  readonly itemIds: readonly ItemId[]
  readonly rowIndexById: ReadonlyMap<ItemId, number>
  readonly sectionHeaderKey: string
  readonly columnHeaderKey: string
  readonly createRecordKey: string
  readonly columnFooterKey: string

  private readonly rowHeight: number
  private readonly headerHeight: number
  private readonly rowHeights: FenwickTree
  private sectionHeaderHeight: number
  private columnHeaderHeight: number
  private createRecordHeight: number
  private columnFooterHeight: number

  constructor(input: {
    grouped: boolean
    state: TableLayoutSectionState
    rowHeight: number
    headerHeight: number
    measuredHeights?: ReadonlyMap<string, number>
  }) {
    this.key = input.state.key
    this.grouped = input.grouped
    this.collapsed = input.state.collapsed
    this.itemIds = input.state.itemIds
    this.rowHeight = input.rowHeight
    this.headerHeight = input.headerHeight
    this.sectionHeaderKey = sectionHeaderKeyOf(input.state.key)
    this.columnHeaderKey = columnHeaderKeyOf(input.state.key)
    this.createRecordKey = createRecordKeyOf(input.state.key)
    this.columnFooterKey = columnFooterKeyOf(input.state.key)

    const rowIndexById = new Map<ItemId, number>()
    const resolvedRowHeights = this.itemIds.map((rowId, index) => {
      rowIndexById.set(rowId, index)
      return input.measuredHeights?.get(rowKeyOf(rowId))
        ?? this.rowHeight
    })

    this.rowIndexById = rowIndexById
    this.rowHeights = new FenwickTree(resolvedRowHeights)
    this.sectionHeaderHeight = this.grouped
      ? (input.measuredHeights?.get(this.sectionHeaderKey) ?? this.headerHeight)
      : 0
    this.columnHeaderHeight = this.collapsed
      ? 0
      : (input.measuredHeights?.get(this.columnHeaderKey) ?? this.headerHeight)
    this.createRecordHeight = this.collapsed
      ? 0
      : (input.measuredHeights?.get(this.createRecordKey) ?? this.rowHeight)
    this.columnFooterHeight = this.collapsed
      ? 0
      : (input.measuredHeights?.get(this.columnFooterKey) ?? this.headerHeight)
  }

  sync(input: {
    grouped: boolean
    state: TableLayoutSectionState
    measuredHeights?: ReadonlyMap<string, number>
  }) {
    return this.grouped === input.grouped
      && sameSectionState({
        key: this.key,
        collapsed: this.collapsed,
        itemIds: this.itemIds
      }, input.state)
      ? this
      : new TableLayoutSectionModel({
          grouped: input.grouped,
          state: input.state,
          rowHeight: this.rowHeight,
          headerHeight: this.headerHeight,
          measuredHeights: input.measuredHeights
        })
  }

  get totalHeight() {
    return this.sectionHeaderHeight
      + this.columnHeaderHeight
      + this.rowHeights.total()
      + this.createRecordHeight
      + this.columnFooterHeight
  }

  get measurementIds() {
    return buildSectionMeasurementIds({
      grouped: this.grouped,
      sectionKey: this.key,
      collapsed: this.collapsed,
      itemIds: this.itemIds
    })
  }

  locateRow(rowId: ItemId, sectionTop: number) {
    const rowIndex = this.rowIndexById.get(rowId)
    if (rowIndex === undefined || this.collapsed) {
      return null
    }

    const rowsTop = this.rowsTop()
    const top = sectionTop + rowsTop + this.rowHeights.prefixSum(rowIndex)
    return {
      rowId,
      top,
      bottom: top + this.rowHeights.valueAt(rowIndex)
    }
  }

  topOfKey(key: string, sectionTop: number) {
    if (key === this.sectionHeaderKey && this.grouped) {
      return sectionTop
    }

    if (this.collapsed) {
      return null
    }

    if (key === this.columnHeaderKey) {
      return sectionTop + this.sectionHeaderHeight
    }

    const rowIndex = this.rowIndexOfKey(key)
    if (rowIndex !== undefined) {
      return sectionTop + this.rowsTop() + this.rowHeights.prefixSum(rowIndex)
    }

    if (key === this.createRecordKey) {
      return sectionTop + this.rowsBottom()
    }

    if (key === this.columnFooterKey) {
      return sectionTop + this.rowsBottom() + this.createRecordHeight
    }

    return null
  }

  replaceMeasuredHeights(heightByKey: ReadonlyMap<string, number>) {
    let changed = false

    changed = this.setSimpleHeight('section-header', heightByKey.get(this.sectionHeaderKey)) || changed
    changed = this.setSimpleHeight('column-header', heightByKey.get(this.columnHeaderKey)) || changed
    changed = this.setSimpleHeight('create-record', heightByKey.get(this.createRecordKey)) || changed
    changed = this.setSimpleHeight('column-footer', heightByKey.get(this.columnFooterKey)) || changed

    this.itemIds.forEach(rowId => {
      changed = this.setRowHeight(rowId, heightByKey.get(rowKeyOf(rowId))) || changed
    })

    return changed
  }

  applyMeasuredHeight(key: string, height: number | undefined) {
    switch (key) {
      case this.sectionHeaderKey:
        return this.setSimpleHeight('section-header', height)
      case this.columnHeaderKey:
        return this.setSimpleHeight('column-header', height)
      case this.createRecordKey:
        return this.setSimpleHeight('create-record', height)
      case this.columnFooterKey:
        return this.setSimpleHeight('column-footer', height)
      default:
        return this.setRowHeightByKey(key, height)
    }
  }

  materializeWindow(input: {
    start: number
    end: number
    sectionTop: number
  }) {
    const items: TableBlock[] = []
    let blockCount = 0

    const pushSimple = (descriptor: TableBlockDescriptor, height: number, top: number) => {
      blockCount += 1
      if (top > input.end || top + height < input.start) {
        return
      }

      items.push(materializeBlock({
        descriptor,
        top,
        height
      }))
    }

    let top = input.sectionTop

    if (this.grouped) {
      pushSimple({
        key: this.sectionHeaderKey,
        kind: 'section-header',
        estimatedHeight: this.headerHeight,
        sectionKey: this.key
      }, this.sectionHeaderHeight, top)
      top += this.sectionHeaderHeight
    }

    if (this.collapsed) {
      return {
        items,
        blockCount
      }
    }

    pushSimple({
      key: this.columnHeaderKey,
      kind: 'column-header',
      estimatedHeight: this.headerHeight,
      scopeId: this.key,
      scope: createItemArraySelectionScope({
        key: this.key,
        ids: this.itemIds
      }),
      ...(this.grouped
        ? { label: `Select rows in ${this.key}` }
        : {})
    }, this.columnHeaderHeight, top)
    top += this.columnHeaderHeight
    blockCount += this.itemIds.length

    if (top <= input.end && top + this.rowHeights.total() >= input.start) {
      const relativeStart = Math.max(0, input.start - top)
      const startIndex = this.rowHeights.lowerBound(relativeStart)
      let rowTop = top + this.rowHeights.prefixSum(startIndex)

      for (let index = startIndex; index < this.itemIds.length; index += 1) {
        if (index > startIndex && rowTop > input.end) {
          break
        }

        const rowId = this.itemIds[index]
        if (rowId === undefined) {
          break
        }

        const height = this.rowHeights.valueAt(index)
        items.push(materializeBlock({
          descriptor: {
            key: rowKeyOf(rowId),
            kind: 'row',
            estimatedHeight: this.rowHeight,
            rowId
          },
          top: rowTop,
          height
        }))
        rowTop += height
      }
    }

    top += this.rowHeights.total()

    pushSimple({
      key: this.createRecordKey,
      kind: 'create-record',
      estimatedHeight: this.rowHeight,
      sectionKey: this.key
    }, this.createRecordHeight, top)
    top += this.createRecordHeight

    pushSimple({
      key: this.columnFooterKey,
      kind: 'column-footer',
      estimatedHeight: this.headerHeight,
      scopeId: this.key
    }, this.columnFooterHeight, top)

    return {
      items,
      blockCount
    }
  }

  private rowsTop() {
    return this.sectionHeaderHeight + this.columnHeaderHeight
  }

  private rowsBottom() {
    return this.rowsTop() + this.rowHeights.total()
  }

  private rowIndexOfKey(key: string) {
    if (!key.startsWith('row:')) {
      return undefined
    }

    const rowId = Number(key.slice(4)) as ItemId
    return this.rowIndexById.get(rowId)
  }

  private setRowHeightByKey(key: string, height: number | undefined) {
    const rowIndex = this.rowIndexOfKey(key)
    if (rowIndex === undefined) {
      return false
    }

    return this.rowHeights.set(
      rowIndex,
      height ?? this.rowHeight
    )
  }

  private setRowHeight(rowId: ItemId, height: number | undefined) {
    const rowIndex = this.rowIndexById.get(rowId)
    if (rowIndex === undefined) {
      return false
    }

    return this.rowHeights.set(
      rowIndex,
      height ?? this.rowHeight
    )
  }

  private setSimpleHeight(
    kind: 'section-header' | 'column-header' | 'create-record' | 'column-footer',
    height: number | undefined
  ) {
    switch (kind) {
      case 'section-header': {
        const next = this.grouped
          ? (height ?? this.headerHeight)
          : 0
        if (this.sectionHeaderHeight === next) {
          return false
        }
        this.sectionHeaderHeight = next
        return true
      }
      case 'column-header': {
        const next = this.collapsed
          ? 0
          : (height ?? this.headerHeight)
        if (this.columnHeaderHeight === next) {
          return false
        }
        this.columnHeaderHeight = next
        return true
      }
      case 'create-record': {
        const next = this.collapsed
          ? 0
          : (height ?? this.rowHeight)
        if (this.createRecordHeight === next) {
          return false
        }
        this.createRecordHeight = next
        return true
      }
      case 'column-footer': {
        const next = this.collapsed
          ? 0
          : (height ?? this.headerHeight)
        if (this.columnFooterHeight === next) {
          return false
        }
        this.columnFooterHeight = next
        return true
      }
    }
  }
}

export class TableLayoutModel {
  readonly grouped: boolean
  readonly measurementIds: readonly string[]
  readonly rowCount: number

  private readonly rowHeight: number
  private readonly headerHeight: number
  private readonly sections: readonly TableLayoutSectionModel[]
  private readonly sectionIndexByRowId: ReadonlyMap<ItemId, number>
  private readonly sectionIndexByBlockKey: ReadonlyMap<string, number>
  private sectionHeights: FenwickTree

  static fromState(input: {
    state: TableLayoutState
    rowHeight: number
    headerHeight: number
    measuredHeights?: ReadonlyMap<string, number>
  }) {
    return new TableLayoutModel({
      ...input,
      sections: input.state.sections.map(state => new TableLayoutSectionModel({
        grouped: input.state.grouped,
        state,
        rowHeight: input.rowHeight,
        headerHeight: input.headerHeight,
        measuredHeights: input.measuredHeights
      }))
    })
  }

  constructor(input: {
    state: TableLayoutState
    rowHeight: number
    headerHeight: number
    sections: readonly TableLayoutSectionModel[]
  }) {
    this.grouped = input.state.grouped
    this.measurementIds = input.sections.flatMap(section => section.measurementIds)
    this.rowCount = input.state.rowCount
    this.rowHeight = input.rowHeight
    this.headerHeight = input.headerHeight
    this.sections = input.sections

    const sectionIndexByRowId = new Map<ItemId, number>()
    const sectionIndexByBlockKey = new Map<string, number>()
    input.sections.forEach((section, index) => {
      sectionIndexByBlockKey.set(section.sectionHeaderKey, index)
      sectionIndexByBlockKey.set(section.columnHeaderKey, index)
      sectionIndexByBlockKey.set(section.createRecordKey, index)
      sectionIndexByBlockKey.set(section.columnFooterKey, index)
      section.itemIds.forEach(rowId => {
        sectionIndexByRowId.set(rowId, index)
      })
    })

    this.sectionIndexByRowId = sectionIndexByRowId
    this.sectionIndexByBlockKey = sectionIndexByBlockKey
    this.sectionHeights = new FenwickTree(
      input.sections.map(section => section.totalHeight)
    )
  }

  get totalHeight() {
    return this.sectionHeights.total()
  }

  sync(input: {
    state: TableLayoutState
    measuredHeights?: ReadonlyMap<string, number>
  }) {
    if (
      this.grouped !== input.state.grouped
      || this.sections.length !== input.state.sections.length
      || this.sections.some((section, index) => section.key !== input.state.sections[index]?.key)
    ) {
      return TableLayoutModel.fromState({
        state: input.state,
        rowHeight: this.rowHeight,
        headerHeight: this.headerHeight,
        measuredHeights: input.measuredHeights
      })
    }

    const nextSections = this.sections.map((section, index) => section.sync({
      grouped: input.state.grouped,
      state: input.state.sections[index]!,
      measuredHeights: input.measuredHeights
    }))
    const changed = (
      this.rowCount !== input.state.rowCount
      || nextSections.some((section, index) => section !== this.sections[index])
    )

    return changed
      ? new TableLayoutModel({
          state: input.state,
          rowHeight: this.rowHeight,
          headerHeight: this.headerHeight,
          sections: nextSections
        })
      : this
  }

  materializeWindow(input: {
    start: number
    end: number
  }): TableWindowProjection {
    if (!this.sections.length) {
      return {
        items: [],
        totalHeight: 0,
        startIndex: 0,
        endIndex: 0,
        startTop: 0
      }
    }

    const startSectionIndex = this.findStartSectionIndex(input.start)
    if (startSectionIndex >= this.sections.length) {
      return {
        items: [],
        totalHeight: this.totalHeight,
        startIndex: startSectionIndex,
        endIndex: startSectionIndex,
        startTop: this.totalHeight
      }
    }

    const items: TableBlock[] = []
    let blockCount = 0
    let sectionTop = this.topOfSection(startSectionIndex)

    for (let index = startSectionIndex; index < this.sections.length; index += 1) {
      const section = this.sections[index]
      if (!section) {
        break
      }

      if (index > startSectionIndex && sectionTop > input.end) {
        break
      }

      const projection = section.materializeWindow({
        start: input.start,
        end: input.end,
        sectionTop
      })
      items.push(...projection.items)
      blockCount += projection.blockCount
      sectionTop += section.totalHeight
    }

    return {
      items,
      totalHeight: this.totalHeight,
      startIndex: startSectionIndex,
      endIndex: startSectionIndex + blockCount,
      startTop: items[0]?.top ?? this.totalHeight
    }
  }

  locateRow(rowId: ItemId) {
    const sectionIndex = this.sectionIndexByRowId.get(rowId)
    if (sectionIndex === undefined) {
      return null
    }

    const section = this.sections[sectionIndex]
    return section?.locateRow(rowId, this.topOfSection(sectionIndex)) ?? null
  }

  topOfKey(key: string) {
    const sectionIndex = key.startsWith('row:')
      ? this.sectionIndexByRowId.get(Number(key.slice(4)) as ItemId)
      : this.sectionIndexByBlockKey.get(key)
    if (sectionIndex === undefined) {
      return null
    }

    const section = this.sections[sectionIndex]
    return section?.topOfKey(key, this.topOfSection(sectionIndex)) ?? null
  }

  replaceMeasuredHeights(heightByKey: ReadonlyMap<string, number>) {
    let changed = false

    this.sections.forEach((section, index) => {
      if (!section.replaceMeasuredHeights(heightByKey)) {
        return
      }

      changed = this.sectionHeights.set(index, section.totalHeight) || changed
    })

    return changed
  }

  applyMeasuredHeightPatches(input: {
    changedHeights?: ReadonlyMap<string, number>
    removedKeys?: readonly string[]
  }) {
    let changed = false

    input.changedHeights?.forEach((height, key) => {
      changed = this.applyMeasuredHeight(key, height) || changed
    })

    input.removedKeys?.forEach(key => {
      changed = this.applyMeasuredHeight(key, undefined) || changed
    })

    return changed
  }

  private applyMeasuredHeight(key: string, height: number | undefined) {
    const sectionIndex = key.startsWith('row:')
      ? this.sectionIndexByRowId.get(Number(key.slice(4)) as ItemId)
      : this.sectionIndexByBlockKey.get(key)
    if (sectionIndex === undefined) {
      return false
    }

    const section = this.sections[sectionIndex]
    if (!section?.applyMeasuredHeight(key, height)) {
      return false
    }

    return this.sectionHeights.set(sectionIndex, section.totalHeight)
  }

  private findStartSectionIndex(start: number) {
    if (!this.sections.length || start <= 0) {
      return 0
    }

    return Math.min(
      this.sectionHeights.lowerBound(start),
      this.sections.length
    )
  }

  private topOfSection(index: number) {
    return this.sectionHeights.prefixSum(index)
  }
}
