import type {
  CalculationMetric,
  FieldId,
  Command,
  CustomFieldId,
  CustomFieldKind,
  View,
  ViewType,
  RecordId,
  ViewId
} from '@dataview/core/contracts'
import { getDocumentViewById } from '@dataview/core/document'
import { isTitleFieldId } from '@dataview/core/field'
import { createUniqueFieldName } from '@dataview/core/field'
import {
  createGrouping,
  move,
  readSectionRecordIds,
  recordIdsOfAppearances,
  resolveGrouping,
  resolveSectionRecordIds,
  toRecordField,
  type AppearanceId,
  type AppearanceList,
  type CellRef,
  type Grouping,
  type GroupingNextValue,
  type Placement,
  type SectionKey,
  type ViewProjection
} from '@dataview/engine/projection/view'
import { createRecordId } from '@dataview/engine/command/entityId'
import { meta, renderMessage } from '@dataview/meta'
import type {
  Engine,
  ViewGalleryApi,
  ViewKanbanApi,
  KanbanApi,
  KanbanCreateCardInput,
  KanbanMoveCardsInput,
  ViewItemsApi,
  ViewOrderApi,
  ViewEngineApi,
  ViewTableApi
} from '../types'

const uniqueIds = <T,>(ids: readonly T[]) => Array.from(new Set(ids))

const sameValue = (
  left: unknown,
  right: unknown
): boolean => {
  if (Object.is(left, right)) {
    return true
  }

  if (Array.isArray(left) && Array.isArray(right)) {
    return left.length === right.length
      && left.every((value, index) => sameValue(value, right[index]))
  }

  if (
    left
    && right
    && typeof left === 'object'
    && typeof right === 'object'
  ) {
    try {
      return JSON.stringify(left) === JSON.stringify(right)
    } catch {
      return false
    }
  }

  return false
}

const toValueCommand = (
  recordId: RecordId,
  fieldId: FieldId,
  next: GroupingNextValue
): Command => (
  isTitleFieldId(fieldId)
    ? {
        type: 'record.apply',
        target: {
          type: 'record',
          recordId
        },
        patch: {
          title: 'clear' in next
            ? ''
            : String(next.value ?? '')
        }
      }
    : 'clear' in next
      ? {
          type: 'value.apply',
          target: {
            type: 'record',
            recordId
          },
          action: {
            type: 'clear',
            field: fieldId
          }
        }
      : {
          type: 'value.apply',
          target: {
            type: 'record',
            recordId
          },
          action: {
            type: 'set',
            field: fieldId,
            value: next.value
          }
        }
)

const createGroupWriteCommands = (input: {
  engine: Pick<Engine, 'read'>
  view: ViewProjection['view']
  appearances: AppearanceList
  ids: readonly AppearanceId[]
  targetSection: string
  grouping: Grouping
}): readonly Command[] | undefined => {
  const fieldId = input.view.group?.field
  if (!fieldId) {
    return []
  }

  const appearanceIdsByRecordId = new Map<RecordId, AppearanceId[]>()

  input.ids.forEach(id => {
    const recordId = input.appearances.get(id)?.recordId
    if (!recordId) {
      return
    }

    const current = appearanceIdsByRecordId.get(recordId)
    if (current) {
      current.push(id)
      return
    }

    appearanceIdsByRecordId.set(recordId, [id])
  })

  const commands: Command[] = []

  for (const [recordId, appearanceIds] of appearanceIdsByRecordId) {
    const record = input.engine.read.record.get(recordId)
    const initialValue = isTitleFieldId(fieldId)
      ? record?.title
      : record?.values[fieldId]
    let currentValue = initialValue

    for (const appearanceId of appearanceIds) {
      const next = input.grouping.next(
        currentValue,
        input.appearances.sectionOf(appearanceId),
        input.targetSection
      )
      if (!next) {
        return undefined
      }

      currentValue = 'clear' in next
        ? undefined
        : next.value
    }

    if (sameValue(initialValue, currentValue)) {
      continue
    }

    commands.push(
      toValueCommand(
        recordId,
        fieldId,
        currentValue === undefined
          ? { clear: true }
          : { value: currentValue }
      )
    )
  }

  return commands
}

export const createViewEngineApi = (options: {
  engine: Pick<Engine, 'read' | 'command' | 'fields'>
  viewId: ViewId
}): ViewEngineApi => {
  const dispatch = (
    command: Parameters<Engine['command']>[0]
  ) => options.engine.command(command)
  const readDocument = () => options.engine.read.document.get()
  const readCurrentView = () => getDocumentViewById(readDocument(), options.viewId)
  const readCurrentProjection = () => options.engine.read.viewProjection.get(options.viewId)

  const commit = (command: Command | readonly Command[]) => dispatch(command).applied

  const createMoveOrderCommand = (
    recordIds: readonly RecordId[],
    beforeRecordId?: RecordId
  ): Command | undefined => {
    const nextRecordIds = uniqueIds(recordIds)
    if (!nextRecordIds.length) {
      return undefined
    }

    return {
      type: 'view.order.move',
      viewId: options.viewId,
      recordIds: nextRecordIds,
      ...(beforeRecordId ? { beforeRecordId } : {})
    }
  }

  const order: ViewOrderApi = {
    move: (recordIds, beforeRecordId) => {
      const command = createMoveOrderCommand(recordIds, beforeRecordId)
      if (command) {
        commit(command)
      }
    },
    clear: () => {
      commit({
        type: 'view.order.clear',
        viewId: options.viewId
      })
    }
  }

  const items: ViewItemsApi = {
    moveAppearances: (appearanceIds, target) => {
      const currentView = readCurrentProjection()
      if (!currentView) {
        return
      }

      const grouping = createGrouping({
        document: readDocument(),
        view: currentView.view,
        sections: currentView.sections
      })
      const plan = move.plan(currentView.appearances, appearanceIds, target)
      if (!plan.changed || !plan.ids.length) {
        return
      }

      const recordIds = recordIdsOfAppearances(currentView.appearances, plan.ids)
      if (!recordIds.length) {
        return
      }

      const sectionChanged = plan.ids.some(id => currentView.appearances.sectionOf(id) !== plan.target.section)
      if (sectionChanged && currentView.view.group && !grouping) {
        return
      }

      const sectionRecordIds = readSectionRecordIds(
        {
          sections: currentView.sections,
          appearances: currentView.appearances
        },
        plan.target.section
      )
      const rawBeforeRecordId = plan.target.before
        ? currentView.appearances.get(plan.target.before)?.recordId
        : undefined
      const beforeRecordId = rawBeforeRecordId
        ? move.before(
            sectionRecordIds,
            sectionRecordIds.indexOf(rawBeforeRecordId),
            recordIds
          )
        : undefined
      const commands: Command[] = []

      if (sectionChanged && grouping) {
        const valueCommands = createGroupWriteCommands({
          engine: options.engine,
          view: currentView.view,
          appearances: currentView.appearances,
          ids: plan.ids,
          targetSection: plan.target.section,
          grouping
        })
        if (!valueCommands) {
          return
        }

        commands.push(...valueCommands)
      }

      if (!currentView.view.sort.length) {
        const moveCommand = createMoveOrderCommand(recordIds, beforeRecordId)
        if (moveCommand) {
          commands.push(moveCommand)
        }
      }

      if (commands.length) {
        dispatch(commands)
      }
    },
    createInSection: (sectionKey, input) => {
      const currentView = readCurrentProjection()
      if (!currentView) {
        return undefined
      }

      const fieldId = currentView.view.group?.field
      const grouping = createGrouping({
        document: readDocument(),
        view: currentView.view,
        sections: currentView.sections
      })
      if (currentView.view.group && !grouping) {
        return undefined
      }

      const values: Partial<Record<string, unknown>> = {
        ...(input?.values ?? {})
      }
      let title = input?.title?.trim()

      if (fieldId && grouping) {
        const next = grouping.next(
          isTitleFieldId(fieldId)
            ? title
            : values[fieldId],
          undefined,
          sectionKey
        )
        if (!next) {
          return undefined
        }

        if (isTitleFieldId(fieldId)) {
          if (!('clear' in next)) {
            title = String(next.value ?? '')
          }
        } else if ('clear' in next) {
          delete values[fieldId]
        } else {
          values[fieldId] = next.value
        }
      }

      const recordId = createRecordId()
      const commands: Command[] = [{
        type: 'record.create',
        input: {
          id: recordId,
          ...(title ? { title } : {}),
          values
        }
      }]

      if (
        currentView.view.type === 'kanban'
        && currentView.view.options.kanban.newRecordPosition === 'start'
        && !currentView.view.sort.length
      ) {
        const beforeRecordId = readSectionRecordIds(
          {
            sections: currentView.sections,
            appearances: currentView.appearances
          },
          sectionKey
        )[0]
        const moveCommand = createMoveOrderCommand([recordId], beforeRecordId)
        if (moveCommand) {
          commands.push(moveCommand)
        }
      }

      const result = dispatch(commands)
      return result.applied
        ? recordId
        : undefined
    },
    removeAppearances: appearanceIds => {
      const currentView = readCurrentProjection()
      if (!currentView) {
        return
      }

      const recordIds = recordIdsOfAppearances(currentView.appearances, appearanceIds)
      if (!recordIds.length) {
        return
      }

      dispatch({
        type: 'record.remove',
        recordIds: [...recordIds]
      })
    },
    writeCell: (cell, value) => {
      const currentView = readCurrentProjection()
      if (!currentView) {
        return
      }

      const target = toRecordField(cell, currentView.appearances)
      if (!target) {
        return
      }

      if (value === undefined) {
        dispatch(
          isTitleFieldId(target.fieldId)
            ? {
                type: 'record.apply',
                target: {
                  type: 'record',
                  recordId: target.recordId
                },
                patch: {
                  title: ''
                }
              }
            : {
                type: 'value.apply',
                target: {
                  type: 'record',
                  recordId: target.recordId
                },
                action: {
                  type: 'clear',
                  field: target.fieldId
                }
              }
        )
        return
      }

      dispatch(
        isTitleFieldId(target.fieldId)
          ? {
              type: 'record.apply',
              target: {
                type: 'record',
                recordId: target.recordId
              },
              patch: {
                title: String(value ?? '')
              }
            }
          : {
              type: 'value.apply',
              target: {
                type: 'record',
                recordId: target.recordId
              },
              action: {
                type: 'set',
                field: target.fieldId,
                value
              }
            }
      )
    }
  }

  const type: ViewEngineApi['type'] = {
    set: value => {
      commit({
        type: 'view.type.set',
        viewId: options.viewId,
        value
      })
    }
  }

  const search: ViewEngineApi['search'] = {
    set: value => {
      commit({
        type: 'view.search.set',
        viewId: options.viewId,
        value
      })
    }
  }

  const filter: ViewEngineApi['filter'] = {
    add: fieldId => {
      commit({
        type: 'view.filter.add',
        viewId: options.viewId,
        fieldId
      })
    },
    replace: (index, rule) => {
      commit({
        type: 'view.filter.replace',
        viewId: options.viewId,
        index,
        rule
      })
    },
    remove: index => {
      commit({
        type: 'view.filter.remove',
        viewId: options.viewId,
        index
      })
    },
    clear: () => {
      commit({
        type: 'view.filter.clear',
        viewId: options.viewId
      })
    }
  }

  const sort: ViewEngineApi['sort'] = {
    add: (fieldId, direction) => {
      commit({
        type: 'view.sort.add',
        viewId: options.viewId,
        fieldId,
        ...(direction ? { direction } : {})
      })
    },
    set: (fieldId, direction) => {
      commit({
        type: 'view.sort.set',
        viewId: options.viewId,
        fieldId,
        direction
      })
    },
    only: (fieldId, direction) => {
      commit({
        type: 'view.sort.only',
        viewId: options.viewId,
        fieldId,
        direction
      })
    },
    replace: (index, sorter) => {
      commit({
        type: 'view.sort.replace',
        viewId: options.viewId,
        index,
        sorter
      })
    },
    remove: index => {
      commit({
        type: 'view.sort.remove',
        viewId: options.viewId,
        index
      })
    },
    move: (from, to) => {
      commit({
        type: 'view.sort.move',
        viewId: options.viewId,
        from,
        to
      })
    },
    clear: () => {
      commit({
        type: 'view.sort.clear',
        viewId: options.viewId
      })
    }
  }

  const group: ViewEngineApi['group'] = {
    set: fieldId => {
      commit({
        type: 'view.group.set',
        viewId: options.viewId,
        fieldId
      })
    },
    clear: () => {
      commit({
        type: 'view.group.clear',
        viewId: options.viewId
      })
    },
    toggle: fieldId => {
      commit({
        type: 'view.group.toggle',
        viewId: options.viewId,
        fieldId
      })
    },
    setMode: value => {
      commit({
        type: 'view.group.mode.set',
        viewId: options.viewId,
        value
      })
    },
    setSort: value => {
      commit({
        type: 'view.group.sort.set',
        viewId: options.viewId,
        value
      })
    },
    setInterval: value => {
      commit({
        type: 'view.group.interval.set',
        viewId: options.viewId,
        ...(value !== undefined ? { value } : {})
      })
    },
    setShowEmpty: value => {
      commit({
        type: 'view.group.empty.set',
        viewId: options.viewId,
        value
      })
    },
    show: key => {
      commit({
        type: 'view.group.bucket.show',
        viewId: options.viewId,
        key
      })
    },
    hide: key => {
      commit({
        type: 'view.group.bucket.hide',
        viewId: options.viewId,
        key
      })
    },
    collapse: key => {
      commit({
        type: 'view.group.bucket.collapse',
        viewId: options.viewId,
        key
      })
    },
    expand: key => {
      commit({
        type: 'view.group.bucket.expand',
        viewId: options.viewId,
        key
      })
    },
    toggleCollapse: key => {
      commit({
        type: 'view.group.bucket.toggleCollapse',
        viewId: options.viewId,
        key
      })
    }
  }

  const calc: ViewEngineApi['calc'] = {
    set: (fieldId, metric) => {
      commit({
        type: 'view.calc.set',
        viewId: options.viewId,
        fieldId,
        metric
      })
    }
  }

  const display: ViewEngineApi['display'] = {
    replace: fieldIds => {
      commit({
        type: 'view.display.replace',
        viewId: options.viewId,
        fieldIds: [...fieldIds]
      })
    },
    move: (fieldIds, beforeFieldId) => {
      commit({
        type: 'view.display.move',
        viewId: options.viewId,
        fieldIds: [...fieldIds],
        ...(beforeFieldId !== undefined ? { beforeFieldId } : {})
      })
    },
    show: (fieldId, beforeFieldId) => {
      commit({
        type: 'view.display.show',
        viewId: options.viewId,
        fieldId,
        ...(beforeFieldId !== undefined ? { beforeFieldId } : {})
      })
    },
    hide: fieldId => {
      commit({
        type: 'view.display.hide',
        viewId: options.viewId,
        fieldId
      })
    },
    clear: () => {
      commit({
        type: 'view.display.clear',
        viewId: options.viewId
      })
    }
  }

  const tableSettings: ViewTableApi = {
    setColumnWidths: widths => {
      commit({
        type: 'view.table.setWidths',
        viewId: options.viewId,
        widths
      })
    },
    setVerticalLines: value => {
      commit({
        type: 'view.table.verticalLines.set',
        viewId: options.viewId,
        value
      })
    }
  }

  const readVisibleFieldIds = () => (
    readCurrentView()?.display.fields ?? []
  )

  const resolveInsertBeforeId = (
    anchorFieldId: FieldId,
    side: 'left' | 'right'
  ): FieldId | null => {
    const fieldIds = readVisibleFieldIds()
    const anchorIndex = fieldIds.findIndex(fieldId => fieldId === anchorFieldId)
    if (anchorIndex === -1) {
      return null
    }

    return side === 'left'
      ? anchorFieldId
      : fieldIds[anchorIndex + 1] ?? null
  }

  const createField = (input?: {
    name?: string
    kind?: CustomFieldKind
  }): CustomFieldId | undefined => {
    const kind = input?.kind ?? 'text'
    const explicitName = input?.name?.trim()
    const name = explicitName || createUniqueFieldName(
      renderMessage(meta.field.kind.get(kind).defaultName),
      options.engine.fields.list()
    )

    if (!name) {
      return undefined
    }

    return options.engine.fields.create({
      name,
      kind
    })
  }

  const table: ViewEngineApi['table'] = {
    setWidths: widths => {
      tableSettings.setColumnWidths(widths)
    },
    setVerticalLines: value => {
      tableSettings.setVerticalLines(value)
    },
    insertLeft: (anchorFieldId, input) => {
      const fieldId = createField(input)
      if (!fieldId) {
        return undefined
      }

      display.show(fieldId, resolveInsertBeforeId(anchorFieldId, 'left'))
      return fieldId
    },
    insertRight: (anchorFieldId, input) => {
      const fieldId = createField(input)
      if (!fieldId) {
        return undefined
      }

      display.show(fieldId, resolveInsertBeforeId(anchorFieldId, 'right'))
      return fieldId
    }
  }

  const gallery: ViewGalleryApi = {
    setLabels: value => {
      commit({
        type: 'view.gallery.labels.set',
        viewId: options.viewId,
        value
      })
    },
    setCardSize: value => {
      commit({
        type: 'view.gallery.setCardSize',
        viewId: options.viewId,
        value
      })
    }
  }

  const kanban: ViewKanbanApi = {
    setNewRecordPosition: value => {
      commit({
        type: 'view.kanban.setNewRecordPosition',
        viewId: options.viewId,
        value
      })
    },
    setFillColor: value => {
      commit({
        type: 'view.kanban.fillColor.set',
        viewId: options.viewId,
        value
      })
    }
  }

  const cards: KanbanApi = {
    createCard: (input: KanbanCreateCardInput) => {
      const document = readDocument()
      const view = readCurrentView()
      let title = input.title.trim()
      if (!view || !title) {
        return undefined
      }

      const grouping = resolveGrouping(document, options.viewId)
      const groupFieldId = view.group?.field
      if (view.group && !grouping) {
        return undefined
      }

      const values: Partial<Record<CustomFieldId, unknown>> = {}

      if (groupFieldId && grouping) {
        const next = grouping.next(
          isTitleFieldId(groupFieldId)
            ? title
            : values[groupFieldId],
          undefined,
          input.groupKey
        )
        if (!next) {
          return undefined
        }

        if (isTitleFieldId(groupFieldId)) {
          if (!('clear' in next)) {
            title = String(next.value ?? '')
          }
        } else if ('clear' in next) {
          delete values[groupFieldId]
        } else {
          values[groupFieldId] = next.value
        }
      }

      const recordId = createRecordId()
      const commands: Command[] = [{
        type: 'record.create',
        input: {
          id: recordId,
          title,
          values
        }
      }]

      const beforeRecordId = (
        view.type === 'kanban'
        && view.options.kanban.newRecordPosition === 'start'
        && !view.sort.length
      )
        ? resolveSectionRecordIds(document, options.viewId, input.groupKey)[0]
        : undefined
      const insertOrderCommand = beforeRecordId
        ? createMoveOrderCommand([recordId], beforeRecordId)
        : undefined
      if (insertOrderCommand) {
        commands.push(insertOrderCommand)
      }

      const result = dispatch(commands)
      return result.applied
        ? recordId
        : undefined
    },
    moveCards: (input: KanbanMoveCardsInput) => {
      const document = readDocument()
      const view = readCurrentView()
      const recordIds = uniqueIds(input.recordIds)

      if (!view || !recordIds.length) {
        return
      }

      const grouping = resolveGrouping(document, options.viewId)
      const fieldId = view.group?.field
      if (!grouping || !fieldId) {
        return
      }

      const moveCommand = createMoveOrderCommand(recordIds, input.beforeRecordId)
      if (!moveCommand) {
        return
      }

      const valueCommands: Command[] = []

      for (const recordId of recordIds) {
        const record = options.engine.read.record.get(recordId)
        const currentValue = isTitleFieldId(fieldId)
          ? record?.title
          : record?.values[fieldId]
        const next = grouping.next(
          currentValue,
          undefined,
          input.groupKey
        )
        if (!next) {
          return
        }

        valueCommands.push(
          isTitleFieldId(fieldId)
            ? {
                type: 'record.apply',
                target: {
                  type: 'record',
                  recordId
                },
                patch: {
                  title: 'clear' in next
                    ? ''
                    : String(next.value ?? '')
                }
              }
            : 'clear' in next
              ? {
                  type: 'value.apply',
                  target: {
                    type: 'record',
                    recordId
                  },
                  action: {
                    type: 'clear',
                    field: fieldId
                  }
                }
              : {
                  type: 'value.apply',
                  target: {
                    type: 'record',
                    recordId
                  },
                  action: {
                    type: 'set',
                    field: fieldId,
                    value: next.value
                  }
                }
        )
      }

      dispatch([...valueCommands, moveCommand])
    }
  }

  return {
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
    cards
  }
}
