export interface RunningStat {
  count: number
  total: number
  avg: number
  max: number
  p95?: number
}

export const cloneRunningStat = (
  stat: RunningStat
): RunningStat => ({
  count: stat.count,
  total: stat.total,
  avg: stat.avg,
  max: stat.max,
  ...(stat.p95 === undefined ? {} : { p95: stat.p95 })
})

export const createRunningStat = (): RunningStat => ({
  count: 0,
  total: 0,
  avg: 0,
  max: 0
})

export const updateRunningStat = (
  stat: RunningStat,
  value: number | undefined
) => {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return
  }

  stat.count += 1
  stat.total += value
  stat.avg = stat.total / stat.count
  stat.max = Math.max(stat.max, value)
}
