import type {
  MutationCustomPlannerInput,
  MutationCustomTable,
} from '@shared/mutation/engine'
import type {
  DocumentReader
} from '@whiteboard/core/document/reader'
import type {
  WhiteboardCompileServices
} from '@whiteboard/core/operations/compile/helpers'
import type {
  WhiteboardInternalOperation
} from '@whiteboard/core/operations/internal'
import type {
  Document,
  Operation,
  ResultCode
} from '@whiteboard/core/types'

export type WhiteboardCustomOperation = Exclude<
  Operation,
  | { type: 'document.create' }
  | { type: 'document.patch' }
  | { type: 'node.create' }
  | { type: 'node.patch' }
  | { type: 'node.delete' }
  | { type: 'edge.create' }
  | { type: 'edge.patch' }
  | { type: 'edge.delete' }
  | { type: 'group.create' }
  | { type: 'group.patch' }
  | { type: 'group.delete' }
>

export type WhiteboardCustomCode = ResultCode

export type WhiteboardCustomPlanContext<
  TOp extends WhiteboardCustomOperation = WhiteboardCustomOperation
> = MutationCustomPlannerInput<
  Document,
  TOp,
  DocumentReader,
  WhiteboardCompileServices,
  string,
  WhiteboardCustomCode
>

export type WhiteboardCustomPlanner<
  TOp extends WhiteboardCustomOperation
> = {
  plan(input: WhiteboardCustomPlanContext<TOp>): void
}

export type WhiteboardCustomTableType = MutationCustomTable<
  Document,
  WhiteboardInternalOperation,
  DocumentReader,
  WhiteboardCompileServices,
  string,
  WhiteboardCustomCode
>
