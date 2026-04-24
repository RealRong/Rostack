import type { MutationResult } from '@shared/mutation'
import type { OrderMode } from '@whiteboard/core/types'
import type {
  CanvasIntent,
  DocumentIntent,
  EdgeIntent,
  GroupIntent,
  MindmapIntent,
  NodeIntent,
  ReplaceDocumentIntent,
  WhiteboardIntent,
  WhiteboardIntentKind,
  WhiteboardIntentOutput,
  WhiteboardIntentTable
} from '@whiteboard/core/intent'
import type { EngineWrite } from '../types/engineWrite'
import type { WhiteboardErrorCode } from '../types/result'

export type {
  CanvasIntent,
  DocumentIntent,
  EdgeIntent,
  GroupIntent,
  MindmapIntent,
  NodeIntent,
  OrderMode,
  ReplaceDocumentIntent,
  WhiteboardIntentTable
}

export type IntentKind = WhiteboardIntentKind
export type Intent<K extends IntentKind = IntentKind> = WhiteboardIntent<K>
export type IntentData<K extends IntentKind = IntentKind> = WhiteboardIntentOutput<K>
export type EngineIntent = Intent

export type ExecuteResult<K extends IntentKind = IntentKind> =
  MutationResult<IntentData<K>, EngineWrite, WhiteboardErrorCode>
