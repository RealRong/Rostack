import type {
  CanvasIntent,
  DocumentIntent,
  EdgeIntent,
  GroupIntent,
  MindmapIntent,
  NodeIntent,
  WhiteboardIntent,
  whiteboardCompileHandlers,
} from '@whiteboard/core/mutation'
import type {
  WhiteboardCompileAbort,
} from '@whiteboard/core/mutation/compile/helpers'
import type { WhiteboardErrorCode } from '../types/result'
import type { IntentResult } from './result'

type WhiteboardCompileHandlers = typeof whiteboardCompileHandlers

type HandlerOutput<THandler> = Exclude<
  THandler extends (...args: any[]) => infer TResult
    ? TResult
    : never,
  void | WhiteboardCompileAbort
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
}

export type IntentKind = WhiteboardIntent['type']
export type Intent<K extends IntentKind = IntentKind> = Extract<WhiteboardIntent, { type: K }>
export type IntentData<K extends IntentKind = IntentKind> = HandlerOutput<HandlerOfIntent<K>>
export type EngineIntent = Intent

export type ExecuteResult<K extends IntentKind = IntentKind> =
  IntentResult<IntentData<K>, WhiteboardErrorCode>
