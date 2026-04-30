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
  MutationChangeInput,
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
} from './structures'

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

export type DataviewDocumentPatch = Partial<Pick<
  DataDoc,
  'schemaVersion' | 'activeViewId' | 'meta'
>>

export type DataviewRecordPatch = Partial<Omit<DataRecord, 'id'>>
export type DataviewFieldPatch = Partial<Omit<CustomField, 'id'>>
export type DataviewViewPatch = Partial<Omit<View, 'id'>>
export type DataviewFieldOptionPatch = Partial<Omit<FieldOption, 'id'>>
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
  semantic: {
    tag(value: DataviewTag): void
    change(key: string, change?: MutationChangeInput): void
    footprint(footprint: readonly MutationFootprint[]): void
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
        writer.structure.ordered.insert(
          fieldOptionsStructure(fieldId),
          option.id,
          option,
          toOrderedAnchor(input),
          tags
        )
      },
      move: (fieldId, optionId, input, tags) => {
        writer.structure.ordered.move(
          fieldOptionsStructure(fieldId),
          optionId,
          toOrderedAnchor(input),
          tags
        )
      },
      splice: (fieldId, optionIds, input, tags) => {
        writer.structure.ordered.splice(
          fieldOptionsStructure(fieldId),
          optionIds,
          toOrderedAnchor(input),
          tags
        )
      },
      patch: (fieldId, optionId, patch, tags) => {
        writer.structure.ordered.patch(
          fieldOptionsStructure(fieldId),
          optionId,
          patch,
          tags
        )
      },
      delete: (fieldId, optionId, tags) => {
        writer.structure.ordered.delete(
          fieldOptionsStructure(fieldId),
          optionId,
          tags
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
        writer.structure.ordered.insert(
          viewFilterRulesStructure(viewId),
          rule.id,
          rule,
          toOrderedAnchor(input),
          tags
        )
      },
      move: (viewId, ruleId, input, tags) => {
        writer.structure.ordered.move(
          viewFilterRulesStructure(viewId),
          ruleId,
          toOrderedAnchor(input),
          tags
        )
      },
      splice: (viewId, ruleIds, input, tags) => {
        writer.structure.ordered.splice(
          viewFilterRulesStructure(viewId),
          ruleIds,
          toOrderedAnchor(input),
          tags
        )
      },
      patch: (viewId, ruleId, patch, tags) => {
        writer.structure.ordered.patch(
          viewFilterRulesStructure(viewId),
          ruleId,
          patch,
          tags
        )
      },
      delete: (viewId, ruleId, tags) => {
        writer.structure.ordered.delete(
          viewFilterRulesStructure(viewId),
          ruleId,
          tags
        )
      }
    },
    sort: {
      insert: (viewId, rule, input, tags) => {
        writer.structure.ordered.insert(
          viewSortRulesStructure(viewId),
          rule.id,
          rule,
          toOrderedAnchor(input),
          tags
        )
      },
      move: (viewId, ruleId, input, tags) => {
        writer.structure.ordered.move(
          viewSortRulesStructure(viewId),
          ruleId,
          toOrderedAnchor(input),
          tags
        )
      },
      splice: (viewId, ruleIds, input, tags) => {
        writer.structure.ordered.splice(
          viewSortRulesStructure(viewId),
          ruleIds,
          toOrderedAnchor(input),
          tags
        )
      },
      patch: (viewId, ruleId, patch, tags) => {
        writer.structure.ordered.patch(
          viewSortRulesStructure(viewId),
          ruleId,
          patch,
          tags
        )
      },
      delete: (viewId, ruleId, tags) => {
        writer.structure.ordered.delete(
          viewSortRulesStructure(viewId),
          ruleId,
          tags
        )
      }
    },
    display: {
      insert: (viewId, fieldId, input, tags) => {
        writer.structure.ordered.insert(
          viewDisplayFieldsStructure(viewId),
          fieldId,
          fieldId,
          toOrderedAnchor(input),
          tags
        )
      },
      move: (viewId, fieldId, input, tags) => {
        writer.structure.ordered.move(
          viewDisplayFieldsStructure(viewId),
          fieldId,
          toOrderedAnchor(input),
          tags
        )
      },
      splice: (viewId, fieldIds, input, tags) => {
        writer.structure.ordered.splice(
          viewDisplayFieldsStructure(viewId),
          fieldIds,
          toOrderedAnchor(input),
          tags
        )
      },
      delete: (viewId, fieldId, tags) => {
        writer.structure.ordered.delete(
          viewDisplayFieldsStructure(viewId),
          fieldId,
          tags
        )
      }
    },
    order: {
      insert: (viewId, recordId, input, tags) => {
        writer.structure.ordered.insert(
          viewOrdersStructure(viewId),
          recordId,
          recordId,
          toOrderedAnchor(input),
          tags
        )
      },
      move: (viewId, recordId, input, tags) => {
        writer.structure.ordered.move(
          viewOrdersStructure(viewId),
          recordId,
          toOrderedAnchor(input),
          tags
        )
      },
      splice: (viewId, recordIds, input, tags) => {
        writer.structure.ordered.splice(
          viewOrdersStructure(viewId),
          recordIds,
          toOrderedAnchor(input),
          tags
        )
      },
      delete: (viewId, recordId, tags) => {
        writer.structure.ordered.delete(
          viewOrdersStructure(viewId),
          recordId,
          tags
        )
      }
    }
  },
  semantic: {
    tag: writer.semantic.tag,
    change: writer.semantic.change,
    footprint: writer.semantic.footprint
  }
})
