import type {
  FieldId,
  Command,
  RecordId,
  ViewId
} from '@dataview/core/contracts'
import { isTitleFieldId } from '@dataview/core/field'
import {
  createRecordId
} from '@dataview/engine/command/entityId'
import type {
  Engine
} from '@dataview/engine'
import {
  createGrouping,
  move,
  readSectionRecordIds,
  recordIdsOfAppearances,
  type ViewProjection,
  type GroupingNextValue,
  type Grouping
} from '@dataview/engine/projection/view'
import {
  AppearanceList,
  Commands,
  CreateInSectionInput,
  Placement,
  Section
} from './types'
import type {
  SelectionStore
} from '@dataview/react/runtime/selection'

const createMoveOrderCommand = (
  viewId: ViewId,
  recordIds: readonly RecordId[],
  beforeRecordId?: RecordId
): Command | undefined => {
  if (!recordIds.length) {
    return undefined
  }

  return {
    type: 'view.order.move',
    viewId,
    recordIds: [...recordIds],
    ...(beforeRecordId ? { beforeRecordId } : {})
  }
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
  engine: Engine
  view: ViewProjection['view']
  appearances: AppearanceList
  ids: readonly string[]
  targetSection: string
  grouping: Grouping
}): readonly Command[] | undefined => {
  const fieldId = input.view.query.group?.field
  if (!fieldId) {
    return []
  }

  const appearanceIdsByRecordId = new Map<RecordId, string[]>()

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

const moveIds = (input: {
  engine: Engine
  view: ViewProjection['view']
  appearances: AppearanceList
  grouping?: Grouping
  sections: readonly Section[]
  ids: readonly string[]
  target: Placement
}) => {
  const plan = move.plan(input.appearances, input.ids, input.target)
  if (!plan.changed || !plan.ids.length) {
    return
  }

  const recordIds = recordIdsOfAppearances(input.appearances, plan.ids)
  if (!recordIds.length) {
    return
  }

  const sectionChanged = plan.ids.some(id => input.appearances.sectionOf(id) !== plan.target.section)
  if (sectionChanged && input.view.query.group && !input.grouping) {
    return
  }

  const sectionRecordIds = readSectionRecordIds(
    {
      sections: input.sections,
      appearances: input.appearances
    },
    plan.target.section
  )
  const rawBeforeRecordId = plan.target.before
    ? input.appearances.get(plan.target.before)?.recordId
    : undefined
  const beforeRecordId = rawBeforeRecordId
    ? move.before(
        sectionRecordIds,
        sectionRecordIds.indexOf(rawBeforeRecordId),
        recordIds
      )
    : undefined
  const commands: Command[] = []

  if (sectionChanged && input.grouping) {
    const valueCommands = createGroupWriteCommands({
      engine: input.engine,
      view: input.view,
      appearances: input.appearances,
      ids: plan.ids,
      targetSection: plan.target.section,
      grouping: input.grouping
    })
    if (!valueCommands) {
      return
    }

    commands.push(...valueCommands)
  }

  if (!input.view.query.sorters.length) {
    const orderCommand = createMoveOrderCommand(
      input.view.id,
      recordIds,
      beforeRecordId
    )
    if (orderCommand) {
      commands.push(orderCommand)
    }
  }

  if (!commands.length) {
    return
  }

  input.engine.command(commands)
}

const createInSection = (input: {
  engine: Engine
  view: ViewProjection['view']
  appearances: AppearanceList
  grouping?: Grouping
  sections: readonly Section[]
  section: string
  createInput?: CreateInSectionInput
}) => {
  const fieldId = input.view.query.group?.field
  if (input.view.query.group && !input.grouping) {
    return undefined
  }

  const values: Partial<Record<string, unknown>> = {
    ...(input.createInput?.values ?? {})
  }

  let title = input.createInput?.title?.trim()

  if (fieldId && input.grouping) {
    const next = input.grouping.next(
      isTitleFieldId(fieldId)
        ? title
        : values[fieldId],
      undefined,
      input.section
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
    input.view.type === 'kanban'
    && input.view.options.kanban.newRecordPosition === 'start'
    && !input.view.query.sorters.length
  ) {
    const beforeRecordId = readSectionRecordIds(
      {
        sections: input.sections,
        appearances: input.appearances
      },
      input.section
    )[0]
    const orderCommand = beforeRecordId
      ? createMoveOrderCommand(input.view.id, [recordId], beforeRecordId)
      : undefined

    if (orderCommand) {
      commands.push(orderCommand)
    }
  }

  const result = input.engine.command(commands)

  return result.applied
    ? recordId
    : undefined
}

const removeSelection = (input: {
  engine: Engine
  appearances: AppearanceList
  selection: SelectionStore
}) => {
  const recordIds = recordIdsOfAppearances(
    input.appearances,
    input.selection.get().ids
  )
  if (!recordIds.length) {
    return
  }

  input.engine.command({
    type: 'record.remove',
    recordIds: [...recordIds]
  })
}

export const createCommands = (input: {
  engine: Engine
  selection: SelectionStore
  currentView: () => ViewProjection | undefined
}): Commands => ({
  move: {
    ids: (ids, target) => {
      const currentView = input.currentView()
      if (!currentView) {
        return
      }

      const grouping = createGrouping({
        document: input.engine.read.document.get(),
        view: currentView.view,
        sections: currentView.sections
      })

      moveIds({
        engine: input.engine,
        view: currentView.view,
        appearances: currentView.appearances,
        grouping,
        sections: currentView.sections,
        ids,
        target
      })
    }
  },
  mutation: {
    create: (section, createInput) => {
      const currentView = input.currentView()
      if (!currentView) {
        return undefined
      }

      return createInSection({
        engine: input.engine,
        view: currentView.view,
        appearances: currentView.appearances,
        grouping: createGrouping({
          document: input.engine.read.document.get(),
          view: currentView.view,
          sections: currentView.sections
        }),
        sections: currentView.sections,
        section,
        createInput
      })
    },
    remove: () => {
      const currentView = input.currentView()
      if (!currentView) {
        return
      }

      removeSelection({
        engine: input.engine,
        appearances: currentView.appearances,
        selection: input.selection
      })
    }
  }
})
