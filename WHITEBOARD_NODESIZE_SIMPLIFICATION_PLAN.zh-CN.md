# Whiteboard `nodeSize` 收敛方案

## 背景

当前 whiteboard 里的 `nodeSize` 不是单一职责配置，而是混合承担了至少两类职责：

1. 节点几何兜底尺寸
   - 当 `node.size` 缺失时，几何层通过 `nodeSize` 补出 rect / bounds / outline。
2. 交互层的尺度启发式
   - 例如 edge connect 的 broad-phase query rect，会用 `nodeSize` 估算候选搜索范围。

这导致 `nodeSize` 从 config 一路传到 core、intent、editor-scene、editor input，多数调用点并不是在表达真正的业务依赖，而是在为“不完整的节点模型”兜底。

## 现状判断

`nodeSize` 现在不能直接删除，原因有三类：

1. 核心模型允许持久态节点缺失 `size`
   - `Node.size` 当前是可选字段。
   - text 节点创建路径里，存在未显式写入 `size` 的情况。
2. 几何与文档操作层依赖 fallback
   - committed node view
   - committed edge endpoint resolve
   - selection / move / distribute / align
   - slice export / insert / duplicate
3. 少数交互算法确实需要一个“全局尺度估计”
   - 尤其是 edge connect 在 spatial query 阶段的候选扩张半径。

因此问题不是“要不要传 `nodeSize`”，而是“哪些传递是在补模型漏洞，哪些传递是真正的启发式依赖”。

## 目标

把当前单一的 `nodeSize` 线拆成两部分：

1. 从核心文档模型中移除对 `nodeSize` 几何兜底的依赖。
2. 把少量真实存在的交互尺度需求，保留为语义明确的 heuristic config。

最终希望达到的状态：

1. `NodeInput` 可以不完整。
2. 持久态 `Node` 必须完整，尤其必须具备稳定 `size`。
3. 核心几何 API 基于完整节点工作，而不是普遍接收 `(node, nodeSize)`。
4. 只有少量交互算法显式依赖“默认查询尺度”之类的配置。

## 推荐模式

### 1. 区分输入态与持久态

这是最重要的一步。

建议把类型语义改成：

1. `NodeInput` / draft node / template node
   - `size` 可选。
2. `Node` / committed node / document snapshot node
   - `size` 必填。

这样可以把“补尺寸”的动作收敛到少量入口，而不是让所有下游 API 为上游不完整数据买单。

这一步完成后，绝大多数 `nodeSize` 透传会自然消失。

### 2. 拆分 `nodeSize` 的语义

当前 `nodeSize` 名字过宽，建议拆成两个概念：

1. `defaultNodeBootstrapSize`
   - 用于创建、导入、迁移时给缺失尺寸的普通节点补出初始 size。
2. `edgeConnectQuerySize` 或 `connectBroadphaseSize`
   - 仅用于 edge connect 等交互算法的候选搜索尺度估计。

这两个值即使结构上都还是 `Size`，语义也不应该继续复用一个字段名。

### 3. 用 geometry facade 代替裸参数透传

不要继续把 `Size` 当成公共上下文在所有层级裸传。

建议在 runtime / tx 边界收敛成明确能力，例如：

1. `geometry.rect(node)`
2. `geometry.bounds(node)`
3. `geometry.outline(node)`
4. `geometry.edgeSnapshot(node)`

这样下游依赖的是“几何能力”，不是某个模糊的 fallback config。

## 建议架构

### A. 文档入口负责物化 size

所有进入 committed document 的节点，都应该先被规范化为完整节点：

1. create node
2. import / paste slice
3. scenario seed / fixture
4. collab / storage migration

规范化过程负责：

1. 补齐 `size`
2. 对 text / sticky / shape / frame 使用各自稳定的 bootstrap 策略
3. 迁移旧文档里缺失 `size` 的节点

这样几何层读到的 committed node 永远是完整的。

### B. 核心几何层只接受完整节点

收敛目标是：

1. `getNodeRect(node)` 不再需要 fallback 参数。
2. `getNodeBoundsByNode(node)` 不再需要 fallback 参数。
3. committed node / edge view 构建不再依赖全局 `nodeSize`。

如果个别场景仍然处理未规范化输入，应在进入几何层之前先显式调用 normalize / bootstrap。

### C. 交互 heuristic 独立配置

对于 edge connect 这种确实需要“搜索半径估计”的地方，不要伪装成节点默认尺寸。

建议保留一个显式的交互配置，例如：

1. `connectBroadphaseSize`
2. `connectBroadphasePadding`
3. `connectCandidateQueryRadius`

选哪一种取决于 spatial index 的能力，但核心原则是：

1. 它属于 interaction config。
2. 它不应该再参与 committed node geometry。

## 分阶段实施

### Phase 1: 明确职责，先停止继续扩散

目标：

1. 识别所有 `nodeSize` 调用点。
2. 分类为：
   - 模型不完整导致的几何兜底
   - 真实的 heuristic 依赖
   - 纯冗余透传

产出：

1. 一张调用点分类表。
2. 一份必须保留的最小依赖集。

### Phase 2: 让 committed node 必有 `size`

目标：

1. 收紧 `Node` 的语义。
2. 把补尺寸逻辑收敛到 create / import / migrate 入口。

重点：

1. text 节点当前是最主要的缺口。
2. 旧文档需要 migration 或 lazy normalize。

完成标志：

1. document snapshot 中不再出现缺失 `size` 的节点。

### Phase 3: 从 core geometry 中移除 fallback

目标：

1. 删除几何层对 `nodeSize` fallback 的普遍依赖。
2. 改造 committed node / edge view 计算链。

优先改造对象：

1. node geometry
2. node committed view
3. edge committed resolve
4. slice bounds / duplicate / move / align / distribute

完成标志：

1. 大部分 core API 不再接收 `nodeSize: Size`。

### Phase 4: 单独重构 edge connect heuristic

目标：

1. 把 edge connect 的 query 逻辑从 `nodeSize` 脱钩。
2. 单独引入明确语义的 interaction config。

可以接受的形态：

1. 固定 query radius
2. 基于 viewport / zoom 的 query radius
3. 基于 spatial candidate 统计经验值的 query radius
4. 仍保留 `Size`，但命名改为 `connectBroadphaseSize`

这一步不要求“最优算法”，重点是职责隔离。

### Phase 5: 清理冗余透传

在前面几步完成后，清理剩余噪音：

1. 删除不再使用的函数参数。
2. 收紧 context / runtime / config 字段。
3. 合并重复的 bootstrap / normalize 逻辑。

## 迁移策略

建议采用“先兼容、再收紧”的迁移方式。

### Step 1

保留现有 `nodeSize` 行为，但新增 normalize 层，在 document write / import 时尽量补齐 size。

### Step 2

在测试与开发态加入断言：

1. committed node 不应缺失 `size`
2. 如果缺失，给出明确错误或 telemetry

### Step 3

等旧数据和入口路径都被覆盖后，再删除几何层 fallback 参数。

## 风险

### 1. 旧文档兼容

历史 snapshot、场景数据、collab 同步流里可能仍然存在无 `size` 的节点，直接收紧类型会导致运行时崩溃。

### 2. Text bootstrap 稳定性

text 的初始尺寸与 wrap width、测量时机、字体策略耦合较深。补 size 的时机如果选错，可能导致首次渲染抖动或与当前视觉行为不一致。

### 3. Edge connect 行为回归

如果把 broad-phase query 半径改得过小，用户会感知到“连接吸附变差”；改得过大，性能和误命中会变差。

## 预期收益

完成后会得到这些收益：

1. core 几何接口更干净，不再普遍透传 `nodeSize`
2. committed model 更完整，行为更可预测
3. editor-scene、intent、document slice 的依赖关系更清晰
4. 交互 heuristic 与文档几何职责分离
5. 后续做 view cache、geometry cache、projection 收敛时阻力更小

## 结论

最优雅的方向不是换一种方式继续传 `nodeSize`，而是：

1. 让 committed node 本身具备完整几何信息
2. 把 `nodeSize` 从“全局几何兜底参数”降级为“少量算法的显式 heuristic config”
3. 再把剩余几何访问收敛为 facade / committed view / normalized geometry

简化地说：

1. `NodeInput` 可以缺 `size`
2. `Node` 不应该缺 `size`
3. heuristic config 应该单独命名
4. geometry API 不该再到处收 `nodeSize`
