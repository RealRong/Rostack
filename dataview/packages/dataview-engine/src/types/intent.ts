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
  RecordId,
  ViewId
} from '@dataview/core/types'
import type {
  Intent as CoreIntent
} from '@dataview/core/intent'
import type {
  ValidationCode
} from '@dataview/core/compile'
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
  'record.patch': {
    intent: IntentOfType<'record.patch'>
    output: void
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
  'view.patch': {
    intent: IntentOfType<'view.patch'>
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
  'view.display.move': {
    intent: IntentOfType<'view.display.move'>
    output: void
  }
  'view.display.splice': {
    intent: IntentOfType<'view.display.splice'>
    output: void
  }
  'view.display.show': {
    intent: IntentOfType<'view.display.show'>
    output: void
  }
  'view.display.hide': {
    intent: IntentOfType<'view.display.hide'>
    output: void
  }
  'view.display.clear': {
    intent: IntentOfType<'view.display.clear'>
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
  'external.version.bump': {
    intent: IntentOfType<'external.version.bump'>
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
