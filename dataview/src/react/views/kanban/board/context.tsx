import {
  createContext,
  createElement,
  useContext,
  type ReactNode
} from 'react'
import type { BoardController } from './useController'

const Ctx = createContext<BoardController | null>(null)

export const BoardProvider = (props: {
  value: BoardController
  children?: ReactNode
}) => createElement(Ctx.Provider, { value: props.value }, props.children)

export const useBoardContext = () => {
  const value = useContext(Ctx)
  if (!value) {
    throw new Error('Missing BoardProvider.')
  }

  return value
}
