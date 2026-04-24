import { createGraphPhase } from './graph'
import { createItemsPhase } from './items'
import { createSpatialPhase } from './spatial'
import { createUiPhase } from './ui'
import type { EditorPhase } from './shared'

export const createEditorGraphPhases = (): readonly EditorPhase[] => [
  createGraphPhase(),
  createSpatialPhase(),
  createUiPhase(),
  createItemsPhase()
]
