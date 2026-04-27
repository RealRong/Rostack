# whiteboard-core 审计：命名、抽象与目录结构

## 1. 审计目标

本轮只审 `whiteboard/packages/whiteboard-core`，重点不是检查功能正确性，而是判断它是否真的只保留：

- 纯算法
- 纯领域逻辑
- 最小必要的数据结构

并重点看三类问题：

1. 是否没有充分复用 `shared` 底层设施，仍然在 core 内重复抽象
2. 是否存在大量 `read*` / `resolve*` / `get*` helper，导致数据模型不流畅
3. 是否文件和目录拆得过细，最终又靠重型聚合入口重新拼装

---

## 2. 总体结论

结论很明确：**有，而且三个问题都存在。**

但问题的本质不是 `whiteboard-core` “不够纯”，而是：**纯领域逻辑的组织方式还不够最终。**

当前 `whiteboard-core` 更像：

- 一批细粒度 helper
- 一些超厚的 glue / spec / state 文件
- 再加一个重型 barrel / facade 入口把这些 helper 重新装配成 API

这意味着它虽然已经明显比 UI/runtime 层更纯，但还没有达到“稳定领域面直接暴露、底层设施最大复用、命名即模型”的长期最优状态。

一句话判断：

- **方向是对的**
- **组织还不够最终**
- **命名层和拼装层仍然太重**

---

## 3. 结论一：`shared` 已经用了不少，但 core 里仍有重复抽象

这不是“完全没复用 shared”的问题。相反，`whiteboard-core` 已经接入了：

- `@shared/mutation`
- `@shared/reducer`
- `@shared/draft`
- `@shared/delta`
- `@shared/core`

所以真正的问题是：

> **shared 提供了底层能力，但 whiteboard-core 在其上又长出了一层自己的局部 helper、局部读模型、局部 clone、局部 context glue。**

也就是：**设施复用了，但最终领域面没有收紧。**

### 3.1 典型重复抽象

#### A. `reducer/internal/state.ts`

这个文件同时承担了：

- draft 文档运行态
- materialize
- invalidation
- 多类 clone helper
- reducer 内部状态组织

这类文件的问题不是“逻辑不纯”，而是**太像一个局部 runtime 内核**。  
如果 shared 已经承担 mutation / reducer / draft / delta 的基础设施，那么 whiteboard-core 这里最好只保留：

- 白板文档特有的结构更新
- 白板领域特有的失效归类
- 白板领域特有的派生结果

而不应该继续堆很多细碎的局部复制与中间态拼装 helper。

#### B. `spec/operation/index.ts`

这个文件目前不只是 spec，它还承担了：

- operation definition table
- footprint collect glue
- history read 包装
- reducer context 适配
- 多个局部 read helper

这说明它还不是“声明式 spec”，而更像“**半个运行时编排文件**”。

长期最优里，spec 文件应尽量只回答三件事：

- 这个 operation 是什么
- 它如何 apply
- 它的 footprint / issue / sync 语义是什么

而不是再生长一整套本地 `createHistoryRead` / `createFootprintContext` / `readNodeOwners` 一类的中间组织层。

#### C. `document/read.ts`

这里面大量函数本质只是：

- 从 map 里拿值
- 对集合做 `Object.values`
- 做一层非常薄的过滤

如果 helper 只是对原始结构读取做 rename，那么它会制造命名噪音，而不是提升模型质量。

应该只保留两类读取：

1. **有明确领域语义的读取**
2. **被广泛复用且能稳定定义 read model 的读取**

否则更适合直接访问稳定数据结构，或者把它们并入真正的领域模块里。

#### D. `lock/index.ts`

`lock` 的规则逻辑留在 core 是合理的，这本身没有问题。  
问题在于这个文件里混在一起的东西过多：

- document 读取
- target 归一化
- lock decision
- operation violation 扫描
- 局部读函数适配

这说明 `lock` 目前不是一个纯净的“领域规则面”，而还是夹杂着不少流程式 glue。

### 3.2 这一类问题的本质

不是 shared 不够强，而是：

- core 没有完全信任 shared 作为基础设施
- core 在 shared 之上又搭了很多二级包装层
- 这些包装层没有沉淀成真正稳定的领域 API

所以看起来就会变成：

- 基础设施已经统一
- 但 core 内部还在继续“自己组织一遍”

---

## 4. 结论二：函数名系统不稳定，`read* / resolve* / get*` 明显过量

这是本轮最明显的问题。

在 `whiteboard-core/src` 下，`read*` / `resolve*` / `get*` 命名命中了非常多位置，数量级已经足以说明这不是个别命名问题，而是**模型风格没有收口**。

### 4.1 当前问题不只是“名字不好看”

真正的问题是：这些前缀承载的语义并不稳定。

当前大致有几种混用情况：

- `get*` 有时只是 map 取值
- `get*` 有时是几何派生
- `read*` 有时是稳定读取
- `read*` 有时是局部运行态查询
- `resolve*` 有时是纯计算
- `resolve*` 有时是“带上下文判定”
- `resolve*` 有时甚至接近“业务决策”

这会导致两个后果：

1. **看名字无法预判成本**
   - 是 O(1) 取值，还是 O(n) 派生？
   - 是纯函数，还是依赖上下文？
   - 是原始读取，还是隐含领域规则？

2. **数据模型没有长成稳定对象面**
   - 读模型还是散落函数集合
   - 决策模型还是散落 helper 集合
   - 只能靠调用方记忆“这个 read / resolve / get 到底是哪一种”

### 4.2 典型症状

#### A. `document/read.ts`

像 `getNode` / `getEdge` / `getGroup` / `listNodes` 这种名字，本质只是集合访问包装。  
如果这种函数大量存在，说明：

- 调用面没有真正稳定的数据对象语义
- helper 在替代模型，而不是在表达模型

#### B. `node/index.ts`

这里聚合了大量不同语义层级的函数，例如：

- `getNodeAABB`
- `readNodeRotation`
- `resolveMoveEffect`
- `buildSelectionTransformPlan`
- `projectResizePatches`
- `resolveNodeTransformBehavior`

这些函数并不都属于同一个抽象层级，却被最终聚合在统一 namespace 下。  
这说明底层模块的最终命名和最终边界还没完全稳定，只能靠聚合层再解释一次。

#### C. `spec/operation/index.ts`

这里出现很多名字：

- `createHistoryRead`
- `createFootprintContext`
- `readMindmapSubtreeNodeIds`
- `readNodeOwners`

这些名字本身就暴露出“中间层组织”还很重，而不是 spec 本身已经足够 declarative。

### 4.3 长期最优的命名原则

`whiteboard-core` 应该尽量只保留三类稳定语义：

#### 1. 原始存取

只在确实需要时保留，语义要极其明确：

- `byId`
- `has`
- `list`
- `ids`

例如：

- `node.byId`
- `edge.byId`
- `group.listNodeIds`

而不是到处出现 `getNode` / `getGroup` / `readNode` 的并存。

#### 2. 纯派生 / 纯投影 / 纯几何计算

这类名字应表达“它是在算什么”，而不是泛化成 `resolve`：

- `bounds`
- `geometry`
- `outline`
- `project`
- `derive`
- `layout`
- `route`
- `tree`

`resolve` 只适合保留给非常少量、语义非常明确的“从不完整输入收敛为确定结果”的算法。

#### 3. 领域决策 / 规划 / 校验

这类名字应该直接表达决策含义：

- `plan`
- `decide`
- `validate`
- `classify`
- `collect`

例如锁逻辑更适合稳定在：

- `lock.decide`
- `lock.validateOperations`

而不是一堆 `readXxxViolation` / `resolveXxxDecision` / `collectXxxIds` 的流程式函数名混在一起。

### 4.4 最重要的判断

`read* / resolve* / get*` 多，不只是“命名不统一”。  
它实质上说明：

> **whiteboard-core 目前更像函数工具箱，而不是已经收口成最终的领域 API 面。**

---

## 5. 结论三：问题不是目录太深，而是文件过碎 + 聚合入口过重

从目录层级上看，`whiteboard-core` 并不算深。  
真正的问题是：

- 很多文件切得偏细
- 稳定 API 没直接长在最终位置上
- 最后靠重型入口重新组装

### 5.1 结构特征

本次扫描里比较典型的信号：

- `src` 下总文件数约 `125`
- `src/node` 目录下文件约 `22`
- `src/mindmap` 目录下文件约 `11`
- `src/reducer/internal` 目录下文件约 `9`

同时又存在几类超厚文件：

- `src/node/index.ts` 约 `427` 行
- `src/spec/operation/index.ts` 约 `1057` 行
- `src/lock/index.ts` 约 `517` 行
- `src/reducer/internal/state.ts` 约 `619` 行

这不是“简单的大文件问题”，而是一个更明确的结构信号：

> **模块被切碎了，但最终稳定边界没有形成，所以又必须用大文件把它们重新组装。**

### 5.2 最典型案例：`node/index.ts`

`node/index.ts` 不是普通 barrel。  
它实际上承担了：

- 大规模二次命名
- 多子模块重编组
- 对外 API 语义再组织

如果一个入口文件需要长期承担这种职责，说明：

- 底层模块的最终命名还没稳定
- API 面不是天然长出来的，而是被“拼出来”的

长期最优里，`index.ts` 最多应该做：

- 少量 re-export
- 少量最终 namespace 收口

而不应该成为一个大型领域拼装器。

### 5.3 `spec/operation/index.ts` 与 `lock/index.ts` 的另一种问题

这两个文件和 `node/index.ts` 正好相反：

- `node/index.ts` 是“太强的外部聚合”
- `spec/operation/index.ts` / `lock/index.ts` 是“太重的内部编排”

这说明当前结构同时存在两个方向的噪音：

1. 文件切得太散，需要大聚合入口
2. 规则与编排没拆干净，导致单文件过厚

所以问题不是单纯“拆太多”或者“合太多”，而是：

> **稳定边界没有定住，于是既碎又厚。**

---

## 6. 重点文件判断

### 6.1 `node/index.ts`

判断：

- 是当前最明显的“重 facade / 重 barrel”信号
- 说明 `node/*` 子模块最终边界还不稳定
- 说明对外 API 仍靠二次拼装

保留意见：

- `node` 作为高层领域命名空间本身没有问题

问题点：

- 不应再承载大量重新命名与重新组织职责

### 6.2 `document/read.ts`

判断：

- 里面很多 helper 过薄
- 更像“对象访问包装层”，而不是稳定 read model

长期方向：

- 只保留有领域价值的读取
- 薄包装要么删掉，要么并入稳定对象面

### 6.3 `reducer/internal/state.ts`

判断：

- 职责过宽
- 白板 reducer 运行态、draft、materialize、clone、失效归类混在一起

长期方向：

- shared 负责通用运行机制
- core 只保留白板特有状态变换与领域失效定义

### 6.4 `spec/operation/index.ts`

判断：

- 还不够 declarative
- 仍然残留明显的 runtime glue 和 read glue

长期方向：

- 把 spec 压缩成“定义”
- 把辅助 read / collect / context glue 尽量消掉或下沉

### 6.5 `lock/index.ts`

判断：

- 领域规则放在 core 是对的
- 但内部组织更像流程拼装器，而不是稳定规则面

长期方向：

- 让 `lock` 成为明确的 decision / validate 模块
- 减少局部读 helper 和流程式中间函数

---

## 7. 从架构师视角看，whiteboard-core 应该收敛成什么样

目标不是“把 helper 全删掉”，而是让 helper 只保留真正必要的那部分。

长期最优的 `whiteboard-core` 应该具备以下特征：

### 7.1 `shared` 负责设施，core 只负责白板领域

`shared` 负责：

- mutation runtime
- reducer runtime
- delta / draft / projection 等底层机制

`whiteboard-core` 负责：

- 白板 document 结构
- 白板 operation spec
- 几何 / 布局 / 路由 / 变换 / 选择等算法
- 锁、mindmap、group 等领域规则

不应再在 core 内重复长出一层“像 infra 的 infra”。

### 7.2 命名必须直接表达抽象层级

原始读取、纯派生、规则决策必须分层命名，不再混用：

- 原始读：`byId` / `list` / `has`
- 派生算：`project` / `derive` / `bounds` / `geometry`
- 规则决策：`plan` / `decide` / `validate`

`get` / `read` / `resolve` 只能保留在语义非常稳定、并且确实没有更好名字的地方。

### 7.3 文件边界围绕“最终领域面”组织，而不是围绕辅助动作组织

应该优先围绕稳定领域面组织，例如：

- `node.geometry`
- `node.outline`
- `node.transform`
- `lock`
- `mindmap.tree`

而不是围绕这种“中间动作”组织：

- `read`
- `resolve`
- `internal state helper`
- `context builder`

### 7.4 减少“先拆碎，再拼回去”的结构

长期最优不是继续增加层次，而是：

- 合并过薄文件
- 减少大 barrel 重新装配
- 让最终 API 直接长在稳定模块上

---

## 8. 建议的整改优先级

如果下一轮真的要动 `whiteboard-core`，我建议按下面顺序做。

### P1. 先做命名收口

优先处理：

- `document/read.ts`
- `node/index.ts`
- `lock/index.ts`
- `spec/operation/index.ts`

目标：

- 明确哪些是原始读
- 明确哪些是纯算法
- 明确哪些是规则决策
- 大幅减少泛化 `read* / resolve* / get*`

这是收益最高的一步，因为它会直接让模型变清晰。

### P2. 再做“中间组织层”削减

优先处理：

- `spec/operation/index.ts`
- `reducer/internal/state.ts`
- `lock/index.ts`

目标：

- 删掉局部 context glue
- 删掉薄包装 read helper
- 能交给 shared 的机制交给 shared

### P3. 最后做目录与文件重组

目标：

- 合并过薄文件
- 把超厚的聚合/编排文件拆成真正稳定的领域面
- 减少 `index.ts` 的再组装职责

这一步应该最后做，因为如果命名和边界还没定，先重排目录只会反复返工。

---

## 9. 最终判断

如果只回答一句：

> `whiteboard-core` 现在已经大体站在“纯算法 + 领域逻辑”的正确方向上，但它还没有进入最终形态。

它当前最大的问题不是引入了太多 UI / runtime 杂质，而是：

- 领域 API 还不够直接
- helper 风格过重
- 命名不能稳定表达抽象层级
- 文件切分与聚合方式都还带着明显过渡痕迹

所以这轮审计的核心结论是：

1. **有重复抽象，尤其是 shared 之上的二级包装层**
2. **有明显的 `read* / resolve* / get*` 过量问题**
3. **有“文件过碎 + 聚合过重”并存的问题**

长期最优不是继续加层，而是：

- 让 shared 真正吃掉基础设施
- 让 core 只保留白板特有领域面
- 让命名直接等于模型
- 让最终 API 不再依赖大规模二次拼装

