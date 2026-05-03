import type {
  EngineApplyCommit
} from './write'

export interface DataviewHistoryConfig {
  enabled: boolean
  capacity: number
  captureSystem: boolean
  captureRemote: boolean
}

export interface DataviewHistory {
  state(): {
    undoDepth: number
    redoDepth: number
  }
  canUndo(): boolean
  canRedo(): boolean
  undo(): EngineApplyCommit | undefined
  redo(): EngineApplyCommit | undefined
  clear(): void
}
