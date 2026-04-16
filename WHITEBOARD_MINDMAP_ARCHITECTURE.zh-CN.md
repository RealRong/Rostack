# Whiteboard Mindmap 长期最优架构与最终 API 设计

## 1. 最终结论

mindmap 的长期最优模型应该是：

1. 文档里只持久化一份 `MindmapTree`。
2. `MindmapTreeNode.style` 直接承载这个 node 自己的外观，以及它到 children 的 branch 外观。
3. engine / query 只负责计算 layout、path、bbox、render model，这些 computed 数据不写回文档。
4. `preset` 不是并行主模型，只是“创建时生成 tree”或“应用时批量改写 tree”的规则来源。

也就是说，最终不要再做：

- `data = { tree, view }`
- `style.root / style.child`
- `depth -> style` 作为持久化主模型

真正简单而且符合产品语义的模型是：

`document node.data = MindmapTree`

以及：

`MindmapTreeNode.style.node` 控制当前 node 自己  
`MindmapTreeNode.style.branch` 控制当前 node 到 direct children 的连线

这和产品交互是完全一致的：

- 选中某个 node
- toolbar 改 `branch`
- 这个 node 到 children 的线立刻变化

## 2. 为什么这是最优解

### 2.1 不需要单独的 `view`

如果 `view` 里放的是用户真正编辑出来并且要持久化的内容，那它本质上就不是“view”，而是 authored model。

把它和 `tree` 并排存：

```ts
data: {
  tree,
  view
}
```

只会增加心智负担：

- 两个领域对象并排存在
- toolbar 改样式时到底改 tree 还是改 view 很绕
- preset / apply / insert / render 都要先决定权威来源

最简单的方案是：

- 结构、布局偏好、样式全部归到 `MindmapTree`
- engine 只在运行时产出 computed layout / render model

### 2.2 不应该把主样式模型做成 `level -> style`

`level -> style` 适合做 preset 的内部生成规则，不适合做主持久化模型。

原因很直接：

- 用户交互是 node-based，不是 depth-based
- toolbar 改的是当前 node 的 branch，不是“第 2 层 branch”
- 同层不同分支经常会需要不同样式

所以：

- `level rule` 可以存在于 preset schema
- 但文档里最终只应该保存 materialized 的 `node.style`

### 2.3 不应该把主样式模型做成 `id -> style` 的独立表

如果单独维护：

```ts
styles: {
  [nodeId]: ...
}
```

也不优，因为：

- `nodes` 和 `styles` 又分裂成两份真相
- 新增 / 删除节点需要做双份同步
- 复制 / 克隆 / move subtree 都更脆弱

样式最自然的归属还是：

`MindmapTreeNode.style`

## 3. 最终持久化形态

一个 `type: 'mindmap'` 的 canvas node，最终应该长这样：

```ts
document.nodes[nodeId] = {
  id: nodeId,
  type: 'mindmap',
  position: { x, y },
  data: {
    rootId: 'node_root',
    nodes: {
      node_root: {
        id: 'node_root',
        data: { kind: 'text', text: 'Central topic' },
        style: {
          node: {
            frame: { kind: 'ellipse', color: '#2563eb', width: 2 },
            fill: '#dbeafe',
            text: '#0f172a',
            paddingX: 20,
            paddingY: 10,
            minWidth: 120
          },
          branch: {
            color: '#2563eb',
            line: 'curve',
            width: 2,
            stroke: 'solid'
          }
        }
      }
    },
    children: {
      node_root: []
    },
    layout: {
      side: 'both',
      mode: 'tidy',
      hGap: 28,
      vGap: 18
    },
    preset: 'mindmap.underline-split'
  }
}
```

关键点：

- 外层 canvas node 负责位置、锁定、zIndex 等 whiteboard 通用属性
- `node.data` 直接就是 `MindmapTree`
- 不再多包一层 `view`
- 不再单独维护 styles 表

## 4. 最终类型设计

### 4.1 Tree

建议最终把 `MindmapTree` 做成唯一 authored model：

```ts
export type MindmapNodeId = string
export type MindmapPresetKey = string

export type MindmapLayoutSpec = {
  side: 'both' | 'left' | 'right'
  mode: 'simple' | 'tidy'
  hGap: number
  vGap: number
}

export type MindmapTree = {
  rootId: MindmapNodeId
  nodes: Record<MindmapNodeId, MindmapTreeNode>
  children: Record<MindmapNodeId, MindmapNodeId[]>
  layout: MindmapLayoutSpec
  preset?: MindmapPresetKey
  meta?: {
    createdAt?: string
    updatedAt?: string
  }
}
```

这里建议直接去掉 `MindmapTree.id`。

原因：

- 这棵树本来就挂在外层 canvas node 上
- 外层 `node.id` 就是 tree 的权威标识
- 内外两层再各有一个 id 是重复建模

### 4.2 Tree Node

```ts
export type MindmapTopicData =
  | { kind: 'text'; text?: string }
  | { kind: 'file'; fileId: string; name?: string }
  | { kind: 'link'; url: string; title?: string }
  | { kind: 'ref'; ref: { type: 'whiteboard-node' | 'object'; id: string }; title?: string }
  | { kind: 'custom'; [key: string]: unknown }
```

```ts
export type MindmapTreeNodeStyle = {
  node: MindmapNodeStyle
  branch: MindmapBranchStyle
}

export type MindmapTreeNode = {
  id: MindmapNodeId
  parentId?: MindmapNodeId
  side?: 'left' | 'right'
  collapsed?: boolean
  data?: MindmapTopicData
  style: MindmapTreeNodeStyle
}
```

这里建议 `style` 在理想模型里直接必填。

原因：

- query/render 不需要猜继承链
- 新增 child 时，parent 的 branch style 永远存在
- toolbar 编辑当前 node 也不需要处理 “style 不存在”

如果实现阶段为了兼容老数据要允许 optional，那只是迁移细节，不应该污染最终模型。

### 4.3 Node Style

```ts
export type MindmapNodeFrameKind =
  | 'ellipse'
  | 'rect'
  | 'underline'

export type MindmapNodeFrameStyle = {
  kind: MindmapNodeFrameKind
  color: string
  width: number
}

export type MindmapNodeStyle = {
  frame: MindmapNodeFrameStyle
  fill: string
  text: string
  paddingX: number
  paddingY: number
  minWidth?: number
}
```

这里的语义非常直接：

- `frame.kind = 'ellipse'`
  节点是椭圆
- `frame.kind = 'rect'`
  节点是矩形
- `frame.kind = 'underline'`
  节点只显示下划线，不显示完整包围框

也就是说，你要的：

- root node 可设椭圆 / 方形 / 下划线
- child node 可设椭圆 / 方形 / 下划线

都直接通过每个 node 的 `style.node.frame.kind` 完成。

### 4.4 Branch Style

```ts
export type MindmapBranchLineKind =
  | 'curve'
  | 'elbow'
  | 'rail'

export type MindmapStrokeStyle =
  | 'solid'
  | 'dashed'
  | 'dotted'

export type MindmapBranchStyle = {
  color: string
  line: MindmapBranchLineKind
  width: number
  stroke: MindmapStrokeStyle
}
```

这就是 branch 的最终语义：

- `color`
  线颜色
- `line`
  几何样式
- `width`
  线宽
- `stroke`
  实线 / 虚线 / 点线

最重要的是归属：

`MindmapTreeNode.style.branch` 属于这个 node 自己。

一条连接线 `parent -> child` 的样式，总是取 `parent.style.branch`。

所以：

- 改 root 的 `branch`
  影响 root 到第一层 children 的线
- 改某个 child 的 `branch`
  影响这个 child 到它 children 的线

这正是产品语义。

## 5. 最终语义定义

这是整套模型最核心的部分。

### 5.1 `node.style.node`

控制当前 node 自己的视觉外观。

包括：

- 节点外壳形状
- 边框颜色和宽度
- 填充色
- 文本色
- 内边距

### 5.2 `node.style.branch`

控制当前 node 发出的 branch，也就是它到 direct children 的线。

不控制：

- parent 到当前 node 的线
- 当前 node 的 grandchildren 之间的线

只控制：

- 当前 node -> 它的 direct children

### 5.3 root 和 child 不再需要单独建模

是否 root、是否 child、是否第几层，都不需要单独占一个持久化样式槽位。

因为：

- root 本质上只是 `nodeId === tree.rootId`
- child 本质上只是非 root node
- 样式本来就挂在 node 上

如果 preset 想让 root 和 child 不同，只需要在 `applyPreset(...)` 时给 root 和 child materialize 出不同的 `node.style` 即可。

## 6. preset 的最终定位

`preset` 不再是并行主模型，也不是运行时 render 的第二真相。

它的定位应该非常收敛：

1. 创建 mindmap 时生成一棵初始 tree
2. 应用 preset 时批量改写现有 tree 的 layout 和 node.style

换句话说：

`preset 是写 tree 的规则，不是 tree 旁边的另一棵模型。`

### 6.1 Seed

`seed` 只负责初始内容结构。

```ts
export type MindmapSeedKey = string

export type MindmapSeed = {
  key: MindmapSeedKey
  label: string
  description?: string
  root: MindmapTopicData
  children?: readonly {
    data: MindmapTopicData
    side?: 'left' | 'right'
  }[]
}
```

### 6.2 Preset

`preset` 负责：

- layout 默认值
- 节点样式生成规则
- branch 样式生成规则

但这些规则不直接持久化为 `view`，而是在 create/apply 时落成具体 node.style。

推荐最终 API：

```ts
export type MindmapPresetRule = {
  match?: {
    depth?: number | { min?: number; max?: number }
    side?: 'left' | 'right'
    leaf?: boolean
    root?: boolean
  }
  node?: Partial<MindmapNodeStyle>
  branch?: Partial<MindmapBranchStyle>
}

export type MindmapPreset = {
  key: MindmapPresetKey
  label: string
  description?: string
  seed: MindmapSeedKey
  layout: MindmapLayoutSpec
  rules: readonly MindmapPresetRule[]
}
```

这套 schema 的意义是：

- preset 自己可以按 depth / side / leaf / root 生成不同结果
- 但最终写回文档的仍然是每个 node 的 concrete `style`
- 文档运行时不需要再认 `rules`

### 6.3 为什么这里允许 rule，但文档不保留 rule

因为 preset 是生成器，不是用户最终编辑态本身。

这个边界非常重要：

- `preset.rules`
  是 apply/create 的输入
- `tree.nodes[id].style`
  是最终持久化真相

这样既保留足够表达力，又不把运行时模型搞复杂。

## 7. 最终 schema API

建议最终只保留这组 schema API：

```ts
export const listMindmapPresets: () => readonly MindmapPreset[]

export const readMindmapPreset: (
  key: MindmapPresetKey
) => MindmapPreset | undefined

export const listMindmapSeeds: () => readonly MindmapSeed[]

export const readMindmapSeed: (
  key: MindmapSeedKey
) => MindmapSeed | undefined

export const createMindmapTree: (input: {
  preset: MindmapPresetKey
  seed?: MindmapSeedKey
}) => MindmapTree

export const applyMindmapPreset: (
  tree: MindmapTree,
  preset: MindmapPresetKey
) => MindmapTree
```

这 6 个 API 足够了。

其中：

- `createMindmapTree`
  用于创建一棵新树，并且把样式 materialize 到每个 node 上
- `applyMindmapPreset`
  用于把 preset 批量落到现有 tree 上

## 8. 最终 editor command API

editor 层建议最终收敛为下面几组：

```ts
mindmap.create({
  at,
  preset,
  seed?
})

mindmap.patch(nodeId, {
  layout?: Partial<MindmapLayoutSpec>
  preset?: MindmapPresetKey
})

mindmap.patchNode(nodeId, mindmapNodeId, {
  data?: MindmapTopicData
  collapsed?: boolean
  side?: 'left' | 'right'
  style?: Partial<MindmapTreeNodeStyle>
})

mindmap.applyPreset(nodeId, preset)
```

结构编辑继续保留现有那批：

- insert child / sibling / parent
- move subtree
- remove subtree
- clone subtree

语义上：

- `create`
  创建 mindmap canvas node，并写入 `data: MindmapTree`
- `patch`
  改 tree 级字段，比如 layout
- `patchNode`
  改某个 tree node 的文本、折叠、side、样式
- `applyPreset`
  批量覆盖整棵 tree 的 layout 和 node.style

### 8.1 为什么不需要 `patchView`

因为没有 `view`。

toolbar 改 branch 时，最简单的动作就是：

```ts
mindmap.patchNode(canvasNodeId, selectedMindmapNodeId, {
  style: {
    branch: {
      color: '#0ea5e9',
      line: 'rail',
      width: 2,
      stroke: 'solid'
    }
  }
})
```

这就是最终语义，不需要中间层。

## 9. 新增节点时样式如何确定

这是 node-based 模型里必须讲清楚的一点。

建议最终策略如下：

1. 新增 sibling
   优先继承相邻 sibling 的 `style`
2. 新增 child
   优先继承同层已有 sibling 的 `style`
3. 如果没有可继承 sibling
   用当前 `tree.preset` 对该节点位置重新 resolve 一次默认 style
4. 如果没有 preset
   用 schema 的系统默认值

重点是：

- 文档里最终存的是 concrete `style`
- 不是插入时临时算完就丢

这样新增 node 后，后续 toolbar/query/render 都不需要再猜。

## 10. 最终 query / render API

query 层只负责把 tree 变成可渲染模型，不负责决定 authored truth。

建议最终 API：

```ts
export type MindmapRenderNode = {
  id: MindmapNodeId
  depth: number
  side?: 'left' | 'right'
  rect: Rect
  label: string
  style: MindmapNodeStyle
  state: {
    dragActive: boolean
    attachTarget: boolean
    dragPreviewActive: boolean
    showActions: boolean
  }
}

export type MindmapRenderConnector = {
  id: string
  parentId: MindmapNodeId
  childId: MindmapNodeId
  path: string
  style: MindmapBranchStyle
}

export type MindmapRenderModel = {
  treeId: NodeId
  rootPosition: Point
  bbox: Rect
  nodes: readonly MindmapRenderNode[]
  connectors: readonly MindmapRenderConnector[]
  ghost?: Rect
  drop?: {
    connectionPath?: string
    insertPath?: string
  }
}
```

```ts
export const resolveMindmapRender: (input: {
  tree: MindmapTree
  nodeSize: Size
  drag?: MindmapDragState
}) => MindmapRenderModel
```

连接线样式解析规则非常简单：

```ts
connector.style = tree.nodes[parentId].style.branch
```

节点样式解析规则也非常简单：

```ts
renderNode.style = tree.nodes[nodeId].style.node
```

这是整套设计最大的好处之一：

- query 不需要再从 `view`、`root/child slot`、`depth slot` 里猜
- React 也不需要再自己拼业务语义

## 11. computed 数据该怎么处理

layout、bbox、connector path、drag preview、hover hint 这些全部属于 computed data。

它们应该：

- 在 engine / query 层计算
- 在内存里缓存
- 按需失效重算

但不应该写回文档。

也就是：

- authored truth：`MindmapTree`
- computed truth：`MindmapRenderModel`

不要把两者混在一起。

## 12. React 侧如何消费

React 侧只消费 render model 和 editor commands。

建议最终只暴露：

```ts
useMindmapRenderModel(treeId)
MindmapPresetGallery
MindmapPresetPreview
```

规则：

- 菜单 preview 用 synthetic tree + `resolveMindmapRender(...)`
- toolbar 改 node shell，调用 `mindmap.patchNode(...style.node...)`
- toolbar 改 branch，调用 `mindmap.patchNode(...style.branch...)`
- layout 菜单改 side / mode / gap，调用 `mindmap.patch(...)`
- 一键切换样式，调用 `mindmap.applyPreset(...)`

React 不再维护第二套样式真相。

## 13. 一个完整例子

下面这个例子直接表达：

- root 是椭圆
- child 是下划线
- root 的 branch 是蓝色 curve
- 某个 child 的 branch 是灰色 rail

```ts
const tree: MindmapTree = {
  rootId: 'root',
  layout: {
    side: 'both',
    mode: 'tidy',
    hGap: 28,
    vGap: 18
  },
  preset: 'mindmap.underline-split',
  nodes: {
    root: {
      id: 'root',
      data: { kind: 'text', text: 'Central topic' },
      style: {
        node: {
          frame: {
            kind: 'ellipse',
            color: 'var(--wb-palette-blue-6)',
            width: 2
          },
          fill: 'var(--wb-palette-blue-0)',
          text: 'var(--wb-palette-text-0)',
          paddingX: 20,
          paddingY: 10,
          minWidth: 120
        },
        branch: {
          color: 'var(--wb-palette-blue-6)',
          line: 'curve',
          width: 2,
          stroke: 'solid'
        }
      }
    },
    child_a: {
      id: 'child_a',
      parentId: 'root',
      side: 'left',
      data: { kind: 'text', text: 'Branch A' },
      style: {
        node: {
          frame: {
            kind: 'underline',
            color: 'var(--wb-palette-slate-5)',
            width: 2
          },
          fill: 'transparent',
          text: 'var(--wb-palette-text-0)',
          paddingX: 6,
          paddingY: 4,
          minWidth: 72
        },
        branch: {
          color: 'var(--wb-palette-slate-4)',
          line: 'rail',
          width: 1.5,
          stroke: 'solid'
        }
      }
    }
  },
  children: {
    root: ['child_a'],
    child_a: []
  }
}
```

这个例子也说明了为什么 node-based 模型比 `view` / `levels` 更顺：

- 用户改哪里，就 patch 哪个 node
- branch 属于谁，一眼就能看懂
- render 读取路径极短

## 14. 实施顺序

### 阶段 1：先收敛数据模型

目标：

- 删除 `view` 主模型
- 把样式并回 `MindmapTreeNode.style`
- 外层 `node.data` 直接收敛为 `MindmapTree`

### 阶段 2：重做 preset 链路

目标：

- `createMindmapTree(...)`
- `applyMindmapPreset(...)`
- preset 只负责生成和批量覆盖 concrete node.style

### 阶段 3：query/render 收敛

目标：

- connector 用 parent node 的 `style.branch`
- node 用自己的 `style.node`
- computed layout/path 不写回文档

### 阶段 4：React / toolbar 收敛

目标：

- toolbar 直接 patch 当前 node 的 `style.node` 或 `style.branch`
- menu preview 和 canvas 渲染走同一条 render pipeline
- 不再保留第二套样式 owner

## 15. 最后一句话

mindmap 的最终推荐方案可以压缩成一句话：

`只持久化一份 MindmapTree；node style 和 branch style 都挂在 MindmapTreeNode.style 上；preset 只负责生成和覆盖；engine 只负责 computed layout/render。`
