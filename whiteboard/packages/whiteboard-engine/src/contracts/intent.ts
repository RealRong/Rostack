import type { MutationCompileControl, MutationResult } from '@shared/mutation/engine'
import type {
  CanvasIntent,
  DocumentIntent,
  EdgeIntent,
  GroupIntent,
  MindmapIntent,
  NodeIntent,
  ReplaceDocumentIntent,
  WhiteboardIntent,
  whiteboardCompile,
} from '@whiteboard/core/mutation'
import type { EngineApplyCommit } from '../types/engineWrite'
import type { WhiteboardErrorCode } from '../types/result'

type WhiteboardCompileHandlers = typeof whiteboardCompile.handlers

type HandlerOutput<THandler> = Exclude<
  THandler extends (...args: any[]) => infer TResult
    ? TResult
    : never,
  void | MutationCompileControl<any>
>

type HandlerOfIntent<K extends WhiteboardIntent['type']> = K extends keyof WhiteboardCompileHandlers
  ? WhiteboardCompileHandlers[K]
  : never

export type {
  CanvasIntent,
  DocumentIntent,
  EdgeIntent,
  GroupIntent,
  MindmapIntent,
  NodeIntent,
  ReplaceDocumentIntent,
}

export type IntentKind = WhiteboardIntent['type']
export type Intent<K extends IntentKind = IntentKind> = Extract<WhiteboardIntent, { type: K }>
export type IntentData<K extends IntentKind = IntentKind> = HandlerOutput<HandlerOfIntent<K>>
export type EngineIntent = Intent

export type ExecuteResult<K extends IntentKind = IntentKind> =
  MutationResult<IntentData<K>, EngineApplyCommit, WhiteboardErrorCode>
