import type { ScenarioSize } from '@whiteboard/demo/scenarios/types'

export const SCENARIO_SIZES: readonly ScenarioSize[] = [
  100,
  500,
  1000,
  2000
] as const

export const DEFAULT_SCENARIO_SIZE: ScenarioSize = 100

export const parseScenarioSize = (
  value: string | null | undefined
): ScenarioSize | undefined => {
  if (!value) {
    return undefined
  }

  const parsed = Number.parseInt(value, 10)
  return SCENARIO_SIZES.find((size) => size === parsed)
}

