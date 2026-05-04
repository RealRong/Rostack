import { readFileSync } from 'node:fs'
import path from 'node:path'

const DEFAULT_THRESHOLD = 0.2
const DEFAULT_MIN_DELTA_MS = 1

const parseArgs = (argv: string[]) => {
  const options = {
    baseline: undefined,
    current: undefined,
    threshold: DEFAULT_THRESHOLD,
    minDeltaMs: DEFAULT_MIN_DELTA_MS,
    mode: 'warn',
    silent: false
  }

  argv.forEach(argument => {
    if (argument.startsWith('--baseline=')) {
      options.baseline = argument.slice('--baseline='.length)
      return
    }
    if (argument.startsWith('--current=')) {
      options.current = argument.slice('--current='.length)
      return
    }
    if (argument.startsWith('--threshold=')) {
      options.threshold = Number(argument.slice('--threshold='.length)) || DEFAULT_THRESHOLD
      return
    }
    if (argument.startsWith('--min-delta-ms=')) {
      options.minDeltaMs = Number(argument.slice('--min-delta-ms='.length)) || DEFAULT_MIN_DELTA_MS
      return
    }
    if (argument.startsWith('--mode=')) {
      options.mode = argument.slice('--mode='.length) === 'strict'
        ? 'strict'
        : 'warn'
      return
    }
    if (argument === '--silent') {
      options.silent = true
    }
  })

  return options
}

const loadJson = (filePath: string) => JSON.parse(
  readFileSync(path.resolve(process.cwd(), filePath), 'utf8')
)

const scenarioKeyOf = (result) => `${result.size}:${result.scenario.id}`

const percentDeltaOf = (baseline: number, current: number) => {
  if (baseline === 0) {
    return current > 0
      ? Infinity
      : 0
  }

  return (current - baseline) / baseline
}

const compareBenchmarks = (input) => {
  const baseline = loadJson(input.baseline)
  const current = loadJson(input.current)
  const baselineByScenario = new Map(
    baseline.results.map(result => [scenarioKeyOf(result), result])
  )
  const warnings = []
  const missing = []

  current.results.forEach(result => {
    const key = scenarioKeyOf(result)
    const baselineResult = baselineByScenario.get(key)
    if (!baselineResult) {
      missing.push(key)
      return
    }

    const metrics = ['elapsedMs']
    metrics.forEach(metric => {
      const baselineValue = baselineResult.avg?.[metric]
      const currentValue = result.avg?.[metric]
      if (typeof baselineValue !== 'number' || typeof currentValue !== 'number') {
        return
      }

      const deltaMs = currentValue - baselineValue
      const deltaRatio = percentDeltaOf(baselineValue, currentValue)

      if (deltaMs >= input.minDeltaMs && deltaRatio >= input.threshold) {
        warnings.push({
          scenario: key,
          kind: 'timing',
          metric,
          baseline: baselineValue,
          current: currentValue,
          deltaMs,
          deltaRatio
        })
      }
    })

  })

  return {
    baseline: input.baseline,
    current: input.current,
    threshold: input.threshold,
    minDeltaMs: input.minDeltaMs,
    warnings,
    missing,
    ok: warnings.length === 0 && missing.length === 0
  }
}

const formatPercent = (value: number) => `${(value * 100).toFixed(1)}%`

const reportComparison = (result) => {
  console.log(`Dataview perf compare`)
  console.log(`baseline=${result.baseline}`)
  console.log(`current=${result.current}`)
  console.log(`threshold=${formatPercent(result.threshold)} minDeltaMs=${result.minDeltaMs}`)

  if (!result.missing.length && !result.warnings.length) {
    console.log('No perf regressions detected.')
    return
  }

  result.missing.forEach(key => {
    console.log(`MISSING ${key}`)
  })

  result.warnings.forEach(warning => {
    if (warning.kind === 'timing') {
      console.log(
        `WARN ${warning.scenario} ${warning.metric} baseline=${warning.baseline.toFixed(3)} current=${warning.current.toFixed(3)} delta=${warning.deltaMs.toFixed(3)} (${formatPercent(warning.deltaRatio)})`
      )
      return
    }

    console.log(`WARN ${warning.scenario} ${warning.kind} changed`)
  })
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const options = parseArgs(process.argv.slice(2))
  if (!options.baseline || !options.current) {
    throw new Error('compare.ts requires --baseline and --current')
  }

  const result = compareBenchmarks(options)
  if (!options.silent) {
    reportComparison(result)
  }
  if (options.mode === 'strict' && !result.ok) {
    process.exitCode = 1
  }
}

export {
  DEFAULT_THRESHOLD,
  DEFAULT_MIN_DELTA_MS,
  compareBenchmarks,
  parseArgs,
  reportComparison
}
