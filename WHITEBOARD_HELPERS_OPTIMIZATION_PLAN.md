# Whiteboard Packages Helpers / Read-Write-Query 优化方案

## 1. 研究范围

- 范围：`whiteboard/packages/*/src`
- 排除：`dist`、`node_modules`、`test`
- 目标：判断 `whiteboard/packages` 是否存在大量散落的 `helper` 风格函数，是否适合收敛成 `read / write / query / resolve` 这类模块化入口，而不是继续追加 `helpers`

## 2. 现状基线

### 2.1 按 package 的源码规模

| package | src 文件数 |
| --- | ---: |
| whiteboard-core | 156 |
| whiteboard-editor | 89 |
| whiteboard-engine | 45 |
| whiteboard-react | 149 |
| whiteboard-product | 26 |
| whiteboard-collab | 11 |

### 2.2 显式 `utils/helpers` 文件分布

源码里真正显式命名为 `utils/helpers` 的文件非常少，只有 3 个核心位置：

- `whiteboard/packages/whiteboard-core/src/utils/objectPath.ts`
- `whiteboard/packages/whiteboard-core/src/utils/recordMutation.ts`
- `whiteboard/packages/whiteboard-editor/src/query/utils.ts`

结论：当前问题不是“helpers 文件数量失控”，而是“同类能力的组织语言不统一”。

### 2.3 `read / write / query` 语义模块分布

按文件路径统计，命中 `read` / `write` / `query` 语义目录或文件名的源码文件共有 **64 个**：

| package | 语义文件数 |
| --- | ---: |
| whiteboard-core | 10 |
| whiteboard-editor | 25 |
| whiteboard-engine | 29 |

说明：

- `whiteboard-core` 已有 `kernel/reduce/read/*`
- `whiteboard-engine` 已形成较完整的 `read/*` 与 `write/*`
- `whiteboard-editor` 内部同时存在 `query/*`、`editor/read.ts`、`write/*`

也就是说，工程其实已经在往“对象化读写接口层”走，而不是依赖 `helpers`。

### 2.4 顶层函数命名粗扫

对顶层函数/箭头函数命名做保守统计，`read/get/resolve` 这类前缀确实存在，但数量没有达到需要建立“全局 helpers 中心仓库”的程度：

| 前缀 | 顶层定义数 | 命中文件数 |
| --- | ---: | ---: |
| read | 14 | 11 |
| get | 17 | 11 |
| resolve | 2 | 2 |
| is | 11 | 7 |
| apply | 5 | 5 |
| set | 2 | 2 |

注意：

- 这是按顶层定义做的保守统计，不含所有对象方法与部分跨行 factory 定义
- 它足够说明命名趋势，但不应该被当成编译级精确数字

## 3. 关键结构判断

### 3.1 已经存在的“对象化接口层”

目前仓库里已经有几处明显的对象化聚合模式：

1. `whiteboard-core/src/kernel/reduce/read/index.ts`
   提供 `createReadApi()`，内部聚合为：
   - `document`
   - `canvas`
   - `node`
   - `edge`
   - `group`
   - `mindmap`
   - `record`

2. `whiteboard-engine/src/read/store/index.ts`
   提供 `createRead()`，最终返回 `EngineRead`，内部已经按领域拆成：
   - `document`
   - `frame`
   - `group`
   - `target`
   - `node`
   - `edge`
   - `mindmap`
   - `scene`
   - `slice`
   - `index`

3. `whiteboard-editor/src/query/index.ts`
   提供 `createEditorQuery()`，把 editor 的查询能力聚合到：
   - `document`
   - `group`
   - `target`
   - `edit`
   - `node`
   - `edge`
   - `mindmap`
   - `selection`
   - `tool`
   - `viewport`
   - `chrome`

4. `whiteboard-editor/src/write/index.ts`
   提供 `createEditorWrite()`，聚合为：
   - `document`
   - `canvas`
   - `node`
   - `group`
   - `edge`
   - `mindmap`
   - `history`

结论：**“聚合成模块对象”这件事已经在做了，只是术语和层级不统一。**

### 3.2 现在真正不统一的点

真正的分裂不是有没有 `helpers`，而是下面三类东西混在一起：

1. 纯算法 / 纯投影函数
   例如 `getNodeBounds`、`resolveFrameAtPoint`、`computeResizeRect`

2. 状态读取 facade
   例如 `EngineRead`、`EditorQuery`、`createReadApi`

3. 小范围共享工具
   例如 `objectPath`、`recordMutation`、`readUniformValue`

因此如果直接把它们都合成 `export const read = {}`，会把“纯函数工具”和“运行时读接口”混成一层，长期会更难维护。

## 4. 是否适合集中化为 `export const read = {}` 这类模块

## 结论

**适合做“按边界收口”的集中化，不适合做“全局 helper 大总线”的集中化。**

更具体地说：

- 适合：在每个 package 内，把运行时读取能力统一为稳定 facade
- 不适合：把所有 `read/get/resolve` 纯函数都塞进一个超级 `helpers` 或超级 `read`

### 4.1 适合集中化的部分

这些部分适合统一成对象化接口：

1. 依赖 store / runtime / snapshot / tx 的读取能力
   - 本质是服务接口，不是普通 helper
   - 例如 engine/editor/kernel 的 read 层

2. 面向调用方的领域 API
   - 例如 `node.read.rect(id)`、`selection.read.summary()` 这类入口
   - 可以降低外部 import 面，便于演进

3. 同一生命周期中的读写配对能力
   - 例如 editor 的 `query` 与 `write`
   - 最终可以统一语言为 `read/write`，降低认知切换成本

### 4.2 不适合集中化的部分

这些应保留为纯函数模块，不建议塞进 `read = {}`：

1. 几何计算
   - `geometry/*`
   - `node/transform.ts`
   - `edge/path.ts`

2. 纯数据查询
   - `document/query.ts`
   - `mindmap/query.ts`

3. 通用数据变换与对象路径工具
   - `utils/objectPath.ts`
   - `utils/recordMutation.ts`

原因很简单：

- 它们不依赖运行时上下文
- 它们是纯函数，天然适合 tree-shaking 和单测
- 强行收进 facade 会让依赖方向反过来，增加隐式耦合

## 5. 最值得优化的不是 helpers，而是“命名层级”

当前主要问题：

1. `core` 用 `query`
2. `engine` 用 `read`
3. `editor` 同时有 `query`、`editor/read`、`write`
4. 某些领域仍然保留大量 `getX / readX / resolveX` 散函数

这会带来几个实际成本：

- 新人很难判断“我要去 `query` 还是 `read` 找能力”
- 一部分 `readX` 是纯函数，一部分 `read` 是 store facade，语义冲突
- 公开 API 很克制，但内部概念很多，迁移成本逐年增加

## 6. 推荐的目标架构

建议统一成下面的分层，而不是统一成一个 `helpers` 桶：

### 6.1 Layer A: Pure Domain Functions

定位：纯函数层

保留形式：

- `node/*`
- `edge/*`
- `geometry/*`
- `document/query.ts`
- `mindmap/query.ts`
- `utils/*`

命名建议：

- `getX`：从明确输入直接取值
- `resolveX`：需要规则推导/冲突处理/优先级决策
- `computeX`：计算新结果
- `buildX`：构建结构或操作集
- `applyX`：把 patch/mutation 应用到数据

原则：

- 不依赖 store
- 不捕获 runtime
- 不返回带订阅语义的对象

### 6.2 Layer B: Read Facade

定位：运行时读取能力

建议统一语言：

- `core` 内部 reducer 继续保留 `createReadApi`
- `engine` 保持 `createRead`
- `editor` 中的 `query` 建议长期向 `read` 语义收敛

目标形态：

- `engine.read.node.rect(id)`
- `engine.read.group.bounds(id)`
- `editor.read.selection.summary()`
- `editor.read.tool.is('draw')`

原则：

- 面向 runtime / store / snapshot
- 只暴露稳定领域入口
- 不承载纯几何算法实现

### 6.3 Layer C: Write Facade

定位：状态变更接口

当前方向基本正确：

- `engine.write.*`
- `editor.write.*`

建议：

- 继续按领域对象聚合
- 避免在 write 内继续内嵌过多匿名 helper
- 内部局部 helper 可以保留，但命名尽量收口到同一文件或同一 domain 子目录

## 7. 具体优化建议

### 建议 A：不要新增 `helpers/` 总目录

理由：

- 当前显式 `utils/helpers` 很少，并不存在目录级泛滥
- 新建总 `helpers` 目录只会把领域代码重新打散
- 以后很容易演化成“什么都往里塞”的回收站

### 建议 B：把 `editor/query` 长期重命名为 `editor/read`

这是最值得做的一步。

原因：

- `engine` 已经明确是 `read/write`
- `editor` 目前是 `query + read + write` 三套词汇并存
- 实际上 `EditorQuery` 承担的是 facade read 层，不是 SQL 风格 query 层

建议目标：

- `createEditorQuery` -> `createEditorReadFacade` 或 `createEditorRead`
- `EditorQuery` -> `EditorReadModel` / `EditorRuntimeRead`
- `editor/read.ts` 保留为对 UI 暴露的 presentation read，或重命名为 `presentation/read.ts`

这里不要求一次性改名，但应先定义目标词汇。

### 建议 C：在各 domain 下建立“子入口”，不要做“跨域 read 总桶”

推荐：

- `node`
- `edge`
- `selection`
- `mindmap`
- `document`
- `group`

不推荐：

- `helpers/read.ts`
- `helpers/get.ts`
- `helpers/resolve.ts`

原因：

- `read/get/resolve` 是动词，不是领域边界
- 以动词建总桶，文件会持续膨胀
- 领域对象更适合演化与授权

### 建议 D：区分“读值”与“读模型”

当前 `readX` 这个词同时指向两件事：

1. 从 store 读取运行时值
2. 从输入数据计算某个结果

建议规范：

- 运行时 facade：优先使用 `read`
- 纯函数取值：优先使用 `get`
- 规则推导：优先使用 `resolve`
- projection / cache 构建：优先使用 `create`

这样可以减少命名碰撞。

### 建议 E：把少数通用工具升级为“受控基础模块”

现有 `utils` 中有些是合理的基础设施，不需要消灭：

- `objectPath`
- `recordMutation`
- `readUniformValue`

但建议把它们定义为：

- 数量严格受控
- 每个工具都有明确责任边界
- 不允许把领域逻辑往里沉

也就是说，`utils` 不是禁用，而是要变成“基础层白名单”。

## 8. 分阶段落地方案

### Phase 0: 先做约束，不做重构

先形成团队共识：

1. 不新增全局 `helpers/`
2. 优先按 domain 放置纯函数
3. runtime 读取能力统一视为 `read facade`
4. `editor/query` 是下一阶段重点收口对象

交付物：

- 命名约定文档
- 新文件放置规则
- PR review checklist

### Phase 1: 统一术语

目标：只做命名层对齐，不改行为

动作：

1. 标注 `query` 与 `read` 的边界
2. 标注哪些 `readX` 实际应该叫 `getX` / `resolveX`
3. 明确 `editor/read.ts` 与 `editor/query/*` 的职责区分

完成标准：

- 新增 API 命名不再混用
- 团队能回答“什么时候放 query，什么时候放 read”

### Phase 2: editor 内部收口

目标：把 editor 的 `query/read/write` 三层关系理顺

建议路线：

1. 先保持对外 API 不变
2. 内部逐步把 `query/*` 视作 read facade 子模块
3. 对 presentation read 单独命名

推荐目标：

- runtime read
- presentation read
- write

避免出现两个都叫 `read` 但语义不同的入口。

### Phase 3: core 中区分 pure query 与 runtime read

目标：减少 `readX` 和 `getX` 的混用

动作：

1. `document/query.ts`、`mindmap/query.ts` 继续保留纯函数定位
2. `kernel/reduce/read/*` 明确为 runtime read api
3. 后续新增纯函数优先进入 domain 模块，不再新增泛工具层

### Phase 4: 对外出口收敛

目标：只暴露稳定、高层的 facade

动作：

1. package root 继续保持克制
2. 内部实现模块可以多，但 public exports 不继续扩散
3. 对外以 domain + capability 为主，不以 helper 名字暴露

## 9. 命名规则建议

建议以后统一遵守：

### 纯函数

- `getX`：直接读取字段/映射/索引
- `resolveX`：需要规则决策
- `computeX`：数值或几何计算
- `buildX`：构建 command / patch / layout / path
- `applyX`：应用 mutation / patch
- `isX` / `hasX`：布尔判断

### facade / service

- `createXRead`
- `createXWrite`
- `createXStore`
- `createXProjection`

### 不推荐新增

- `helpers.ts`
- `common.ts`
- `misc.ts`
- `shared.ts`（除非真的是同一目录下局部共享）
- `read.ts` 用来承载纯算法集合

## 10. 最终判断

### 是否要“集中化”

要，但要按边界集中，而不是按动词集中。

### 是否适合搞成 `export const read = {}` 这种模块

适合用于：

- runtime read facade
- package 内部稳定接口层

不适合用于：

- 纯算法 helper 聚合
- 跨 domain 的通用函数回收站

### 最佳方向

最佳方向不是“消灭 helpers”，而是：

1. 保留少量基础 `utils`
2. 纯函数留在 domain 模块
3. runtime 能力统一到 `read/write`
4. 优先解决 `editor` 中 `query/read/write` 三套词汇并存的问题

---

## 一句话结论

`whiteboard/packages` 当前并不是 helper 太多，而是 **runtime facade 已经成型，但术语没有统一**。因此最优解不是做一个大而全的 `helpers` 或 `read` 总桶，而是继续沿着 **domain pure functions + read/write facade** 的方向收口，第一优先级应放在 `whiteboard-editor` 的 `query/read/write` 语义统一。
