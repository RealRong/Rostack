import type {
  CustomField,
  CustomFieldId,
  DataDoc,
  DataRecord,
  FieldId,
  FieldOption,
  FilterRule,
  RecordId,
  SortRule,
  View,
  ViewId,
  ViewFilterRuleId,
  ViewSortRuleId,
} from '@dataview/core/types'
import type {
  MutationDeltaInput,
  MutationFootprint,
  MutationOrderedAnchor,
  MutationProgramWriter,
} from '@shared/mutation'
import {
  fieldOptionsStructure,
  viewDisplayFieldsStructure,
  viewFilterRulesStructure,
  viewOrdersStructure,
  viewSortRulesStructure,
} from './targets'

type DataviewTag = string
type DataviewTags = readonly DataviewTag[] | undefined

type BeforeAnchorInput<TId extends string> = {
  before?: TId
}

const toOrderedAnchor = <TId extends string>(
  input?: MutationOrderedAnchor | BeforeAnchorInput<TId>
): MutationOrderedAnchor => {
  if (input && 'kind' in input) {
    return input
  }

  return input?.before
    ? {
        kind: 'before',
        itemId: input.before
      }
    : {
        kind: 'end'
      }
}

const createStructureFootprint = (
  structure: string,
  itemId?: string
): readonly MutationFootprint[] => itemId === undefined
  ? [{
      kind: 'structure',
      structure
    }]
  : [{
      kind: 'structure',
      structure
    }, {
      kind: 'structure-item',
      structure,
      id: itemId
    }]

const createIdPathDelta = (
  key: string,
  id: string,
  path: string
): MutationDeltaInput => ({
  changes: {
    [key]: {
      ids: [id],
      paths: {
        [id]: [path]
      }
    }
  }
})

const createExternalVersionDelta = (): MutationDeltaInput => ({
  changes: {
    'external.version': true
  }
})

export type DataviewDocumentPatch = Partial<Pick<
  DataDoc,
  'schemaVersion' | 'activeViewId' | 'meta'
>>

export type DataviewRecordPatch = Partial<Omit<DataRecord, 'id'>>
export type DataviewFieldPatch =
  | Partial<Omit<CustomField, 'id'>>
  | Readonly<Record<string, unknown>>
export type DataviewViewPatch = Partial<Omit<View, 'id'>>
export type DataviewFieldOptionPatch =
  | Partial<Omit<FieldOption, 'id'>>
  | Readonly<Record<string, unknown>>
export type DataviewFilterRulePatch = Partial<Omit<FilterRule, 'id'>>
export type DataviewSortRulePatch = Partial<Omit<SortRule, 'id'>>

export interface DataviewProgramWriter {
  document: {
    patch(patch: DataviewDocumentPatch, tags?: DataviewTags): void
  }
  record: {
    create(value: DataRecord, tags?: DataviewTags): void
    patch(id: RecordId, patch: DataviewRecordPatch, tags?: DataviewTags): void
    delete(id: RecordId, tags?: DataviewTags): void
    value: {
      writeMany(input: {
        recordIds: readonly RecordId[]
        set?: Partial<Record<FieldId, unknown>>
        clear?: readonly FieldId[]
        tags?: DataviewTags
      }): void
    }
  }
  field: {
    create(value: CustomField, tags?: DataviewTags): void
    patch(id: CustomFieldId, patch: DataviewFieldPatch, tags?: DataviewTags): void
    delete(id: CustomFieldId, tags?: DataviewTags): void
    option: {
      insert(
        fieldId: CustomFieldId,
        option: FieldOption,
        input?: MutationOrderedAnchor | BeforeAnchorInput<string>,
        tags?: DataviewTags
      ): void
      move(
        fieldId: CustomFieldId,
        optionId: string,
        input?: MutationOrderedAnchor | BeforeAnchorInput<string>,
        tags?: DataviewTags
      ): void
      splice(
        fieldId: CustomFieldId,
        optionIds: readonly string[],
        input?: MutationOrderedAnchor | BeforeAnchorInput<string>,
        tags?: DataviewTags
      ): void
      patch(
        fieldId: CustomFieldId,
        optionId: string,
        patch: DataviewFieldOptionPatch,
        tags?: DataviewTags
      ): void
      delete(
        fieldId: CustomFieldId,
        optionId: string,
        tags?: DataviewTags
      ): void
    }
  }
  view: {
    create(value: View, tags?: DataviewTags): void
    patch(id: ViewId, patch: DataviewViewPatch, tags?: DataviewTags): void
    delete(id: ViewId, tags?: DataviewTags): void
    filter: {
      insert(
        viewId: ViewId,
        rule: FilterRule,
        input?: MutationOrderedAnchor | BeforeAnchorInput<ViewFilterRuleId>,
        tags?: DataviewTags
      ): void
      move(
        viewId: ViewId,
        ruleId: ViewFilterRuleId,
        input?: MutationOrderedAnchor | BeforeAnchorInput<ViewFilterRuleId>,
        tags?: DataviewTags
      ): void
      splice(
        viewId: ViewId,
        ruleIds: readonly ViewFilterRuleId[],
        input?: MutationOrderedAnchor | BeforeAnchorInput<ViewFilterRuleId>,
        tags?: DataviewTags
      ): void
      patch(
        viewId: ViewId,
        ruleId: ViewFilterRuleId,
        patch: DataviewFilterRulePatch,
        tags?: DataviewTags
      ): void
      delete(
        viewId: ViewId,
        ruleId: ViewFilterRuleId,
        tags?: DataviewTags
      ): void
    }
    sort: {
      insert(
        viewId: ViewId,
        rule: SortRule,
        input?: MutationOrderedAnchor | BeforeAnchorInput<ViewSortRuleId>,
        tags?: DataviewTags
      ): void
      move(
        viewId: ViewId,
        ruleId: ViewSortRuleId,
        input?: MutationOrderedAnchor | BeforeAnchorInput<ViewSortRuleId>,
        tags?: DataviewTags
      ): void
      splice(
        viewId: ViewId,
        ruleIds: readonly ViewSortRuleId[],
        input?: MutationOrderedAnchor | BeforeAnchorInput<ViewSortRuleId>,
        tags?: DataviewTags
      ): void
      patch(
        viewId: ViewId,
        ruleId: ViewSortRuleId,
        patch: DataviewSortRulePatch,
        tags?: DataviewTags
      ): void
      delete(
        viewId: ViewId,
        ruleId: ViewSortRuleId,
        tags?: DataviewTags
      ): void
    }
    display: {
      insert(
        viewId: ViewId,
        fieldId: FieldId,
        input?: MutationOrderedAnchor | BeforeAnchorInput<FieldId>,
        tags?: DataviewTags
      ): void
      move(
        viewId: ViewId,
        fieldId: FieldId,
        input?: MutationOrderedAnchor | BeforeAnchorInput<FieldId>,
        tags?: DataviewTags
      ): void
      splice(
        viewId: ViewId,
        fieldIds: readonly FieldId[],
        input?: MutationOrderedAnchor | BeforeAnchorInput<FieldId>,
        tags?: DataviewTags
      ): void
      delete(
        viewId: ViewId,
        fieldId: FieldId,
        tags?: DataviewTags
      ): void
    }
    order: {
      insert(
        viewId: ViewId,
        recordId: RecordId,
        input?: MutationOrderedAnchor | BeforeAnchorInput<RecordId>,
        tags?: DataviewTags
      ): void
      move(
        viewId: ViewId,
        recordId: RecordId,
        input?: MutationOrderedAnchor | BeforeAnchorInput<RecordId>,
        tags?: DataviewTags
      ): void
      splice(
        viewId: ViewId,
        recordIds: readonly RecordId[],
        input?: MutationOrderedAnchor | BeforeAnchorInput<RecordId>,
        tags?: DataviewTags
      ): void
      delete(
        viewId: ViewId,
        recordId: RecordId,
        tags?: DataviewTags
      ): void
    }
  }
  signal: {
    externalVersion(tags?: DataviewTags): void
  }
}

export const createDataviewProgramWriter = (
  writer: MutationProgramWriter<DataviewTag>
): DataviewProgramWriter => ({
  document: {
    patch: (patch, tags) => {
      writer.entity.patch({
        table: 'document',
        id: 'document'
      }, patch, tags)
    }
  },
  record: {
    create: (value, tags) => {
      writer.entity.create({
        table: 'record',
        id: value.id
      }, value, tags)
    },
    patch: (id, patch, tags) => {
      writer.entity.patch({
        table: 'record',
        id
      }, patch, tags)
    },
    delete: (id, tags) => {
      writer.entity.delete({
        table: 'record',
        id
      }, tags)
    },
    value: {
      writeMany: ({ recordIds, set, clear, tags }) => {
        const clearKeys = new Set(clear ?? [])
        const setEntries = Object.entries(set ?? {})
        const updates = recordIds.map((id) => {
          const writes: Record<string, unknown> = {}

          setEntries.forEach(([fieldId, value]) => {
            if (fieldId === 'title') {
              writes.title = value
              return
            }
            writes[`values.${fieldId}`] = value
          })

          clearKeys.forEach((fieldId) => {
            if (fieldId === 'title') {
              writes.title = ''
              return
            }
            writes[`values.${fieldId}`] = undefined
          })

          return {
            id,
            writes
          }
        }).filter((entry) => Object.keys(entry.writes).length > 0)

        if (updates.length === 0) {
          return
        }

        writer.entity.patchMany(
          'record',
          updates,
          tags
        )
      }
    }
  },
  field: {
    create: (value, tags) => {
      writer.entity.create({
        table: 'field',
        id: value.id
      }, value, tags)
    },
    patch: (id, patch, tags) => {
      writer.entity.patch({
        table: 'field',
        id
      }, patch, tags)
    },
    delete: (id, tags) => {
      writer.entity.delete({
        table: 'field',
        id
      }, tags)
    },
    option: {
      insert: (fieldId, option, input, tags) => {
        const structure = fieldOptionsStructure(fieldId)
        writer.ordered.insert(
          structure,
          option.id,
          option,
          toOrderedAnchor(input),
          tags,
          {
            delta: createIdPathDelta('field.schema', fieldId, 'options'),
            footprint: createStructureFootprint(structure, option.id)
          }
        )
      },
      move: (fieldId, optionId, input, tags) => {
        const structure = fieldOptionsStructure(fieldId)
        writer.ordered.move(
          structure,
          optionId,
          toOrderedAnchor(input),
          tags,
          {
            delta: createIdPathDelta('field.schema', fieldId, 'options'),
            footprint: createStructureFootprint(structure, optionId)
          }
        )
      },
      splice: (fieldId, optionIds, input, tags) => {
        const structure = fieldOptionsStructure(fieldId)
        writer.ordered.splice(
          structure,
          optionIds,
          toOrderedAnchor(input),
          tags,
          {
            delta: createIdPathDelta('field.schema', fieldId, 'options'),
            footprint: optionIds.flatMap((optionId) => createStructureFootprint(structure, optionId))
          }
        )
      },
      patch: (fieldId, optionId, patch, tags) => {
        const structure = fieldOptionsStructure(fieldId)
        writer.ordered.patch(
          structure,
          optionId,
          patch,
          tags,
          {
            delta: createIdPathDelta('field.schema', fieldId, 'options'),
            footprint: createStructureFootprint(structure, optionId)
          }
        )
      },
      delete: (fieldId, optionId, tags) => {
        const structure = fieldOptionsStructure(fieldId)
        writer.ordered.delete(
          structure,
          optionId,
          tags,
          {
            delta: createIdPathDelta('field.schema', fieldId, 'options'),
            footprint: createStructureFootprint(structure, optionId)
          }
        )
      }
    }
  },
  view: {
    create: (value, tags) => {
      writer.entity.create({
        table: 'view',
        id: value.id
      }, value, tags)
    },
    patch: (id, patch, tags) => {
      writer.entity.patch({
        table: 'view',
        id
      }, patch, tags)
    },
    delete: (id, tags) => {
      writer.entity.delete({
        table: 'view',
        id
      }, tags)
    },
    filter: {
      insert: (viewId, rule, input, tags) => {
        const structure = viewFilterRulesStructure(viewId)
        writer.ordered.insert(
          structure,
          rule.id,
          rule,
          toOrderedAnchor(input),
          tags,
          {
            delta: createIdPathDelta('view.query', viewId, 'filter'),
            footprint: createStructureFootprint(structure, rule.id)
          }
        )
      },
      move: (viewId, ruleId, input, tags) => {
        const structure = viewFilterRulesStructure(viewId)
        writer.ordered.move(
          structure,
          ruleId,
          toOrderedAnchor(input),
          tags,
          {
            delta: createIdPathDelta('view.query', viewId, 'filter'),
            footprint: createStructureFootprint(structure, ruleId)
          }
        )
      },
      splice: (viewId, ruleIds, input, tags) => {
        const structure = viewFilterRulesStructure(viewId)
        writer.ordered.splice(
          structure,
          ruleIds,
          toOrderedAnchor(input),
          tags,
          {
            delta: createIdPathDelta('view.query', viewId, 'filter'),
            footprint: ruleIds.flatMap((ruleId) => createStructureFootprint(structure, ruleId))
          }
        )
      },
      patch: (viewId, ruleId, patch, tags) => {
        const structure = viewFilterRulesStructure(viewId)
        writer.ordered.patch(
          structure,
          ruleId,
          patch,
          tags,
          {
            delta: createIdPathDelta('view.query', viewId, 'filter'),
            footprint: createStructureFootprint(structure, ruleId)
          }
        )
      },
      delete: (viewId, ruleId, tags) => {
        const structure = viewFilterRulesStructure(viewId)
        writer.ordered.delete(
          structure,
          ruleId,
          tags,
          {
            delta: createIdPathDelta('view.query', viewId, 'filter'),
            footprint: createStructureFootprint(structure, ruleId)
          }
        )
      }
    },
    sort: {
      insert: (viewId, rule, input, tags) => {
        const structure = viewSortRulesStructure(viewId)
        writer.ordered.insert(
          structure,
          rule.id,
          rule,
          toOrderedAnchor(input),
          tags,
          {
            delta: createIdPathDelta('view.query', viewId, 'sort'),
            footprint: createStructureFootprint(structure, rule.id)
          }
        )
      },
      move: (viewId, ruleId, input, tags) => {
        const structure = viewSortRulesStructure(viewId)
        writer.ordered.move(
          structure,
          ruleId,
          toOrderedAnchor(input),
          tags,
          {
            delta: createIdPathDelta('view.query', viewId, 'sort'),
            footprint: createStructureFootprint(structure, ruleId)
          }
        )
      },
      splice: (viewId, ruleIds, input, tags) => {
        const structure = viewSortRulesStructure(viewId)
        writer.ordered.splice(
          structure,
          ruleIds,
          toOrderedAnchor(input),
          tags,
          {
            delta: createIdPathDelta('view.query', viewId, 'sort'),
            footprint: ruleIds.flatMap((ruleId) => createStructureFootprint(structure, ruleId))
          }
        )
      },
      patch: (viewId, ruleId, patch, tags) => {
        const structure = viewSortRulesStructure(viewId)
        writer.ordered.patch(
          structure,
          ruleId,
          patch,
          tags,
          {
            delta: createIdPathDelta('view.query', viewId, 'sort'),
            footprint: createStructureFootprint(structure, ruleId)
          }
        )
      },
      delete: (viewId, ruleId, tags) => {
        const structure = viewSortRulesStructure(viewId)
        writer.ordered.delete(
          structure,
          ruleId,
          tags,
          {
            delta: createIdPathDelta('view.query', viewId, 'sort'),
            footprint: createStructureFootprint(structure, ruleId)
          }
        )
      }
    },
    display: {
      insert: (viewId, fieldId, input, tags) => {
        const structure = viewDisplayFieldsStructure(viewId)
        writer.ordered.insert(
          structure,
          fieldId,
          fieldId,
          toOrderedAnchor(input),
          tags,
          {
            delta: createIdPathDelta('view.layout', viewId, 'display'),
            footprint: createStructureFootprint(structure, fieldId)
          }
        )
      },
      move: (viewId, fieldId, input, tags) => {
        const structure = viewDisplayFieldsStructure(viewId)
        writer.ordered.move(
          structure,
          fieldId,
          toOrderedAnchor(input),
          tags,
          {
            delta: createIdPathDelta('view.layout', viewId, 'display'),
            footprint: createStructureFootprint(structure, fieldId)
          }
        )
      },
      splice: (viewId, fieldIds, input, tags) => {
        const structure = viewDisplayFieldsStructure(viewId)
        writer.ordered.splice(
          structure,
          fieldIds,
          toOrderedAnchor(input),
          tags,
          {
            delta: createIdPathDelta('view.layout', viewId, 'display'),
            footprint: fieldIds.flatMap((fieldId) => createStructureFootprint(structure, fieldId))
          }
        )
      },
      delete: (viewId, fieldId, tags) => {
        const structure = viewDisplayFieldsStructure(viewId)
        writer.ordered.delete(
          structure,
          fieldId,
          tags,
          {
            delta: createIdPathDelta('view.layout', viewId, 'display'),
            footprint: createStructureFootprint(structure, fieldId)
          }
        )
      }
    },
    order: {
      insert: (viewId, recordId, input, tags) => {
        const structure = viewOrdersStructure(viewId)
        writer.ordered.insert(
          structure,
          recordId,
          recordId,
          toOrderedAnchor(input),
          tags,
          {
            delta: createIdPathDelta('view.query', viewId, 'order'),
            footprint: createStructureFootprint(structure, recordId)
          }
        )
      },
      move: (viewId, recordId, input, tags) => {
        const structure = viewOrdersStructure(viewId)
        writer.ordered.move(
          structure,
          recordId,
          toOrderedAnchor(input),
          tags,
          {
            delta: createIdPathDelta('view.query', viewId, 'order'),
            footprint: createStructureFootprint(structure, recordId)
          }
        )
      },
      splice: (viewId, recordIds, input, tags) => {
        const structure = viewOrdersStructure(viewId)
        writer.ordered.splice(
          structure,
          recordIds,
          toOrderedAnchor(input),
          tags,
          {
            delta: createIdPathDelta('view.query', viewId, 'order'),
            footprint: recordIds.flatMap((recordId) => createStructureFootprint(structure, recordId))
          }
        )
      },
      delete: (viewId, recordId, tags) => {
        const structure = viewOrdersStructure(viewId)
        writer.ordered.delete(
          structure,
          recordId,
          tags,
          {
            delta: createIdPathDelta('view.query', viewId, 'order'),
            footprint: createStructureFootprint(structure, recordId)
          }
        )
      }
    }
  },
  signal: {
    externalVersion: (tags) => {
      writer.entity.patch({
        table: 'document',
        id: 'document'
      }, {}, tags, {
        delta: createExternalVersionDelta()
      })
    }
  }
})
