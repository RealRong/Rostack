import { createGraphPhase } from './graph'
import { createScenePhase } from './scene'
import { createSpatialPhase } from './spatial'
import { createUiPhase } from './ui'
import type { EditorPhase } from './shared'

export const createEditorGraphPhases = (): readonly EditorPhase[] => [
  createGraphPhase(),
  createSpatialPhase(),
  createUiPhase(),
  createScenePhase()
]
