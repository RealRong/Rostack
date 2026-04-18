import { token, type Token } from '@shared/i18n'
import {
  whiteboardEdgePresetLabelKey,
  whiteboardInsertPresetDescriptionKey,
  whiteboardInsertPresetLabelKey,
  whiteboardMindmapPresetDescriptionKey,
  whiteboardMindmapPresetLabelKey,
  whiteboardMindmapSeedDescriptionKey,
  whiteboardMindmapSeedLabelKey
} from '@whiteboard/product/i18n/keys'

export const whiteboardEdgePresetLabelToken = (
  preset: string,
  fallback: string
): Token => token(
  whiteboardEdgePresetLabelKey(preset),
  fallback
)

export const whiteboardInsertPresetLabelToken = (
  preset: string,
  fallback: string
): Token => token(
  whiteboardInsertPresetLabelKey(preset),
  fallback
)

export const whiteboardInsertPresetDescriptionToken = (
  preset: string,
  fallback: string
): Token => token(
  whiteboardInsertPresetDescriptionKey(preset),
  fallback
)

export const whiteboardMindmapSeedLabelToken = (
  seed: string,
  fallback: string
): Token => token(
  whiteboardMindmapSeedLabelKey(seed),
  fallback
)

export const whiteboardMindmapSeedDescriptionToken = (
  seed: string,
  fallback: string
): Token => token(
  whiteboardMindmapSeedDescriptionKey(seed),
  fallback
)

export const whiteboardMindmapPresetLabelToken = (
  preset: string,
  fallback: string
): Token => token(
  whiteboardMindmapPresetLabelKey(preset),
  fallback
)

export const whiteboardMindmapPresetDescriptionToken = (
  preset: string,
  fallback: string
): Token => token(
  whiteboardMindmapPresetDescriptionKey(preset),
  fallback
)
