import type {
  WhiteboardMutationPorts
} from '@whiteboard/core/mutation/compile/helpers'
import type {
  DocumentReader
} from '@whiteboard/core/document/reader'
import type {
  WhiteboardCompileServices
} from '@whiteboard/core/mutation/compile/helpers'
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

export interface WhiteboardCustomFailure {
  code: WhiteboardCustomCode
  message: string
  details?: unknown
  path?: string
}

export type WhiteboardCustomPlanContext<
  TOp extends WhiteboardCustomOperation = WhiteboardCustomOperation
> = {
  op: TOp
  document: Document
  reader: DocumentReader
  services: WhiteboardCompileServices | undefined
  program: WhiteboardMutationPorts
  fail(issue: WhiteboardCustomFailure): never
}

export type WhiteboardCustomPlanner<
  TOp extends WhiteboardCustomOperation
> = {
  plan(input: WhiteboardCustomPlanContext<TOp>): void
}
