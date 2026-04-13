# Dataview Engine Runtime 架构一步到位方案

## 文档定位

这份文档回答的是下面这个问题：

- 如果不考虑迁移成本，不考虑兼容层，不考虑双轨阶段，`dataview/src/engine` 围绕 `state`、`store`、`read`、`services`、`write`、`derive` 的组织方式，长期最优应该怎么做。

它不是局部整理建议，也不是低风险迁移清单，而是终态设计。

当这份文档与更早的局部简化文档发生冲突时，围绕 runtime 组织、读写边界、目录命名这几个问题，以这份文档为准。

## 1. 硬性结论

一步到位时，必须直接接受下面这些结论，不保留过渡心智模型。

- `DataDoc` 是唯一持久化真相源。
- engine 里只有一个可变 runtime store。
- engine 里只有一个 active view runtime。
- `read` 不是一个顶层模块名，它只是访问方式。
- `state` 不是一个好的顶层模块名，长期应改成 `runtime`。
- `services` 不是一个好的顶层模块名，长期应彻底删除。
- 所有 public API 装配都必须放到 `api/`。
- 所有 `ReadStore` 构造都必须放到 `runtime/selectors/` 或 `active/selectors.ts`。
- 所有纯 `DataDoc` 读取都必须放到 `document/`。
- 所有 active view 派生都必须收口到 `active/`。
- 所有写入规划与提交都必须收口到 `mutate/`。

一句话总结：

- 当前 engine 应该从“按动作命名和按实现阶段命名混排”，改成“按稳定领域边界命名”。

## 2. 对当前结构的判断

当前代码并不是不可维护，但它已经明显暴露出组织轴混乱的问题。

### 2.1 当前目录混用了三种不同坐标轴

当前 `engine/` 下的目录同时在按三种标准分组：

- 按数据来源分组：`state/`
- 按动作分组：`read/`、`write/`
- 按 use case 分组：`services/`
- 按实现阶段分组：`index/`、`derive/`

这会导致同一件事被拆散在不同目录里。

比如“读取当前 active view 的运行时信息”会同时穿过：

- `state/store.ts`
- `state/select.ts`
- `state/read.ts`
- `read/entities.ts`
- `services/active/base.ts`
- `services/active/read.ts`

这不是功能复杂本身导致的，而是目录语义不稳定导致的。

### 2.2 `read/entities.ts` 同时做了两件本不该混在一起的事

`dataview/src/engine/read/entities.ts` 当前同时包含：

- 纯 `DataDoc` 快照读取
- 基于 `Store` 的 reactive selector 构造

这意味着一个文件同时依赖：

- `DataDoc`
- `Store`
- `ReadStore`
- `KeyedReadStore`
- `state/select`

这是典型的边界泄漏。

长期最优方案里，不允许任何文件同时承担这两类职责。

### 2.3 `state/read.ts` 实际上不是 state，而是 public API 装配

`dataview/src/engine/state/read.ts` 的真实职责不是“读取 state”，而是：

- 从 root store 组装 `DocumentReadApi`

它放在 `state/` 里，会误导后来者以为这里是 runtime 内部逻辑。

实际上它属于 `api/`。

### 2.4 `services/active/base.ts` 已经是 active runtime 的上帝对象

这个文件当前同时承担：

- active selector 构造
- active config 读取
- active state 读取
- field/group/filter 辅助定位
- patch action 构造
- dispatch 封装
- item move 相关辅助
- field create 辅助

这不是一个 `base` 文件该承受的职责密度。

长期最优方案里，它必须被拆成：

- `active/context.ts`
- `active/selectors.ts`
- `active/read.ts`
- `active/commands/*`

### 2.5 `index/` 与 `derive/active/` 其实属于同一条 active runtime 派生链

当前顶层同时存在：

- `index/`
- `derive/active/`

但从系统真实语义看，它们都只是“active view runtime 的派生组成部分”。

也就是说，当前的拆法更像在按“技术阶段”分目录：

- 先建 index
- 再 derive snapshot

而不是按领域边界分目录。

长期最优方案里，它们应该一起进入 `active/` 下面。

## 3. 最终架构主轴

一步到位后的 engine，只保留 5 个顶层主轴：

- `document/`
- `runtime/`
- `active/`
- `mutate/`
- `api/`

它们各自回答完全不同的问题。

### 3.1 `document/`

回答：

- 持久化文档里有什么
- 怎样从 `DataDoc` 里读取记录、字段、view
- 怎样做纯文档层的规则判断

这一层只接受 `DataDoc`，只返回普通值，不知道 `Store`、`ReadStore`、public API。

### 3.2 `runtime/`

回答：

- engine 运行时持有哪些内存状态
- root store 如何创建与更新
- history 和 performance 如何挂在 runtime 上
- 如何从 runtime store 派生 selector

这一层知道 `RuntimeStore` 和 `ReadStore`，但不知道 public API。

### 3.3 `active/`

回答：

- 当前 active view runtime 的内部模型是什么
- active demand / index / cache / snapshot 如何派生
- 当前 active view 的同步 read helper 是什么
- 当前 active view 的命令上下文是什么

这一层描述的是“当前 active view session”，不是泛化 view 系统。

### 3.4 `mutate/`

回答：

- action 如何规划
- 校验如何执行
- operation 如何提交
- history / perf trace 如何记录

这一层只关心写路径，不关心 public API。

### 3.5 `api/`

回答：

- 对外的 engine API 长什么样
- document select API 如何暴露
- active view API 如何暴露
- fields / records / views 的对外命令面如何装配

这一层只做装配，不承载底层领域逻辑。

## 4. 最终最优文件目录

这里给出的是我认为长期最优、且语义最稳定的一版终态目录。重点不是“尽量扁平”，而是“只保留真实领域层级，删除假层”。

### 4.1 顶层目录

```text
dataview/src/engine/
  api/
  document/
  runtime/
  active/
  mutate/
  contracts/
```

顶层只保留 6 个主语：

- `api`：对外装配
- `document`：纯 `DataDoc` 读取与规则
- `runtime`：root runtime store 与 selector 基础设施
- `active`：当前 active view runtime
- `mutate`：写路径的规划与提交
- `contracts`：public/internal 类型

### 4.2 最终最优文件树

```text
dataview/src/engine/
  api/
    createEngine.ts
    engine.ts
    active.ts
    fields.ts
    records.ts
    views.ts
    documentSelect.ts

  document/
    records.ts
    fields.ts
    views.ts
    activeView.ts
    fieldLookup.ts
    entities.ts

  runtime/
    state.ts
    store.ts
    history.ts
    performance.ts
    selectors/
      core.ts
      document.ts
      active.ts

  active/
    runtime.ts
    demand.ts
    context.ts
    selectors.ts
    read.ts

    index/
      runtime.ts
      demand.ts
      trace.ts
      shared.ts
      records.ts
      search.ts
      sort.ts
      calculations.ts
      group/
        runtime.ts
        demand.ts
        bucket.ts

    snapshot/
      runtime.ts
      base.ts
      collections.ts
      equality.ts
      reuse.ts
      trace.ts
      query/
        runtime.ts
        derive.ts
      sections/
        runtime.ts
        derive.ts
        sync.ts
        publish.ts
      summary/
        runtime.ts
        compute.ts
        sync.ts
        publish.ts

    commands/
      query.ts
      display.ts
      sections.ts
      items.ts
      cells.ts
      gallery.ts
      kanban.ts
      table.ts

  mutate/
    planner/
      index.ts
      shared.ts
      records.ts
      fields.ts
      views.ts
      validate.ts
      issues.ts
    commit/
      runtime.ts
      trace.ts
    entityId.ts

  contracts/
    public.ts
    internal.ts
```

### 4.3 这份文件树的关键判断

这份结构里最重要的决定，不是简单移动文件，而是明确哪些层级应该保留，哪些应该消失。

- 删除顶层 `read/`
- 删除顶层 `services/`
- 删除顶层 `state/`
- 删除顶层 `write/`
- 顶层 `index/` 整体并入 `active/index/`
- 顶层 `derive/active/` 整体并入 `active/snapshot/`
- `api/` 不再出现子目录式 facade 拼装层，直接按 public surface 组织
- `document/` 只保留纯文档访问，不再知道 `ReadStore`
- `runtime/selectors/` 统一承接所有 reactive selector 构造

### 4.4 不做“全面扁平化”

长期最优不等于把所有文件打平成一层。这里必须明确反对错误的全面扁平化。

不应该做的事：

- 不要把 `active/index/*` 全部塞进 `active/`
- 不要把 `active/snapshot/query`、`sections`、`summary` 打平到一个目录
- 不要把所有 stage helper 合并成两个超大文件

应该做的事：

- 只删除没有真实边界价值的中间层
- 保留真实存在的流水线阶段
- 让目录直接表达派生顺序和依赖方向

换句话说，最终最优结构不是“草坪式扁平”，而是“一棵目录树，但每一层都有真实语义”。

### 4.5 哪些地方要压平，哪些地方要保留分层

应该压平的地方：

- 很薄的 barrel file
- 纯转发 `index.ts`
- 只有 1 到 2 个导出的伪命名空间文件
- 只是为了躲避大文件而拆出来、但没有独立主语的 helper 文件

应该保留分层的地方：

- `active/index/` 这一整层
- `active/snapshot/` 这一整层
- `active/snapshot/query`
- `active/snapshot/sections`
- `active/snapshot/summary`
- `active/commands/`
- `runtime/selectors/`

判断标准只有一个：

- 这层目录是否对应一个稳定领域或稳定阶段

如果答案是“是”，就保留；如果只是为了“看起来没那么大”，就删掉。

## 5. 文件迁移与处置

下面是对当前关键文件的一步到位处置方式。

### 5.1 `state/store.ts`

当前职责：

- 定义 `Store`
- 初始化 `EngineState`

最终处置：

- 类型定义移到 `runtime/state.ts`
- `createStore` 保留在 `runtime/store.ts`
- `createInitialState` 改名为 `createRuntimeState`

重命名建议：

- `EngineState` -> `EngineRuntimeState`
- `Store` -> `RuntimeStore`

### 5.2 `state/select.ts`

当前职责：

- 创建通用 derived selector
- 创建 document selector

最终处置：

- 通用 selector 工具移到 `runtime/selectors/core.ts`
- document entity selector 移到 `runtime/selectors/document.ts`
- active runtime selector 移到 `runtime/selectors/active.ts`

原则：

- `selectDocument()` 这种 helper 可以保留，但只能存在于 `runtime/selectors/`。

### 5.3 `state/read.ts`

当前职责：

- 装配 `DocumentReadApi`

最终处置：

- 文件删除
- 对外装配逻辑迁移到 `api/document/select.ts`

重命名建议：

- `DocumentReadApi` -> `DocumentSelectApi`

原因：

- 它暴露的是 `ReadStore`，语义更接近 `select`，不是同步 `read`。

### 5.4 `read/entities.ts`

当前职责：

- 纯 `DataDoc` 读取
- store entity selector 构造
- `createWriteRead()` helper

最终处置：

- 文件删除
- 纯 `DataDoc` 读取拆到 `document/entities.ts`
- store selector 构造拆到 `runtime/selectors/document.ts`
- `createWriteRead()` 彻底删除

硬性规则：

- 以后不允许任何文件同时接收 `DataDoc` 和 `RuntimeStore`
- 以后不允许任何 factory 同时返回普通同步 getter 与 `ReadStore`

### 5.5 `services/fields.ts`、`services/records.ts`、`services/views.ts`

当前职责：

- 对外的 document 级命令式 API

最终处置：

- 迁移到 `api/fields.ts`
- 迁移到 `api/records.ts`
- 迁移到 `api/views.ts`

这里不再使用 `services` 命名，因为这些文件本质是 public API adapter。

### 5.6 `services/active/base.ts`

当前职责：

- active runtime 上下文
- active selector 构造
- active command helper
- patch action helper

最终处置：

- 文件删除
- 拆成 `active/context.ts`
- 拆成 `active/selectors.ts`
- 拆成 `active/commands/*`

拆分原则：

- `context.ts` 只负责依赖聚合与上下文读写
- `selectors.ts` 只负责 `ReadStore`
- `commands/*` 只负责行为实现

### 5.7 `services/active/read.ts`

当前职责：

- active view 的同步 read facade

最终处置：

- 迁移到 `active/read.ts`

原因：

- 它不是 public API 装配，而是 active domain 的同步 helper。

### 5.8 `services/active/index.ts`

当前职责：

- 组装 `ViewApi`

最终处置：

- 文件删除
- 装配移动到 `api/active/index.ts`

重命名建议：

- `ViewApi` -> `ActiveViewApi`
- `engine.view` -> `engine.active`

### 5.9 `index/*`

当前职责：

- active demand 驱动的 records/search/group/sort/calculation index

最终处置：

- 全部迁移到 `active/index/`

原因：

- 它们不是通用 engine index 基础设施
- 它们都是为了当前 active view runtime 服务

### 5.10 `derive/active/*`

当前职责：

- 由 active index 继续派生 query、sections、summary、snapshot

最终处置：

- 全部迁移到 `active/snapshot/`

原因：

- 它们与 `index/*` 共同组成 active runtime 派生链

### 5.11 `write/*`

当前职责：

- action 规划
- commit
- trace
- entityId

最终处置：

- `resolve.ts`、`plan.ts`、`shared.ts`、`issues.ts` 进入 `mutate/planner/`
- `commit.ts`、`trace.ts` 进入 `mutate/commit/`
- `entityId.ts` 保留到 `mutate/entityId.ts`

重命名建议：

- `write/` -> `mutate/`

原因：

- 这里不只是“写”，而是完整的规划与提交流水线。

## 6. 关键边界规则

长期最优结构必须强制执行下面这些规则。

### 6.1 数据源规则

- `document/` 只能依赖 `DataDoc`
- `runtime/` 只能依赖 runtime state/store/history/perf
- `active/` 可以依赖 `document/` 和 `runtime/`
- `mutate/` 可以依赖 `document/` 和 `runtime/`
- `api/` 可以依赖所有内部层，但内部层不能反向依赖 `api/`

### 6.2 命名规则

- `select` 只表示返回 `ReadStore`
- `read` 只表示同步读取普通值
- `store` 只表示可变 runtime store
- `state` 只表示 plain data shape，不再表示目录名
- `context` 只表示依赖聚合与便捷读取，不承载核心业务实现
- `commands` 只表示命令式行为实现，不承载 selector 构造

### 6.3 文件职责规则

- 一个文件只能有一个主语
- 一个 factory 不能同时产出同步 getter 和 reactive selector
- 一个模块不能同时对外暴露 public API 和内部 helper
- `api/` 下的文件不得持有核心算法
- `runtime/` 下的文件不得出现 public `*Api` 类型
- `document/` 下的文件不得 import `ReadStore`

### 6.4 禁止项

- 禁止顶层再出现 `services/`
- 禁止顶层再出现 `read/`
- 禁止把 public API 装配放进 `runtime/`
- 禁止把 active runtime 逻辑分散到 `services/active/base.ts` 这种全能文件
- 禁止把 planner helper 暴露成通用 `createWriteRead()` 一类 facade

## 7. 公开 API 的终态

如果允许不考虑成本，public API 也应该顺手一起收口。

### 7.1 `Engine`

最终推荐形态：

```ts
interface Engine {
  active: ActiveViewApi
  views: ViewsApi
  fields: FieldsApi
  records: RecordsApi
  document: DocumentApi
  select: DocumentSelectApi
  history: HistoryApi
  performance: PerformanceApi
  dispatch: (action: Action | readonly Action[]) => ActionResult
}
```

关键变化：

- `view` 改名为 `active`
- `read` 改名为 `select`

这两个改名非常重要，因为它们把“active view session”和“reactive selector”两个事实直接写进了 API 名字里。

### 7.2 `DocumentSelectApi`

最终不要继续使用现在这种扁平命名：

- `recordIds`
- `record`
- `fieldIds`
- `field`
- `viewIds`
- `view`

推荐改成分组结构：

```ts
interface DocumentSelectApi {
  document: ReadStore<DataDoc>
  records: {
    ids: ReadStore<readonly RecordId[]>
    all: ReadStore<readonly DataRecord[]>
    byId: KeyedReadStore<RecordId, DataRecord | undefined>
  }
  fields: {
    ids: ReadStore<readonly CustomFieldId[]>
    all: ReadStore<readonly CustomField[]>
    byId: KeyedReadStore<CustomFieldId, CustomField | undefined>
  }
  views: {
    ids: ReadStore<readonly ViewId[]>
    all: ReadStore<readonly View[]>
    byId: KeyedReadStore<ViewId, View | undefined>
  }
}
```

这样有三个好处：

- 名称对称
- 层级稳定
- 更容易扩展 entity 类别

### 7.3 `ActiveViewApi`

最终推荐形态：

```ts
interface ActiveViewApi {
  id: ReadStore<ViewId | undefined>
  config: ReadStore<View | undefined>
  state: ReadStore<ViewState | undefined>
  select: <T>(selector: (state: ViewState | undefined) => T, isEqual?: Equality<T>) => ReadStore<T>
  read: ActiveViewReadApi

  query: ActiveQueryCommands
  display: ActiveDisplayCommands
  sections: ActiveSectionCommands
  items: ActiveItemsCommands
  cells: ActiveCellsCommands
  table: ActiveTableCommands
  gallery: ActiveGalleryCommands
  kanban: ActiveKanbanCommands
}
```

关键变化：

- `config` 明确表示持久化 view 配置
- `state` 明确表示 active runtime snapshot
- query 相关命令收口到 `query`
- 保留 `read` 作为同步 helper，避免与 `select` 混淆

## 8. 读写路径的最终形态

### 8.1 读路径

最终读路径应该非常明确：

```text
RuntimeStore
  -> runtime/selectors/*
  -> api/select 或 active/select
```

同步读取路径也应该非常明确：

```text
DataDoc
  -> document/*

active runtime snapshot
  -> active/read.ts
```

这里最重要的约束是：

- reactive 读取走 `select`
- 同步读取走 `read`
- 两者不能再用同一个 `read` 名字混写

### 8.2 写路径

最终写路径应该收口为：

```text
api/*
  -> mutate/planner/*
  -> mutate/commit/*
  -> runtime/store
  -> active/index + active/snapshot 重新派生
```

active runtime 更新本质上只是 commit 后的派生刷新，不应该再散落在别的中间主语里。

## 9. 为什么这才是长期最优

这个方案的价值不在于目录更整齐，而在于它解决的是长期演进时最容易失控的那几个问题。

### 9.1 它把“数据来源”与“交付方式”分开了

当前最容易让人混淆的地方，是：

- `DataDoc` 读取
- `ReadStore` selector
- public read facade

三者都被叫成 read。

终态结构里，这三件事被明确拆成：

- `document/` 负责纯数据读取
- `runtime/selectors/` 负责 reactive selector
- `api/` 负责 public 装配

### 9.2 它把 active runtime 变成真正独立的领域

当前 active runtime 逻辑散落在：

- `index/`
- `derive/active/`
- `services/active/base.ts`
- `services/active/read.ts`

终态结构里，这些东西全部收口到 `active/`，于是系统会直接承认一个事实：

- active view runtime 是 engine 的核心领域，不是一些分散 helper 的拼接结果。

### 9.3 它让命名和真实语义一致

当前最典型的语义误导包括：

- `state/read.ts` 其实不是 state
- `read/entities.ts` 其实不只读 document
- `services/` 里其实有 public API 装配
- `view` 其实表示 active view session

终态结构里，这些名字都可以被纠正。

### 9.4 它能显著降低未来继续长歪的概率

只要执行了上面的边界规则，后续再加功能时，工程师会更容易知道新代码应该放哪：

- 纯文档访问进 `document/`
- reactive selector 进 `runtime/selectors/`
- active session 逻辑进 `active/`
- 写路径进 `mutate/`
- 对外接口进 `api/`

这比继续在 `read/`、`services/`、`state/` 里做局部修补稳定得多。

## 10. 最终实施方案

这里给出的不是低风险迁移清单，而是在“允许重构成本、目标是最快到达长期最优终态”的前提下，最合适的一次性实施方案。

### 10.1 实施总原则

- 不保留兼容层
- 不保留双目录双实现
- 不保留新旧命名并存
- 不做“先复制过去再慢慢替换”的长期过渡
- 每一步都以最终边界为准，而不是为了迁移方便暂时制造新中间层

这意味着实施过程虽然可以分阶段提交，但每个阶段都必须朝着同一个最终目录收口，而不是引入新的临时抽象。

### 10.2 第一阶段：先把目录主语改对

第一阶段只做结构切割，不主动改算法行为。

目标：

- 建立 `document/`
- 建立 `runtime/`
- 建立 `active/`
- 建立 `mutate/`
- 建立最终 `api/`

具体动作：

1. 把 `state/store.ts`、`state/history.ts`、`state/performance.ts` 迁移到 `runtime/`
2. 把 `state/select.ts` 拆到 `runtime/selectors/`
3. 把 `state/read.ts` 迁移到 `api/documentSelect.ts`
4. 把 `services/fields.ts`、`records.ts`、`views.ts` 迁移到 `api/`
5. 把 `services/active/index.ts` 的装配职责迁移到 `api/active.ts`
6. 保留原实现逻辑，只改 import 和模块归属

这一步的目标不是简化代码，而是先让目录名与职责主语一致。

### 10.3 第二阶段：拆开 document read 与 runtime select

第二阶段解决当前最容易继续长歪的边界问题。

目标：

- 彻底删除顶层 `read/`
- 彻底消灭一个文件同时处理 `DataDoc` 与 `RuntimeStore` 的情况

具体动作：

1. 删除 `read/entities.ts`
2. 把纯 `DataDoc` 的实体访问拆到 `document/entities.ts`
3. 把 document entity selector 构造拆到 `runtime/selectors/document.ts`
4. 删除 `createWriteRead()`
5. 把 public 的 `DocumentReadApi` 收口成 `DocumentSelectApi`

验收标准：

- `document/` 下不再 import `ReadStore`
- `runtime/selectors/` 下不再 import `DataDoc` helper 以外的 public API
- engine 里不再存在顶层 `read/`

### 10.4 第三阶段：把 `index` 和 `derive/active` 收口成一个 active runtime 子树

这是整个方案里最关键的一步。

目标：

- 不做全面扁平化
- 但把当前两条并列顶层链路收口为同一棵 `active/` 子树

具体动作：

1. 把 `index/*` 整体迁移到 `active/index/*`
2. 把 `derive/active/*` 整体迁移到 `active/snapshot/*`
3. 把当前 `index/runtime.ts` 重命名为 `active/index/runtime.ts`
4. 把当前 `derive/active/runtime.ts` 与 `run.ts` 的总装逻辑收口为 `active/runtime.ts` + `active/snapshot/runtime.ts`
5. 保留 `query`、`sections`、`summary` 这三个 snapshot stage 的目录层级
6. 保留 `records`、`search`、`group`、`sort`、`calculations` 这五个 index stage 的目录层级
7. 删除只有转发作用的薄 `index.ts` 文件和假命名空间

验收标准：

- 顶层不再存在 `index/`
- 顶层不再存在 `derive/active/`
- active runtime 的所有派生逻辑都能从 `active/` 一棵树读全

### 10.5 第四阶段：拆掉 `services/active/base.ts` 上帝对象

当前 active 这层的复杂度，主要是被 `services/active/base.ts` 吞掉了。

目标：

- 去掉万能 `base`
- 建立显式的 active runtime context 和 command 边界

具体动作：

1. 提取 `active/context.ts`
2. 提取 `active/selectors.ts`
3. 保留 `active/read.ts` 作为同步 helper
4. 把 query/display/sections/items/cells/gallery/kanban/table 的行为全部迁移到 `active/commands/*`
5. 让 `api/active.ts` 只做 public API 装配

验收标准：

- 不再存在 `services/active/base.ts`
- `active/context.ts` 不包含具体业务算法
- `active/commands/*` 不构造 `ReadStore`
- `api/active.ts` 不实现核心业务规则

### 10.6 第五阶段：重命名 public API，校正最终语义

目录正确后，应该顺手把 public naming 一次改正。

具体动作：

1. `engine.view` 改成 `engine.active`
2. `engine.read` 改成 `engine.select`
3. `DocumentReadApi` 改成 `DocumentSelectApi`
4. `ViewApi` 改成 `ActiveViewApi`
5. `Store` 改成 `RuntimeStore`
6. `EngineState` 改成 `EngineRuntimeState`

这一步非常重要，因为公开命名会反过来约束后续代码组织。如果 public API 继续沿用旧名字，内部边界很容易再次倒退。

### 10.7 第六阶段：删除旧层与死代码

所有新目录接通之后，不应该长期保留旧层。

必须直接删除：

- 旧 `state/`
- 旧 `read/`
- 旧 `services/`
- 旧 `write/`
- 顶层 `index/`
- 顶层 `derive/active/`
- 未再被消费的 helper
- 仅剩转发作用的 barrel file

验收标准：

- 旧目录彻底消失
- 不再有新代码依赖旧 import path
- 不再有一份逻辑存在两份命名空间

### 10.8 最终 cutover 的验收清单

最终完成时，必须同时满足下面这些条件：

- `engine/` 顶层只剩 `api / document / runtime / active / mutate / contracts`
- 所有 `ReadStore` 工厂都在 `runtime/selectors/` 或 `active/selectors.ts`
- 所有纯同步读取都在 `document/` 或 `active/read.ts`
- 所有 public API 装配都在 `api/`
- 所有 active runtime 派生都在 `active/`
- 所有写入规划与提交都在 `mutate/`
- 不再存在 `services/active/base.ts` 这种上帝对象
- 不再存在 `createWriteRead()` 这种混合 facade
- 不再存在顶层 `read/`、`services/`、`state/`、`write/`

### 10.9 为什么这是“最终实施方案”而不是“迁移建议”

因为这套顺序不是在讨论“怎么最稳”，而是在讨论“怎么最快到达真正稳定的终态”。

如果目标是长期最优，那么真正应该避免的不是一次性大重排，而是下面这类动作：

- 先造一个临时层，准备未来再删
- 先保留旧命名，等大家适应
- 先把文件搬过去，但继续保留旧抽象
- 先把 `index` 和 `derive` 合在语义上，但继续放两个顶层目录

这些做法短期舒服，长期通常会留下新的历史包袱。

所以最终实施方案应该直接面对真实终态：

- 用最终主语改目录
- 用最终边界改文件职责
- 用最终命名改 public API
- 改完立刻删除旧层

## 11. 最终建议

如果目标真的是“一步到位到长期最优”，我的结论非常明确：

- 不要继续修补 `state/read.ts` 和 `read/entities.ts` 的边界。
- 直接删除顶层 `read/`、`services/`、`state/`、`write/` 这四个弱语义入口。
- 直接重组为 `document / runtime / active / mutate / api` 五层结构。
- 顺手把 public API 里的 `view` 改成 `active`，`read` 改成 `select`。

如果只允许保留一个判断标准，那就是：

- 一个模块首先应该回答“它属于哪个稳定领域”，而不是“它是在读、写、服务，还是派生”。

这就是当前这套 engine 长期最优的组织方式。
