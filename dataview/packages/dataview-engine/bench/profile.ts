import path from 'node:path'
import { mkdirSync, writeFileSync } from 'node:fs'
import { performance } from 'node:perf_hooks'
import { createEngine } from '@dataview/engine/bench/runtime'
import { dataviewSpec } from '@dataview/react'
import {
  SIZE_TO_COUNT,
  createFixture
} from '@dataview/engine/bench/fixtures/index'
import { getScenarios } from '@dataview/engine/bench/scenarios/index'

const DEFAULT_SIZES = ['small', 'medium']
const DEFAULT_ITERATIONS = 3
const DEFAULT_WARMUP = 1

const averageOf = (values: number[]) => values.length
  ? values.reduce((sum, value) => sum + value, 0) / values.length
  : 0

const parseArgs = (argv: string[]) => {
  const options = {
    sizes: DEFAULT_SIZES,
    iterations: DEFAULT_ITERATIONS,
    warmup: DEFAULT_WARMUP,
    scenarios: undefined as string[] | undefined,
    json: undefined as string | undefined,
    silent: false
  }

  argv.forEach(argument => {
    if (argument.startsWith('--sizes=')) {
      options.sizes = argument.slice('--sizes='.length).split(',').filter(Boolean)
      return
    }
    if (argument.startsWith('--iterations=')) {
      options.iterations = Math.max(1, Number(argument.slice('--iterations='.length)) || DEFAULT_ITERATIONS)
      return
    }
    if (argument.startsWith('--warmup=')) {
      options.warmup = Math.max(0, Number(argument.slice('--warmup='.length)) || 0)
      return
    }
    if (argument.startsWith('--scenarios=')) {
      options.scenarios = argument.slice('--scenarios='.length).split(',').filter(Boolean)
      return
    }
    if (argument.startsWith('--json=')) {
      options.json = argument.slice('--json='.length)
      return
    }
    if (argument === '--silent') {
      options.silent = true
    }
  })

  return options
}

const createBenchEngine = (fixture: ReturnType<typeof createFixture>) => createEngine({
  spec: dataviewSpec,
  document: fixture.document,
  performance: {
    traces: true,
    stats: true
  }
})

const forceGc = () => {
  if (typeof global.gc === 'function') {
    global.gc()
  }
}

const heapUsedMb = () => process.memoryUsage().heapUsed / (1024 * 1024)

const runScenarioIteration = (scenario: ReturnType<typeof getScenarios>[number], size: keyof typeof SIZE_TO_COUNT) => {
  forceGc()
  const heapBeforeMb = heapUsedMb()
  const fixture = createFixture(size)
  const engine = createBenchEngine(fixture)

  scenario.setup?.(engine, fixture)
  scenario.prepare?.(engine, fixture)
  engine.performance.traces.clear()
  engine.performance.stats.clear()
  forceGc()

  const stableHeapBeforeMb = heapUsedMb()
  const startedAt = performance.now()
  scenario.run(engine, fixture)
  const elapsedMs = performance.now() - startedAt
  const heapAfterRunMb = heapUsedMb()
  forceGc()
  const heapAfterGcMb = heapUsedMb()
  const trace = engine.performance.traces.last()

  if (!trace) {
    throw new Error(`Scenario "${scenario.id}" did not produce a perf trace.`)
  }

  return {
    elapsedMs,
    trace,
    heapBeforeMb,
    stableHeapBeforeMb,
    heapAfterRunMb,
    heapAfterGcMb
  }
}

const summarizeRuns = (runs: ReturnType<typeof runScenarioIteration>[], scenario: ReturnType<typeof getScenarios>[number], size: keyof typeof SIZE_TO_COUNT) => ({
  size,
  records: SIZE_TO_COUNT[size],
  scenario: {
    id: scenario.id,
    title: scenario.title
  },
  iterations: runs.length,
  avg: {
    elapsedMs: averageOf(runs.map(run => run.elapsedMs)),
    totalMs: averageOf(runs.map(run => run.trace.timings.totalMs)),
    indexMs: averageOf(runs.map(run => run.trace.timings.indexMs ?? 0)),
    viewMs: averageOf(runs.map(run => run.trace.timings.viewMs ?? 0)),
    snapshotMs: averageOf(runs.map(run => run.trace.timings.snapshotMs ?? 0))
  },
  heapMb: {
    before: averageOf(runs.map(run => run.stableHeapBeforeMb)),
    afterRun: averageOf(runs.map(run => run.heapAfterRunMb)),
    afterGc: averageOf(runs.map(run => run.heapAfterGcMb)),
    transientDelta: averageOf(runs.map(run => run.heapAfterRunMb - run.stableHeapBeforeMb)),
    retainedDelta: averageOf(runs.map(run => run.heapAfterGcMb - run.stableHeapBeforeMb))
  },
  indexActions: {
    records: runs[runs.length - 1]?.trace.index.records.action,
    search: runs[runs.length - 1]?.trace.index.search.action,
    bucket: runs[runs.length - 1]?.trace.index.bucket.action,
    sort: runs[runs.length - 1]?.trace.index.sort.action,
    summaries: runs[runs.length - 1]?.trace.index.summaries.action
  }
})

const reportResults = (results: {
  generatedAt: string
  config: {
    sizes: readonly string[]
    iterations: number
    warmup: number
    scenarios: readonly string[]
  }
  gcEnabled: boolean
  results: ReturnType<typeof summarizeRuns>[]
}) => {
  console.log(`Dataview profile results (${results.generatedAt})`)
  console.log(`sizes=${results.config.sizes.join(',')} iterations=${results.config.iterations} warmup=${results.config.warmup} gc=${results.gcEnabled ? 'on' : 'off'}`)

  results.results.forEach(result => {
    console.log('')
    console.log(`${result.size} | ${result.scenario.id} | records=${result.records}`)
    console.log(`  avg total=${result.avg.totalMs.toFixed(3)}ms index=${result.avg.indexMs.toFixed(3)}ms view=${result.avg.viewMs.toFixed(3)}ms snapshot=${result.avg.snapshotMs.toFixed(3)}ms`)
    console.log(`  heap before=${result.heapMb.before.toFixed(2)}MB afterRun=${result.heapMb.afterRun.toFixed(2)}MB afterGc=${result.heapMb.afterGc.toFixed(2)}MB transient=${result.heapMb.transientDelta.toFixed(2)}MB retained=${result.heapMb.retainedDelta.toFixed(2)}MB`)
    console.log(`  index actions=${Object.entries(result.indexActions).map(([key, value]) => `${key}:${value}`).join(' ')}`)
  })
}

const runProfile = (input: ReturnType<typeof parseArgs>) => {
  const sizes = input.sizes?.length ? input.sizes : DEFAULT_SIZES
  const iterations = input.iterations ?? DEFAULT_ITERATIONS
  const warmup = input.warmup ?? DEFAULT_WARMUP
  const scenarios = getScenarios(input.scenarios)

  if (!scenarios.length) {
    throw new Error('No profile scenarios selected.')
  }

  sizes.forEach(size => {
    if (!SIZE_TO_COUNT[size as keyof typeof SIZE_TO_COUNT]) {
      throw new Error(`Unknown profile size: ${size}`)
    }
  })

  const results: ReturnType<typeof summarizeRuns>[] = []

  sizes.forEach(size => {
    const typedSize = size as keyof typeof SIZE_TO_COUNT
    scenarios.forEach(scenario => {
      for (let index = 0; index < warmup; index += 1) {
        runScenarioIteration(scenario, typedSize)
      }

      const runs = Array.from(
        { length: iterations },
        () => runScenarioIteration(scenario, typedSize)
      )
      results.push(summarizeRuns(runs, scenario, typedSize))
    })
  })

  const output = {
    generatedAt: new Date().toISOString(),
    config: {
      sizes,
      iterations,
      warmup,
      scenarios: scenarios.map(item => item.id)
    },
    gcEnabled: typeof global.gc === 'function',
    results
  }

  if (input.json) {
    const target = path.resolve(process.cwd(), input.json)
    mkdirSync(path.dirname(target), { recursive: true })
    writeFileSync(target, JSON.stringify(output, null, 2) + '\n')
  }

  if (!input.silent) {
    reportResults(output)
  }

  return output
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runProfile(parseArgs(process.argv.slice(2)))
}

export {
  parseArgs,
  runProfile
}
