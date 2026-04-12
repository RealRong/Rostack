# Whiteboard Draw 中轴方案

## 目标

这份文档专门回答 `whiteboard/packages/whiteboard-editor/src/draw.ts` 当前是否已经构成 draw 中轴，以及如果要把 draw 领域真正中轴化，长期最优的结构应该是什么。

这里的“中轴”不是指再加一个导出桶文件，而是指：

- draw 领域的核心不变量有单一归属
- draw 相关的默认值、归一化、读模型、偏好状态、交互规划不再散落
- interaction / runtime state / react toolbox 都依赖同一套 draw 语义，而不是各自维护一部分事实

本文不要求兼容旧结构，也不以最小改动为目标，而是以边界最清楚、API 面最小、后续演进成本最低为目标。

## 结论

当前 [`whiteboard/packages/whiteboard-editor/src/draw.ts`](/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor/src/draw.ts) 的存在，说明 `draw` 已经被当成一个值得单独暴露的子域。

但它现在还不是一份真正的 draw 中轴，只是一层很薄的 public facade。

根本问题不是“有没有 `draw.ts`”，而是：

1. `draw.ts` 只暴露了少量 selector 和常量，没有控制 draw 领域的主要不变量
2. draw 的核心语义当前分散在 `types/`、`runtime/state/`、`interactions/`、`react toolbox` 四处
3. `eraser` 被放在 `Tool` 的 `DrawKind` 里，而不在 draw 子域内部统一建模，导致 draw 的状态空间被拆开

所以当前最准确的判断是：

- `draw.ts` 的存在意味着 draw 确实缺少一份真正的中轴
- 但这份中轴不应该继续等价于现在的 `draw.ts`
- 应该建立的是一套完整的 `draw axis`，而不是继续往 `draw.ts` 里零散加 helper

## 设计原则

这次 draw 中轴设计只遵守四条原则：

1. 模块少
2. 命名短
3. 公共 API 小
4. 不为未来假需求预留层级

具体来说：

- 不做 `draw/model + preferences + read + planner` 这种四层拆分
- 不引入通用状态机框架
- 不引入过多 `resolve* / create* / to* / plan*` 风格 helper
- 只保留真正跨层共享、能减少重复判断的 API

长期最优在这里不等于“层次最多”，而等于“事实归属单一，调用点判断最少”。

## 边界原则

draw 相关能力最终不是只存在一层，而是要明确拆成两层：

- `whiteboard-core` 负责 draw node 本身
- `whiteboard-editor` 负责 draw tool 和 draw state

一句话定义：

- core 定义“draw node 是什么”
- editor 定义“draw tool 怎么工作”

这条边界比“全部放 core”或者“全部留 editor”都更稳。

## 一、现状扫描

## 1. `draw.ts` 当前只是一层薄 facade

[`whiteboard/packages/whiteboard-editor/src/draw.ts`](/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor/src/draw.ts) 目前主要导出：

- draw 相关 type re-export
- `DRAW_SLOTS`
- `readDrawSlot`
- `readDrawBrushStyle`
- `readDrawStyle`

这些能力有用，但它们只覆盖了“从 `DrawPreferences` 读取当前笔刷样式”这一小块语义。

它没有承载下面这些 draw 领域更核心的事实：

- draw 默认配置
- draw 偏好归一化
- draw 偏好等价比较
- brush 与 eraser 的统一语义
- stroke session 的演进规则
- preview 与 commit 的统一规划

这说明它不是 draw 中轴，只是 draw 子路径的导出门面。

## 2. draw 领域语义目前是散的

当前 draw 相关语义大致分布如下：

### 类型层

- [`whiteboard/packages/whiteboard-editor/src/types/draw.ts`](/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor/src/types/draw.ts)
- [`whiteboard/packages/whiteboard-editor/src/types/tool.ts`](/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor/src/types/tool.ts)

问题在于：

- `DrawBrushKind` 定义在 tool
- `DrawPreferences` / `DrawSlot` / `ResolvedDrawStyle` 定义在 draw
- `DrawKind = DrawBrushKind | 'eraser'` 又回到 tool

也就是说，draw 的类型状态空间被拆成了两半。

### 状态层

- [`whiteboard/packages/whiteboard-editor/src/runtime/state/draw.ts`](/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor/src/runtime/state/draw.ts)

这里承载了实际最重要的不变量之一：

- `DrawPreferences` 的 normalize
- `DrawPreferences` 的 equality
- slot 和 style patch 的 state transition

但这些规则没有被 `draw.ts` 统一暴露，也没有成为 draw 子域对内对外都显式依赖的唯一事实源。

### 交互层

- [`whiteboard/packages/whiteboard-editor/src/interactions/draw/stroke.ts`](/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor/src/interactions/draw/stroke.ts)
- [`whiteboard/packages/whiteboard-editor/src/interactions/draw/erase.ts`](/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor/src/interactions/draw/erase.ts)

这里定义了：

- draw tool 的启动判定
- pointer sample 的过滤与累积
- preview overlay 更新
- commit 时如何创建 draw node 或删除 draw node

这部分已经属于 draw 行为语义，但没有经过 draw 中轴，而是直接由 interaction 文件各自实现。

### UI / toolbox 层

- [`whiteboard/packages/whiteboard-react/src/features/toolbox/tool.ts`](/Users/realrong/Rostack/whiteboard/packages/whiteboard-react/src/features/toolbox/tool.ts)
- [`whiteboard/packages/whiteboard-react/src/features/toolbox/model.ts`](/Users/realrong/Rostack/whiteboard/packages/whiteboard-react/src/features/toolbox/model.ts)
- [`whiteboard/packages/whiteboard-react/src/features/toolbox/menus/DrawMenu.tsx`](/Users/realrong/Rostack/whiteboard/packages/whiteboard-react/src/features/toolbox/menus/DrawMenu.tsx)

这里现在还维护着：

- `DEFAULT_DRAW_BRUSH_KIND`
- `DEFAULT_DRAW_KIND`
- `isDrawBrushKind`

这意味着 draw 的基础语义有一部分已经漂移到 react 侧。

## 3. `eraser` 暴露出 draw 中轴缺失最明显的问题

当前语义里：

- `pen` / `highlighter` 是 `DrawBrushKind`
- `eraser` 不属于 `DrawBrushKind`
- 但 `eraser` 又属于 `DrawKind`
- tool 判断时使用 `tool.type === 'draw'`
- stroke 和 erase 的行为再通过 `tool.kind === 'eraser'` 或 `!== 'eraser'` 分叉

这会产生一个结构性问题：

- 从 toolbar 视角，eraser 是 draw 家族的一员
- 从 draw preferences 视角，eraser 没有进入 draw 子域模型
- 从 interaction 视角，eraser 又被当成 draw 的特殊分支

这说明 draw 的完整状态空间目前并没有单点建模。

## 二、为什么当前 `draw.ts` 不能算中轴

一个模块如果要称得上某个子域的中轴，至少应该满足下面几点：

1. 核心类型和核心常量围绕它收敛
2. 核心 normalize / resolve / compare 规则围绕它收敛
3. 上层调用通过它理解“这个领域是什么”
4. 交互层和 UI 层不会绕过它各自发明一套局部语义

当前 `draw.ts` 不满足这些条件：

- 它没有 draw 默认值
- 它没有 draw normalize
- 它没有 draw equality
- 它没有 draw mode 分类
- 它没有统一 brush/eraser 关系
- 它没有 stroke/erase planner

所以它最多只能算：

- 一个 draw public subpath
- 一组轻量 selector 的集合

不能算 draw 领域的中轴。

## 三、分层结论

draw 中轴不能整体下沉到 `whiteboard-core`。

可以下沉的是 draw 的 node 几何语义，不可以下沉的是 draw 的 tool / state / mode 语义。

更具体地说：

- `whiteboard-core` 适合承载 draw node 的基础模型、几何计算、命中测试、点集处理
- `whiteboard-editor` 适合承载 draw mode、draw 默认值、draw 偏好状态、draw 工具读模型

如果把 draw 整体塞进 core，会把 core 拉进 editor 交互和工具栏语义，这不是长期最优。

## 四、最终结构

长期最优且复杂度最低的结构，不是四五层细拆，而是只保留三个文件：

```txt
whiteboard-core/src/
  node/
    draw.ts

whiteboard-editor/src/
  draw/
    index.ts
    model.ts
    state.ts
```

以及继续保留现有交互文件：

```txt
whiteboard-editor/src/
  interactions/
    draw/
      stroke.ts
      erase.ts
```

这里有一个明确取舍：

- `whiteboard-core/src/node/draw.ts` 只收 draw node 语义
- `whiteboard-editor/src/draw/` 只收 draw tool 语义
- `interactions/draw/` 继续收 pointer session

不额外抽 `planner.ts`，除非后面 draw 行为显著继续膨胀。当前长期最优是先把事实和规则收回来，而不是先造抽象层。

## 1. `whiteboard-core/src/node/draw.ts`

这是 core 层 draw 中轴，负责 draw node 本身的语义。

应继续承载：

- 点集 normalize / simplify / compact
- stroke 几何求解
- draw node bounds / painted rect / hit test
- local / world 投影

这个文件不应该知道：

- pen / highlighter / eraser
- draw slot
- draw 默认 tool
- draw preferences state
- toolbox 用的默认样式

## 2. `whiteboard-editor/src/draw/model.ts`

这是 draw 子域的“名词层”，只放最稳定的事实：

- draw mode
- brush mode
- slot
- 默认值
- 模式分类判断
- 和模式直接相关的只读常量，例如 opacity

这个文件不碰 store，不碰 interaction，不碰 patch 逻辑。

## 3. `whiteboard-editor/src/draw/state.ts`

这是 draw 子域的“规则层”，只放和 `DrawPreferences` 直接相关的规则：

- normalize
- equality
- slot/style 读取
- slot/style 更新
- style resolve

这个文件不碰 pointer session，也不直接调用 editor command。

## 4. `whiteboard-editor/src/draw/index.ts`

这是 `@whiteboard/editor/draw` 的唯一稳定入口。

它只 re-export：

- 对外稳定类型
- 对外稳定常量
- 对外稳定读取函数

它不暴露 runtime state 内部实现，也不暴露 interaction 内部 session。

## 五、哪些应该下沉到 core

只有那些不依赖 editor tool / state 的 draw 能力，才应该放到 `whiteboard-core`。

推荐放到 core 的能力：

- `readDrawPoints`
- `readDrawBaseSize`
- `normalizeDrawPoints`
- `simplifyDrawPoints`
- `compactDrawPoints`
- `resolveDrawPoints`
- `resolveDrawStroke`
- `matchDrawRect`

这些能力的共同特征是：

- 输入是 node data、rect、geometry、point set
- 输出是 node geometry 或命中测试结果
- 不依赖当前用户选了什么 draw tool
- 不依赖 draw slot、draw state、toolbox 默认值

如果未来还要继续往 core 收 draw 能力，标准也一样：

- 只收 draw node 语义
- 不收 editor tool 语义

## 六、哪些必须留在 editor

下面这些能力不适合放进 core，应该明确留在 `whiteboard-editor`：

- `DrawMode`
- `DrawBrush`
- `DrawState`
- `DrawStyle`
- `DRAW_MODES`
- `DRAW_BRUSHES`
- `DRAW_SLOTS`
- `DEFAULT_DRAW_MODE`
- `DEFAULT_DRAW_BRUSH`
- `DRAW_OPACITY`
- `isDrawMode`
- `isDrawBrush`
- `hasDrawBrush`
- `readDrawSlot`
- `readDrawStyle`
- `normalizeDrawState`
- `isDrawStateEqual`
- `setDrawSlot`
- `patchDrawStyle`

这些能力留在 editor 的原因也很一致：

- 它们服务的是 tool mode，而不是 document node
- 它们服务的是用户偏好状态，而不是静态模型
- 它们直接被 toolbox、runtime state、interaction 消费
- `eraser` 这种行为模式天然属于 editor，不属于 core

## 七、最终命名

当前 `DrawKind` / `DrawBrushKind` 这组命名不是最简洁的。

长期最优建议直接改成：

- `DrawMode`
- `DrawBrush`
- `DrawState`
- `DrawStyle`

对应语义如下：

- `DrawMode = 'pen' | 'highlighter' | 'eraser'`
- `DrawBrush = 'pen' | 'highlighter'`
- `DrawState` 对应今天的 `DrawPreferences`
- `DrawStyle` 对应今天的 `ResolvedDrawStyle`

理由很简单：

- `mode` 比 `kind` 更像工具工作模式
- `brush` 比 `brush kind` 更短
- `state` 比 `preferences` 更接近真实用途，它已经不只是“配置”，而是 runtime 持有的 draw 偏好状态
- `DrawStyle` 已经足够清楚，不需要 `Resolved` 前缀

如果不想一次性改名，也至少应该把这组命名作为目标状态。

## 八、最终 API 设计

## 1. public API

长期最优下，`@whiteboard/editor/draw` 对外只保留这组 API。

```ts
export type DrawMode = 'pen' | 'highlighter' | 'eraser'
export type DrawBrush = 'pen' | 'highlighter'
export type DrawSlot = '1' | '2' | '3'

export type BrushStyle = {
  color: string
  width: number
}

export type DrawBrushState = {
  slot: DrawSlot
  slots: Record<DrawSlot, BrushStyle>
}

export type DrawState = Record<DrawBrush, DrawBrushState>

export type DrawStyle = {
  kind: DrawBrush
  color: string
  width: number
  opacity: number
}

export const DRAW_MODES: readonly DrawMode[]
export const DRAW_BRUSHES: readonly DrawBrush[]
export const DRAW_SLOTS: readonly DrawSlot[]

export const DEFAULT_DRAW_MODE: DrawMode
export const DEFAULT_DRAW_BRUSH: DrawBrush

export const isDrawMode: (value: string) => value is DrawMode
export const isDrawBrush: (value: string) => value is DrawBrush
export const hasDrawBrush: (mode: DrawMode) => mode is DrawBrush

export const readDrawSlot: (
  state: DrawState,
  brush: DrawBrush
) => DrawSlot

export const readDrawStyle: (
  state: DrawState,
  brush: DrawBrush
) => DrawStyle
```

这组 API 有几个特征：

- 名词少
- 判断少
- 不暴露 normalize / equality / patch 这类内部规则
- 已经足够支持 toolbox、preview、交互读样式

## 2. internal API

只在 editor 内部使用，不从 `@whiteboard/editor/draw` 对外暴露：

```ts
export const normalizeDrawState: (value: DrawState) => DrawState
export const isDrawStateEqual: (left: DrawState, right: DrawState) => boolean
export const setDrawSlot: (
  state: DrawState,
  brush: DrawBrush,
  slot: DrawSlot
) => DrawState
export const patchDrawStyle: (
  state: DrawState,
  brush: DrawBrush,
  slot: DrawSlot,
  patch: Partial<BrushStyle>
) => DrawState
```

这里的原则也很简单：

- internal 规则都围绕 `DrawState -> DrawState`
- 不碰 store
- 不碰 command
- 不碰 interaction context

这样 `runtime/state/draw.ts` 可以退化成很薄的一层 store adapter。

## 3. tool API 的最终形态

draw 中轴真正立住以后，tool 侧应该只引用 draw 的 mode，而不再自己定义 draw 类型。

理想状态：

```ts
import type { DrawMode } from '../draw'

export type DrawTool = {
  type: 'draw'
  mode: DrawMode
}
```

这里建议把字段名从 `kind` 改成 `mode`，原因是：

- `draw` 在工具栏里本质上是一个 mode family
- `mode` 更容易和 `eraser` 这种行为模式对齐
- `tool.kind` 这种写法语义太弱，不如 `tool.mode` 直接

## 九、core API 与 editor API 的最终边界

## 1. core API

`@whiteboard/core/node` 只保留 draw node 能力，不暴露 draw tool 能力。

长期最优下，core draw API 的样子应该接近：

```ts
export const readDrawPoints
export const readDrawBaseSize
export const normalizeDrawPoints
export const simplifyDrawPoints
export const compactDrawPoints
export const resolveDrawPoints
export const resolveDrawStroke
export const matchDrawRect
```

这里的关键词始终是：

- points
- stroke
- rect
- node

不会出现：

- mode
- brush
- slot
- preferences
- default tool

## 2. editor API

`@whiteboard/editor/draw` 只保留 draw tool / draw state 能力，不重新暴露 core 的 node 几何 API。

长期最优下，editor draw API 的关键词应该是：

- mode
- brush
- slot
- state
- style

不会出现：

- painted rect
- draw hit test
- stroke geometry resolve

这样分层之后，外部调用方也会更容易理解：

- 你在处理 draw node 几何，用 core
- 你在处理 draw tool 与 draw state，用 editor

## 十、具体模块职责

## 1. `draw/model.ts`

应包含：

- `DrawMode`
- `DrawBrush`
- `DrawSlot`
- `DRAW_MODES`
- `DRAW_BRUSHES`
- `DRAW_SLOTS`
- `DEFAULT_DRAW_MODE`
- `DEFAULT_DRAW_BRUSH`
- `DRAW_OPACITY`
- `isDrawMode`
- `isDrawBrush`
- `hasDrawBrush`

不应包含：

- `DrawState` normalize
- equality
- patch
- 任何 store command

## 2. `draw/state.ts`

应包含：

- `BrushStyle`
- `DrawBrushState`
- `DrawState`
- `DrawStyle`
- `normalizeDrawState`
- `isDrawStateEqual`
- `readDrawSlot`
- `readDrawBrushStyle`
- `readDrawStyle`
- `setDrawSlot`
- `patchDrawStyle`

不应包含：

- `createValueStore`
- `InteractionContext`
- `node.create`
- `preview.draw.setPreview`

## 3. `runtime/state/draw.ts`

最终应该退化成：

- 创建 store
- 调用 `normalizeDrawState`
- 调用 `isDrawStateEqual`
- commands 里调用 `setDrawSlot` / `patchDrawStyle`

这个文件不应该再自己定义 draw 规则。

## 十一、`eraser` 的推荐处理方式

draw 中轴要不要成立，关键就看 `eraser` 怎么处理。

长期最优我建议明确承认：

- `eraser` 属于 draw mode
- 但 `eraser` 不是 brush kind
- brush preferences 只对具备笔刷样式的 mode 生效

也就是说，中轴里应该显式区分：

- `draw mode`
- `brush-backed mode`

这样能把当前几种散乱判断统一掉：

- toolbox 不需要自己推断哪种 mode 才有 brush style
- interaction 不需要再以 `tool.kind === 'eraser'` 作为唯一分叉入口
- draw read model 可以显式决定哪些 mode 可解析出 `ResolvedDrawStyle`

这比现在“`DrawKind` 在 tool，`DrawBrushKind` 在 draw preferences，`eraser` 靠局部 if 分叉”的结构更稳。

## 十二、对外 API 面应该怎么收

这轮 `tool/model.ts` 已经被删除，说明 editor 包已经开始收缩公共 value helper。

draw 这边也应该遵循同样原则：

- 不把 UI 私有默认值散落到根入口
- 不把 runtime 内部比较函数、normalize 细节直接做成公共 API
- 不把给 toolbox 临时用的 helper 提升成 editor 根入口能力

长期最优的 API 面应该是：

- `@whiteboard/editor` 只暴露 editor 总入口和跨域类型
- `@whiteboard/editor/draw` 暴露 draw 子域的稳定模型和读能力
- react toolbox 只依赖 draw 子域公开的稳定事实，不再自己定义 draw 默认值

也就是说，今天 react 里新建的 [`whiteboard/packages/whiteboard-react/src/features/toolbox/tool.ts`](/Users/realrong/Rostack/whiteboard/packages/whiteboard-react/src/features/toolbox/tool.ts) 只是过渡态，不是长期终态。

如果 draw 中轴建立完成，这些默认值和 mode 判断应当回收到 draw 子域内部。

## 十三、具体执行落地方案

执行顺序也需要区分 core 和 editor。

## 第一阶段：先定边界，不急着搬代码

目标：

- 先明确哪些 draw 能力属于 core
- 明确哪些 draw 能力属于 editor
- 避免迁一半又反悔

具体动作：

1. 在文档和命名上确认两层边界
2. 停止把新的 draw 默认值、draw mode 判断继续加到 react 或 core
3. 后续所有 draw 相关新增逻辑，先按 “node 语义 -> core / tool 语义 -> editor” 分类

阶段完成标准：

- 团队对 draw 分层有统一判断
- 不再新增新的边界污染

## 第二阶段：先收 editor draw 事实

目标：

- 让 react toolbox 不再维护 draw 基础事实
- 建立 `draw/model.ts`
- 建立 `draw/index.ts`

具体动作：

1. 新建 `whiteboard/packages/whiteboard-editor/src/draw/model.ts`
2. 把下面这些内容迁入 `draw/model.ts`
   - `DrawBrushKind` 的后继命名目标
   - `DrawKind` 的后继命名目标
   - `DRAW_SLOTS`
   - `DEFAULT_DRAW_BRUSH_KIND`
   - `DEFAULT_DRAW_KIND`
   - `DRAW_OPACITY`
   - `isDrawBrushKind`
3. 让 `whiteboard/packages/whiteboard-editor/src/draw.ts` 不再自带实现，只转发到 `src/draw/index.ts`
4. 把 `whiteboard/packages/whiteboard-react/src/features/toolbox/tool.ts` 里的 draw 默认值和判断迁回 `@whiteboard/editor/draw`
5. 删除 `whiteboard/packages/whiteboard-react/src/features/toolbox/tool.ts`

阶段完成标准：

- react toolbox 只从 `@whiteboard/editor/draw` 取 draw 默认值和判断
- draw 基础事实不再散落在 UI 层

## 第三阶段：把 draw 规则收回 editor draw 子域

目标：

- 建立 `draw/state.ts`
- 把真正的 draw 不变量从 runtime state 里抽出来

具体动作：

1. 新建 `whiteboard/packages/whiteboard-editor/src/draw/state.ts`
2. 从 [`whiteboard/packages/whiteboard-editor/src/runtime/state/draw.ts`](/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor/src/runtime/state/draw.ts) 移出：
   - `normalizeStyle`
   - `isSameStyle`
   - `normalizeBrush`
   - `normalizeDrawPreferences`
   - `isSameBrush`
   - `isDrawPreferencesEqual`
3. 从现有 [`whiteboard/packages/whiteboard-editor/src/draw.ts`](/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor/src/draw.ts) 移出：
   - `readDrawSlot`
   - `readDrawBrushStyle`
   - `readDrawStyle`
4. 在 `draw/state.ts` 补齐：
   - `setDrawSlot`
   - `patchDrawStyle`
5. 让 [`runtime/state/draw.ts`](/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor/src/runtime/state/draw.ts) 只负责 store adapter

阶段完成标准：

- draw 领域规则只在 `draw/state.ts` 一处定义
- runtime state 不再自己发明 normalize / equality 规则

## 第四阶段：让 tool 显式依赖 draw mode

目标：

- tool 不再自己定义 draw 相关类型
- `eraser` 的语义边界归 draw 子域统一管理

具体动作：

1. 在 `draw/model.ts` 中确立 `DrawMode` / `DrawBrush`
2. 让 [`whiteboard/packages/whiteboard-editor/src/types/tool.ts`](/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor/src/types/tool.ts) 改为引用 draw type
3. 把 `DrawTool` 字段从 `kind` 改成 `mode`
4. 全仓替换 `tool.kind` 为 `tool.mode`

阶段完成标准：

- draw mode 只在 draw 子域定义
- tool 只是消费方，不再是 draw 类型来源

## 第五阶段：只在必要时补 core 收敛

目标：

- 保持 core 只承载 node draw 语义
- 只在出现重复几何逻辑时再往 core 下沉

具体动作：

1. 检查 `whiteboard-editor` 是否还存在 draw node 点集/几何重复逻辑
2. 若有，再把那部分下沉到 [`whiteboard/packages/whiteboard-core/src/node/draw.ts`](/Users/realrong/Rostack/whiteboard/packages/whiteboard-core/src/node/draw.ts)
3. 不把 draw mode / state / default 迁进 core

阶段完成标准：

- core draw API 只增长 node 语义
- editor draw API 只增长 tool 语义

## 第六阶段：压薄 draw interaction，但不先造 planner

目标：

- 保持 `stroke.ts` / `erase.ts` 两文件结构不变
- 只移除它们对 draw 基础事实的直接判断

具体动作：

1. 让 [`whiteboard/packages/whiteboard-editor/src/interactions/draw/stroke.ts`](/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor/src/interactions/draw/stroke.ts) 改为依赖 draw 子域 API 读取样式和判断 brush mode
2. 让 [`whiteboard/packages/whiteboard-editor/src/interactions/draw/erase.ts`](/Users/realrong/Rostack/whiteboard/packages/whiteboard-editor/src/interactions/draw/erase.ts) 改为依赖 draw 子域 API 判断 erase mode
3. 不抽象出通用 planner，除非这两个文件后续继续显著膨胀

阶段完成标准：

- draw interaction 只关心 pointer session
- draw 基础语义和样式解析都来自 draw 子域

## 第七阶段：统一 public 名称

目标：

- API 名称变短、变直观
- 彻底摆脱 `Kind` / `Preferences` / `Resolved` 这组偏冗长名字

具体动作：

1. `DrawKind` -> `DrawMode`
2. `DrawBrushKind` -> `DrawBrush`
3. `DrawPreferences` -> `DrawState`
4. `ResolvedDrawStyle` -> `DrawStyle`

阶段完成标准：

- draw 相关 public API 命名统一、短、直观
- 新调用点不再看到 `Kind` / `Preferences` / `Resolved` 这些历史命名

## 十四、明确不做的事

为了保持方案简单清晰，下面这些事不在第一轮做：

- 不做 `draw/planner.ts`
- 不把 stroke 和 erase 强行合并成一个大 reducer
- 不把所有 draw preview / commit 细节提成公共 API
- 不做兼容层叠加的双命名长期共存
- 不在 `@whiteboard/editor` 根入口重新暴露 draw helper
- 不把 draw tool / state 整体下沉到 `whiteboard-core`

这些动作看起来“更抽象”，但当前只会增加复杂度。

## 十五、最终判断

`whiteboard/packages/whiteboard-editor/src/draw.ts` 这种存在，确实意味着 draw 还缺少一份真正的中轴。

更准确地说：

- draw 已经被识别为一个子域
- 但这个子域目前只有 public facade，没有真正的单一事实源
- 现在真正的 draw 规则分散在类型、状态、交互和 UI 四处

因此长期最优不是删除 draw 子路径，而是把它做实：

- 让 draw 子路径真正对齐 draw 子域
- 让 brush / mode / preferences / read / planner 都围绕 draw axis 收敛
- 让 react toolbox 和 interaction 都改为依赖 draw 中轴，而不是各自补事实

如果只做一句话总结：

当前 `draw.ts` 不是“draw 中轴”，而是“draw 中轴缺位后留下的一层薄入口”。

如果只做一句更具体的实现总结：

长期最优不是给 draw 再加更多层，而是把它收成三件事：

- `whiteboard-core/src/node/draw.ts` 放 draw node 语义
- `whiteboard-editor/src/draw/model.ts` 和 `state.ts` 放 draw tool 语义
- `@whiteboard/editor/draw` 放最小公共入口
