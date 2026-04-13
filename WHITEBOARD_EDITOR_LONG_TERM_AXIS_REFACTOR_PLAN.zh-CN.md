# Whiteboard Editor 中轴化长期改造方案

## 目标

这份文档只讨论 `whiteboard/packages/whiteboard-editor` 的长期最优结构，不讨论迁移成本，不保留兼容层，不接受双轨实现。

判断标准只有一个：

- editor 内部每个模块都应该围绕稳定的“主轴”组织
- 主轴文件负责表达完整意图与流程
- helper 只能作为主轴内部近邻实现细节，不能反向牵引主流程
- editor 不能继续承接 core / engine 本应负责的领域语义与内部结构

## 一句话结论

当前 `whiteboard-editor` 已经完成了一轮目录收敛，但还没有完成真正的“中轴化收敛”。

现在最主要的问题不是旧目录残留，而是以下几类结构问题仍然存在：

1. editor 中仍有少数模块通过拼接 core/helper 能力自己构造复杂领域逻辑
2. 一些 feature 已经有了目录主轴，但文件内部仍是“阶段函数 + 对外暴露中间产物”
3. overlay / node write / selection presentation 还存在明显的局部工具箱化倾向
4. mindmap 与 live node projection 仍然明显越过 editor 应有边界

长期终态应当继续收敛为：

- editor 只表达交互装配、局部会话、transient projection、UI projection、写入意图
- core 负责纯领域规则、纯投影函数、派生、判定、patch 编译、默认值策略
- engine 只负责 committed read / committed write，不负责本地 transient live projection

这里明确一条长期边界原则：

- 只要状态是本地临时态，就不下沉到 engine
- 只要逻辑是纯领域规则，就下沉到 core
- editor 负责把 committed state 与本地临时态组合成最终 UI 可消费的 transient projection

## 审计结论

## 1. 最严重的越界点

### A. `read/node.ts` 已经不是 read，而是在 editor 内重建 live node 语义

当前文件：

- `whiteboard/packages/whiteboard-editor/src/read/node.ts`

问题：

- 同时处理 overlay patch、text preview、edit draft、rect 变更、geometry 派生
- 直接调用 `setTextWidthMode`、`setTextWrapWidth`、`readTextWrapWidth`
- 直接修改 `node.data` 与 `rect`

这意味着 editor read 不只是“读”，而是在本地重新做一套 live node projection。

这不应该长期留在 editor。

长期终态：

- editor 不再在 `read/node.ts` 里直接改写 node
- 新增明确的 editor 内部 `projection/node.ts` 主轴
- `projection/node.ts` 负责把 committed `NodeItem`、overlay preview、edit draft 组合成 transient live node
- 其中涉及节点领域的纯计算，例如 text width mode / wrap width / geometry 派生规则，全部下沉到 core 纯函数
- `read/node.ts` 最终只负责把 engine committed read 与 `projection/node.ts` 连接起来，不再承载节点语义实现

结论：

- 这不是下沉到 engine
- 这是从 `read/node.ts` 下沉到“editor 内明确的 projection 轴 + core 纯投影函数”的问题

### B. `write/mindmap.ts` 仍在 editor 内承接 mindmap 领域编排

当前文件：

- `whiteboard/packages/whiteboard-editor/src/write/mindmap.ts`

问题：

- editor 内自己做 insert plan
- editor 内自己做 root move threshold 判定
- editor 内自己做 subtree drop move 判定
- editor 内自己构造 layout hint

这不是 editor 的职责。

editor 最多应该表达：

- 用户要按某 placement 插入
- 用户要按某 drop 结果移动
- 用户要移动根节点

而不应该自己决定：

- placement 如何翻译为 child / sibling / parent
- 什么情况下允许 move
- root move 的提交阈值
- layout hint 的构造细节

长期终态：

- `write/mindmap.ts` 中的 placement 规划、drop move 判定、root move 提交判定、layout hint 生成全部下沉到 core
- core 提供单一的 mindmap application planner，输入 committed tree 与 editor intent，输出标准 command payload
- editor `write/mindmap.ts` 只负责收集 intent、调用 core planner、再把 planner 结果交给 engine `execute`
- engine 只负责执行 committed mutation，不负责本地编排

## 2. helper 反向牵引主流程的问题

### A. `presentation/selection.ts` 仍然是“巨型 helper 集合”

当前文件：

- `whiteboard/packages/whiteboard-editor/src/presentation/selection.ts`

问题：

- 一个文件里混合了 node meta fallback、schema style support 探测、默认样式推导、selection stats 聚合、overlay projection、toolbar projection
- 主体阅读路径不是“selection presentation 主轴”，而是不断在几十个小 helper 中跳转
- 对外还暴露了多个中间阶段函数：
  - `readSelectionNodeInfo`
  - `resolveSelectionOverlay`
  - `resolveSelectionToolbar`

这些函数目前几乎都只是本模块内部消费。

长期终态：

- 该文件继续保留为 selection presentation 轴文件，但只保留一个公开入口
- 内部按近邻子块组织，不再把中间阶段函数作为 feature surface 暴露
- 如果需要拆分，只能按语义子块拆：
  - `nodeInfo`
  - `overlay`
  - `toolbar`
- 不能再往外制造更多散 helper

### B. `input/selection/press/*` 已经轴化，但中间阶段对象仍然外露过宽

当前文件：

- `whiteboard/packages/whiteboard-editor/src/input/selection/press/resolve.ts`
- `whiteboard/packages/whiteboard-editor/src/input/selection/press/plan.ts`
- `whiteboard/packages/whiteboard-editor/src/input/selection/press/session.ts`
- `whiteboard/packages/whiteboard-editor/src/input/selection/press/start.ts`

问题：

- 目录结构已对，但内部仍偏“阶段函数管线”
- `resolve` 与 `plan` 暴露了较多本应只属于 press feature 私有的类型和函数
- `session` 依赖多个中间阶段函数组合，而不是只依赖一个更强内聚的 press driver

长期终态：

- `press/start.ts` 应继续作为唯一 feature start 入口
- `resolve.ts` 与 `plan.ts` 可以存在，但应退回 feature-private 角色
- `SelectionPressTarget` / `SelectionPressPlan` / `SelectionPressSubject` 等中间类型不应继续外扩

### C. `input/edge/connect/start.ts` 仍然偏“从 core 拿一把能力再现拼流程”

当前文件：

- `whiteboard/packages/whiteboard-editor/src/input/edge/connect/start.ts`

问题：

- 在 editor 内同时做 create start、reconnect start、preview edge path、gesture draft 组装
- 多个阶段都建立在 core helper 之上，但组合逻辑仍由 editor 持有

这块不是边界越界最严重的问题，但仍有明显的 helper 驱动味道。

长期终态：

- start 文件保留，但只保留 feature 主流程与少量近邻辅助
- preview path / reconnect draft / gesture draft 这类可复用领域推导，优先向 core 收拢

## 3. 重复逻辑与局部工具箱化问题

### A. overlay node entry 读写逻辑重复

当前文件：

- `whiteboard/packages/whiteboard-editor/src/overlay/node.ts`
- `whiteboard/packages/whiteboard-editor/src/write/overlay.ts`

问题：

- `readNodePatchEntry` / `replaceNodePatchEntry`
- `readTextPreviewEntry` / `replaceTextPreviewEntry`

两套逻辑本质相同，只是 patch 类型不同。

同时：

- `write/overlay.ts` 直接依赖这些底层 entry-list helper
- overlay 的内部数据结构细节被写入层感知

长期终态：

- overlay 自己维护 patch list 内部结构
- `write/overlay.ts` 只调用 overlay feature 的高层 write API
- entry 读写算法退回 overlay 私有实现，不再成为模块间协作表面

### B. edge overlay map 合并逻辑重复

当前文件：

- `whiteboard/packages/whiteboard-editor/src/overlay/edge.ts`

问题：

- `selection.edge` 与 `edge.interaction` 两段循环结构几乎一致
- 只是来源不同，合并逻辑相同

长期终态：

- 提炼为 edge overlay 内部的单一 merge step
- 不对外暴露局部 merge helper

### C. node write patch builder 被做成了工具箱

当前文件：

- `whiteboard/packages/whiteboard-editor/src/write/node/patch.ts`
- `whiteboard/packages/whiteboard-editor/src/write/node/commands.ts`
- `whiteboard/packages/whiteboard-editor/src/write/node/text.ts`

问题：

- `mergeNodeUpdates`
- `styleUpdate`
- `dataUpdate`
- `toNodeStyleUpdates`
- `toNodeDataUpdates`

这些低层 patch builder 被大量上层命令逻辑直接调用。

这会导致：

- node write 主轴不清晰
- 上层命令自己负责 patch 组装
- helper 成为真正的“驱动层”

长期终态：

- patch compiler 统一下沉到 core/schema primitive
- `write/node/patch.ts` 不再作为 editor 内部工具箱存在
- `commands.ts` / `text.ts` 只调用更高层的 node write builder 或 core primitive，不再直接拼散 patch helper

## 4. editor 触碰了不该触碰的领域结构

以下几类逻辑长期不该停留在 editor：

### A. 节点 live projection 细节

涉及：

- text width mode
- wrap width
- live size
- edit draft 注入 node.data
- geometry / bounds 重新派生

当前位置：

- `read/node.ts`

长期归属：

- editor 内新增 `projection/node.ts`
- core 提供 projection 所需纯函数
- engine 继续只提供 committed `NodeItem`

### B. mindmap 插入与移动规则

涉及：

- sibling / child / towardRoot 计划求解
- root move 是否提交
- subtree drop 是否有效
- layout hint 生成

当前位置：

- `write/mindmap.ts`

长期归属：

- core mindmap application planner
- engine committed command executor

### C. selection toolbar 默认样式与 schema 支持判定

涉及：

- 默认 fill / stroke / textColor / strokeWidth
- style field 支持探测
- toolbar mixed value 判定

当前位置：

- `presentation/selection.ts`

这块仍然属于 editor presentation，但不应继续散成一堆裸 helper 与中间暴露。
它的正确归属是“一个高内聚的 selection presentation 主轴”，不是“presentation 工具箱”。

## 长期目标结构

## 1. editor 层只保留四类职责

1. runtime 装配
2. input session 投影
3. UI presentation projection
4. 应用级 write intent

明确不保留：

- 领域规则求解器
- live read model 合成器
- patch compiler 工具箱
- 特定领域的 commit 判定策略

## 2. 目标边界

### editor

负责：

- createEditor 装配
- interaction runtime
- overlay runtime
- transient projection
- presentation read
- session local state
- application intent write facade

不负责：

- node / edge / mindmap 领域规则推导
- committed state 持久化

明确要求：

- editor 可以拥有 transient projection
- 但 editor 的 projection 只能消费 committed state 与本地临时态，不能自己发明领域规则

### core

负责：

- 纯领域规则
- 纯 projection function
- start / resolve / plan 所需判定
- patch 编译与 merge primitive
- 默认值策略
- 几何与选择推导
- committed state 到 transient state 的纯函数变换规则

### engine

负责：

- committed read model
- document mutation
- command execute

明确不负责：

- overlay preview
- edit draft
- transient live node / edge / selection projection
- editor 级应用意图编排

## 3. 唯一下沉策略

为了避免后续再出现“下沉到哪里”的模糊表述，长期统一采用下面这套唯一策略：

### 1. committed-only 的东西，下沉到 engine

包括：

- command execute
- committed read store
- committed index
- committed mutation pipeline

### 2. 纯领域规则与纯投影函数，下沉到 core

包括：

- selection / edge / mindmap 规则
- patch 编译
- 默认值与 schema 支持判定规则
- committed model + transient patch -> transient projection 的纯函数

### 3. 本地临时态组合，保留在 editor，但必须进入显式 projection 轴

包括：

- overlay preview
- edit session draft
- gesture preview
- committed read 与本地临时态的组合结果

明确禁止：

- 把本地临时态塞进 engine
- 把纯领域规则继续留在 editor read / write 文件里
- 把 projection 逻辑继续混在 `read/*` 里伪装成 read

## 必须执行的改造动作

## 阶段 1：先收最严重边界问题

### 1. 下沉 `read/node.ts` 的 live projection

目标：

- editor 不再在 `read/node.ts` 改写 live `NodeItem`

动作：

- 新增 `src/projection/node.ts`
- 把 overlay patch、text preview、edit draft 对 node item 的组合迁到 `projection/node.ts`
- 将 text width mode、wrap width、geometry 派生等纯计算抽到 core
- `read/node.ts` 只拼接：
  - engine committed node read
  - editor overlay/edit state
  - `projection/node.ts`

结果要求：

- `read/node.ts` 不再出现任何直接改写 `node.data` / `rect` 的逻辑
- transient live node 逻辑集中到单一 projection 主轴

### 2. 下沉 `write/mindmap.ts` 的领域编排

目标：

- editor 不再承接 mindmap 领域规则

动作：

- 在 core 新增单一 mindmap application planner
- 将 placement -> insert plan、drop move 判定、root move 判定、layout hint 生成全部迁入 planner
- editor 只保留调用入口：
  - `insertByPlacement`
  - `moveByDrop`
  - `moveRoot`

结果要求：

- `write/mindmap.ts` 不再包含任何 mindmap 领域判定分支
- `write/mindmap.ts` 只负责 intent -> planner -> engine.execute

## 阶段 2：清理 helper 驱动的主轴文件

### 3. 收口 `presentation/selection.ts`

目标：

- 一个 selection presentation 主轴文件
- 最多一个公开入口

动作：

- 取消内部阶段函数对外暴露
- 把 nodeInfo / overlay / toolbar 变成私有近邻子块
- 不再允许继续扩散更多小 helper 文件

### 4. 收口 `selection/press`

目标：

- `press/start.ts` 成为真正唯一 start 入口

动作：

- `resolve` / `plan` 保留私有角色
- 中间类型尽量内聚，不再扩大 surface
- `session` 不再直接拼接多个阶段函数，而是依赖更稳定的 press driver

### 5. 收口 `edge/connect/start.ts`

目标：

- 保留 edge connect 主轴
- 下沉可复用领域推导

动作：

- preview path 推导下沉到 core edge preview function
- reconnect preview / gesture draft 所需纯推导统一收进 core edge connect projection
- `start.ts` 只保留 feature start/router 与少量近邻 glue

## 阶段 3：消除局部工具箱与重复实现

### 6. 重构 overlay node / write overlay 边界

目标：

- overlay 自己拥有内部 patch-list 结构

动作：

- 删除 `write/overlay.ts` 对 `overlay/node.ts` 底层 entry helper 的直接依赖
- entry-list 读写操作改为 overlay 内部私有实现
- node text preview 写入改成高层 API，而不是外部拼 patch list

### 7. 收口 `write/node/patch.ts`

目标：

- node write 以 feature axis 组织，而不是 patch helper 组织

动作：

- 将 `compileNodeFieldUpdate` 周边组合能力统一下沉到 core/schema primitive
- `commands.ts` / `text.ts` 不再依赖成组裸 patch builder
- `write/node` 最终公开 surface 只保留真正的 node write 能力
- 删除 `write/node/patch.ts` 作为独立工具箱文件

### 8. 消除 overlay 内部重复 merge 逻辑

目标：

- 一个 feature 一套 merge 规则

动作：

- `overlay/edge.ts` 两段相似循环合并
- `overlay/node.ts` 两套 patch entry 算法统一抽象，但保持 feature 内部私有

## 明确不该继续保留的状态

以下状态长期都不应继续存在：

1. editor read 自己改写 live node
2. editor write 自己做 mindmap 领域计划与阈值判定
3. 一个 feature 主轴文件对外暴露一组阶段函数
4. 低层 patch helper 成为上层命令的主要依赖面
5. overlay 写入层依赖 overlay 内部数组结构操作函数
6. transient projection 混在 `read/*`
7. 文档里出现“下沉到 engine 或别的地方”的模糊表述

## 优先级

如果只按长期价值排序，不考虑成本，顺序应该是：

1. `read/node.ts`
2. `write/mindmap.ts`
3. `presentation/selection.ts`
4. `write/node/patch.ts` + `write/node/*`
5. `overlay/node.ts` + `write/overlay.ts`
6. `input/selection/press/*`
7. `input/edge/connect/start.ts`

## 终态判据

改造完成后，应该满足下面这些条件：

1. editor 内没有任何文件再承担 core / engine 级领域规则
2. engine 只承接 committed state，不承接本地临时态
3. core 承接所有纯规则与纯投影函数
4. editor 内存在明确的 `projection/*` 轴，负责 transient live projection
5. 主轴文件都能自上而下读完，不需要跨十几个 helper 才能理解
6. 中间阶段函数和中间阶段类型不再成为 feature surface
7. overlay、node write、selection presentation 都围绕单一 feature 主轴内聚
8. editor 的 read / projection / write / input / presentation 都只表达自己的层次职责

## 最终结论

`whiteboard-editor` 当前已经完成目录级收敛，但距离真正的长期最优还差最后一层边界收敛。

后续改造不应该再围绕“拆更多 helper”推进，而应该围绕以下三件事推进：

1. 把 editor 不该承担的领域语义下沉出去
2. 把 feature 内部 helper 重新收回主轴
3. 把局部工具箱改回 feature 内聚实现

如果按长期最优执行，这是一轮继续“变少”的改造，而不是继续“变散”的改造。
