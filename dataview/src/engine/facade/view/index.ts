import type {
  Action,
  Field,
  FieldId,
  CustomFieldId,
  CustomFieldKind,
  DataDoc,
  View,
  ViewGroup,
  RecordId,
  ViewId
} from '@dataview/core/contracts'
import {
  group as groupCore
} from '@dataview/core/group'
import { isTitleFieldId } from '@dataview/core/field'
import { createUniqueFieldName } from '@dataview/core/field'
import {
  type CellRef
} from '@dataview/engine/project'
import type {
  AppearanceId,
  AppearanceList
} from '@dataview/engine/project'
import { createRecordId } from '@dataview/engine/command/entityId'
import { meta, renderMessage } from '@dataview/meta'
import type {
  ActiveEngineApi,
  ActiveViewState,
  FieldsEngineApi,
  RecordsEngineApi,
  ViewCellsApi,
  ViewGalleryApi,
  ViewItemsApi,
  ViewKanbanApi,
  ViewOrderApi
} from '../../api/public'
import {
  createViewCommandNamespaces
} from './commands'

type ActiveViewCommandsApi = Omit<
  Pick<
    ActiveEngineApi,
    | 'type'
    | 'search'
    | 'filter'
    | 'sort'
    | 'group'
    | 'calc'
    | 'display'
    | 'table'
    | 'gallery'
    | 'kanban'
    | 'order'
    | 'items'
    | 'cells'
  >,
  'gallery' | 'kanban'
> & {
  gallery: ViewGalleryApi
  kanban: ViewKanbanApi
}

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

const toRecordFieldAction = (
  recordId: RecordId,
  fieldId: FieldId,
  value: unknown | undefined
): Action => (
  isTitleFieldId(fieldId)
    ? {
        type: 'record.patch',
        target: {
          type: 'record',
          recordId
        },
        patch: {
          title: value === undefined
            ? ''
            : String(value ?? '')
        }
      }
    : value === undefined
      ? {
          type: 'value.clear',
          target: {
            type: 'record',
            recordId
          },
          field: fieldId
        }
      : {
          type: 'value.set',
          target: {
            type: 'record',
            recordId
          },
          field: fieldId,
          value
        }
)

const createGroupWriteCommands = (input: {
  readRecord: (recordId: RecordId) => ReturnType<ActiveEngineApi['read']['record']>
  group: ViewGroup
  field: Field
  appearances: AppearanceList
  ids: readonly AppearanceId[]
  targetSection: string
}): readonly Action[] | undefined => {
  const fieldId = input.group.field

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

  const commands: Action[] = []

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
        toKey: input.targetSection
      })
      if (next.kind === 'invalid') {
        return undefined
      }

      currentValue = next.kind === 'clear'
        ? undefined
        : next.value
    }

    if (sameValue(initialValue, currentValue)) {
      continue
    }

    commands.push(
      toRecordFieldAction(
        recordId,
        fieldId,
        currentValue
      )
    )
  }

  return commands
}

export const createActiveViewApi = (options: {
  readViewId: () => ViewId | undefined
  readDocument: () => DataDoc
  readView: () => View | undefined
  readState: () => ActiveViewState | undefined
  activeRead: ActiveEngineApi['read']
  readRecord: ActiveEngineApi['read']['record']
  dispatch: (action: Action | readonly Action[]) => {
    applied: boolean
  }
  fields: Pick<FieldsEngineApi, 'list' | 'create'>
  records: Pick<RecordsEngineApi, 'field'>
}): ActiveViewCommandsApi => {
  const readDocument = options.readDocument
  const readCurrentView = options.readView

  const commit = (action: Action | readonly Action[]) => options.dispatch(action).applied
  const commands = createViewCommandNamespaces({
    readViewId: options.readViewId,
    commit,
    readDocument,
    readView: readCurrentView
  })

  const order: ViewOrderApi = {
    move: (recordIds, beforeRecordId) => {
      const command = commands.createMoveOrderCommand(recordIds, beforeRecordId)
      if (command) {
        commit(command)
      }
    },
    clear: commands.clearOrder
  }

  const items: ViewItemsApi = {
    move: (appearanceIds, target) => {
      const state = options.readState()
      if (!state) {
        return
      }

      const groupWrite = state.query.group.group && state.query.group.field
        ? {
            group: state.query.group.group,
            field: state.query.group.field
          }
        : undefined
      const resolvedPlan = options.activeRead.planMove(appearanceIds, target)
      if (!resolvedPlan.changed || !resolvedPlan.appearanceIds.length) {
        return
      }

      if (!resolvedPlan.recordIds.length) {
        return
      }

      if (resolvedPlan.sectionChanged && state.view.group && !groupWrite) {
        return
      }
      const nextCommands: Action[] = []

      if (resolvedPlan.sectionChanged && groupWrite) {
        const valueCommands = createGroupWriteCommands({
          readRecord: options.readRecord,
          group: groupWrite.group,
          field: groupWrite.field,
          appearances: state.appearances,
          ids: resolvedPlan.appearanceIds,
          targetSection: resolvedPlan.target.sectionKey
        })
        if (!valueCommands) {
          return
        }

        nextCommands.push(...valueCommands)
      }

      if (!state.view.sort.length) {
        const moveCommand = commands.createMoveOrderCommand(
          resolvedPlan.recordIds,
          resolvedPlan.target.beforeRecordId
        )
        if (moveCommand) {
          nextCommands.push(moveCommand)
        }
      }

      if (nextCommands.length) {
        options.dispatch(nextCommands)
      }
    },
    create: input => {
      const state = options.readState()
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
      const nextCommands: Action[] = [{
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
        const moveCommand = commands.createMoveOrderCommand([recordId], beforeRecordId)
        if (moveCommand) {
          nextCommands.push(moveCommand)
        }
      }

      const result = options.dispatch(nextCommands)
      return result.applied
        ? recordId
        : undefined
    },
    remove: appearanceIds => {
      const state = options.readState()
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

  const writeCell = (
    cell: CellRef,
    value: unknown | undefined
  ) => {
    const target = options.activeRead.cell(cell)
    if (!target) {
      return
    }

    if (value === undefined) {
      options.records.field.clear(target.recordId, target.fieldId)
      return
    }

    options.records.field.set(target.recordId, target.fieldId, value)
  }

  const cells: ViewCellsApi = {
    set: (cell, value) => {
      if (!options.readState()) {
        return
      }

      writeCell(cell, value)
    },
    clear: cell => {
      if (!options.readState()) {
        return
      }

      writeCell(cell, undefined)
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

  const table: ActiveEngineApi['table'] = {
    setWidths: widths => {
      commands.tableSettings.setColumnWidths(widths)
    },
    setVerticalLines: value => {
      commands.tableSettings.setVerticalLines(value)
    },
    insertLeft: (anchorFieldId, input) => {
      const fieldId = createField(input)
      if (!fieldId) {
        return undefined
      }

      commands.display.show(fieldId, resolveInsertBeforeId(anchorFieldId, 'left'))
      return fieldId
    },
    insertRight: (anchorFieldId, input) => {
      const fieldId = createField(input)
      if (!fieldId) {
        return undefined
      }

      commands.display.show(fieldId, resolveInsertBeforeId(anchorFieldId, 'right'))
      return fieldId
    }
  }

  return {
    type: commands.type,
    search: commands.search,
    filter: commands.filter,
    sort: commands.sort,
    group: commands.group,
    calc: commands.calc,
    display: commands.display,
    table,
    gallery: commands.gallery,
    kanban: commands.kanban,
    order,
    items,
    cells
  }
}
