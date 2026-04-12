import type {
  Action,
  Field,
  FieldId,
  CustomFieldId,
  CustomFieldKind,
  RecordId,
  View,
  ViewGroup,
  ViewPatch
} from '@dataview/core/contracts'
import {
  getDocumentFieldById
} from '@dataview/core/document'
import {
  createRecordFieldWriteAction,
  createUniqueFieldName,
  isTitleFieldId
} from '@dataview/core/field'
import {
  addFilterRule,
  cloneFilter,
  removeFilterRule,
  replaceFilterRule,
  setFilterMode,
  setFilterPreset,
  setFilterValue
} from '@dataview/core/filter'
import {
  clearGroup,
  group as groupCore,
  setGroup,
  setGroupBucketCollapsed,
  setGroupBucketHidden,
  setGroupBucketInterval,
  setGroupBucketSort,
  setGroupMode,
  setGroupShowEmpty,
  toggleGroup,
  toggleGroupBucketCollapsed
} from '@dataview/core/group'
import {
  setSearchQuery
} from '@dataview/core/search'
import {
  addSorter,
  clearSorters,
  moveSorter,
  removeSorter,
  replaceSorter,
  setOnlySorter,
  setSorter
} from '@dataview/core/sort'
import {
  clearDisplayFields,
  clearViewOrders,
  hideDisplayField,
  moveDisplayFields,
  reorderViewOrders,
  replaceDisplayFields,
  resolveDisplayInsertBeforeFieldId,
  setGalleryCardSize,
  setGalleryShowFieldLabels,
  setKanbanCardsPerColumn,
  setKanbanFillColumnColor,
  setKanbanNewRecordPosition,
  setTableColumnWidths,
  setTableVerticalLines,
  setViewCalcMetric,
  showDisplayField
} from '@dataview/core/view'
import {
  read as readValue,
  sameJsonValue
} from '@shared/core'
import type {
  CellRef,
  Placement
} from '@dataview/engine/project'
import type {
  AppearanceId,
  AppearanceList
} from '@dataview/engine/project'
import { createRecordId } from '@dataview/engine/command/entityId'
import { meta, renderMessage } from '@dataview/meta'
import type {
  ActiveEngineApi,
  EngineReadApi,
  FieldsEngineApi,
  RecordsEngineApi
} from '../../api/public'
import {
  createActiveBaseApi
} from '../../store/selectors'
import type { Store } from '../../store/state'

type ViewPatchAction = Extract<Action, { type: 'view.patch' }>

const createGroupWriteActions = (input: {
  readRecord: ActiveEngineApi['read']['record']
  group: ViewGroup
  field: Field
  appearances: AppearanceList
  appearanceIds: readonly AppearanceId[]
  targetSectionKey: string
}): readonly Action[] | undefined => {
  const fieldId = input.group.field
  const appearanceIdsByRecordId = new Map<RecordId, AppearanceId[]>()

  input.appearanceIds.forEach(appearanceId => {
    const recordId = input.appearances.get(appearanceId)?.recordId
    if (!recordId) {
      return
    }

    const ids = appearanceIdsByRecordId.get(recordId)
    if (ids) {
      ids.push(appearanceId)
      return
    }

    appearanceIdsByRecordId.set(recordId, [appearanceId])
  })

  const actions: Action[] = []

  for (const [recordId, appearanceIds] of appearanceIdsByRecordId) {
    const record = input.readRecord(recordId)
    const initialValue = isTitleFieldId(fieldId)
      ? record?.title
      : record?.values[fieldId]
    let currentValue = initialValue

    for (const appearanceId of appearanceIds) {
      const next = groupCore.write.next({
        field: input.field,
        group: input.group,
        currentValue,
        fromKey: input.appearances.get(appearanceId)?.sectionKey,
        toKey: input.targetSectionKey
      })
      if (next.kind === 'invalid') {
        return undefined
      }

      currentValue = next.kind === 'clear'
        ? undefined
        : next.value
    }

    if (sameJsonValue(initialValue, currentValue)) {
      continue
    }

    actions.push(createRecordFieldWriteAction(recordId, fieldId, currentValue))
  }

  return actions
}

export const createActiveEngineApi = (options: {
  store: Store
  read: EngineReadApi
  dispatch: (action: Action | readonly Action[]) => {
    applied: boolean
  }
  fields: Pick<FieldsEngineApi, 'list' | 'create'>
  records: Pick<RecordsEngineApi, 'field'>
}): ActiveEngineApi => {
  const activeBase = createActiveBaseApi({
    store: options.store,
    read: options.read
  })
  const readDocument = () => readValue(options.read.document)
  const readView = () => readValue(activeBase.view)
  const readState = () => readValue(activeBase.state)
  const commit = (action: Action | readonly Action[]) => options.dispatch(action).applied

  const createPatchAction = (
    patch: ViewPatch
  ): ViewPatchAction | undefined => {
    const viewId = activeBase.id.get()
    return viewId
      ? {
          type: 'view.patch',
          viewId,
          patch
        }
      : undefined
  }

  const commitPatch = (patch: ViewPatch): boolean => {
    const action = createPatchAction(patch)
    return action
      ? commit(action)
      : false
  }

  const withView = <T,>(
    fn: (view: View) => T
  ): T | undefined => {
    const view = readView()
    if (!view) {
      return undefined
    }

    return fn(view)
  }

  const withField = <T,>(
    fieldId: FieldId,
    fn: (view: View, field: Field) => T
  ): T | undefined => withView(view => {
    const field = getDocumentFieldById(readDocument(), fieldId)
    if (!field) {
      return undefined
    }

    return fn(view, field)
  })

  const withFilterField = <T,>(
    index: number,
    fn: (view: View, field: Field | undefined) => T
  ): T | undefined => withView(view => {
    const fieldId = view.filter.rules[index]?.fieldId
    return fn(
      view,
      fieldId
        ? getDocumentFieldById(readDocument(), fieldId)
        : undefined
    )
  })

  const withGroupField = <T,>(
    fn: (view: View, field: Field) => T
  ): T | undefined => withView(view => {
    if (!view.group) {
      return undefined
    }

    const field = getDocumentFieldById(readDocument(), view.group.field)
    if (!field) {
      return undefined
    }

    return fn(view, field)
  })

  const createMoveOrderAction = (
    recordIds: readonly RecordId[],
    beforeRecordId?: RecordId
  ): ViewPatchAction | undefined => withView(view => {
    if (!recordIds.length) {
      return undefined
    }

    return createPatchAction({
      orders: reorderViewOrders({
        allRecordIds: readDocument().records.order,
        currentOrder: view.orders,
        movingRecordIds: recordIds,
        beforeRecordId
      })
    })
  })

  const createField = (input?: {
    name?: string
    kind?: CustomFieldKind
  }): CustomFieldId | undefined => {
    const kind = input?.kind ?? 'text'
    const explicitName = input?.name?.trim()
    const name = explicitName || createUniqueFieldName(
      renderMessage(meta.field.kind.get(kind).defaultName),
      options.fields.list()
    )

    if (!name) {
      return undefined
    }

    return options.fields.create({
      name,
      kind
    })
  }

  const writeCell = (
    cell: CellRef,
    value: unknown | undefined
  ) => {
    const target = activeBase.read.cell(cell)
    if (!target) {
      return
    }

    if (value === undefined) {
      options.records.field.clear(target.recordId, target.fieldId)
      return
    }

    options.records.field.set(target.recordId, target.fieldId, value)
  }

  const type: ActiveEngineApi['type'] = {
    set: value => {
      commitPatch({
        type: value
      })
    }
  }

  const search: ActiveEngineApi['search'] = {
    set: value => {
      withView(view => {
        commitPatch({
          search: setSearchQuery(view.search, value)
        })
      })
    }
  }

  const filter: ActiveEngineApi['filter'] = {
    add: fieldId => {
      withField(fieldId, (view, field) => {
        commitPatch({
          filter: addFilterRule(view.filter, field)
        })
      })
    },
    set: (index, rule) => {
      withView(view => {
        commitPatch({
          filter: replaceFilterRule(view.filter, index, rule)
        })
      })
    },
    preset: (index, presetId) => {
      withFilterField(index, (view, field) => {
        commitPatch({
          filter: setFilterPreset(view.filter, index, field, presetId)
        })
      })
    },
    value: (index, value) => {
      withFilterField(index, (view, field) => {
        commitPatch({
          filter: setFilterValue(view.filter, index, field, value)
        })
      })
    },
    mode: value => {
      withView(view => {
        commitPatch({
          filter: setFilterMode(view.filter, value)
        })
      })
    },
    remove: index => {
      withView(view => {
        commitPatch({
          filter: removeFilterRule(view.filter, index)
        })
      })
    },
    clear: () => {
      withView(view => {
        commitPatch({
          filter: cloneFilter({
            ...view.filter,
            rules: []
          })
        })
      })
    }
  }

  const sort: ActiveEngineApi['sort'] = {
    add: (fieldId, direction) => {
      withView(view => {
        commitPatch({
          sort: addSorter(view.sort, fieldId, direction)
        })
      })
    },
    set: (fieldId, direction) => {
      withView(view => {
        commitPatch({
          sort: setSorter(view.sort, fieldId, direction)
        })
      })
    },
    only: (fieldId, direction) => {
      withView(view => {
        commitPatch({
          sort: setOnlySorter(view.sort, fieldId, direction)
        })
      })
    },
    replace: (index, sorter) => {
      withView(view => {
        commitPatch({
          sort: replaceSorter(view.sort, index, sorter)
        })
      })
    },
    remove: index => {
      withView(view => {
        commitPatch({
          sort: removeSorter(view.sort, index)
        })
      })
    },
    move: (from, to) => {
      withView(view => {
        commitPatch({
          sort: moveSorter(view.sort, from, to)
        })
      })
    },
    clear: () => {
      withView(view => {
        commitPatch({
          sort: clearSorters(view.sort)
        })
      })
    }
  }

  const group: ActiveEngineApi['group'] = {
    set: fieldId => {
      withField(fieldId, (view, field) => {
        commitPatch({
          group: setGroup(view.group, field) ?? null
        })
      })
    },
    clear: () => {
      withView(view => {
        commitPatch({
          group: clearGroup(view.group) ?? null
        })
      })
    },
    toggle: fieldId => {
      withField(fieldId, (view, field) => {
        commitPatch({
          group: toggleGroup(view.group, field) ?? null
        })
      })
    },
    setMode: value => {
      withGroupField((view, field) => {
        commitPatch({
          group: setGroupMode(view.group, field, value) ?? null
        })
      })
    },
    setSort: value => {
      withGroupField((view, field) => {
        commitPatch({
          group: setGroupBucketSort(view.group, field, value) ?? null
        })
      })
    },
    setInterval: value => {
      withGroupField((view, field) => {
        commitPatch({
          group: setGroupBucketInterval(view.group, field, value) ?? null
        })
      })
    },
    setShowEmpty: value => {
      withGroupField((view, field) => {
        commitPatch({
          group: setGroupShowEmpty(view.group, field, value) ?? null
        })
      })
    },
    show: key => {
      withGroupField((view, field) => {
        commitPatch({
          group: setGroupBucketHidden(view.group, field, key, false) ?? null
        })
      })
    },
    hide: key => {
      withGroupField((view, field) => {
        commitPatch({
          group: setGroupBucketHidden(view.group, field, key, true) ?? null
        })
      })
    },
    collapse: key => {
      withGroupField((view, field) => {
        commitPatch({
          group: setGroupBucketCollapsed(view.group, field, key, true) ?? null
        })
      })
    },
    expand: key => {
      withGroupField((view, field) => {
        commitPatch({
          group: setGroupBucketCollapsed(view.group, field, key, false) ?? null
        })
      })
    },
    toggleCollapse: key => {
      withGroupField((view, field) => {
        commitPatch({
          group: toggleGroupBucketCollapsed(view.group, field, key) ?? null
        })
      })
    }
  }

  const calc: ActiveEngineApi['calc'] = {
    set: (fieldId, metric) => {
      withView(view => {
        commitPatch({
          calc: setViewCalcMetric(view.calc, fieldId, metric)
        })
      })
    }
  }

  const display: ActiveEngineApi['display'] = {
    replace: fieldIds => {
      withView(() => {
        commitPatch({
          display: replaceDisplayFields(fieldIds)
        })
      })
    },
    move: (fieldIds, beforeFieldId) => {
      withView(view => {
        commitPatch({
          display: moveDisplayFields(view.display, fieldIds, beforeFieldId)
        })
      })
    },
    show: (fieldId, beforeFieldId) => {
      withView(view => {
        commitPatch({
          display: showDisplayField(view.display, fieldId, beforeFieldId)
        })
      })
    },
    hide: fieldId => {
      withView(view => {
        commitPatch({
          display: hideDisplayField(view.display, fieldId)
        })
      })
    },
    clear: () => {
      withView(() => {
        commitPatch({
          display: clearDisplayFields()
        })
      })
    }
  }

  const gallery: ActiveEngineApi['gallery'] = {
    setLabels: value => {
      withView(view => {
        commitPatch({
          options: setGalleryShowFieldLabels(view.options, value)
        })
      })
    },
    setCardSize: value => {
      withView(view => {
        commitPatch({
          options: setGalleryCardSize(view.options, value)
        })
      })
    },
    state: activeBase.gallery.state
  }

  const kanban: ActiveEngineApi['kanban'] = {
    setNewRecordPosition: value => {
      withView(view => {
        commitPatch({
          options: setKanbanNewRecordPosition(view.options, value)
        })
      })
    },
    setFillColor: value => {
      withView(view => {
        commitPatch({
          options: setKanbanFillColumnColor(view.options, value)
        })
      })
    },
    setCardsPerColumn: value => {
      withView(view => {
        commitPatch({
          options: setKanbanCardsPerColumn(view.options, value)
        })
      })
    },
    state: activeBase.kanban.state
  }

  const order: ActiveEngineApi['order'] = {
    move: (recordIds, beforeRecordId) => {
      const action = createMoveOrderAction(recordIds, beforeRecordId)
      if (action) {
        commit(action)
      }
    },
    clear: () => {
      commitPatch({
        orders: clearViewOrders()
      })
    }
  }

  const items: ActiveEngineApi['items'] = {
    move: (appearanceIds, target) => {
      const state = readState()
      if (!state) {
        return
      }

      const groupWrite = state.query.group.group && state.query.group.field
        ? {
            group: state.query.group.group,
            field: state.query.group.field
          }
        : undefined
      const plan = activeBase.read.planMove(appearanceIds, target)
      if (!plan.changed || !plan.appearanceIds.length || !plan.recordIds.length) {
        return
      }

      if (plan.sectionChanged && state.view.group && !groupWrite) {
        return
      }

      const actions: Action[] = []

      if (plan.sectionChanged && groupWrite) {
        const valueActions = createGroupWriteActions({
          readRecord: activeBase.read.record,
          group: groupWrite.group,
          field: groupWrite.field,
          appearances: state.appearances,
          appearanceIds: plan.appearanceIds,
          targetSectionKey: plan.target.sectionKey
        })
        if (!valueActions) {
          return
        }

        actions.push(...valueActions)
      }

      if (!state.view.sort.length) {
        const moveAction = createMoveOrderAction(
          plan.recordIds,
          plan.target.beforeRecordId
        )
        if (moveAction) {
          actions.push(moveAction)
        }
      }

      if (actions.length) {
        options.dispatch(actions)
      }
    },
    create: input => {
      const state = readState()
      if (!state) {
        return undefined
      }

      const groupWrite = state.query.group.group && state.query.group.field
        ? {
            group: state.query.group.group,
            field: state.query.group.field
          }
        : undefined
      if (state.view.group && !groupWrite) {
        return undefined
      }

      const values: Partial<Record<FieldId, unknown>> = {
        ...(input.values ?? {})
      }
      let title = input.title?.trim()

      if (groupWrite) {
        const fieldId = groupWrite.group.field
        const next = groupCore.write.next({
          field: groupWrite.field,
          group: groupWrite.group,
          currentValue: isTitleFieldId(fieldId)
            ? title
            : values[fieldId],
          toKey: input.section
        })
        if (next.kind === 'invalid') {
          return undefined
        }

        if (isTitleFieldId(fieldId)) {
          title = next.kind === 'clear'
            ? ''
            : String(next.value ?? '')
        } else if (next.kind === 'clear') {
          delete values[fieldId]
        } else {
          values[fieldId] = next.value
        }
      }

      const recordId = createRecordId()
      const actions: Action[] = [{
        type: 'record.create',
        input: {
          id: recordId,
          ...(title ? { title } : {}),
          values
        }
      }]

      if (
        state.view.type === 'kanban'
        && state.view.options.kanban.newRecordPosition === 'start'
        && !state.view.sort.length
      ) {
        const beforeRecordId = state.sections.get(input.section)?.recordIds[0]
        const moveAction = createMoveOrderAction([recordId], beforeRecordId)
        if (moveAction) {
          actions.push(moveAction)
        }
      }

      const result = options.dispatch(actions)
      return result.applied
        ? recordId
        : undefined
    },
    remove: appearanceIds => {
      const state = readState()
      if (!state) {
        return
      }

      const recordIds = appearanceIds.flatMap(appearanceId => {
        const recordId = state.appearances.get(appearanceId)?.recordId
        return recordId ? [recordId] : []
      }).filter((recordId, index, source) => source.indexOf(recordId) === index)
      if (!recordIds.length) {
        return
      }

      options.dispatch({
        type: 'record.remove',
        recordIds: [...recordIds]
      })
    }
  }

  const cells: ActiveEngineApi['cells'] = {
    set: (cell, value) => {
      if (!readState()) {
        return
      }

      writeCell(cell, value)
    },
    clear: cell => {
      if (!readState()) {
        return
      }

      writeCell(cell, undefined)
    }
  }

  const table: ActiveEngineApi['table'] = {
    setWidths: widths => {
      withView(view => {
        commitPatch({
          options: setTableColumnWidths(view.options, widths)
        })
      })
    },
    setVerticalLines: value => {
      withView(view => {
        commitPatch({
          options: setTableVerticalLines(view.options, value)
        })
      })
    },
    insertLeft: (anchorFieldId, input) => {
      const fieldId = createField(input)
      if (!fieldId) {
        return undefined
      }

      display.show(
        fieldId,
        resolveDisplayInsertBeforeFieldId(
          readView()?.display.fields ?? [],
          anchorFieldId,
          'left'
        )
      )
      return fieldId
    },
    insertRight: (anchorFieldId, input) => {
      const fieldId = createField(input)
      if (!fieldId) {
        return undefined
      }

      display.show(
        fieldId,
        resolveDisplayInsertBeforeFieldId(
          readView()?.display.fields ?? [],
          anchorFieldId,
          'right'
        )
      )
      return fieldId
    }
  }

  return {
    ...activeBase,
    type,
    search,
    filter,
    sort,
    group,
    calc,
    display,
    table,
    gallery,
    kanban,
    order,
    items,
    cells
  }
}
