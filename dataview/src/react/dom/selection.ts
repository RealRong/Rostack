const noop = () => {}

export const disableUserSelect = (
  ownerDocument: Document | null | undefined
) => {
  const body = ownerDocument?.body
  if (!body) {
    return noop
  }

  const previousUserSelect = body.style.userSelect
  const previousWebkitUserSelect = body.style.webkitUserSelect

  body.style.userSelect = 'none'
  body.style.webkitUserSelect = 'none'

  return () => {
    body.style.userSelect = previousUserSelect
    body.style.webkitUserSelect = previousWebkitUserSelect
  }
}
