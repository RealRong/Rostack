import type {
  MutationExecuteInput,
  MutationExecuteResult,
  MutationExecuteResultOfInput,
  MutationIntentKind,
  MutationIntentOf,
  MutationIntentTable,
  MutationOutputOf,
  MutationResult
} from '@shared/mutation/engine'
import type {
  CustomFieldId,
  Intent as CoreIntent,
  RecordId,
  ViewId
} from '@dataview/core/types'
import type {
  ValidationCode
} from '@dataview/core/mutation'
import type {
  EngineApplyCommit
} from '@dataview/engine/contracts/write'

type IntentOfType<TType extends CoreIntent['type']> = Extract<CoreIntent, {
  type: TType
}>

export type DataviewErrorCode =
  | ValidationCode
  | 'mutation_engine.compile.blocked'
  | 'mutation_engine.compile.empty'
  | 'mutation_engine.apply.empty'
  | 'mutation_engine.execute.empty'

export interface DataviewIntentTable extends MutationIntentTable {
  'record.create': {
    intent: IntentOfType<'record.create'>
    output: {
      id: RecordId
    }
  }
  'record.remove': {
    intent: IntentOfType<'record.remove'>
    output: void
  }
  'record.fields.writeMany': {
    intent: IntentOfType<'record.fields.writeMany'>
    output: void
  }
  'field.create': {
    intent: IntentOfType<'field.create'>
    output: {
      id: CustomFieldId
    }
  }
  'field.patch': {
    intent: IntentOfType<'field.patch'>
    output: void
  }
  'field.replace': {
    intent: IntentOfType<'field.replace'>
    output: void
  }
  'field.setKind': {
    intent: IntentOfType<'field.setKind'>
    output: void
  }
  'field.duplicate': {
    intent: IntentOfType<'field.duplicate'>
    output: {
      id: CustomFieldId
    }
  }
  'field.option.create': {
    intent: IntentOfType<'field.option.create'>
    output: {
      id: string
    }
  }
  'field.option.move': {
    intent: IntentOfType<'field.option.move'>
    output: void
  }
  'field.option.patch': {
    intent: IntentOfType<'field.option.patch'>
    output: void
  }
  'field.option.remove': {
    intent: IntentOfType<'field.option.remove'>
    output: void
  }
  'field.remove': {
    intent: IntentOfType<'field.remove'>
    output: void
  }
  'view.create': {
    intent: IntentOfType<'view.create'>
    output: {
      id: ViewId
    }
  }
  'view.rename': {
    intent: IntentOfType<'view.rename'>
    output: void
  }
  'view.type.set': {
    intent: IntentOfType<'view.type.set'>
    output: void
  }
  'view.search.set': {
    intent: IntentOfType<'view.search.set'>
    output: void
  }
  'view.filter.create': {
    intent: IntentOfType<'view.filter.create'>
    output: {
      id: string
    }
  }
  'view.filter.patch': {
    intent: IntentOfType<'view.filter.patch'>
    output: void
  }
  'view.filter.move': {
    intent: IntentOfType<'view.filter.move'>
    output: void
  }
  'view.filter.mode.set': {
    intent: IntentOfType<'view.filter.mode.set'>
    output: void
  }
  'view.filter.remove': {
    intent: IntentOfType<'view.filter.remove'>
    output: void
  }
  'view.filter.clear': {
    intent: IntentOfType<'view.filter.clear'>
    output: void
  }
  'view.sort.create': {
    intent: IntentOfType<'view.sort.create'>
    output: {
      id: string
    }
  }
  'view.sort.patch': {
    intent: IntentOfType<'view.sort.patch'>
    output: void
  }
  'view.sort.move': {
    intent: IntentOfType<'view.sort.move'>
    output: void
  }
  'view.sort.remove': {
    intent: IntentOfType<'view.sort.remove'>
    output: void
  }
  'view.sort.clear': {
    intent: IntentOfType<'view.sort.clear'>
    output: void
  }
  'view.group.set': {
    intent: IntentOfType<'view.group.set'>
    output: void
  }
  'view.group.clear': {
    intent: IntentOfType<'view.group.clear'>
    output: void
  }
  'view.group.toggle': {
    intent: IntentOfType<'view.group.toggle'>
    output: void
  }
  'view.group.mode.set': {
    intent: IntentOfType<'view.group.mode.set'>
    output: void
  }
  'view.group.sort.set': {
    intent: IntentOfType<'view.group.sort.set'>
    output: void
  }
  'view.group.interval.set': {
    intent: IntentOfType<'view.group.interval.set'>
    output: void
  }
  'view.group.showEmpty.set': {
    intent: IntentOfType<'view.group.showEmpty.set'>
    output: void
  }
  'view.section.show': {
    intent: IntentOfType<'view.section.show'>
    output: void
  }
  'view.section.hide': {
    intent: IntentOfType<'view.section.hide'>
    output: void
  }
  'view.section.collapse': {
    intent: IntentOfType<'view.section.collapse'>
    output: void
  }
  'view.section.expand': {
    intent: IntentOfType<'view.section.expand'>
    output: void
  }
  'view.calc.set': {
    intent: IntentOfType<'view.calc.set'>
    output: void
  }
  'view.table.widths.set': {
    intent: IntentOfType<'view.table.widths.set'>
    output: void
  }
  'view.table.verticalLines.set': {
    intent: IntentOfType<'view.table.verticalLines.set'>
    output: void
  }
  'view.table.wrap.set': {
    intent: IntentOfType<'view.table.wrap.set'>
    output: void
  }
  'view.gallery.wrap.set': {
    intent: IntentOfType<'view.gallery.wrap.set'>
    output: void
  }
  'view.gallery.size.set': {
    intent: IntentOfType<'view.gallery.size.set'>
    output: void
  }
  'view.gallery.layout.set': {
    intent: IntentOfType<'view.gallery.layout.set'>
    output: void
  }
  'view.kanban.wrap.set': {
    intent: IntentOfType<'view.kanban.wrap.set'>
    output: void
  }
  'view.kanban.size.set': {
    intent: IntentOfType<'view.kanban.size.set'>
    output: void
  }
  'view.kanban.layout.set': {
    intent: IntentOfType<'view.kanban.layout.set'>
    output: void
  }
  'view.kanban.fillColor.set': {
    intent: IntentOfType<'view.kanban.fillColor.set'>
    output: void
  }
  'view.kanban.cardsPerColumn.set': {
    intent: IntentOfType<'view.kanban.cardsPerColumn.set'>
    output: void
  }
  'view.order.move': {
    intent: IntentOfType<'view.order.move'>
    output: void
  }
  'view.order.splice': {
    intent: IntentOfType<'view.order.splice'>
    output: void
  }
  'view.fields.move': {
    intent: IntentOfType<'view.fields.move'>
    output: void
  }
  'view.fields.splice': {
    intent: IntentOfType<'view.fields.splice'>
    output: void
  }
  'view.fields.show': {
    intent: IntentOfType<'view.fields.show'>
    output: void
  }
  'view.fields.hide': {
    intent: IntentOfType<'view.fields.hide'>
    output: void
  }
  'view.fields.clear': {
    intent: IntentOfType<'view.fields.clear'>
    output: void
  }
  'view.open': {
    intent: IntentOfType<'view.open'>
    output: void
  }
  'view.remove': {
    intent: IntentOfType<'view.remove'>
    output: void
  }
}

export type IntentKind = MutationIntentKind<DataviewIntentTable>

export type Intent<K extends IntentKind = IntentKind> =
  MutationIntentOf<DataviewIntentTable, K>

export type IntentData<K extends IntentKind = IntentKind> =
  MutationOutputOf<DataviewIntentTable, K>

export type ExecuteResult<K extends IntentKind = IntentKind> =
  MutationExecuteResult<DataviewIntentTable, EngineApplyCommit, K, DataviewErrorCode>

export type ExecuteInput = MutationExecuteInput<DataviewIntentTable>

export type ExecuteResultOf<I extends ExecuteInput> =
  MutationExecuteResultOfInput<
    DataviewIntentTable,
    EngineApplyCommit,
    I,
    DataviewErrorCode
  >

export type DispatchResult = MutationResult<
  unknown,
  EngineApplyCommit,
  DataviewErrorCode
>
