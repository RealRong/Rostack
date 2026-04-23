import type {
  ItemId,
  SectionId
} from '@dataview/engine'
import {
  createItemArraySelectionScope,
  type SelectionScope
} from '@dataview/runtime'
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
import {
  parseTableBlockKey,
  tableBlockKey,
  type TableBlockId
} from '@dataview/react/views/table/virtual/blockId'

interface TableBlockDescriptorBase {
  id: TableBlockId
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
  sectionId: string
}

interface TableSectionHeaderDescriptor extends TableBlockDescriptorBase {
  kind: 'section-header'
  sectionId: SectionId
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

    for (let index = 0; index < values.length; index += 1) {
      this.add(index, values[index]!)
    }
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
        id: input.descriptor.id,
        key: tableBlockKey(input.descriptor.id),
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
        id: input.descriptor.id,
        key: tableBlockKey(input.descriptor.id),
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
        id: input.descriptor.id,
        key: tableBlockKey(input.descriptor.id),
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
        id: input.descriptor.id,
        key: tableBlockKey(input.descriptor.id),
        kind: 'create-record',
        top: input.top,
        height: input.height,
        estimatedHeight: input.descriptor.estimatedHeight,
        measuredHeight,
        sectionId: input.descriptor.sectionId
      }
      return block
    }
    case 'section-header': {
      const block: TableSectionHeaderBlock = {
        id: input.descriptor.id,
        key: tableBlockKey(input.descriptor.id),
        kind: 'section-header',
        top: input.top,
        height: input.height,
        estimatedHeight: input.descriptor.estimatedHeight,
        measuredHeight,
        sectionId: input.descriptor.sectionId
      }
      return block
    }
  }
}

interface TableRowLocation {
  sectionIndex: number
  rowIndex: number
}

const sameSectionState = (
  left: TableLayoutSectionState,
  right: TableLayoutSectionState
) => left.key === right.key
  && left.collapsed === right.collapsed
  && left.itemIds === right.itemIds

class TableLayoutSectionModel {
  readonly key: SectionId
  readonly grouped: boolean
  readonly collapsed: boolean
  readonly itemIds: readonly ItemId[]
  readonly sectionHeaderId: Extract<TableBlockId, {
    kind: 'section-header'
  }>
  readonly columnHeaderId: Extract<TableBlockId, {
    kind: 'column-header'
  }>
  readonly createRecordId: Extract<TableBlockId, {
    kind: 'create-record'
  }>
  readonly columnFooterId: Extract<TableBlockId, {
    kind: 'column-footer'
  }>
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
    sectionIndex: number
    rowLocationById: Map<ItemId, TableRowLocation>
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
    this.sectionHeaderId = {
      kind: 'section-header',
      sectionId: input.state.key
    }
    this.columnHeaderId = {
      kind: 'column-header',
      sectionId: input.state.key
    }
    this.createRecordId = {
      kind: 'create-record',
      sectionId: input.state.key
    }
    this.columnFooterId = {
      kind: 'column-footer',
      sectionId: input.state.key
    }
    this.sectionHeaderKey = tableBlockKey(this.sectionHeaderId)
    this.columnHeaderKey = tableBlockKey(this.columnHeaderId)
    this.createRecordKey = tableBlockKey(this.createRecordId)
    this.columnFooterKey = tableBlockKey(this.columnFooterId)

    const resolvedRowHeights = new Array<number>(this.itemIds.length)
    for (let index = 0; index < this.itemIds.length; index += 1) {
      const rowId = this.itemIds[index]!
      input.rowLocationById.set(rowId, {
        sectionIndex: input.sectionIndex,
        rowIndex: index
      })
      resolvedRowHeights[index] = input.measuredHeights?.get(tableBlockKey({
        kind: 'row',
        rowId
      })) ?? this.rowHeight
    }

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
    sectionIndex: number
    rowLocationById: Map<ItemId, TableRowLocation>
    grouped: boolean
    state: TableLayoutSectionState
    measuredHeights?: ReadonlyMap<string, number>
  }) {
    const unchanged = this.grouped === input.grouped
      && sameSectionState({
        key: this.key,
        collapsed: this.collapsed,
        itemIds: this.itemIds
      }, input.state)
    if (unchanged) {
      this.appendRowLocations(input.rowLocationById, input.sectionIndex)
      return this
    }

    return new TableLayoutSectionModel({
      sectionIndex: input.sectionIndex,
      rowLocationById: input.rowLocationById,
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
      + this.visibleRowsHeight()
      + this.createRecordHeight
      + this.columnFooterHeight
  }

  locateRow(
    rowIndex: number,
    rowId: ItemId,
    sectionTop: number
  ) {
    const top = this.topOfRow(rowIndex, sectionTop)
    return top === null
      ? null
      : {
          rowId,
          top,
          bottom: top + this.rowHeights.valueAt(rowIndex)
        }
  }

  topOfBlock(
    id: Exclude<TableBlockId, {
      kind: 'row'
    }>,
    sectionTop: number
  ) {
    if (id.kind === 'section-header' && id.sectionId === this.key && this.grouped) {
      return sectionTop
    }

    if (this.collapsed) {
      return null
    }

    if (id.kind === 'column-header' && id.sectionId === this.key) {
      return sectionTop + this.sectionHeaderHeight
    }

    if (id.kind === 'create-record' && id.sectionId === this.key) {
      return sectionTop + this.rowsBottom()
    }

    if (id.kind === 'column-footer' && id.sectionId === this.key) {
      return sectionTop + this.rowsBottom() + this.createRecordHeight
    }

    return null
  }

  topOfRow(
    rowIndex: number,
    sectionTop: number
  ) {
    if (
      this.collapsed
      || rowIndex < 0
      || rowIndex >= this.itemIds.length
    ) {
      return null
    }

    return sectionTop + this.rowsTop() + this.rowHeights.prefixSum(rowIndex)
  }

  replaceMeasuredHeights(heightByKey: ReadonlyMap<string, number>) {
    let changed = false

    changed = this.setSimpleHeight('section-header', heightByKey.get(this.sectionHeaderKey)) || changed
    changed = this.setSimpleHeight('column-header', heightByKey.get(this.columnHeaderKey)) || changed
    changed = this.setSimpleHeight('create-record', heightByKey.get(this.createRecordKey)) || changed
    changed = this.setSimpleHeight('column-footer', heightByKey.get(this.columnFooterKey)) || changed

    for (let index = 0; index < this.itemIds.length; index += 1) {
      const rowId = this.itemIds[index]!
      changed = this.rowHeights.set(
        index,
        heightByKey.get(tableBlockKey({
          kind: 'row',
          rowId
        })) ?? this.rowHeight
      ) || changed
    }

    return changed
  }

  applySimpleMeasuredHeight(
    key: string,
    height: number | undefined
  ) {
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
        return false
    }
  }

  applyRowMeasuredHeight(
    rowIndex: number,
    height: number | undefined
  ) {
    return this.rowHeights.set(
      rowIndex,
      height ?? this.rowHeight
    )
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
        id: this.sectionHeaderId,
        kind: 'section-header',
        estimatedHeight: this.headerHeight,
        sectionId: this.key
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
      id: this.columnHeaderId,
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

    const rowsHeight = this.rowHeights.total()
    if (top <= input.end && top + rowsHeight >= input.start) {
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
            id: {
              kind: 'row',
              rowId
            },
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

    top += rowsHeight

    pushSimple({
      id: this.createRecordId,
      kind: 'create-record',
      estimatedHeight: this.rowHeight,
      sectionId: this.key
    }, this.createRecordHeight, top)
    top += this.createRecordHeight

    pushSimple({
      id: this.columnFooterId,
      kind: 'column-footer',
      estimatedHeight: this.headerHeight,
      scopeId: this.key
    }, this.columnFooterHeight, top)

    return {
      items,
      blockCount
    }
  }

  private appendRowLocations(
    rowLocationById: Map<ItemId, TableRowLocation>,
    sectionIndex: number
  ) {
    for (let index = 0; index < this.itemIds.length; index += 1) {
      rowLocationById.set(this.itemIds[index]!, {
        sectionIndex,
        rowIndex: index
      })
    }
  }

  private rowsTop() {
    return this.sectionHeaderHeight + this.columnHeaderHeight
  }

  private rowsBottom() {
    return this.rowsTop() + this.visibleRowsHeight()
  }

  private visibleRowsHeight() {
    return this.collapsed
      ? 0
      : this.rowHeights.total()
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
  readonly rowCount: number

  private readonly rowHeight: number
  private readonly headerHeight: number
  private readonly sections: readonly TableLayoutSectionModel[]
  private readonly rowLocationById: ReadonlyMap<ItemId, TableRowLocation>
  private readonly sectionIndexByBlockKey: ReadonlyMap<string, number>
  private sectionHeights: FenwickTree

  static fromState(input: {
    state: TableLayoutState
    rowHeight: number
    headerHeight: number
    measuredHeights?: ReadonlyMap<string, number>
  }) {
    const rowLocationById = new Map<ItemId, TableRowLocation>()
    const sections = new Array<TableLayoutSectionModel>(input.state.sections.length)

    for (let index = 0; index < input.state.sections.length; index += 1) {
      sections[index] = new TableLayoutSectionModel({
        sectionIndex: index,
        rowLocationById,
        grouped: input.state.grouped,
        state: input.state.sections[index]!,
        rowHeight: input.rowHeight,
        headerHeight: input.headerHeight,
        measuredHeights: input.measuredHeights
      })
    }

    return new TableLayoutModel({
      state: input.state,
      rowHeight: input.rowHeight,
      headerHeight: input.headerHeight,
      sections,
      rowLocationById
    })
  }

  constructor(input: {
    state: TableLayoutState
    rowHeight: number
    headerHeight: number
    sections: readonly TableLayoutSectionModel[]
    rowLocationById: ReadonlyMap<ItemId, TableRowLocation>
  }) {
    this.grouped = input.state.grouped
    this.rowCount = input.state.rowCount
    this.rowHeight = input.rowHeight
    this.headerHeight = input.headerHeight
    this.sections = input.sections
    this.rowLocationById = input.rowLocationById

    const sectionIndexByBlockKey = new Map<string, number>()
    const sectionHeights = new Array<number>(input.sections.length)
    for (let index = 0; index < input.sections.length; index += 1) {
      const section = input.sections[index]!
      sectionIndexByBlockKey.set(section.sectionHeaderKey, index)
      sectionIndexByBlockKey.set(section.columnHeaderKey, index)
      sectionIndexByBlockKey.set(section.createRecordKey, index)
      sectionIndexByBlockKey.set(section.columnFooterKey, index)
      sectionHeights[index] = section.totalHeight
    }

    this.sectionIndexByBlockKey = sectionIndexByBlockKey
    this.sectionHeights = new FenwickTree(sectionHeights)
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

    const rowLocationById = new Map<ItemId, TableRowLocation>()
    const nextSections = new Array<TableLayoutSectionModel>(this.sections.length)
    let changed = this.rowCount !== input.state.rowCount

    for (let index = 0; index < this.sections.length; index += 1) {
      const section = this.sections[index]!
      const nextSection = section.sync({
        sectionIndex: index,
        rowLocationById,
        grouped: input.state.grouped,
        state: input.state.sections[index]!,
        measuredHeights: input.measuredHeights
      })
      nextSections[index] = nextSection
      changed = changed || nextSection !== section
    }

    return changed
      ? new TableLayoutModel({
          state: input.state,
          rowHeight: this.rowHeight,
          headerHeight: this.headerHeight,
          sections: nextSections,
          rowLocationById
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
    const location = this.rowLocationById.get(rowId)
    if (!location) {
      return null
    }

    const section = this.sections[location.sectionIndex]
    return section?.locateRow(
      location.rowIndex,
      rowId,
      this.topOfSection(location.sectionIndex)
    ) ?? null
  }

  topOfBlock(id: TableBlockId) {
    if (id.kind === 'row') {
      const location = this.rowLocationById.get(id.rowId)
      if (!location) {
        return null
      }

      const section = this.sections[location.sectionIndex]
      return section?.topOfRow(
        location.rowIndex,
        this.topOfSection(location.sectionIndex)
      ) ?? null
    }

    const sectionIndex = this.sectionIndexByBlockKey.get(tableBlockKey(id))
    if (sectionIndex === undefined) {
      return null
    }

    const section = this.sections[sectionIndex]
    return section?.topOfBlock(id, this.topOfSection(sectionIndex)) ?? null
  }

  replaceMeasuredHeights(heightByKey: ReadonlyMap<string, number>) {
    let changed = false

    for (let index = 0; index < this.sections.length; index += 1) {
      const section = this.sections[index]!
      if (!section.replaceMeasuredHeights(heightByKey)) {
        continue
      }

      changed = this.sectionHeights.set(index, section.totalHeight) || changed
    }

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
    const id = parseTableBlockKey(key)
    if (!id) {
      return false
    }

    if (id.kind === 'row') {
      const location = this.rowLocationById.get(id.rowId)
      if (!location) {
        return false
      }

      const section = this.sections[location.sectionIndex]
      if (!section?.applyRowMeasuredHeight(location.rowIndex, height)) {
        return false
      }

      return this.sectionHeights.set(location.sectionIndex, section.totalHeight)
    }

    const sectionIndex = this.sectionIndexByBlockKey.get(key)
    if (sectionIndex === undefined) {
      return false
    }

    const section = this.sections[sectionIndex]
    if (!section?.applySimpleMeasuredHeight(key, height)) {
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
