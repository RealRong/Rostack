import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState
} from 'react'
import { cn } from '../utils'
import { Level } from './level'
import {
  appendPath,
  firstEnabledPath,
  isPathPrefix,
  isSamePath,
  isVisiblePath,
  normalizeExpandedPath,
  normalizeValue,
  parentPath,
  serializePath,
  toValueResult,
  toggleSelection
} from './shared'
import type {
  Controller,
  Handle,
  Path,
  Props,
  SubmenuItem
} from './types'

export const Base = forwardRef<Handle, Props>((props, ref) => {
  const submenuOpenPolicy = props.submenuOpenPolicy ?? 'hover'
  const open = props.open ?? true
  const selectionMode = props.selectionMode ?? 'none'
  const [uncontrolledValue, setUncontrolledValue] = useState<string | readonly string[]>(
    props.defaultValue ?? (selectionMode === 'multiple' ? [] : '')
  )
  const selectedKeys = useMemo(
    () => normalizeValue(props.value ?? uncontrolledValue),
    [props.value, uncontrolledValue]
  )
  const itemRefs = useRef<Record<string, HTMLButtonElement | null>>({})
  const [activePath, setActivePath] = useState<Path>([])
  const [activeSource, setActiveSource] = useState<'pointer' | 'keyboard' | null>(null)
  const [pendingFocusPath, setPendingFocusPath] = useState<Path | null>(null)
  const [uncontrolledExpandedRootKey, setUncontrolledExpandedRootKey] = useState<string | null>(
    props.openSubmenuKey ?? null
  )
  const [expandedTail, setExpandedTail] = useState<string[]>([])
  const rootExpandedKey = props.openSubmenuKey !== undefined
    ? props.openSubmenuKey
    : uncontrolledExpandedRootKey
  const rawExpandedPath = useMemo<Path>(() => (
    rootExpandedKey
      ? [rootExpandedKey, ...expandedTail]
      : []
  ), [expandedTail, rootExpandedKey])
  const expandedPath = useMemo(
    () => normalizeExpandedPath(props.items, rawExpandedPath),
    [props.items, rawExpandedPath]
  )

  useEffect(() => {
    if (props.openSubmenuKey !== undefined) {
      setExpandedTail([])
    }
  }, [props.openSubmenuKey])

  useEffect(() => {
    if (props.openSubmenuKey !== undefined || isSamePath(rawExpandedPath, expandedPath)) {
      return
    }

    setUncontrolledExpandedRootKey(expandedPath[0] ?? null)
    setExpandedTail(expandedPath.slice(1))
  }, [expandedPath, props.openSubmenuKey, rawExpandedPath])

  useEffect(() => {
    if (!activePath.length) {
      return
    }

    if (!isVisiblePath(props.items, activePath, expandedPath)) {
      setActivePath([])
      setActiveSource(null)
    }
  }, [activePath, expandedPath, props.items])

  useEffect(() => {
    if (open) {
      return
    }

    setActivePath([])
    setActiveSource(null)
    setPendingFocusPath(null)
    if (props.openSubmenuKey === undefined) {
      setUncontrolledExpandedRootKey(null)
      setExpandedTail([])
    }
  }, [open, props.openSubmenuKey])

  const rootEnabledPaths = useMemo(
    () => props.items
      .filter(item => item.kind !== 'divider' && item.kind !== 'label' && item.kind !== 'custom' && !item.disabled)
      .map(item => appendPath([], item.key)),
    [props.items]
  )

  const setExpandedPath = useCallback((nextPath: Path) => {
    const nextRootKey = nextPath[0] ?? null
    const nextTail = nextRootKey
      ? nextPath.slice(1)
      : []

    if (props.openSubmenuKey === undefined) {
      setUncontrolledExpandedRootKey(nextRootKey)
    }
    setExpandedTail(nextTail)
    props.onOpenSubmenuChange?.(nextRootKey)
  }, [props.onOpenSubmenuChange, props.openSubmenuKey])

  const focusPath = useCallback((path: Path) => {
    const element = itemRefs.current[serializePath(path)]
    if (!element) {
      setPendingFocusPath(path)
      return
    }

    setPendingFocusPath(null)
    element.focus({ preventScroll: true })
    element.scrollIntoView({
      block: 'nearest'
    })
  }, [])

  const registerItemRef = useCallback((path: Path, element: HTMLButtonElement | null) => {
    const pathKey = serializePath(path)
    itemRefs.current[pathKey] = element

    if (element && pendingFocusPath && isSamePath(path, pendingFocusPath)) {
      element.focus({ preventScroll: true })
      element.scrollIntoView({
        block: 'nearest'
      })
      setPendingFocusPath(null)
    }
  }, [pendingFocusPath])

  const setActivePointerPath = useCallback((path: Path) => {
    setActivePath(path)
    setActiveSource('pointer')
  }, [])

  const setActiveKeyboardPath = useCallback((path: Path) => {
    setActivePath(path)
    setActiveSource('keyboard')
    focusPath(path)
  }, [focusPath])

  const clearPointerActivePath = useCallback(() => {
    if (activeSource !== 'pointer') {
      return
    }

    setActivePath([])
    setActiveSource(null)
  }, [activeSource])

  const onItemValueToggle = useCallback((itemKey: string) => {
    if (selectionMode === 'none') {
      return
    }

    const nextSelectedKeys = toggleSelection(selectionMode, selectedKeys, itemKey)
    const nextValue = toValueResult(selectionMode, nextSelectedKeys)
    if (props.value === undefined) {
      setUncontrolledValue(nextValue)
    }
    props.onValueChange?.(nextValue)
  }, [props.onValueChange, props.value, selectedKeys, selectionMode])

  const trimExpandedPath = useCallback((path: Path) => {
    if (!isPathPrefix(path, expandedPath) || isSamePath(path, expandedPath)) {
      return
    }

    setExpandedPath(path)
  }, [expandedPath, setExpandedPath])

  const moveRootActive = useCallback((delta: number) => {
    if (!rootEnabledPaths.length) {
      return
    }

    const currentIndex = rootEnabledPaths.findIndex(path => isSamePath(path, activePath))
    const baseIndex = currentIndex === -1
      ? (delta > 0 ? -1 : 0)
      : currentIndex
    const nextIndex = (baseIndex + delta + rootEnabledPaths.length) % rootEnabledPaths.length
    const nextPath = rootEnabledPaths[nextIndex] ?? null
    if (!nextPath) {
      return
    }

    trimExpandedPath([])
    setActiveKeyboardPath(nextPath)
  }, [activePath, rootEnabledPaths, setActiveKeyboardPath, trimExpandedPath])

  const moveRootFirst = useCallback(() => {
    const nextPath = rootEnabledPaths[0] ?? null
    if (!nextPath) {
      return
    }

    trimExpandedPath([])
    setActiveKeyboardPath(nextPath)
  }, [rootEnabledPaths, setActiveKeyboardPath, trimExpandedPath])

  const moveRootLast = useCallback(() => {
    const nextPath = rootEnabledPaths[rootEnabledPaths.length - 1] ?? null
    if (!nextPath) {
      return
    }

    trimExpandedPath([])
    setActiveKeyboardPath(nextPath)
  }, [rootEnabledPaths, setActiveKeyboardPath, trimExpandedPath])

  useImperativeHandle(ref, () => ({
    moveNext: () => {
      moveRootActive(1)
    },
    movePrev: () => {
      moveRootActive(-1)
    },
    moveFirst: moveRootFirst,
    moveLast: moveRootLast,
    clearActive: () => {
      setActivePath([])
      setActiveSource(null)
    },
    getActiveKey: () => activePath.length === 1
      ? activePath[0] ?? null
      : null
  }), [activePath, moveRootActive, moveRootFirst, moveRootLast])

  const dismissSubmenuPath = useCallback((path: Path) => {
    setExpandedPath(parentPath(path))
    setActiveKeyboardPath(path)
  }, [setActiveKeyboardPath, setExpandedPath])

  const collapseSubmenuPathToTrigger = useCallback((path: Path) => {
    setExpandedPath(parentPath(path))
    setActiveKeyboardPath(path)
  }, [setActiveKeyboardPath, setExpandedPath])

  const openSubmenuPath = useCallback((path: Path, item: SubmenuItem, source: 'pointer' | 'keyboard' | 'click') => {
    setExpandedPath(path)

    if (source === 'pointer') {
      setActivePointerPath(path)
      return
    }

    const childPath = item.items?.length
      ? firstEnabledPath(item.items, path)
      : null
    if (childPath) {
      setActiveKeyboardPath(childPath)
      return
    }

    setActivePointerPath(path)
  }, [setActiveKeyboardPath, setActivePointerPath, setExpandedPath])

  const controller = useMemo<Controller>(() => ({
    activePath,
    activeSource,
    expandedPath,
    registerItemRef,
    setActivePointerPath,
    setActiveKeyboardPath,
    clearPointerActivePath,
    trimExpandedPath,
    dismissSubmenuPath,
    collapseSubmenuPathToTrigger,
    openSubmenuPath
  }), [
    activePath,
    activeSource,
    expandedPath,
    registerItemRef,
    setActivePointerPath,
    setActiveKeyboardPath,
    clearPointerActivePath,
    trimExpandedPath,
    dismissSubmenuPath,
    collapseSubmenuPathToTrigger,
    openSubmenuPath
  ])

  return (
    <div className={cn('flex max-h-[72vh] flex-col', props.className)}>
      <Level
        items={props.items}
        parentPath={[]}
        open={open}
        selectedKeys={selectedKeys}
        selectionMode={selectionMode}
        onItemValueToggle={onItemValueToggle}
        onClose={props.onClose}
        autoFocus={props.autoFocus ?? true}
        submenuOpenPolicy={submenuOpenPolicy}
        controller={controller}
      />
    </div>
  )
})

Base.displayName = 'Menu'

