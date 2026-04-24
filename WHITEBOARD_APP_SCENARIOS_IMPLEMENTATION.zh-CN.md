# WHITEBOARD_APP_SCENARIOS_IMPLEMENTATION

## 目标

在 `apps/whiteboard` 增加一套可扩展的 scenario 数据生成体系，用于手工测试白板的渲染、命中、框选、拖拽、连接、缩放和平移行为。

这套体系的目标不是再补几份静态 demo，而是提供一组：

- 有语义的数据。
- 可按规模扩展的数据。
- 每次生成结果稳定一致的数据。
- 能直接在 `apps/whiteboard` 中切换加载的数据。

本次目标规模固定为：

- `100`
- `500`
- `1000`
- `2000`

## 范围

本方案只覆盖 `apps/whiteboard` 的场景组织、数据生成、加载入口与默认 room 隔离。

本方案不覆盖：

- benchmark runner。
- `whiteboard/packages/*` 的 schema 改造。
- 新增 node / edge 基础类型。
- 基于随机数每次变化的“临场生成”。

## 现状

当前已有的场景入口在：

- `apps/whiteboard/src/scenarios.ts`
- `apps/whiteboard/src/App.tsx`

当前问题有三个：

1. `scenarios.ts` 里是静态文档工厂，适合 demo，不适合 `family x size` 扩展。
2. `App.tsx` 虽然有 `resolveScenario`，但启动时仍固定加载第一个场景，不方便手工切换。
3. collab 默认 room 是 `playground`，如果不把 scenario 与 room 隔离，测试结果容易被历史状态污染。

## 设计原则

### 1. 数据必须有语义

不生成纯网格、不生成无意义编号矩形、不做随机散点排布。

所有 generated scenario 都必须有明确主题，例如：

- 服务架构图
- 交付规划图
- 研究知识图谱

### 2. 数据必须可复现

同一个 `scenario + size` 每次生成的文档必须一致。

允许使用轻量 jitter 打破机械排版，但 jitter 必须来自稳定 seed，而不是每次运行不同的随机数。

### 3. size 语义固定

`100 / 500 / 1000 / 2000` 表示内容节点预算，即：

- 不含 `frame`
- 不含 `edge`
- 不含 mindmap record

这样不同场景族之间可横向比较。

### 4. 可视分区使用 `frame`

有可视语义的分区、泳道、领域、主题，都使用 `frame`。

不使用 `group` 承担可视分区职责，因为 `group` 在这里更接近结构归属，不适合作为主要空间语义。

### 5. 组织方式采用 `scenario family x size`

内部按“场景族定义”与“规模预设”分开组织，对外导出扁平的 preset 列表供 `App` 消费。

### 6. 旧 demo 与 generated scenario 分层

现有 `basic / shapes / mindmap` 这类 showcase 场景可以保留，但不应继续承担主要测试数据职责。

`dense` 只适合作为 synthetic 压力样例，不作为“有语义数据”的主入口。

## 目标目录结构

建议把当前单文件 `apps/whiteboard/src/scenarios.ts` 重构为目录：

```text
apps/whiteboard/src/scenarios/
  types.ts
  sizes.ts
  builder.ts
  showcase.ts
  generated.ts
  index.ts
  families/
    serviceArchitecture.ts
    deliveryPlanning.ts
    researchKnowledgeMap.ts
```

各文件职责：

- `types.ts`
  场景类型、size 类型、preset 类型、family 类型。
- `sizes.ts`
  `100 / 500 / 1000 / 2000` 及相关 budget helper。
- `builder.ts`
  生成 `Document` 的通用构建器，负责 id、canvas order、frame/content/edge 收集。
- `showcase.ts`
  保留现有 `basic / shapes / mindmap` 等静态 demo。
- `generated.ts`
  generated family 定义注册、扁平 preset 导出。
- `index.ts`
  对外导出 `scenarios`、resolver、默认 preset。
- `families/*.ts`
  每个有语义的 generated scenario family 一个文件。

## API 设计

### 1. size 与 family

```ts
export type ScenarioSize = 100 | 500 | 1000 | 2000

export type GeneratedScenarioFamilyId =
  | 'service-architecture'
  | 'delivery-planning'
  | 'research-knowledge-map'

export type ScenarioKind = 'showcase' | 'generated'
```

### 2. 场景上下文

```ts
export type ScenarioContext = {
  familyId: GeneratedScenarioFamilyId
  size: ScenarioSize
  seed: string
  budget: {
    contentNodes: number
  }
}
```

约束：

- `seed` 固定取 `${familyId}:${size}`。
- `budget.contentNodes === size`。
- family 内可以再派生 `frames`、`edges`、不同实体类型配比，但不能改写内容节点总预算。

### 3. family 定义

```ts
export type GeneratedScenarioFamily = {
  id: GeneratedScenarioFamilyId
  label: string
  description: string
  sizes: readonly ScenarioSize[]
  create: (context: ScenarioContext) => Document
}
```

### 4. 对外 preset

```ts
export type ScenarioPreset = {
  id: string
  kind: ScenarioKind
  familyId?: GeneratedScenarioFamilyId
  size?: ScenarioSize
  documentId: string
  label: string
  description: string
  create: () => Document
}
```

规则：

- generated preset 的 `id` 使用 `${familyId}-${size}`。
- generated preset 的 `documentId` 使用 `demo-${familyId}-${size}`。
- showcase preset 继续使用当前简短 id，例如 `basic`、`mindmap`。

### 5. 对外导出函数

`apps/whiteboard/src/scenarios/index.ts` 对外提供：

```ts
export const scenarios: ScenarioPreset[]

export const defaultScenarioPreset: ScenarioPreset

export const resolveScenarioPreset: (input: {
  scenarioId?: string | null
  size?: string | null
}) => ScenarioPreset

export const buildScenarioRoomId: (preset: ScenarioPreset) => string
```

解析规则：

- `scenarioId` 命中 showcase id 时，忽略 `size`。
- `scenarioId` 命中 generated family id 时，需要再结合 `size` 解析 preset。
- `size` 非法时回退到 `100`。
- `scenarioId` 非法时回退到默认 preset。

## Document Builder 设计

为避免每个 family 重复手写 `nodes / edges / canvas.order`，需要一层底层构建器。

### Builder 目标

- 统一生成稳定 id。
- 统一收集 `frame`、内容节点、边。
- 统一产出 `Document`。
- 统一控制 `canvas.order`。

### Builder 形态

```ts
type ScenarioDocumentBuilder = {
  addFrame(input: FrameInput): Node
  addShape(input: ShapeInput): Node
  addSticky(input: StickyInput): Node
  addText(input: TextInput): Node
  addEdge(input: EdgeInput): Edge
  build(documentId: string): Document
}
```

约束：

- `build()` 时按 `frame -> content -> edge` 组织 `canvas.order`。
- `frame` 默认不连边，除非 family 有明确语义要求。
- 所有文本都来自语义词库，不使用 `1-1 / 1-2 / node-37` 这类占位文本。

## 生成场景族

第一批 generated scenario family 固定为三类。

### 1. `service-architecture`

目标：

- 测试中高密度连线。
- 测试分区内与跨分区依赖。
- 测试 frame、shape、sticky、text 混合场景。

语义元素：

- 领域 frame
- service
- database
- cache
- queue / stream
- batch job
- gateway
- external api
- dashboard / alert
- design note / migration note

布局规则：

- 顶层按领域分列，每个领域一个 `frame`。
- 每个领域内部再分入口层、服务层、存储层、异步层。
- 允许轻量 seed jitter，避免完全机械的栅格感。
- 保持整体从左到右可读，跨域依赖尽量走相邻列，再补少量远距离边。

规模规则：

- `size` 表示内容节点数。
- 边数量目标为内容节点数的 `0.9x ~ 1.2x`。
- service 占比最高，database / queue / gateway / note 为辅。

文本来源：

- 领域词：Identity、Order、Billing、Search、Workspace、Feed、Notification、Growth。
- 实体词：API、Worker、Consumer、Replica、Indexer、Gateway、Cache、Dashboard、Runbook。

### 2. `delivery-planning`

目标：

- 测试多 frame 泳道。
- 测试跨团队依赖边。
- 测试 sticky / text 注释与主流程混排。

语义元素：

- 团队或 stream frame
- initiative
- epic
- task cluster
- milestone
- risk
- decision
- doc / spec

布局规则：

- 顶层按 team / stream 分 frame。
- 每个 frame 内部按季度或阶段分段。
- 主要阅读方向从左到右，局部 cluster 按 initiative 聚合。
- 风险、决策、说明优先使用 sticky / text，避免所有东西都画成同一种矩形。

规模规则：

- task 是最大头，但不能把场景退化成纯任务表。
- 边数量目标为内容节点数的 `0.6x ~ 0.9x`。
- 每个 frame 都必须有少量跨 frame 依赖，保证不是“孤岛分栏”。

文本来源：

- stream 词：Editor、Infra、Sync、Comments、Search、Mobile、Growth。
- 项目词：Migration、Launch、Audit、Refactor、Experiment、Onboarding、Recovery。

### 3. `research-knowledge-map`

目标：

- 测试更图谱化、非纯流程式的空间分布。
- 测试大量语义交叉引用边。
- 测试 cluster 间导航与局部编辑。

语义元素：

- theme frame
- question
- hypothesis
- experiment
- finding
- evidence
- decision
- reference

布局规则：

- 顶层按主题分 `frame`。
- 每个主题内使用“中心问题 + 环绕证据/实验/结论”的 cluster 布局。
- 主题之间保留交叉引用边，但不能多到变成完全不可读的毛线团。
- 允许比前两类更自由的摆放，但仍要可读。

规模规则：

- 边数量目标为内容节点数的 `0.8x ~ 1.0x`。
- finding / experiment / evidence 的占比高于 decision / note。

文本来源：

- 研究词：Activation、Retention、Collaboration、Latency、Search Intent、Template Usage、Mobile Entry。
- 结论词：Drop-off、Signal、Pattern、Contradiction、Follow-up、Constraint、Tradeoff。

## showcase 场景的处理

现有场景处理方式：

- `basic`
  保留，放入 `showcase.ts`。
- `shapes`
  保留，放入 `showcase.ts`。
- `mindmap`
  保留，放入 `showcase.ts`。
- `dense`
  不作为 generated 主测试集的一部分。

`dense` 有两个可选处理方式：

1. 继续保留在 `showcase.ts`，但文案改成 `Synthetic Dense`。
2. 直接移除，只保留有语义的 generated scenario。

更推荐第 `1` 种，原因是它仍然对纯渲染压测有价值，但不应与“有语义数据”混在同一类入口里。

## URL 与加载行为

`App.tsx` 需要从“固定加载第一个场景”改成“按 URL 解析 preset”。

建议查询参数：

- `scenario`
- `size`
- `room`

规则：

- `?scenario=service-architecture&size=100`
- `?scenario=delivery-planning&size=500`
- `?scenario=research-knowledge-map&size=1000`
- `?scenario=basic`

解析逻辑：

1. 先读 `scenario`。
2. 如果命中 showcase，则直接返回对应 preset。
3. 如果命中 generated family，则再读 `size`。
4. `size` 不合法时回退到 `100`。
5. 都不合法时回退到默认 preset。

默认 preset 建议：

- `service-architecture + 100`

原因：

- 比 `basic` 更接近真实测试场景。
- 比 `500 / 1000 / 2000` 更适合默认启动。

## room 隔离规则

当前默认 room 是 `playground`，这不适合做 scenario 对比测试。

应调整为：

- 如果 URL 显式传了 `room`，则使用显式值。
- 如果 URL 没有传 `room`，则根据当前 preset 自动生成默认 room。

默认 room 规则：

```ts
showcase -> demo-${preset.id}
generated -> demo-${familyId}-${size}
```

示例：

- `?scenario=service-architecture&size=500`
  默认 room 为 `demo-service-architecture-500`
- `?scenario=basic`
  默认 room 为 `demo-basic`

这样可以避免不同 scenario 之间的共享状态污染。

## 文本与词库策略

为了保证“有意义的数据”，每个 family 都要有自己的小词库，不允许全局复用一套泛化占位文本。

原则：

- 词库按 family 内聚，不做单独的超大共享词典。
- 文本由“领域词 + 实体词”组合生成。
- 同一 size 下文本稳定，不因为运行次数变化。
- 文本重复可以存在，但必须是合理重复，而不是占位符重复。

## 实施步骤

### 步骤 1. 拆分现有 `scenarios.ts`

把当前单文件拆成：

- `showcase.ts`
- `generated.ts`
- `index.ts`
- `types.ts`
- `sizes.ts`
- `builder.ts`

这一阶段不引入新 generated family，只先把结构搭起来。

### 步骤 2. 实现底层 builder

完成：

- id 生成
- frame / content / edge 收集
- `Document` 构造
- `canvas.order` 组织

这一层只解决“怎么稳定生成文档”，不承载业务语义。

### 步骤 3. 实现三类 generated family

按 family 文件分别完成：

- `serviceArchitecture.ts`
- `deliveryPlanning.ts`
- `researchKnowledgeMap.ts`

每个 family 都要：

- 接收 `ScenarioContext`
- 精确消费 `size` 预算
- 生成稳定文本
- 生成稳定布局
- 生成合理的边密度

### 步骤 4. 扁平化 preset 导出

`generated.ts` 负责把 family 与 sizes 展开成：

- `service-architecture-100`
- `service-architecture-500`
- `service-architecture-1000`
- `service-architecture-2000`
- 其他 family 同理

然后在 `index.ts` 中与 showcase 场景合并成统一 `scenarios` 列表。

### 步骤 5. 接入 `App.tsx`

`App.tsx` 需要改成：

- 从 URL 解析 `scenario` 与 `size`
- 选择 preset
- 用 preset 的 `create()` 初始化 document

这里不需要上复杂 UI，URL 参数就足够完成第一轮手工测试。

### 步骤 6. 接入 room 隔离

`collab.ts` 需要补齐“默认 room 基于 preset”的逻辑，避免所有测试都打到 `playground`。

## 验收标准

完成后应满足：

1. `apps/whiteboard` 可以通过 URL 加载 generated scenario。
2. `100 / 500 / 1000 / 2000` 四档都可用。
3. 同一 `scenario + size` 每次生成结果一致。
4. `size` 精确表示内容节点数，不因 frame 或 edge 数量而漂移。
5. 主要可视分区通过 `frame` 表达，而不是 `group`。
6. 生成文本是语义文本，不是编号占位文本。
7. 未显式传 `room` 时，不同 scenario 不会默认共用 `playground`。

## 手工测试清单

建议至少手动检查：

1. `service-architecture` 在 `500 / 1000 / 2000` 下的缩放、拖拽、框选与边可读性。
2. `delivery-planning` 在跨 frame 依赖较多时的框选与批量移动。
3. `research-knowledge-map` 在交叉引用较多时的导航与命中。
4. 切换 `scenario` 或 `size` 时，默认 room 是否随之变化。
5. 不传任何参数时，是否稳定落到默认 preset。

## 结论

这项改造没有底层模型阻碍，重点在于把 `apps/whiteboard` 现有“静态 demo 场景”升级为“按场景族与规模生成的稳定测试数据体系”。

核心落点只有四个：

- 结构拆分
- builder 抽象
- 三类有语义的 generated family
- URL 选择与 room 隔离

按这个方案落地后，`apps/whiteboard` 就能承担一套可持续扩展的手工测试数据入口，而不是继续依赖少量静态 demo 与无语义 dense 网格。
