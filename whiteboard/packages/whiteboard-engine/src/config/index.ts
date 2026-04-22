import { json } from '@shared/core'
import type { BoardConfig } from '@whiteboard/core/config'
import {
  DEFAULT_BOARD_CONFIG
} from './defaults'

export {
  DEFAULT_BOARD_CONFIG,
  DEFAULT_TUNING
} from './defaults'

export const resolveBoardConfig = (
  configOverrides?: Partial<BoardConfig>
): BoardConfig => json.merge(DEFAULT_BOARD_CONFIG, configOverrides)
