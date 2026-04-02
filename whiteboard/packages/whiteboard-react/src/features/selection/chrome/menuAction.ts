export const bindMenuDismiss = <Args extends unknown[]>(
  action: (...args: Args) => unknown,
  dismiss: () => void
) => (...args: Args) => {
  const result = action(...args)

  if (result && typeof (result as PromiseLike<unknown>).then === 'function') {
    return Promise.resolve(result).finally(dismiss)
  }

  dismiss()
  return result
}
