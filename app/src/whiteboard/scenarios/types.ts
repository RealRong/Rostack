import type { Document } from '@whiteboard/core/types'

export type ScenarioSize = 100 | 500 | 1000 | 2000

export type GeneratedScenarioFamilyId =
  | 'service-architecture'
  | 'delivery-planning'
  | 'research-knowledge-map'

export type ScenarioKind = 'showcase' | 'generated'

export type ScenarioContext = {
  familyId: GeneratedScenarioFamilyId
  size: ScenarioSize
  seed: string
  budget: {
    contentNodes: number
  }
}

export type GeneratedScenarioFamily = {
  id: GeneratedScenarioFamilyId
  label: string
  description: string
  sizes: readonly ScenarioSize[]
  create: (context: ScenarioContext) => Document
}

export type ScenarioPreset = {
  id: string
  kind: ScenarioKind
  familyId?: GeneratedScenarioFamilyId
  size?: ScenarioSize
  documentId: string
  label: string
  description: string
  create: () => Document
}

