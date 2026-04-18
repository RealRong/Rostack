import {
  createContext,
  useContext
} from 'react'
import type { SettingsRoute } from '@dataview/runtime/page/session/types'

export interface SettingsRouter {
  route: SettingsRoute
  close: () => void
  back: () => void
  push: (route: SettingsRoute) => void
}

export const ViewSettingsContext = createContext<SettingsRouter | null>(null)

export const useViewSettings = () => {
  const value = useContext(ViewSettingsContext)
  if (!value) {
    throw new Error('Missing ViewSettingsContext.')
  }
  return value
}
