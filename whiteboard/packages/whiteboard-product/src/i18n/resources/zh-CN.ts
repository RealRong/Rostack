export const whiteboardProductZhCNResources = {
  whiteboard: {
    edge: {
      preset: {
        'edge.line': { label: '线' },
        'edge.arrow': { label: '箭头' },
        'edge.elbow-arrow': { label: '折线' },
        'edge.fillet-arrow': { label: '圆角折线' },
        'edge.curve-arrow': { label: '曲线' }
      }
    },
    insert: {
      preset: {
        text: { label: '文本', description: '空文本块' },
        frame: { label: '框架', description: '手动框选区域' }
      }
    },
    mindmap: {
      seed: {
        blank: { label: '空白', description: '仅包含中心主题' },
        project: { label: '项目', description: '目标、时间线、任务、备注' },
        research: { label: '研究', description: '问题、来源、结论、下一步' },
        meeting: { label: '会议', description: '议程、讨论、决策、行动项' }
      },
      preset: {
        'mindmap.capsule-outline': { label: '胶囊描边', description: '根节点描边，分支为胶囊' },
        'mindmap.capsule-solid': { label: '胶囊实心', description: '根节点实心，分支更柔和' },
        'mindmap.underline-split': { label: '下划线分叉', description: '下划线节点，分支分叉展开' },
        'mindmap.tree-balanced': { label: '平衡树', description: '矩形主题的平衡树结构' }
      }
    }
  }
} as const
