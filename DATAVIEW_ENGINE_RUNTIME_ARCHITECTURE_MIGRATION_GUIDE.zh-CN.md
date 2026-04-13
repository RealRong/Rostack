# Dataview Engine Runtime 架构迁移实施手册

## 文档定位

这份文档不是在讨论“理想上应该怎样”，而是在回答下面这个问题：

- 站在当前仓库状态上，如果现在就开始迁移 `dataview/src/engine`，应该按什么顺序、把哪些文件迁到哪里、每一步如何验收，才能直接落到最终目标结构。

它是针对迁移执行的手册。

配套终态说明文档是：

- `DATAVIEW_ENGINE_RUNTIME_ARCHITECTURE_FINAL_PLAN.zh-CN.md`

两者关系如下：

- `FINAL_PLAN` 负责说明终态原则与最终组织方式
- 这份 `MIGRATION_GUIDE` 负责说明如何从当前代码直接迁过去

如果两份文档有细节差异，以这份文档的“可执行性”优先，但不允许违背 `FINAL_PLAN` 的核心边界：

- `document / runtime / active / mutate / api` 五层主语
- 不做错误的全面扁平化
- 不保留旧的弱语义顶层目录作为长期兼容层

## 1. 迁移总策略

### 1.1 核心原则

- 先改目录主语，再改内部职责
- 先让依赖方向正确，再做命名收口
- 先把 active runtime 收成一棵树，再拆掉旧层
- 每个阶段结束都必须能 `typecheck`
- 结构迁移阶段尽量不混入行为改动

### 1.2 明确不做的事

- 不做“先复制一份新目录，旧目录继续活着很久”的双轨迁移
- 不做“所有文件一次性打平”的目录扁平化
- 不做“边迁移边顺手重写算法”的混合大手术
- 不做“为了省事保留旧命名”的长期妥协

### 1.3 建议执行方式

建议按阶段提交，每个阶段都保持仓库可编译。

推荐采用下面的节奏：

1. 建目标目录与迁移骨架
2. 迁移 `runtime` 与 `api`
3. 拆 `document read` 与 `runtime select`
4. 收口 `active/index` 与 `active/snapshot`
5. 拆 active command/context
6. 收口 `mutate` 与校验
7. 完成 public rename 和旧层删除

## 2. 最终目标目录

这份迁移手册采用的最终目录，比终态原则文档更适合直接落地，因为它补齐了迁移时确实需要的几个文件。

### 2.1 顶层目录

```text
dataview/src/engine/
  index.ts
  api/
  document/
  runtime/
  active/
  mutate/
  contracts/
```

说明：

- 顶层 `index.ts` 保留，作为 package entry
- 顶层只保留一个入口文件，不保留旧式 `index.ts` barrel 体系扩散

### 2.2 最终文件树

```text
dataview/src/engine/
  index.ts

  api/
    createEngine.ts
    engine.ts
    active.ts
    fields.ts
    records.ts
    views.ts
    documentSelect.ts

  document/
    activeView.ts
    entities.ts
    fieldLookup.ts
    fields.ts
    records.ts
    views.ts

  runtime/
    state.ts
    store.ts
    history.ts
    performance.ts
    clock.ts
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
      sync.ts
      types.ts
      aggregate.ts
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
      summary.ts
      gallery.ts
      kanban.ts
      table.ts

  mutate/
    issues.ts
    validate/
      entity.ts
      field.ts
    planner/
      index.ts
      shared.ts
      records.ts
      fields.ts
      views.ts
    commit/
      runtime.ts
      trace.ts
    entityId.ts

  contracts/
    public.ts
    internal.ts
```

### 2.3 这份目标目录的补充说明

相比前一份终态文档，这里有 4 个为了便于直接迁移而明确落地的点：

- 保留顶层 `index.ts`，不改 `dataview/package.json` 的导出入口
- 新增 `runtime/clock.ts`，接管当前 `perf/shared.ts`
- 保留 `active/commands/summary.ts`，不在本次迁移里强制把 `summary` namespace 改成 `calc`
- 保留 `mutate/validate/` 子目录，而不是在执行时过度压平

## 3. 迁移前准备

开始动代码前，先做下面这些事。

### 3.1 先跑基线命令

在仓库根目录执行：

```bash
pnpm --dir dataview typecheck
pnpm --dir dataview test
```

如果要在 workspace 级别再确认一次，可以额外执行：

```bash
pnpm typecheck:dataview
pnpm test:dataview
```

### 3.2 记录基线

建议在迁移分支开始前记录：

- `pnpm --dir dataview typecheck` 是否通过
- `pnpm --dir dataview test` 是否通过
- `dataview/src/engine` 当前文件树

### 3.3 迁移期间的验证节奏

建议每个阶段结束至少执行一次：

```bash
pnpm --dir dataview typecheck
```

建议在第 3、5、7 阶段结束执行：

```bash
pnpm --dir dataview test
```

## 4. 当前文件到最终文件的迁移映射

这部分是执行迁移时最应该直接照着看的内容。

说明：

- `保留`：文件继续存在，但内部实现会重写
- `移动`：直接迁移到新位置
- `拆分`：一个文件拆成多个文件
- `合并`：多个文件合并到一个文件
- `删除`：迁移完成后彻底移除

### 4.1 顶层入口与 API

| 当前文件 | 最终文件 | 动作 | 说明 |
| --- | --- | --- | --- |
| `dataview/src/engine/index.ts` | `dataview/src/engine/index.ts` | 保留 | 改成只 re-export `api/engine.ts` 和必要 public type/helper |
| `dataview/src/engine/api/createEngine.ts` | `dataview/src/engine/api/createEngine.ts` | 保留 | 重写 imports，接入新目录结构与最终 public surface |
| `dataview/src/engine/api/index.ts` | `dataview/src/engine/api/engine.ts` | 移动并重写 | 原 `api/index.ts` 删除，改由 `api/engine.ts` 作为 API 总入口 |

### 4.2 Contracts

| 当前文件 | 最终文件 | 动作 | 说明 |
| --- | --- | --- | --- |
| `dataview/src/engine/contracts/public.ts` | `dataview/src/engine/contracts/public.ts` | 保留 | 最后阶段完成 `read -> select`、`view -> active` 等命名收口 |
| `dataview/src/engine/contracts/internal.ts` | `dataview/src/engine/contracts/internal.ts` | 保留 | 跟随 runtime/active 重命名内部 state 类型 |

### 4.3 Perf

| 当前文件 | 最终文件 | 动作 | 说明 |
| --- | --- | --- | --- |
| `dataview/src/engine/perf/shared.ts` | `dataview/src/engine/runtime/clock.ts` | 移动 | 无状态计时 helper 不应独立成顶层 `perf/` |

### 4.4 State

| 当前文件 | 最终文件 | 动作 | 说明 |
| --- | --- | --- | --- |
| `dataview/src/engine/state/store.ts` | `dataview/src/engine/runtime/state.ts` + `dataview/src/engine/runtime/store.ts` | 拆分 | 类型进 `state.ts`，store factory 进 `store.ts` |
| `dataview/src/engine/state/history.ts` | `dataview/src/engine/runtime/history.ts` | 移动 | 保持行为不变，先改归属 |
| `dataview/src/engine/state/performance.ts` | `dataview/src/engine/runtime/performance.ts` | 移动 | 保持行为不变，先改归属 |
| `dataview/src/engine/state/select.ts` | `dataview/src/engine/runtime/selectors/core.ts` + `dataview/src/engine/runtime/selectors/document.ts` + `dataview/src/engine/runtime/selectors/active.ts` | 拆分 | 通用 selector、document selector、active selector 分开 |
| `dataview/src/engine/state/read.ts` | `dataview/src/engine/api/documentSelect.ts` | 移动并重命名 | `DocumentReadApi` 收口为 `DocumentSelectApi` |

### 4.5 Read

| 当前文件 | 最终文件 | 动作 | 说明 |
| --- | --- | --- | --- |
| `dataview/src/engine/read/entities.ts` | `dataview/src/engine/document/entities.ts` + `dataview/src/engine/runtime/selectors/document.ts` | 拆分 | 纯 `DataDoc` 读取与 `ReadStore` selector 必须分开 |

额外要求：

- 删除 `createWriteRead()`
- 删除顶层 `read/` 目录

### 4.6 Document Helpers

这部分当前并不存在为独立目录，迁移时需要从已有逻辑中抽出。

| 来源 | 最终文件 | 动作 | 说明 |
| --- | --- | --- | --- |
| `read/entities.ts` 中的 document entity 逻辑 | `dataview/src/engine/document/entities.ts` | 新建 | 放 records/fields/views 的纯快照 getter |
| `services/active/base.ts` 中 `getDocumentFieldById` 等聚合读逻辑 | `dataview/src/engine/document/fieldLookup.ts` | 新建 | 专门承接文档级 field lookup helper |
| 当前对 active view 的 document helper 访问 | `dataview/src/engine/document/activeView.ts` | 新建 | 承接 active view document 层读取 |
| 若现有逻辑需要按主题拆分 | `dataview/src/engine/document/records.ts` / `fields.ts` / `views.ts` | 新建 | 只放纯 document helper，不放 selector |

### 4.7 Public Services

| 当前文件 | 最终文件 | 动作 | 说明 |
| --- | --- | --- | --- |
| `dataview/src/engine/services/fields.ts` | `dataview/src/engine/api/fields.ts` | 移动 | 本质是 public adapter，不是 service layer |
| `dataview/src/engine/services/records.ts` | `dataview/src/engine/api/records.ts` | 移动 | 同上 |
| `dataview/src/engine/services/views.ts` | `dataview/src/engine/api/views.ts` | 移动 | 同上 |
| `dataview/src/engine/services/index.ts` | 删除 | 删除 | 不再保留顶层 `services/` barrel |

### 4.8 Active API 与 Commands

| 当前文件 | 最终文件 | 动作 | 说明 |
| --- | --- | --- | --- |
| `dataview/src/engine/services/active/index.ts` | `dataview/src/engine/api/active.ts` | 移动并重写 | 只做 public active API 装配 |
| `dataview/src/engine/services/active/base.ts` | `dataview/src/engine/active/context.ts` + `dataview/src/engine/active/selectors.ts` | 拆分 | 去掉上帝对象 |
| `dataview/src/engine/services/active/read.ts` | `dataview/src/engine/active/read.ts` | 移动 | 保留为同步 active read helper |
| `dataview/src/engine/services/active/query.ts` | `dataview/src/engine/active/commands/query.ts` | 移动 | 只保留 query 命令 |
| `dataview/src/engine/services/active/display.ts` | `dataview/src/engine/active/commands/display.ts` | 移动 | 同上 |
| `dataview/src/engine/services/active/sections.ts` | `dataview/src/engine/active/commands/sections.ts` | 移动 | 同上 |
| `dataview/src/engine/services/active/items.ts` | `dataview/src/engine/active/commands/items.ts` | 移动 | 同上 |
| `dataview/src/engine/services/active/cells.ts` | `dataview/src/engine/active/commands/cells.ts` | 移动 | 同上 |
| `dataview/src/engine/services/active/summary.ts` | `dataview/src/engine/active/commands/summary.ts` | 移动 | 本次迁移保留 `summary` namespace |
| `dataview/src/engine/services/active/gallery.ts` | `dataview/src/engine/active/commands/gallery.ts` | 移动 | 同上 |
| `dataview/src/engine/services/active/kanban.ts` | `dataview/src/engine/active/commands/kanban.ts` | 移动 | 同上 |
| `dataview/src/engine/services/active/table.ts` | `dataview/src/engine/active/commands/table.ts` | 移动 | 同上 |

### 4.9 Active Index

| 当前文件 | 最终文件 | 动作 | 说明 |
| --- | --- | --- | --- |
| `dataview/src/engine/index.ts` | 删除 | 删除 | 顶层 `index` barrel 删除 |
| `dataview/src/engine/index/runtime.ts` | `dataview/src/engine/active/index/runtime.ts` | 移动 | 成为 active index 总调度器 |
| `dataview/src/engine/index/demand.ts` | `dataview/src/engine/active/index/demand.ts` | 移动 | 成为 active index demand 归一化逻辑 |
| `dataview/src/engine/index/trace.ts` | `dataview/src/engine/active/index/trace.ts` | 移动 | 同上 |
| `dataview/src/engine/index/shared.ts` | `dataview/src/engine/active/index/shared.ts` | 移动 | 同上 |
| `dataview/src/engine/index/runtime/sync.ts` | `dataview/src/engine/active/index/sync.ts` | 移动 | 保留 field sync helper |
| `dataview/src/engine/index/types.ts` | `dataview/src/engine/active/index/types.ts` | 移动 | index state types 进入 active 子树 |
| `dataview/src/engine/index/aggregate.ts` | `dataview/src/engine/active/index/aggregate.ts` | 移动 | calculations 依赖的聚合工具保持独立 |
| `dataview/src/engine/index/calculations.ts` | `dataview/src/engine/active/index/calculations.ts` | 移动 | 同上 |
| `dataview/src/engine/index/records/index.ts` | `dataview/src/engine/active/index/records.ts` | 移动并压平 | `records/index.ts` 不值得保留子目录 |
| `dataview/src/engine/index/search/index.ts` | `dataview/src/engine/active/index/search.ts` | 移动并压平 | 同上 |
| `dataview/src/engine/index/sort/state.ts` | `dataview/src/engine/active/index/sort.ts` | 移动并压平 | `sort/index.ts` 只是 barrel，直接删除 |
| `dataview/src/engine/index/sort/index.ts` | 删除 | 删除 | 薄 barrel 删除 |
| `dataview/src/engine/index/group/state.ts` | `dataview/src/engine/active/index/group/runtime.ts` | 移动并重命名 | group index runtime |
| `dataview/src/engine/index/group/demand.ts` | `dataview/src/engine/active/index/group/demand.ts` | 移动 | 保留子目录 |
| `dataview/src/engine/index/group/bucket.ts` | `dataview/src/engine/active/index/group/bucket.ts` | 移动 | 保留子目录 |
| `dataview/src/engine/index/group/index.ts` | 删除 | 删除 | 薄 barrel 删除 |

### 4.10 Active Snapshot

| 当前文件 | 最终文件 | 动作 | 说明 |
| --- | --- | --- | --- |
| `dataview/src/engine/derive/active/runtime.ts` | `dataview/src/engine/active/runtime.ts` | 移动并重写 | active runtime 总入口 |
| `dataview/src/engine/derive/active/demand.ts` | `dataview/src/engine/active/demand.ts` | 移动 | active view -> index demand 解析 |
| `dataview/src/engine/derive/active/run.ts` | `dataview/src/engine/active/snapshot/runtime.ts` | 移动并重命名 | snapshot stage orchestrator |
| `dataview/src/engine/derive/active/snapshot.ts` | `dataview/src/engine/active/snapshot/base.ts` | 移动并重命名 | 承接 view/query/fields projection 构造 |
| `dataview/src/engine/derive/active/equality.ts` | `dataview/src/engine/active/snapshot/equality.ts` | 移动 | 同上 |
| `dataview/src/engine/derive/active/reuse.ts` | `dataview/src/engine/active/snapshot/reuse.ts` | 移动 | 同上 |
| `dataview/src/engine/derive/active/trace.ts` | `dataview/src/engine/active/snapshot/trace.ts` | 移动 | 同上 |
| `dataview/src/engine/derive/active/models.ts` | 删除 | 删除 | 纯 type re-export，直接改 imports 到 `contracts/public.ts` |
| `dataview/src/engine/derive/active/projections.ts` | 删除 | 删除 | 纯 type re-export，直接改 imports 到 `contracts/public.ts` |
| `dataview/src/engine/derive/active/records.ts` | 合并到 `dataview/src/engine/active/snapshot/query/runtime.ts` | 合并 | `publishViewRecords()` 跟 query stage 同属一段逻辑 |
| `dataview/src/engine/derive/active/collections.ts` | `dataview/src/engine/active/snapshot/sections/publish.ts` | 移动并重命名 | section/item publish 逻辑并入 sections publish |
| `dataview/src/engine/derive/active/publishSummary.ts` | `dataview/src/engine/active/snapshot/summary/publish.ts` | 移动并重命名 | 同上 |
| `dataview/src/engine/derive/active/query/index.ts` | `dataview/src/engine/active/snapshot/query/runtime.ts` | 移动并重命名 | query stage runtime |
| `dataview/src/engine/derive/active/query/derive.ts` | `dataview/src/engine/active/snapshot/query/derive.ts` | 移动 | 同上 |
| `dataview/src/engine/derive/active/sections/index.ts` | `dataview/src/engine/active/snapshot/sections/runtime.ts` | 移动并重命名 | sections stage runtime |
| `dataview/src/engine/derive/active/sections/derive.ts` | `dataview/src/engine/active/snapshot/sections/derive.ts` | 移动 | 同上 |
| `dataview/src/engine/derive/active/sections/shape.ts` | 合并到 `dataview/src/engine/active/snapshot/sections/derive.ts` | 合并 | section shape helper 跟 derive 逻辑同属一段 |
| `dataview/src/engine/derive/active/sections/sync.ts` | `dataview/src/engine/active/snapshot/sections/sync.ts` | 移动 | 同上 |
| `dataview/src/engine/derive/active/summary/index.ts` | `dataview/src/engine/active/snapshot/summary/runtime.ts` | 移动并重命名 | summary stage runtime |
| `dataview/src/engine/derive/active/summary/compute.ts` | `dataview/src/engine/active/snapshot/summary/compute.ts` | 移动 | 同上 |
| `dataview/src/engine/derive/active/summary/sync.ts` | `dataview/src/engine/active/snapshot/summary/sync.ts` | 移动 | 同上 |
| `dataview/src/engine/derive/active/summary/state.ts` | 合并到 `dataview/src/engine/active/snapshot/summary/compute.ts` 或 `sync.ts` | 合并 | 依据最终函数归属决定，不再单独保留状态辅助文件 |

### 4.11 Validation 与 Mutate

| 当前文件 | 最终文件 | 动作 | 说明 |
| --- | --- | --- | --- |
| `dataview/src/engine/validation/entity.ts` | `dataview/src/engine/mutate/validate/entity.ts` | 移动 | 校验属于 mutate 体系 |
| `dataview/src/engine/validation/field.ts` | `dataview/src/engine/mutate/validate/field.ts` | 移动 | 同上 |
| `dataview/src/engine/write/issues.ts` | `dataview/src/engine/mutate/issues.ts` | 移动 | issues 供 planner/validate/public contracts 共用 |
| `dataview/src/engine/write/shared.ts` | `dataview/src/engine/mutate/planner/shared.ts` | 移动 | planner domain helper |
| `dataview/src/engine/write/entityId.ts` | `dataview/src/engine/mutate/entityId.ts` | 移动 | 同上 |
| `dataview/src/engine/write/resolve.ts` | `dataview/src/engine/mutate/planner/index.ts` | 移动并重写 | batch planner 总入口 |
| `dataview/src/engine/write/plan.ts` | `dataview/src/engine/mutate/planner/records.ts` + `dataview/src/engine/mutate/planner/fields.ts` + `dataview/src/engine/mutate/planner/views.ts` + `dataview/src/engine/mutate/planner/shared.ts` | 拆分 | 先整体迁入 `planner/index.ts` 也可，但最终必须按领域拆开 |
| `dataview/src/engine/write/commit.ts` | `dataview/src/engine/mutate/commit/runtime.ts` | 移动并重命名 | commit runtime |
| `dataview/src/engine/write/trace.ts` | `dataview/src/engine/mutate/commit/trace.ts` | 移动 | 同上 |

## 5. 实施阶段

下面是推荐的实际执行顺序。按这个顺序做，依赖方向最顺，返工最少。

## 5.1 Phase 0：建立目标骨架

目标：

- 先创建最终要用到的目录
- 不改业务行为
- 为后续 `git mv` 和 import 重写提供落点

执行内容：

1. 创建目标目录树
2. 新建空的 `api/engine.ts`
3. 新建空的 `runtime/clock.ts`
4. 新建 `active/index/`、`active/snapshot/`、`active/commands/`
5. 新建 `mutate/validate/`、`mutate/planner/`、`mutate/commit/`

完成标准：

- 目录树建立完成
- 还没有开始替换核心逻辑

验证：

```bash
pnpm --dir dataview typecheck
```

## 5.2 Phase 1：先迁 `runtime` 和 package entry

目标：

- 先把 root runtime 基础设施挪到正确主语下
- 尽量不碰 active runtime 算法

执行内容：

1. 迁移 `state/store.ts` 到 `runtime/state.ts` + `runtime/store.ts`
2. 迁移 `state/history.ts` 到 `runtime/history.ts`
3. 迁移 `state/performance.ts` 到 `runtime/performance.ts`
4. 迁移 `perf/shared.ts` 到 `runtime/clock.ts`
5. 改写所有对 `state/*` 和 `perf/shared` 的 imports
6. 改写顶层 `engine/index.ts`，让它只 re-export `api/engine.ts` 和必要 helper

这一步先不做 public rename。

完成标准：

- 新的 `runtime/` 成为唯一 runtime 基础设施位置
- 老的 `state/` 目录只剩尚未迁走的 `select.ts`、`read.ts`

验证：

```bash
pnpm --dir dataview typecheck
pnpm --dir dataview test
```

## 5.3 Phase 2：拆开 document read 与 runtime select

目标：

- 解决当前最核心的边界混乱

执行内容：

1. 从 `read/entities.ts` 抽出纯 `DataDoc` getter 到 `document/entities.ts`
2. 从 `state/select.ts` 抽出通用 selector 到 `runtime/selectors/core.ts`
3. 抽出 document entity selector 到 `runtime/selectors/document.ts`
4. 如果需要，先在 `runtime/selectors/active.ts` 放最小 active selector helper
5. 把 `state/read.ts` 迁移到 `api/documentSelect.ts`
6. 删除 `createWriteRead()`
7. 删除顶层 `read/` 目录

关键约束：

- 从这一阶段结束开始，任何文件都不能同时处理 `DataDoc` getter 和 `ReadStore` selector

完成标准：

- `document/` 不 import `ReadStore`
- `runtime/selectors/` 不暴露 public API
- `read/` 目录彻底消失

验证：

```bash
pnpm --dir dataview typecheck
pnpm --dir dataview test
```

## 5.4 Phase 3：迁 public adapter 到 `api/`

目标：

- 去掉顶层 `services/`

执行内容：

1. `services/fields.ts` -> `api/fields.ts`
2. `services/records.ts` -> `api/records.ts`
3. `services/views.ts` -> `api/views.ts`
4. `services/active/index.ts` -> `api/active.ts`
5. `services/index.ts` 删除

这一步先保持 public shape 基本不动，只改目录和 imports。

完成标准：

- `api/` 成为唯一 public adapter 层
- 顶层 `services/` 只剩 active 子目录待拆

验证：

```bash
pnpm --dir dataview typecheck
```

## 5.5 Phase 4：把 `index` 和 `derive/active` 收成一棵 `active/` 子树

这是整个迁移里最关键的一步。

目标：

- 不是扁平化
- 而是把同一条 active runtime 派生链放到同一棵目录树

执行内容：

1. 把 `index/*` 全部迁到 `active/index/*`
2. 把 `derive/active/*` 全部迁到 `active/snapshot/*`
3. 把 `derive/active/runtime.ts` 迁到 `active/runtime.ts`
4. 把 `derive/active/run.ts` 迁到 `active/snapshot/runtime.ts`
5. 删除 `models.ts`、`projections.ts` 这种纯 re-export 文件
6. 删除 `index.ts`、`group/index.ts`、`sort/index.ts` 这种薄 barrel
7. 合并 `sections/shape.ts` 到 `sections/derive.ts`
8. 合并 `derive/active/records.ts` 到 `snapshot/query/runtime.ts`
9. 合并 `publishSummary.ts` 到 `snapshot/summary/publish.ts`

关键约束：

- 保留 `active/index/` 分层
- 保留 `active/snapshot/query`、`sections`、`summary` 分层
- 不允许把这些 stage 一把打平到 `active/`

完成标准：

- 顶层 `index/` 目录消失
- 顶层 `derive/active/` 目录消失
- active runtime 的派生逻辑都能从 `active/` 一棵树读全

验证：

```bash
pnpm --dir dataview typecheck
pnpm --dir dataview test
```

## 5.6 Phase 5：拆掉 `services/active/base.ts`

目标：

- 去掉 active runtime 的上帝对象

执行内容：

1. 从 `services/active/base.ts` 提取 `active/context.ts`
2. 提取 `active/selectors.ts`
3. 迁移 `services/active/read.ts` 到 `active/read.ts`
4. 把所有 active command 文件迁到 `active/commands/*`
5. 让 `api/active.ts` 只做装配，不做规则实现
6. 删除整个 `services/active/`

完成标准：

- `active/context.ts` 只负责聚合依赖与便捷读取
- `active/selectors.ts` 只构造 `ReadStore`
- `active/commands/*` 不再构造 public API
- 顶层 `services/` 完全消失

验证：

```bash
pnpm --dir dataview typecheck
pnpm --dir dataview test
```

## 5.7 Phase 6：收口 `mutate` 与 validation

目标：

- 把写路径完整收进 `mutate/`

执行内容：

1. `write/issues.ts` -> `mutate/issues.ts`
2. `validation/*` -> `mutate/validate/*`
3. `write/shared.ts` -> `mutate/planner/shared.ts`
4. `write/resolve.ts` -> `mutate/planner/index.ts`
5. `write/plan.ts` 先整体迁入 `mutate/planner/index.ts` 或临时 `planner/legacy.ts`
6. 在这一阶段后半段，把 `write/plan.ts` 按 `records / fields / views / shared` 拆开
7. `write/commit.ts` -> `mutate/commit/runtime.ts`
8. `write/trace.ts` -> `mutate/commit/trace.ts`
9. `write/entityId.ts` -> `mutate/entityId.ts`
10. 删除顶层 `write/` 与 `validation/`

说明：

- `write/plan.ts` 很大，这个文件是本次迁移里唯一允许“先整体落位，再二次拆分”的例外
- 但在最终 cutover 前，必须拆开，不能把 `planner/index.ts` 留成新的超大文件

完成标准：

- 顶层 `write/` 与 `validation/` 消失
- 所有写路径 imports 都只指向 `mutate/`

验证：

```bash
pnpm --dir dataview typecheck
pnpm --dir dataview test
```

## 5.8 Phase 7：完成 public naming cutover

目标：

- 让 public API 名字和最终语义一致

执行内容：

1. `engine.view` -> `engine.active`
2. `engine.read` -> `engine.select`
3. `DocumentReadApi` -> `DocumentSelectApi`
4. `ViewApi` -> `ActiveViewApi`
5. `Store` -> `RuntimeStore`
6. `EngineState` -> `EngineRuntimeState`
7. 如果需要，再统一 `api/engine.ts` 和顶层 `index.ts` 的对外导出

注意：

- `summary` namespace 在本次迁移里可以先保留
- 如果要改成 `calc`，单独做一个后续语义重命名，不混进这次结构迁移

完成标准：

- public contracts 命名与目录语义一致
- 对外不再出现 `read` 表示 `ReadStore` 的混用表达

验证：

```bash
pnpm --dir dataview typecheck
pnpm --dir dataview test
pnpm typecheck:dataview
pnpm test:dataview
```

## 6. 推荐提交切分

如果要把这次迁移拆成可审查的提交，我建议按下面方式切。

### 6.1 Commit 1

- 建目录骨架
- 新建空文件
- 不做行为改动

### 6.2 Commit 2

- 迁 `runtime/*`
- 迁 `perf/shared.ts` -> `runtime/clock.ts`
- 改顶层 `index.ts`

### 6.3 Commit 3

- 拆 `read/entities.ts`
- 拆 `state/select.ts`
- 迁 `state/read.ts` -> `api/documentSelect.ts`

### 6.4 Commit 4

- 迁 `services/*` -> `api/*`
- 删除 `services/index.ts`

### 6.5 Commit 5

- 迁 `index/*` -> `active/index/*`
- 迁 `derive/active/*` -> `active/snapshot/*`
- 删除薄 barrel

### 6.6 Commit 6

- 拆 `services/active/base.ts`
- 迁 active command 文件
- 删除 `services/active/`

### 6.7 Commit 7

- 迁 `write/*`、`validation/*` -> `mutate/*`
- 拆 `planner`

### 6.8 Commit 8

- 完成 public rename
- 删除旧目录
- 处理死代码和最后的 import 清理

## 7. 迁移过程中的硬性规则

迁移时必须遵守下面这些规则，否则很容易把旧问题重新搬进新目录。

### 7.1 目录规则

- `document/` 不得 import `ReadStore`
- `api/` 不得实现核心算法
- `active/commands/` 不得构造 selector
- `runtime/selectors/` 不得依赖 public API types 以外的装配逻辑
- `mutate/` 不得反向依赖 `api/`

### 7.2 文件规则

- 一个文件只能有一个主语
- 一个 factory 不能同时返回同步 getter 和 `ReadStore`
- 一个目录如果只是为了放一个 5 行 `index.ts`，就不应该存在
- 一个目录如果代表真实阶段，就不能为了“更平”而删掉

### 7.3 命名规则

- `select` 只表示 `ReadStore`
- `read` 只表示同步取值
- `runtime` 只表示内存态与派生态，不表示 public API
- `api` 只表示 public surface

## 8. 最终验收标准

迁移完成时，必须同时满足下面这些条件。

### 8.1 结构验收

- `engine/` 顶层只剩 `index.ts + api + document + runtime + active + mutate + contracts`
- 顶层不再存在 `state/`
- 顶层不再存在 `read/`
- 顶层不再存在 `services/`
- 顶层不再存在 `write/`
- 顶层不再存在 `validation/`
- 顶层不再存在 `index/`
- 顶层不再存在 `derive/active/`

### 8.2 语义验收

- `document/` 只做纯 `DataDoc` 读取
- `runtime/selectors/` 只做 selector
- `active/` 承接全部 active runtime 派生
- `mutate/` 承接全部写路径
- `api/` 只做 public API 装配

### 8.3 命名验收

- public `engine.active` 已替代 `engine.view`
- public `engine.select` 已替代 `engine.read`
- `DocumentSelectApi` 已替代 `DocumentReadApi`
- `RuntimeStore` / `EngineRuntimeState` 命名已经生效

### 8.4 验证验收

必须至少通过：

```bash
pnpm --dir dataview typecheck
pnpm --dir dataview test
pnpm typecheck:dataview
pnpm test:dataview
```

## 9. 最后建议

如果要直接开干，我建议就按下面这条顺序执行，不要再犹豫：

1. 建目标目录骨架
2. 先迁 `runtime`
3. 立刻拆 `read/entities.ts`
4. 然后把 `index + derive/active` 收口到 `active/`
5. 再拆 `services/active/base.ts`
6. 最后收 `mutate` 并做 public rename

真正会把迁移拖复杂的，不是这次重排本身，而是：

- 一边搬目录，一边保留旧层继续活着
- 不肯删薄 barrel
- 不肯拆 `read/entities.ts`
- 不肯把 `index` 和 `derive/active` 合成一棵树

这份文档已经足够作为直接开始迁移的施工手册使用。迁移时按这里的映射表和阶段顺序推进即可。
