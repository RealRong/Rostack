export {
  applySelectionTarget,
  EMPTY_SELECTION_TARGET,
  isSelectionTargetEqual,
  normalizeSelectionTarget,
  type SelectionInput,
  type SelectionTarget
} from './target'
export {
  deriveSelectionSummary,
  isSelectionSummaryEqual,
  resolveSelectionTransformBox,
  type SelectionSummary,
  type SelectionTransformBox,
  type SelectionTransform
} from './summary'
export {
  getTargetBounds,
  resolveSelectionBoxTarget,
  type BoundsTarget
} from './bounds'
export {
  createMarqueeItemsKey,
  createMarqueeRect,
  finishMarqueeSession,
  hasMarqueeStarted,
  startMarqueeSession,
  stepMarqueeSession,
  type MarqueeMatch,
  type MarqueeSession,
  type MarqueeStepResult,
  type SelectionMarqueeItems
} from './marquee'
export {
  matchSelectionTap,
  resolveSelectionPressMode,
  resolveSelectionPressDecision,
  resolveSelectionPressTarget,
  type SelectionDragDecision,
  type SelectionMarqueeDecision,
  type SelectionPressDecision,
  type SelectionPressPolicyDeps,
  type SelectionPressResolution,
  type SelectionPressTargetInput,
  type SelectionPressTarget,
  type SelectionTapAction
} from './press'
