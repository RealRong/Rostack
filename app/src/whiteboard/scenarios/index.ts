import {
  DEFAULT_SCENARIO_SIZE,
  parseScenarioSize
} from '@whiteboard/demo/scenarios/sizes'
import {
  generatedScenarios,
  getGeneratedScenarioFamily,
  resolveGeneratedScenarioPreset
} from '@whiteboard/demo/scenarios/generated'
import {
  showcaseScenarios
} from '@whiteboard/demo/scenarios/showcase'
import type {
  ScenarioPreset
} from '@whiteboard/demo/scenarios/types'

const scenarioById = new Map<string, ScenarioPreset>()

export const scenarios: ScenarioPreset[] = [
  ...generatedScenarios,
  ...showcaseScenarios
]

scenarios.forEach((scenario) => {
  scenarioById.set(scenario.id, scenario)
})

export const defaultScenarioPreset = resolveGeneratedScenarioPreset(
  'service-architecture',
  DEFAULT_SCENARIO_SIZE
)

export const resolveScenarioPreset = ({
  scenarioId,
  size
}: {
  scenarioId?: string | null
  size?: string | null
}): ScenarioPreset => {
  if (!scenarioId) {
    return defaultScenarioPreset
  }

  const exact = scenarioById.get(scenarioId)
  if (exact) {
    return exact
  }

  const showcase = showcaseScenarios.find((item) => item.id === scenarioId)
  if (showcase) {
    return showcase
  }

  const family = getGeneratedScenarioFamily(scenarioId)
  if (family) {
    return resolveGeneratedScenarioPreset(
      family.id,
      parseScenarioSize(size) ?? DEFAULT_SCENARIO_SIZE
    )
  }

  return defaultScenarioPreset
}

export const buildScenarioRoomId = (
  preset: ScenarioPreset
) => preset.documentId

export type {
  GeneratedScenarioFamily,
  GeneratedScenarioFamilyId,
  ScenarioContext,
  ScenarioKind,
  ScenarioPreset,
  ScenarioSize
} from '@whiteboard/demo/scenarios/types'

