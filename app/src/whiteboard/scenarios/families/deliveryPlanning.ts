import type { Edge, Node } from '@whiteboard/core/types'
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

type TeamCounts = {
  initiative: number
  epic: number
  task: number
  milestone: number
  risk: number
  decision: number
  doc: number
}

type TeamPlan = {
  name: string
  fill: string
  stroke: string
  counts: TeamCounts
}

type TeamPhaseCounts = {
  initiative: number
  epic: number
  task: number
  milestone: number
  risk: number
  decision: number
  doc: number
}

type TeamPhaseGraph = {
  initiatives: Node[]
  epics: Node[]
  tasks: Node[]
  milestones: Node[]
  risks: Node[]
  decisions: Node[]
  docs: Node[]
}

type TeamGraph = {
  frame: Node
  phases: TeamPhaseGraph[]
}

const TEAM_NAMES = [
  'Editor',
  'Infra',
  'Sync',
  'Comments',
  'Search',
  'Mobile',
  'Growth',
  'Templates',
  'Observability',
  'Security'
] as const

const PHASE_NAMES = [
  'Now',
  'Next',
  'Validate',
  'Launch'
] as const

const FRAME_FILLS = [
  '#dbeafe',
  '#dcfce7',
  '#fef3c7',
  '#fce7f3',
  '#e9d5ff',
  '#ccfbf1',
  '#fee2e2',
  '#ede9fe',
  '#fde68a',
  '#cffafe'
] as const

const FRAME_STROKES = [
  '#2563eb',
  '#16a34a',
  '#d97706',
  '#db2777',
  '#7c3aed',
  '#0f766e',
  '#dc2626',
  '#8b5cf6',
  '#b45309',
  '#0891b2'
] as const

const INITIATIVE_TOPICS = [
  'Graph rewrite',
  'Comment threads',
  'Template launch',
  'Realtime cursor',
  'Sync recovery',
  'Search onboarding',
  'Permission audit',
  'Mobile polish'
] as const

const EPIC_TOPICS = [
  'Selection delta',
  'Projection cleanup',
  'Schema migration',
  'History compression',
  'Read refactor',
  'Viewport tuning',
  'Edge routing',
  'Telemetry hooks'
] as const

const TASK_TOPICS = [
  'hover affordance',
  'undo semantics',
  'room isolation',
  'delta publish',
  'shape fallback',
  'scroll sync',
  'copy semantics',
  'paste repair',
  'panel memo',
  'snapshot hydration'
] as const

const RISK_LINES = [
  'Risk: replay lag during migration',
  'Risk: selection regressions under marquee',
  'Risk: mobile viewport drifts on reconnect',
  'Risk: history stack spikes during batch patch',
  'Risk: schema drift across collab sessions'
] as const

const DECISION_LINES = [
  'Decision: ship graph/ui split without dual track',
  'Decision: keep delta immutable at publish boundary',
  'Decision: query room from URL before board mount',
  'Decision: move read bundling behind scenario preset'
] as const

const DOC_LINES = [
  'Spec: delta index migration',
  'Plan: phase 5 cleanup',
  'Doc: projection API split',
  'Runbook: broadcast room reset',
  'Checklist: release gate review'
] as const

const teamCountBySize = (
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

const createTeamPlans = (
  context: ScenarioContext
): TeamPlan[] => {
  const teamCount = teamCountBySize(context.size)
  const budgets = distributeEvenly(context.budget.contentNodes, teamCount)
  return budgets.map((budget, index) => ({
    name: cycle(TEAM_NAMES, index),
    fill: cycle(FRAME_FILLS, index),
    stroke: cycle(FRAME_STROKES, index),
    counts: allocateCounts(budget, [
      { key: 'initiative', min: 2, weight: 0.65 },
      { key: 'epic', min: 3, weight: 0.95 },
      { key: 'task', min: 12, weight: 4.7 },
      { key: 'milestone', min: 2, weight: 0.45 },
      { key: 'risk', min: 2, weight: 0.35 },
      { key: 'decision', min: 1, weight: 0.25 },
      { key: 'doc', min: 1, weight: 0.35 }
    ])
  }))
}

const createPhaseCounts = (
  counts: TeamCounts
): TeamPhaseCounts[] => {
  const initiatives = distributeEvenly(counts.initiative, PHASE_NAMES.length)
  const epics = distributeEvenly(counts.epic, PHASE_NAMES.length)
  const tasks = distributeEvenly(counts.task, PHASE_NAMES.length)
  const milestones = distributeEvenly(counts.milestone, PHASE_NAMES.length)
  const risks = distributeEvenly(counts.risk, PHASE_NAMES.length)
  const decisions = distributeEvenly(counts.decision, PHASE_NAMES.length)
  const docs = distributeEvenly(counts.doc, PHASE_NAMES.length)

  return PHASE_NAMES.map((_phase, index) => ({
    initiative: initiatives[index]!,
    epic: epics[index]!,
    task: tasks[index]!,
    milestone: milestones[index]!,
    risk: risks[index]!,
    decision: decisions[index]!,
    doc: docs[index]!
  }))
}

const phaseStackHeight = (
  counts: TeamPhaseCounts
) => (
  counts.milestone * 126
  + counts.initiative * 92
  + counts.epic * 94
  + counts.task * 78
  + counts.risk * 124
  + counts.decision * 64
  + counts.doc * 108
)

const placeStack = ({
  target,
  count,
  createNode
}: {
  target: Node[]
  count: number
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

const createTeamGraph = (
  builder: ScenarioDocumentBuilder,
  context: ScenarioContext,
  team: TeamPlan,
  teamIndex: number,
  frame: Node,
  phaseCounts: TeamPhaseCounts[],
  phaseWidth: number
): TeamGraph => {
  const rng = createSeededRandom(`${context.seed}:${team.name}`)
  const graph: TeamGraph = {
    frame,
    phases: PHASE_NAMES.map(() => ({
      initiatives: [],
      epics: [],
      tasks: [],
      milestones: [],
      risks: [],
      decisions: [],
      docs: []
    }))
  }

  phaseCounts.forEach((counts, phaseIndex) => {
    const phaseName = PHASE_NAMES[phaseIndex]!
    const phaseX = frame.position.x + 40 + phaseIndex * phaseWidth
    let cursorY = frame.position.y + 72

    placeStack({
      target: graph.phases[phaseIndex]!.milestones,
      count: counts.milestone,
      createNode: (index) => {
        const node = builder.addShape({
          position: {
            x: rng.jitter(phaseX + 28, 6),
            y: rng.jitter(cursorY + index * 126, 5)
          },
          size: { width: 128, height: 128 },
          kind: 'diamond',
          text: `${phaseName} review`,
          style: {
            fill: '#ffffff',
            stroke: team.stroke,
            strokeWidth: 1.6,
            color: '#0f172a'
          }
        })
        return node
      }
    })
    cursorY += counts.milestone * 126

    placeStack({
      target: graph.phases[phaseIndex]!.initiatives,
      count: counts.initiative,
      createNode: (index) => builder.addShape({
        position: {
          x: rng.jitter(phaseX, 6),
          y: rng.jitter(cursorY + index * 92, 5)
        },
        size: { width: 182, height: 74 },
        kind: 'pill',
        text: `${phaseName} · ${cycle(INITIATIVE_TOPICS, teamIndex + index)}`,
        style: {
          fill: '#ffffff',
          stroke: team.stroke,
          strokeWidth: 1.8,
          color: '#0f172a'
        }
      })
    })
    cursorY += counts.initiative * 92

    placeStack({
      target: graph.phases[phaseIndex]!.epics,
      count: counts.epic,
      createNode: (index) => builder.addShape({
        position: {
          x: rng.jitter(phaseX, 6),
          y: rng.jitter(cursorY + index * 94, 5)
        },
        size: { width: 182, height: 76 },
        kind: 'rect',
        text: `${phaseName} · ${cycle(EPIC_TOPICS, teamIndex * 3 + index)}`,
        style: {
          fill: '#ffffff',
          stroke: team.stroke,
          strokeWidth: 1.4,
          color: '#0f172a'
        }
      })
    })
    cursorY += counts.epic * 94

    placeStack({
      target: graph.phases[phaseIndex]!.tasks,
      count: counts.task,
      createNode: (index) => builder.addShape({
        position: {
          x: rng.jitter(phaseX + 8, 6),
          y: rng.jitter(cursorY + index * 78, 5)
        },
        size: { width: 166, height: 60 },
        kind: 'rounded-rect',
        text: `${phaseName} · ${cycle(TASK_TOPICS, teamIndex + index)}`
      })
    })
    cursorY += counts.task * 78

    placeStack({
      target: graph.phases[phaseIndex]!.risks,
      count: counts.risk,
      createNode: (index) => builder.addSticky({
        position: {
          x: rng.jitter(phaseX - 4, 6),
          y: rng.jitter(cursorY + index * 124, 5)
        },
        size: { width: 190, height: 106 },
        text: cycle(RISK_LINES, phaseIndex + teamIndex + index),
        style: {
          fill: '#fff1bf'
        }
      })
    })
    cursorY += counts.risk * 124

    placeStack({
      target: graph.phases[phaseIndex]!.decisions,
      count: counts.decision,
      createNode: (index) => builder.addText({
        position: {
          x: rng.jitter(phaseX - 2, 6),
          y: rng.jitter(cursorY + index * 64, 5)
        },
        size: { width: 212, height: 42 },
        text: cycle(DECISION_LINES, phaseIndex + teamIndex + index),
        style: {
          fontSize: 14,
          color: '#334155'
        }
      })
    })
    cursorY += counts.decision * 64

    placeStack({
      target: graph.phases[phaseIndex]!.docs,
      count: counts.doc,
      createNode: (index) => builder.addShape({
        position: {
          x: rng.jitter(phaseX + 4, 6),
          y: rng.jitter(cursorY + index * 108, 5)
        },
        size: { width: 174, height: 92 },
        kind: 'document',
        text: cycle(DOC_LINES, teamIndex + phaseIndex + index),
        style: {
          fill: '#ffffff',
          stroke: team.stroke,
          strokeWidth: 1.3,
          color: '#0f172a'
        }
      })
    })
  })

  return graph
}

const createEdges = (
  builder: ScenarioDocumentBuilder,
  context: ScenarioContext,
  teams: TeamGraph[]
) => {
  const seen = new Set<string>()

  teams.forEach((team, teamIndex) => {
    team.phases.forEach((phase, phaseIndex) => {
      phase.epics.forEach((epic, index) => {
        linkUnique(builder, epic, phase.initiatives[index % phase.initiatives.length], seen)
      })
      phase.tasks.forEach((task, index) => {
        linkUnique(builder, task, phase.epics[index % phase.epics.length], seen)
      })
      phase.milestones.forEach((milestone, index) => {
        linkUnique(builder, milestone, phase.initiatives[index % phase.initiatives.length], seen)
      })
      phase.risks.forEach((risk, index) => {
        linkUnique(builder, risk, phase.initiatives[index % phase.initiatives.length], seen)
      })
      phase.decisions.forEach((decision, index) => {
        linkUnique(builder, decision, phase.initiatives[index % phase.initiatives.length], seen)
      })
      phase.docs.forEach((doc, index) => {
        linkUnique(builder, doc, phase.initiatives[index % phase.initiatives.length], seen)
      })

      const nextPhase = team.phases[(phaseIndex + 1) % team.phases.length]
      phase.initiatives.forEach((initiative, index) => {
        linkUnique(builder, initiative, nextPhase.initiatives[index % nextPhase.initiatives.length], seen)
      })
    })

    const nextTeam = teams[(teamIndex + 1) % teams.length]
    team.phases.forEach((phase, phaseIndex) => {
      phase.initiatives.forEach((initiative, index) => {
        const targetPhase = nextTeam.phases[phaseIndex]
        linkUnique(builder, initiative, targetPhase.epics[index % targetPhase.epics.length], seen)
      })
    })
  })

  const targetEdges = Math.ceil(context.budget.contentNodes * 0.75)
  const tasks = teams.flatMap((team) => team.phases.flatMap((phase) => phase.tasks))
  const epics = teams.flatMap((team) => team.phases.flatMap((phase) => phase.epics))
  let cursor = 0
  while (seen.size < targetEdges && tasks.length > 0 && epics.length > 0) {
    linkUnique(
      builder,
      tasks[cursor % tasks.length],
      epics[(cursor * 3 + 1) % epics.length],
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
  const teams = createTeamPlans(context)
  const phaseByTeam = teams.map((team) => createPhaseCounts(team.counts))
  const maxStackHeight = Math.max(
    ...phaseByTeam.flatMap((phases) => phases.map((phase) => phaseStackHeight(phase))),
    1
  )
  const frameWidth = 4 * 232 + 100
  const frameHeight = maxStackHeight + 140
  const phaseWidth = 232
  const frameColumns = teams.length <= 4 ? 2 : 3
  const frameGapX = 140
  const frameGapY = 180
  const totalWidth = frameColumns * frameWidth + (frameColumns - 1) * frameGapX

  const graphs = teams.map((team, index) => {
    const row = Math.floor(index / frameColumns)
    const col = index % frameColumns
    const position = {
      x: col * (frameWidth + frameGapX) - totalWidth / 2,
      y: row * (frameHeight + frameGapY) - 160
    }
    const frame = builder.addFrame({
      position,
      size: { width: frameWidth, height: frameHeight },
      title: `${team.name} Stream`,
      style: {
        fill: team.fill,
        stroke: team.stroke,
        strokeWidth: 2,
        color: '#0f172a'
      }
    })

    return createTeamGraph(
      builder,
      context,
      team,
      index,
      frame,
      phaseByTeam[index]!,
      phaseWidth
    )
  })

  createEdges(builder, context, graphs)
  return builder.build(`demo-${context.familyId}-${context.size}`)
}

export const deliveryPlanningFamily: GeneratedScenarioFamily = {
  id: 'delivery-planning',
  label: '交付规划',
  description: '按团队与阶段分列的交付计划、风险和依赖。',
  sizes: SCENARIO_SIZES,
  create: createDocument
}

