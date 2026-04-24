import { graphPhase } from './graph'
import { itemsPhase } from './items'
import { spatialPhase } from './spatial'
import { uiPhase } from './ui'

export const editorGraphPhases = [
  graphPhase,
  spatialPhase,
  uiPhase,
  itemsPhase
] as const
