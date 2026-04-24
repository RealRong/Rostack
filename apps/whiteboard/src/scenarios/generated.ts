import { DEFAULT_SCENARIO_SIZE } from '@whiteboard/demo/scenarios/sizes'
import {
  deliveryPlanningFamily
} from '@whiteboard/demo/scenarios/families/deliveryPlanning'
import {
  researchKnowledgeMapFamily
} from '@whiteboard/demo/scenarios/families/researchKnowledgeMap'
import {
  serviceArchitectureFamily
} from '@whiteboard/demo/scenarios/families/serviceArchitecture'
import type {
  GeneratedScenarioFamily,
  GeneratedScenarioFamilyId,
  ScenarioPreset,
  ScenarioSize
} from '@whiteboard/demo/scenarios/types'

export const generatedScenarioFamilies: GeneratedScenarioFamily[] = [
  serviceArchitectureFamily,
  deliveryPlanningFamily,
  researchKnowledgeMapFamily
]

const familyById = new Map(
  generatedScenarioFamilies.map((family) => [family.id, family])
)

const toPreset = (
  family: GeneratedScenarioFamily,
  size: ScenarioSize
): ScenarioPreset => ({
  id: `${family.id}-${size}`,
  kind: 'generated',
  familyId: family.id,
  size,
  documentId: `demo-${family.id}-${size}`,
  label: `${family.label} · ${size}`,
  description: `${family.description} 内容节点 ${size}。`,
  create: () => family.create({
    familyId: family.id,
    size,
    seed: `${family.id}:${size}`,
    budget: {
      contentNodes: size
    }
  })
})

export const generatedScenarios = generatedScenarioFamilies.flatMap((family) => (
  family.sizes.map((size) => toPreset(family, size))
))

export const resolveGeneratedScenarioPreset = (
  familyId: GeneratedScenarioFamilyId,
  size: ScenarioSize = DEFAULT_SCENARIO_SIZE
) => {
  const preset = generatedScenarios.find((item) => (
    item.familyId === familyId && item.size === size
  ))
  if (!preset) {
    throw new Error(`Unknown generated scenario preset: ${familyId}-${size}`)
  }
  return preset
}

export const getGeneratedScenarioFamily = (
  familyId: string
) => familyById.get(familyId as GeneratedScenarioFamilyId)

