import type { BoardConfig } from '@whiteboard/core/config'
import { mergeValue } from '@whiteboard/core/value'
import {
  DEFAULT_HISTORY_CONFIG,
  DEFAULT_BOARD_CONFIG
} from '@whiteboard/engine/config/defaults'

export {
  DEFAULT_HISTORY_CONFIG,
  DEFAULT_BOARD_CONFIG,
  DEFAULT_TUNING
} from '@whiteboard/engine/config/defaults'

export const resolveBoardConfig = (
  configOverrides?: Partial<BoardConfig>
): BoardConfig => mergeValue(DEFAULT_BOARD_CONFIG, configOverrides)
