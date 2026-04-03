export {
  EngineProvider,
  type DataViewContextValue,
  type EngineProviderProps,
  useDataView
} from './provider'
export { useCurrentView } from './useCurrentView'
export { useInlineSession, useInlineSessionValue } from './useInlineSession'
export { useSelection, useSelectionValue } from './useSelection'
export { usePage, usePageValue } from './usePage'
export {
  useDocument,
  usePropertyById,
  useTitlePropertyId,
  useViewById
} from './useDocument'

export type {
  GroupEngine
} from '@dataview/engine'

export type {
  InlineSessionApi,
  InlineSessionTarget
} from '@dataview/react/runtime/inlineSession'
export type {
  Selection,
  SelectionApi
} from '@dataview/react/runtime/selection'
export type {
  BlockingSurfaceBackdrop,
  BlockingSurfaceState,
  OpenBlockingSurfaceInput,
  PageLock,
  PageSessionApi,
  PageSessionInput,
  PageSessionState,
  QueryBarEntry,
  QueryBarState,
  ResolvedPageState,
  SettingsRoute,
  SettingsState,
  PageInteractionState,
} from '@dataview/react/page/session/types'
export type {
  CloseValueEditorOptions,
  OpenValueEditorInput,
  ValueEditorApi,
  ValueEditorAnchor,
  ValueEditorResult,
  ViewFieldRef
} from '@dataview/react/runtime/valueEditor'
