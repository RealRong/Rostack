import type {
  Field,
  FieldId,
  Command,
  CustomFieldId,
  CustomFieldKind,
  View,
  ViewGroup,
  ViewType,
  RecordId,
  ViewId
} from '@dataview/core/contracts'
import {
  group as groupCore,
  type ViewGroupProjection,
  type GroupWriteResult
} from '@dataview/core/group'
import { getDocumentViewById } from '@dataview/core/document'
import { isTitleFieldId } from '@dataview/core/field'
import { createUniqueFieldName } from '@dataview/core/field'
import {
  recordIdsOfAppearances,
  readSectionRecordIds,
  move,
  toRecordField,
  type CellRef,
} from '@dataview/engine/viewmodel'
import type {
  AppearanceId,
  AppearanceList,
  Section,
  SectionKey
} from '@dataview/engine/project/model'
import type {
  Placement
} from '@dataview/engine/viewmodel/types'
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
import {
  createViewCommandNamespaces
} from './viewCommands'

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
  next: Exclude<GroupWriteResult, { kind: 'invalid' }>
): Command => (
  isTitleFieldId(fieldId)
    ? {
        type: 'record.apply',
        target: {
          type: 'record',
          recordId
        },
        patch: {
          title: next.kind === 'clear'
            ? ''
            : String(next.value ?? '')
        }
      }
    : next.kind === 'clear'
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
  group: ViewGroup
  field: Field
  appearances: AppearanceList
  ids: readonly AppearanceId[]
  targetSection: string
}): readonly Command[] | undefined => {
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

  const commands: Command[] = []

  for (const [recordId, appearanceIds] of appearanceIdsByRecordId) {
    const record = input.engine.read.record.get(recordId)
    const initialValue = isTitleFieldId(fieldId)
      ? record?.title
      : record?.values[fieldId]
    let currentValue = initialValue

    for (const appearanceId of appearanceIds) {
      const next = groupCore.write.next({
        field: input.field,
        group: input.group,
        currentValue,
        fromKey: input.appearances.sectionOf(appearanceId),
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
      toValueCommand(
        recordId,
        fieldId,
        currentValue === undefined
          ? { kind: 'clear' }
          : { kind: 'set', value: currentValue }
      )
    )
  }

  return commands
}

const readGroupWriteContext = (
  groupProjection: ViewGroupProjection | undefined
): {
  group: ViewGroup
  field: Field
} | undefined => {
  const group = groupProjection?.group
  const field = groupProjection?.field
  return group && field
    ? {
        group,
        field
      }
    : undefined
}

interface ActiveViewContext {
  view: View
  groupProjection: ViewGroupProjection | undefined
  appearances: AppearanceList
  sections: readonly Section[]
}

export const createViewEngineApi = (options: {
  engine: Pick<Engine, 'read' | 'project' | 'command' | 'fields'>
  viewId: ViewId
}): ViewEngineApi => {
  const dispatch = (
    command: Parameters<Engine['command']>[0]
  ) => options.engine.command(command)
  const readDocument = () => options.engine.read.document.get()
  const readCurrentView = () => getDocumentViewById(readDocument(), options.viewId)
  const readCurrentProjection = (): ActiveViewContext | undefined => {
    const view = options.engine.read.activeView.get()
    if (!view || view.id !== options.viewId) {
      return undefined
    }

    const appearances = options.engine.project.appearances.get()
    const sections = options.engine.project.sections.get()
    if (!appearances || !sections) {
      return undefined
    }

    return {
      view,
      groupProjection: options.engine.project.group.get(),
      appearances,
      sections
    }
  }

  const commit = (command: Command | readonly Command[]) => dispatch(command).applied
  const commands = createViewCommandNamespaces({
    viewId: options.viewId,
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
    moveAppearances: (appearanceIds, target) => {
      const currentView = readCurrentProjection()
      if (!currentView) {
        return
      }

      const groupWrite = readGroupWriteContext(currentView.groupProjection)
      const plan = move.plan(currentView.appearances, appearanceIds, target)
      if (!plan.changed || !plan.ids.length) {
        return
      }

      const recordIds = recordIdsOfAppearances(currentView.appearances, plan.ids)
      if (!recordIds.length) {
        return
      }

      const sectionChanged = plan.ids.some(id => currentView.appearances.sectionOf(id) !== plan.target.section)
      if (sectionChanged && currentView.view.group && !groupWrite) {
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
      const nextCommands: Command[] = []

      if (sectionChanged && groupWrite) {
        const valueCommands = createGroupWriteCommands({
          engine: options.engine,
          group: groupWrite.group,
          field: groupWrite.field,
          appearances: currentView.appearances,
          ids: plan.ids,
          targetSection: plan.target.section
        })
        if (!valueCommands) {
          return
        }

        nextCommands.push(...valueCommands)
      }

      if (!currentView.view.sort.length) {
        const moveCommand = commands.createMoveOrderCommand(recordIds, beforeRecordId)
        if (moveCommand) {
          nextCommands.push(moveCommand)
        }
      }

      if (nextCommands.length) {
        dispatch(nextCommands)
      }
    },
    createInSection: (sectionKey, input) => {
      const currentView = readCurrentProjection()
      if (!currentView) {
        return undefined
      }

      const groupWrite = readGroupWriteContext(currentView.groupProjection)
      if (currentView.view.group && !groupWrite) {
        return undefined
      }

      const values: Partial<Record<string, unknown>> = {
        ...(input?.values ?? {})
      }
      let title = input?.title?.trim()

      if (groupWrite) {
        const fieldId = groupWrite.group.field
        const next = groupCore.write.next({
          field: groupWrite.field,
          group: groupWrite.group,
          currentValue: isTitleFieldId(fieldId)
            ? title
            : values[fieldId],
          toKey: sectionKey
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
      const nextCommands: Command[] = [{
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
        const moveCommand = commands.createMoveOrderCommand([recordId], beforeRecordId)
        if (moveCommand) {
          nextCommands.push(moveCommand)
        }
      }

      const result = dispatch(nextCommands)
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

  const cards: KanbanApi = {
    createCard: (input: KanbanCreateCardInput) => {
      const currentView = readCurrentProjection()
      let title = input.title.trim()
      if (!currentView || !title) {
        return undefined
      }

      const groupWrite = readGroupWriteContext(currentView.groupProjection)
      if (currentView.view.group && !groupWrite) {
        return undefined
      }

      const values: Partial<Record<CustomFieldId, unknown>> = {}

      if (groupWrite) {
        const fieldId = groupWrite.group.field
        const next = groupCore.write.next({
          field: groupWrite.field,
          group: groupWrite.group,
          currentValue: isTitleFieldId(fieldId)
            ? title
            : values[fieldId],
          toKey: input.groupKey
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
      const nextCommands: Command[] = [{
        type: 'record.create',
        input: {
          id: recordId,
          title,
          values
        }
      }]

      const beforeRecordId = (
        currentView.view.type === 'kanban'
        && currentView.view.options.kanban.newRecordPosition === 'start'
        && !currentView.view.sort.length
      )
        ? readSectionRecordIds(
            {
              sections: currentView.sections,
              appearances: currentView.appearances
            },
            input.groupKey
          )[0]
        : undefined
      const insertOrderCommand = beforeRecordId
        ? commands.createMoveOrderCommand([recordId], beforeRecordId)
        : undefined
      if (insertOrderCommand) {
        nextCommands.push(insertOrderCommand)
      }

      const result = dispatch(nextCommands)
      return result.applied
        ? recordId
        : undefined
    },
    moveCards: (input: KanbanMoveCardsInput) => {
      const currentView = readCurrentProjection()
      const recordIds = Array.from(new Set(input.recordIds))

      if (!currentView || !recordIds.length) {
        return
      }

      const groupWrite = readGroupWriteContext(currentView.groupProjection)
      if (!groupWrite) {
        return
      }

      const moveCommand = commands.createMoveOrderCommand(recordIds, input.beforeRecordId)
      if (!moveCommand) {
        return
      }

      const valueCommands: Command[] = []
      const fieldId = groupWrite.group.field

      for (const recordId of recordIds) {
        const record = options.engine.read.record.get(recordId)
        const currentValue = isTitleFieldId(fieldId)
          ? record?.title
          : record?.values[fieldId]
        const next = groupCore.write.next({
          field: groupWrite.field,
          group: groupWrite.group,
          currentValue,
          toKey: input.groupKey
        })
        if (next.kind === 'invalid') {
          return
        }

        valueCommands.push(toValueCommand(recordId, fieldId, next))
      }

      dispatch([...valueCommands, moveCommand])
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
    cards
  }
}
