import { json } from '@shared/core'
import {
  DEFAULT_BOARD_CONFIG,
  type BoardConfig
} from './defaults'

export {
  DEFAULT_BOARD_CONFIG,
  DEFAULT_TUNING,
  type BoardConfig
} from './defaults'

export const resolveBoardConfig = (
  configOverrides?: Partial<BoardConfig>
): BoardConfig => json.merge(DEFAULT_BOARD_CONFIG, configOverrides)
