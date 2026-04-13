const {
  mkdirSync,
  writeFileSync
} = require('node:fs')
const path = require('node:path')
const {
  performance
} = require('node:perf_hooks')
const {
  createEngine
} = require('../runtime.cjs')
const {
  SIZE_TO_COUNT,
  createFixture
} = require('../fixtures/index.cjs')
const {
  getScenarios
} = require('../scenarios/index.cjs')

const DEFAULT_SIZES = ['small', 'medium']
const DEFAULT_ITERATIONS = 3
const DEFAULT_WARMUP = 1

const averageOf = values => values.length
  ? values.reduce((sum, value) => sum + value, 0) / values.length
  : 0

const parseArgs = argv => {
  const options = {
    sizes: DEFAULT_SIZES,
    iterations: DEFAULT_ITERATIONS,
    warmup: DEFAULT_WARMUP,
    scenarios: undefined,
    json: undefined,
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

const createBenchEngine = fixture => createEngine({
  document: fixture.document,
  performance: {
    traces: true,
    stats: true
  }
})

const runScenarioIteration = (scenario, size) => {
  const fixture = createFixture(size)
  const engine = createBenchEngine(fixture)

  scenario.setup?.(engine, fixture)
  scenario.prepare?.(engine, fixture)
  engine.performance.traces.clear()
  engine.performance.stats.clear()

  const startedAt = performance.now()
  scenario.run(engine, fixture)
  const elapsedMs = performance.now() - startedAt
  const trace = engine.performance.traces.last()
  const stats = engine.performance.stats.snapshot()

  if (!trace) {
    throw new Error(`Scenario "${scenario.id}" did not produce a perf trace.`)
  }

  return {
    elapsedMs,
    trace,
    stats
  }
}

const summarizeRuns = (runs, scenario, size) => {
  const last = runs[runs.length - 1]

  return {
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
      commitMs: averageOf(runs.map(run => run.trace.timings.commitMs ?? 0)),
      indexMs: averageOf(runs.map(run => run.trace.timings.indexMs ?? 0)),
      viewMs: averageOf(runs.map(run => run.trace.timings.viewMs ?? 0)),
      snapshotMs: averageOf(runs.map(run => run.trace.timings.snapshotMs ?? 0))
    },
    changedStores: [...last.trace.snapshot.changedStores],
    indexActions: {
      records: last.trace.index.records.action,
      search: last.trace.index.search.action,
      group: last.trace.index.group.action,
      sort: last.trace.index.sort.action,
      summaries: last.trace.index.summaries.action
    },
    plan: {
      ...last.trace.view.plan
    },
    stageDurationsMs: Object.fromEntries(
      last.trace.view.stages.map(stage => [stage.stage, stage.durationMs])
    ),
    stats: last.stats
  }
}

const reportResults = results => {
  console.log(`Dataview benchmark results (${results.generatedAt})`)
  console.log(`sizes=${results.config.sizes.join(',')} iterations=${results.config.iterations} warmup=${results.config.warmup}`)

  results.results.forEach(result => {
    console.log('')
    console.log(`${result.size} | ${result.scenario.id} | records=${result.records}`)
    console.log(`  avg total=${result.avg.totalMs.toFixed(3)}ms index=${result.avg.indexMs.toFixed(3)}ms view=${result.avg.viewMs.toFixed(3)}ms snapshot=${result.avg.snapshotMs.toFixed(3)}ms`)
    console.log(`  changed stores=${result.changedStores.join(',') || '(none)'}`)
    console.log(`  index actions=${Object.entries(result.indexActions).map(([key, value]) => `${key}:${value}`).join(' ')}`)
  })
}

const runBenchmarks = (input = {}) => {
  const sizes = input.sizes?.length ? input.sizes : DEFAULT_SIZES
  const iterations = input.iterations ?? DEFAULT_ITERATIONS
  const warmup = input.warmup ?? DEFAULT_WARMUP
  const scenarios = getScenarios(input.scenarios)

  if (!scenarios.length) {
    throw new Error('No benchmark scenarios selected.')
  }

  sizes.forEach(size => {
    if (!SIZE_TO_COUNT[size]) {
      throw new Error(`Unknown benchmark size: ${size}`)
    }
  })

  const results = []

  sizes.forEach(size => {
    scenarios.forEach(scenario => {
      for (let index = 0; index < warmup; index += 1) {
        runScenarioIteration(scenario, size)
      }

      const runs = Array.from({ length: iterations }, () => runScenarioIteration(scenario, size))
      results.push(summarizeRuns(runs, scenario, size))
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

if (require.main === module) {
  runBenchmarks(parseArgs(process.argv.slice(2)))
}

module.exports = {
  DEFAULT_ITERATIONS,
  DEFAULT_SIZES,
  DEFAULT_WARMUP,
  parseArgs,
  runBenchmarks
}
