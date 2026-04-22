import { createChromePhase } from './chrome'
import { createElementPhase } from './element'
import { createGraphPhase } from './graph'
import { createInputPhase } from './input'
import { createMeasurePhase } from './measure'
import { createScenePhase } from './scene'
import { createSelectionPhase } from './selection'
import { createStructurePhase } from './structure'
import { createTreePhase } from './tree'
import type { EditorPhase } from './shared'

export const createEditorGraphPhases = (): readonly EditorPhase[] => [
  createInputPhase(),
  createGraphPhase(),
  createMeasurePhase(),
  createStructurePhase(),
  createTreePhase(),
  createElementPhase(),
  createSelectionPhase(),
  createChromePhase(),
  createScenePhase()
]
