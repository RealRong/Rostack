import type { Node } from '@whiteboard/core/types'
import {
  createScenarioDocumentBuilder,
  type ScenarioDocumentBuilder
} from '@whiteboard/demo/scenarios/builder'
import {
  allocateCounts,
  createSeededRandom,
  cycle,
  distributeEvenly
} from '@whiteboard/demo/scenarios/support'
import { SCENARIO_SIZES } from '@whiteboard/demo/scenarios/sizes'
import type {
  GeneratedScenarioFamily,
  ScenarioContext
} from '@whiteboard/demo/scenarios/types'

type ThemeCounts = {
  question: number
  hypothesis: number
  experiment: number
  finding: number
  evidence: number
  decision: number
  reference: number
}

type ThemePlan = {
  name: string
  fill: string
  stroke: string
  counts: ThemeCounts
}

type ThemeGraph = {
  frame: Node
  questions: Node[]
  hypotheses: Node[]
  experiments: Node[]
  findings: Node[]
  evidence: Node[]
  decisions: Node[]
  references: Node[]
}

const THEME_NAMES = [
  'Activation',
  'Retention',
  'Collaboration',
  'Latency',
  'Search Intent',
  'Template Usage',
  'Mobile Entry',
  'Sharing',
  'Workspace Setup',
  'Notifications'
] as const

const FRAME_FILLS = [
  '#cffafe',
  '#e0e7ff',
  '#dcfce7',
  '#fee2e2',
  '#fef3c7',
  '#fce7f3',
  '#ede9fe',
  '#dbeafe',
  '#ecfccb',
  '#fde68a'
] as const

const FRAME_STROKES = [
  '#0891b2',
  '#4f46e5',
  '#16a34a',
  '#dc2626',
  '#d97706',
  '#db2777',
  '#7c3aed',
  '#2563eb',
  '#65a30d',
  '#b45309'
] as const

const HYPOTHESIS_TOPICS = [
  'Self-serve onboarding',
  'Template memory',
  'Realtime confidence',
  'Latency tolerance',
  'Search clarity',
  'Mobile drafting'
] as const

const EXPERIMENT_TOPICS = [
  'First board walkthrough',
  'Invite prompt',
  'Search seed query',
  'Comment nudge',
  'Template spotlight',
  'Latency banner',
  'Cursor replay'
] as const

const FINDING_TOPICS = [
  'Drop-off at first share',
  'High recall after template seed',
  'Realtime trust grows with cursor echo',
  'Mobile entry is note-first',
  'Search success depends on recent context',
  'Activation improves after example content'
] as const

const EVIDENCE_TOPICS = [
  'Interview notes',
  'Funnel snapshot',
  'Usage cohort',
  'Session replay',
  'Survey batch',
  'Query log',
  'Latency trace'
] as const

const DECISION_TOPICS = [
  'Ship guarded rollout',
  'Bias toward semantic examples',
  'Keep board room isolated by scenario',
  'Prioritize note capture before structure'
] as const

const REFERENCE_TOPICS = [
  'Reference: onboarding doc',
  'Reference: launch plan',
  'Reference: replay sample',
  'Reference: benchmark clip',
  'Reference: interview transcript'
] as const

const themeCountBySize = (
  size: ScenarioContext['size']
) => {
  switch (size) {
    case 100:
      return 4
    case 500:
      return 6
    case 1000:
      return 8
    case 2000:
      return 10
  }
}

const createThemePlans = (
  context: ScenarioContext
): ThemePlan[] => {
  const themeCount = themeCountBySize(context.size)
  const budgets = distributeEvenly(context.budget.contentNodes, themeCount)
  return budgets.map((budget, index) => ({
    name: cycle(THEME_NAMES, index),
    fill: cycle(FRAME_FILLS, index),
    stroke: cycle(FRAME_STROKES, index),
    counts: allocateCounts(budget, [
      { key: 'question', min: 1, weight: 0.15 },
      { key: 'hypothesis', min: 3, weight: 0.8 },
      { key: 'experiment', min: 6, weight: 2.0 },
      { key: 'finding', min: 6, weight: 2.2 },
      { key: 'evidence', min: 5, weight: 1.8 },
      { key: 'decision', min: 2, weight: 0.5 },
      { key: 'reference', min: 2, weight: 0.55 }
    ])
  }))
}

const bandRows = (
  count: number,
  columns: number
) => Math.ceil(count / Math.max(columns, 1))

const placeGrid = ({
  count,
  target,
  createNode
}: {
  count: number
  target: Node[]
  createNode: (index: number) => Node
}) => {
  for (let index = 0; index < count; index += 1) {
    target.push(createNode(index))
  }
}

const linkUnique = (
  builder: ScenarioDocumentBuilder,
  source: Node | undefined,
  target: Node | undefined,
  seen: Set<string>
) => {
  if (!source || !target || source.id === target.id) {
    return false
  }

  const key = `${source.id}->${target.id}`
  if (seen.has(key)) {
    return false
  }

  seen.add(key)
  builder.addEdge({
    sourceNodeId: source.id,
    targetNodeId: target.id,
    style: {
      color: '#64748b'
    }
  })
  return true
}

const createThemeGraph = (
  builder: ScenarioDocumentBuilder,
  context: ScenarioContext,
  theme: ThemePlan,
  themeIndex: number,
  frame: Node,
  columns: {
    left: number
    right: number
    bottom: number
  },
  tops: {
    question: number
    hypothesis: number
    experiment: number
    finding: number
    evidence: number
    decision: number
  }
): ThemeGraph => {
  const rng = createSeededRandom(`${context.seed}:${theme.name}`)
  const graph: ThemeGraph = {
    frame,
    questions: [],
    hypotheses: [],
    experiments: [],
    findings: [],
    evidence: [],
    decisions: [],
    references: []
  }

  graph.questions.push(builder.addShape({
    position: {
      x: frame.position.x + frame.size!.width / 2 - 110,
      y: frame.position.y + tops.question
    },
    size: { width: 220, height: 82 },
    kind: 'pill',
    text: `${theme.name} question`,
    style: {
      fill: '#ffffff',
      stroke: theme.stroke,
      strokeWidth: 1.8,
      color: '#0f172a'
    }
  }))

  placeGrid({
    count: theme.counts.hypothesis,
    target: graph.hypotheses,
    createNode: (index) => {
      const row = Math.floor(index / columns.left)
      const col = index % columns.left
      return builder.addShape({
        position: {
          x: rng.jitter(frame.position.x + 34 + col * 188, 8),
          y: rng.jitter(frame.position.y + tops.hypothesis + row * 128, 6)
        },
        size: { width: 164, height: 110 },
        kind: 'diamond',
        text: cycle(HYPOTHESIS_TOPICS, themeIndex + index),
        style: {
          fill: '#ffffff',
          stroke: theme.stroke,
          strokeWidth: 1.4,
          color: '#0f172a'
        }
      })
    }
  })

  placeGrid({
    count: theme.counts.experiment,
    target: graph.experiments,
    createNode: (index) => {
      const row = Math.floor(index / columns.left)
      const col = index % columns.left
      return builder.addShape({
        position: {
          x: rng.jitter(frame.position.x + 34 + col * 188, 8),
          y: rng.jitter(frame.position.y + tops.experiment + row * 106, 6)
        },
        size: { width: 172, height: 82 },
        kind: 'rect',
        text: cycle(EXPERIMENT_TOPICS, themeIndex * 2 + index)
      })
    }
  })

  placeGrid({
    count: theme.counts.finding,
    target: graph.findings,
    createNode: (index) => {
      const row = Math.floor(index / columns.right)
      const col = index % columns.right
      return builder.addSticky({
        position: {
          x: rng.jitter(frame.position.x + 420 + col * 194, 8),
          y: rng.jitter(frame.position.y + tops.finding + row * 132, 6)
        },
        size: { width: 180, height: 112 },
        text: cycle(FINDING_TOPICS, themeIndex + index),
        style: {
          fill: '#fff3b0'
        }
      })
    }
  })

  placeGrid({
    count: theme.counts.evidence,
    target: graph.evidence,
    createNode: (index) => {
      const row = Math.floor(index / columns.right)
      const col = index % columns.right
      return builder.addShape({
        position: {
          x: rng.jitter(frame.position.x + 420 + col * 194, 8),
          y: rng.jitter(frame.position.y + tops.evidence + row * 110, 6)
        },
        size: { width: 176, height: 92 },
        kind: 'document',
        text: cycle(EVIDENCE_TOPICS, themeIndex + index),
        style: {
          fill: '#ffffff',
          stroke: theme.stroke,
          strokeWidth: 1.2,
          color: '#0f172a'
        }
      })
    }
  })

  placeGrid({
    count: theme.counts.decision,
    target: graph.decisions,
    createNode: (index) => {
      const row = Math.floor(index / columns.bottom)
      const col = index % columns.bottom
      return builder.addShape({
        position: {
          x: rng.jitter(frame.position.x + 40 + col * 220, 8),
          y: rng.jitter(frame.position.y + tops.decision + row * 106, 6)
        },
        size: { width: 198, height: 82 },
        kind: 'callout',
        text: cycle(DECISION_TOPICS, themeIndex + index),
        style: {
          fill: '#ffffff',
          stroke: theme.stroke,
          strokeWidth: 1.3,
          color: '#0f172a'
        }
      })
    }
  })

  placeGrid({
    count: theme.counts.reference,
    target: graph.references,
    createNode: (index) => {
      const row = Math.floor(index / columns.bottom)
      const col = index % columns.bottom
      return builder.addText({
        position: {
          x: rng.jitter(frame.position.x + 456 + col * 210, 8),
          y: rng.jitter(frame.position.y + tops.decision + row * 74, 6)
        },
        size: { width: 210, height: 44 },
        text: cycle(REFERENCE_TOPICS, themeIndex + index),
        style: {
          fontSize: 14,
          color: '#334155'
        }
      })
    }
  })

  return graph
}

const createEdges = (
  builder: ScenarioDocumentBuilder,
  context: ScenarioContext,
  graphs: ThemeGraph[]
) => {
  const seen = new Set<string>()

  graphs.forEach((graph, index) => {
    const question = graph.questions[0]
    graph.hypotheses.forEach((hypothesis) => {
      linkUnique(builder, question, hypothesis, seen)
    })
    graph.hypotheses.forEach((hypothesis, hypothesisIndex) => {
      linkUnique(builder, hypothesis, graph.experiments[hypothesisIndex % graph.experiments.length], seen)
    })
    graph.experiments.forEach((experiment, experimentIndex) => {
      linkUnique(builder, experiment, graph.evidence[experimentIndex % graph.evidence.length], seen)
    })
    graph.evidence.forEach((evidence, evidenceIndex) => {
      linkUnique(builder, evidence, graph.findings[evidenceIndex % graph.findings.length], seen)
    })
    graph.findings.forEach((finding, findingIndex) => {
      linkUnique(builder, finding, graph.decisions[findingIndex % graph.decisions.length], seen)
    })
    graph.references.forEach((reference, referenceIndex) => {
      linkUnique(builder, reference, graph.experiments[referenceIndex % graph.experiments.length], seen)
    })

    const next = graphs[(index + 1) % graphs.length]
    graph.findings.forEach((finding, findingIndex) => {
      linkUnique(builder, finding, next.questions[findingIndex % next.questions.length], seen)
    })
  })

  const targetEdges = Math.ceil(context.budget.contentNodes * 0.9)
  const findings = graphs.flatMap((graph) => graph.findings)
  const decisions = graphs.flatMap((graph) => graph.decisions)
  let cursor = 0
  while (seen.size < targetEdges && findings.length > 0 && decisions.length > 0) {
    linkUnique(
      builder,
      findings[cursor % findings.length],
      decisions[(cursor * 5 + 1) % decisions.length],
      seen
    )
    cursor += 1
    if (cursor > targetEdges * 3) {
      break
    }
  }
}

const createDocument = (
  context: ScenarioContext
) => {
  const builder = createScenarioDocumentBuilder()
  const themes = createThemePlans(context)
  const zoneColumns = context.size === 100 ? 2 : context.size === 500 ? 2 : 3
  const rightColumns = context.size === 100 ? 2 : context.size === 500 ? 2 : 3
  const bottomColumns = context.size === 100 ? 2 : 3
  const maxRows = themes.reduce((acc, theme) => ({
    hypothesis: Math.max(acc.hypothesis, bandRows(theme.counts.hypothesis, zoneColumns)),
    experiment: Math.max(acc.experiment, bandRows(theme.counts.experiment, zoneColumns)),
    finding: Math.max(acc.finding, bandRows(theme.counts.finding, rightColumns)),
    evidence: Math.max(acc.evidence, bandRows(theme.counts.evidence, rightColumns)),
    decision: Math.max(acc.decision, bandRows(theme.counts.decision, bottomColumns)),
    reference: Math.max(acc.reference, bandRows(theme.counts.reference, bottomColumns))
  }), {
    hypothesis: 1,
    experiment: 1,
    finding: 1,
    evidence: 1,
    decision: 1,
    reference: 1
  })

  const frameWidth = 1040
  const frameHeight =
    92
    + 96
    + maxRows.hypothesis * 128
    + maxRows.experiment * 106
    + maxRows.finding * 132
    + maxRows.evidence * 110
    + Math.max(maxRows.decision * 106, maxRows.reference * 74)
    + 96
  const frameColumns = themes.length <= 4 ? 2 : themes.length <= 6 ? 3 : 4
  const frameGapX = 150
  const frameGapY = 170
  const totalWidth = frameColumns * frameWidth + (frameColumns - 1) * frameGapX
  const tops = {
    question: 46,
    hypothesis: 164,
    experiment: 164 + maxRows.hypothesis * 128,
    finding: 164,
    evidence: 164 + maxRows.finding * 132,
    decision: 164 + maxRows.hypothesis * 128 + maxRows.experiment * 106 + 40
  }

  const graphs = themes.map((theme, index) => {
    const row = Math.floor(index / frameColumns)
    const col = index % frameColumns
    const position = {
      x: col * (frameWidth + frameGapX) - totalWidth / 2,
      y: row * (frameHeight + frameGapY) - 150
    }
    const frame = builder.addFrame({
      position,
      size: { width: frameWidth, height: frameHeight },
      title: `${theme.name} Map`,
      style: {
        fill: theme.fill,
        stroke: theme.stroke,
        strokeWidth: 2,
        color: '#0f172a'
      }
    })

    return createThemeGraph(
      builder,
      context,
      theme,
      index,
      frame,
      {
        left: zoneColumns,
        right: rightColumns,
        bottom: bottomColumns
      },
      {
        question: tops.question,
        hypothesis: tops.hypothesis,
        experiment: tops.experiment,
        finding: tops.finding,
        evidence: tops.evidence,
        decision: tops.decision
      }
    )
  })

  createEdges(builder, context, graphs)
  return builder.build(`demo-${context.familyId}-${context.size}`)
}

export const researchKnowledgeMapFamily: GeneratedScenarioFamily = {
  id: 'research-knowledge-map',
  label: '研究知识图谱',
  description: '按主题分区的假设、实验、证据与结论网络。',
  sizes: SCENARIO_SIZES,
  create: createDocument
}

