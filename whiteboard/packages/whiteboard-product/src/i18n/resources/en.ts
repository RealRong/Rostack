export const whiteboardProductEnResources = {
  whiteboard: {
    edge: {
      preset: {
        'edge.line': { label: 'Line' },
        'edge.arrow': { label: 'Arrow' },
        'edge.elbow-arrow': { label: 'Elbow' },
        'edge.fillet-arrow': { label: 'Fillet' },
        'edge.curve-arrow': { label: 'Curve' }
      }
    },
    insert: {
      preset: {
        text: { label: 'Text', description: 'Empty text block' },
        frame: { label: 'Frame', description: 'Manual frame area' }
      }
    },
    mindmap: {
      seed: {
        blank: { label: 'Blank', description: 'Central topic only' },
        project: { label: 'Project', description: 'Goals, timeline, tasks, notes' },
        research: { label: 'Research', description: 'Question, sources, findings, next steps' },
        meeting: { label: 'Meeting', description: 'Agenda, discussion, decisions, action items' }
      },
      preset: {
        'mindmap.capsule-outline': { label: 'Capsule Outline', description: 'Outline root and pill branches' },
        'mindmap.capsule-solid': { label: 'Capsule Solid', description: 'Solid root with soft branch nodes' },
        'mindmap.underline-split': { label: 'Underline Split', description: 'Underline nodes with split branches' },
        'mindmap.tree-balanced': { label: 'Tree Balanced', description: 'Balanced tree with rectangular topics' }
      }
    }
  }
} as const
