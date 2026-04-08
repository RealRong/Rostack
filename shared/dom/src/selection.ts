const noop = () => {}

export type DocumentSelectionLock = {
  lock: () => () => void
}

type SelectionStyleSnapshot = {
  rootUserSelect: string
  rootWebkitUserSelect: string
  bodyUserSelect: string
  bodyWebkitUserSelect: string
}

type DocumentSelectionState = {
  activeCount: number
  snapshot: SelectionStyleSnapshot | null
  preventDefault: (event: Event) => void
}

const stateByDocument = new WeakMap<Document, DocumentSelectionState>()

const resolveDocumentSelectionState = (
  ownerDocument: Document
) => {
  const current = stateByDocument.get(ownerDocument)
  if (current) {
    return current
  }

  const next: DocumentSelectionState = {
    activeCount: 0,
    snapshot: null,
    preventDefault: (event) => {
      event.preventDefault()
    }
  }
  stateByDocument.set(ownerDocument, next)
  return next
}

const applyDocumentSelectionLock = (
  ownerDocument: Document,
  state: DocumentSelectionState
) => {
  const root = ownerDocument.documentElement
  const body = ownerDocument.body

  state.snapshot = {
    rootUserSelect: root.style.userSelect,
    rootWebkitUserSelect: root.style.webkitUserSelect,
    bodyUserSelect: body?.style.userSelect ?? '',
    bodyWebkitUserSelect: body?.style.webkitUserSelect ?? ''
  }

  root.style.userSelect = 'none'
  root.style.webkitUserSelect = 'none'

  if (body) {
    body.style.userSelect = 'none'
    body.style.webkitUserSelect = 'none'
  }

  ownerDocument.addEventListener('selectstart', state.preventDefault, true)
  ownerDocument.addEventListener('dragstart', state.preventDefault, true)
}

const restoreDocumentSelectionLock = (
  ownerDocument: Document,
  state: DocumentSelectionState
) => {
  if (!state.snapshot) {
    return
  }

  const root = ownerDocument.documentElement
  const body = ownerDocument.body

  ownerDocument.removeEventListener('selectstart', state.preventDefault, true)
  ownerDocument.removeEventListener('dragstart', state.preventDefault, true)

  root.style.userSelect = state.snapshot.rootUserSelect
  root.style.webkitUserSelect = state.snapshot.rootWebkitUserSelect

  if (body) {
    body.style.userSelect = state.snapshot.bodyUserSelect
    body.style.webkitUserSelect = state.snapshot.bodyWebkitUserSelect
  }

  state.snapshot = null
}

export const createDocumentSelectionLock = (
  ownerDocument: Document | null | undefined
): DocumentSelectionLock => ({
  lock: () => {
    if (!ownerDocument) {
      return noop
    }

    const state = resolveDocumentSelectionState(ownerDocument)
    state.activeCount += 1
    if (state.activeCount === 1) {
      applyDocumentSelectionLock(ownerDocument, state)
    }

    let released = false

    return () => {
      if (released) {
        return
      }
      released = true

      state.activeCount = Math.max(0, state.activeCount - 1)
      if (state.activeCount === 0) {
        restoreDocumentSelectionLock(ownerDocument, state)
      }
    }
  }
})

export const disableUserSelect = (
  ownerDocument: Document | null | undefined
) => createDocumentSelectionLock(ownerDocument).lock()
