# Dataview Core / Engine Delta-First 最终 API 与实施方案

## 1. 结论

`dataview` 现在仍然处于“双层 mutation runtime”状态。

- 第一层是 `@shared/mutation` 的 `MutationEngine`，实际负责 commit、history、subscribe。
- 第二层是 `dataview-core` 自己保留的旧 mutation 语义层，负责 compile scope、手工 reduce、手工 delta key、手工 inverse、手工 trace/impact。

这不是“两套完整 engine”，但已经是“两套 mutation runtime 体系”。`shared` 只接管了外壳，`dataview` 仍然保留了大量旧协议和旧运行时约束。最终态必须删掉这层旧体系，打通：

`intent -> compile -> op -> shared mutation engine -> commit/delta -> dataview-engine`

最终 `dataview-engine` 只吃 `commit` / `MutationDelta`，不再依赖任何 `dataview-core` 的旧 mutation internals。

## 2. 当前问题与证据

### 2.1 旧 mutation reduce 体系仍然存在

`dataview/packages/dataview-core/src/operations/mutation.ts` 仍然在做下面这些事：

- 手工拼 `delta.changes`
- 手工定义 delta key：`record.patch`、`field.schema`、`view.query`、`document.activeView`
- 手工构建 `footprint`
- 手工构建 `history.inverse`
- 手工维护 `recordAspects`、`fieldAspects`、`viewQueryAspects`、`viewLayoutAspects`、`viewCalculationFields`

这说明 dataview 还没有真正把 mutation 语义下沉给 shared。

### 2.2 旧 compile scope 体系仍然存在

下面这些文件组成了一整套 dataview 自己的 compile runtime：

- `dataview/packages/dataview-core/src/operations/compile.ts`
- `dataview/packages/dataview-core/src/operations/internal/compile/scope.ts`
- `dataview/packages/dataview-core/src/operations/internal/compile/records.ts`
- `dataview/packages/dataview-core/src/operations/internal/compile/fields.ts`
- `dataview/packages/dataview-core/src/operations/internal/compile/views.ts`

`createCompileScope` 把 `reader`、`emit`、`issue`、`require`、`resolveTarget` 再包装一遍，等于在 shared compile handler 之上又造了一层 dataview 自己的 helper runtime。

### 2.3 trace / impact 旧协议仍然存在

下面这些文件仍然保留 dataview 专属的 mutation impact 协议：

- `dataview/packages/dataview-core/src/operations/trace.ts`
- `dataview/packages/dataview-core/src/operations/internal/impact.ts`
- `dataview/packages/dataview-core/src/types/commit.ts`
- `dataview/packages/dataview-core/src/operations/internal/context.ts`

这一层并不是最终需要保留的共享基础设施，而是旧 mutation 体系遗留下来的 dataview 私有协议。

### 2.4 dataview-engine 仍然被旧 delta 语义绑住

下面这些文件虽然已经接 `MutationDelta`，但实际读的是旧 dataview key / payload 语义：

- `dataview/packages/dataview-engine/src/createEngine.ts`
- `dataview/packages/dataview-engine/src/active/projection/dirty.ts`
- `dataview/packages/dataview-engine/src/runtime/performance.ts`
- `dataview/packages/dataview-engine/src/mutation/projection/trace.ts`

具体问题：

- 读取 `record.patch` 而不是 spec 派生的 `record.title` / `record.type` / `record.meta`
- 读取 `document.activeView` 而不是 `document.activeViewId`
- 依赖 `fieldAspects` / `viewQueryAspects` / `viewCalculationFields` 这类 dataview 私有 payload
- `createEngine.ts` 仍然通过 `operations` 聚合出口取 `entities/custom/compile`

### 2.5 entity spec 与实际 delta 语义已经分裂

`dataview/packages/dataview-core/src/operations/entities.ts` 已经存在实体 spec，但它与真实 invalidate 语义并不一致。

当前 `view` 的定义存在明显偏差：

- 现在 `change.query` 包含 `name`、`type`，这不符合 query 语义
- 现在 `change.layout` 包含 `group`、`orders`，这与 engine 对 query/membership 的脏判断并不一致
- 当前 engine 真正关心的是：
  - `query`: `search` / `filter` / `sort` / `group` / `orders`
  - `layout`: `name` / `type` / `display` / `options`
  - `calc`: `calc`

这说明目前 spec 只是“存在”，还没有成为真实的统一语义源。

## 3. 最终公开 API

最终 `dataview-core` 只对外暴露五类内容：

```ts
export { intent } from '@dataview/core/intent'
export { op } from '@dataview/core/op'
export { entities } from '@dataview/core/entities'
export { custom } from '@dataview/core/custom'
export { compile } from '@dataview/core/compile'
```

最终必须删除下面这些对外出口：

- `operations` 聚合命名空间
- `operations.plan`
- `operations.trace`
- `operations.mutation`
- `operations.compile` 旧包装层
- `types/commit.ts` 这套 mutation impact 类型

最终边界非常明确：

- `intent` 是用户语义输入
- `compile` 是 intent 到 op 的唯一入口
- `op` 是 mutation engine 执行的标准 operation 协议
- `entities` 是 delta 语义和 canonical entity mutation 的唯一 spec 源
- `custom` 是少量保留的领域 reducer

## 4. 最终 op 设计

### 4.1 原则

- 简单的实体 create / patch / delete 使用 canonical entity op
- 跨实体联动、批量值写入、级联修复、纯信号型更新使用 custom op
- 不为了抽象而把复杂领域操作强行拍平成很多无语义的小 op
- history 基于 op 运行，custom op 的 inverse 也是 op，不是 document diff

### 4.2 最终 canonical op

最终 dataview 的 canonical op 只保留这些：

- `document.patch`
- `record.create`
- `record.patch`
- `record.delete`
- `field.create`
- `field.patch`
- `field.delete`
- `view.create`
- `view.patch`
- `view.delete`

说明：

- `document.patch` 只负责 `schemaVersion` / `activeViewId` / `meta`
- `record.patch` 不允许写 `values`
- `field.patch` 统一承接 `field.patch` / `field.replace` / `field.setKind` / `field.option.*`
- `view.patch` 统一承接 `view.patch`

### 4.3 最终 custom op

最终 dataview 保留下面这些 custom op：

| op | 保留原因 |
| --- | --- |
| `record.remove` | 删除 record 的同时修复所有 view 的 `orders`，需要成组 inverse |
| `record.values.writeMany` | 批量写字段值，本质是领域级 values mutation，不应暴露成 patch 细节 |
| `record.values.restoreMany` | 仅作为 `record.values.writeMany` 的 inverse op 使用 |
| `field.remove` | 删除 field 时要级联清理 records 的对应值并修复 views |
| `view.open` | 这是文档级 active view 语义，不是 view entity patch 本身 |
| `view.remove` | 删除 view 时需要同时修复 `document.activeViewId` |
| `external.version.bump` | 这是纯外部版本信号，不属于 document/entity patch |

最终 intent 到 op 的收口规则如下：

| intent | 最终 op |
| --- | --- |
| `record.create` | `record.create` |
| `record.patch` | `record.patch` |
| `record.remove` | `record.remove` |
| `record.fields.writeMany` | `record.values.writeMany` |
| `field.create` | `field.create` |
| `field.patch` | `field.patch` |
| `field.replace` | `field.patch` |
| `field.setKind` | `field.patch` |
| `field.duplicate` | `field.create` |
| `field.option.create` | `field.patch` |
| `field.option.setOrder` | `field.patch` |
| `field.option.patch` | `field.patch` |
| `field.option.remove` | `field.patch` |
| `field.remove` | `field.remove` |
| `view.create` | `view.create`，必要时追加 `document.patch` |
| `view.patch` | `view.patch` |
| `view.open` | `view.open` |
| `view.remove` | `view.remove` |
| `external.version.bump` | `external.version.bump` |

## 5. 最终 entities 与 delta 语义

### 5.1 总原则

- delta key 只允许来自 `entities` spec 和少量 custom signal
- 不允许 dataview 再手工定义一套额外的 mutation payload 协议
- projection / performance / engine dirty 判断都直接基于 `MutationDelta`
- 不做 `MutationDelta -> BaseImpact` 之类的二次转译层

### 5.2 最终 entities change bucket

最终必须把 dataview 实体变更语义收敛成下面这组 key：

| entity | key |
| --- | --- |
| `document` | `document.schemaVersion` |
| `document` | `document.activeViewId` |
| `document` | `document.meta` |
| `record` | `record.title` |
| `record` | `record.type` |
| `record` | `record.values` |
| `record` | `record.meta` |
| `field` | `field.schema` |
| `field` | `field.meta` |
| `view` | `view.query` |
| `view` | `view.layout` |
| `view` | `view.calc` |

canonical create / delete 仍然保留标准 key：

- `record.create`
- `record.delete`
- `field.create`
- `field.delete`
- `view.create`
- `view.delete`

custom signal 只保留一个：

- `external.version`

### 5.3 必须删除的旧 delta key / payload

下面这些都必须删除：

- `record.patch`
- `document.activeView`
- `recordAspects`
- `fieldAspects`
- `viewQueryAspects`
- `viewLayoutAspects`
- `viewCalculationFields`
- `activeView.before/after` 这类 dataview 私有 payload 包装

### 5.4 delta payload 规则

最终 `MutationDelta` 只保留 shared 的标准结构：

- create / delete bucket 用 `ids`
- patch bucket 用 `paths`
- reset 用 `reset`

不再额外定义 dataview 私有字段。

这意味着：

- `record.values` 通过 path 直接表达具体 record / field 的变化
- `field.schema` 通过 path 表达具体 schema 成员变化
- `view.query` 通过 path 表达 `search` / `filter` / `sort` / `group` / `orders` 的变化
- `view.layout` 通过 path 表达 `name` / `type` / `display` / `options` 的变化
- `view.calc` 通过 path 表达具体 calculation field 的变化
- `document.activeViewId` 直接通过 spec bucket 表达，不再包装成专门 payload

### 5.5 最终 view spec 必须修正

最终 `view` 的 change spec 必须改成下面这套语义：

```ts
view: {
  kind: 'table',
  members: {
    name: 'field',
    type: 'field',
    search: 'record',
    filter: 'record',
    sort: 'record',
    calc: 'record',
    display: 'record',
    orders: 'field',
    group: 'record',
    options: 'record'
  },
  change: {
    query: ['search.**', 'filter.**', 'sort.**', 'group.**', 'orders'],
    layout: ['name', 'type', 'display.**', 'options.**'],
    calc: ['calc.**']
  }
}
```

这是 engine 当前真实 invalidate 语义对应的最终定义。

## 6. 最终 inverse 规则

最终 inverse 规则只有两条：

- canonical entity op 的 inverse 由 shared mutation engine 自动生成
- custom op 的 inverse 由 custom reducer 直接返回 op 列表

history 最终只存 inverse op，不存 dataview 私有 impact/diff 协议。

`record.values.restoreMany` 保留，但它是 inverse op，不是用户 intent 层 API。

这轮必须彻底删除下面这种做法：

- reducer 手工拼一套 dataview impact
- history 依赖 impact 反推 inverse
- engine 再把 impact 转成 delta 或 trace

最终顺序只能是：

`reduce -> next document -> inverse op -> shared delta -> commit`

## 7. compile 最终设计

### 7.1 compile 只保留 handler table

最终 compile 只保留 shared-native handler table：

```ts
export const compile = {
  handlers: {
    'record.create': ({ intent, document, emit, issue, output }) => {},
    'record.patch': ({ intent, document, emit, issue, output }) => {},
    ...
  }
} as const
```

### 7.2 必须删除 compile scope runtime

下面这些必须删除：

- `createCompileScope`
- `CompileScope`
- `reader/source/emit/issue/require/resolveTarget` 那套包裹对象
- `operations/compile.ts` 旧入口
- `operations/internal/compile/*` 目录这套 runtime 结构

允许保留的只有纯函数工具：

- 校验函数
- 文档读取函数
- 某类 intent 的 lowering 纯函数

这些函数只接受普通参数，不再依赖 compile scope 对象。

## 8. dataview-engine 最终边界

### 8.1 createEngine 最终依赖

`dataview-engine/src/createEngine.ts` 最终只能依赖：

- `entities`
- `custom`
- `compile`
- `MutationEngine`
- `commit.delta`

不再依赖：

- `operations` 聚合出口
- `dataview trace`
- `commit impact`
- `mutation internals`

### 8.2 projection / dirty / performance 最终输入

下面这些模块最终都只读 `MutationDelta`：

- `active/projection/dirty.ts`
- `active/index/runtime.ts`
- `active/query/stage.ts`
- `active/membership/stage.ts`
- `active/summary/stage.ts`
- `runtime/performance.ts`

所有脏判断都基于最终 spec key 和 path prefix：

- `record.create` / `record.delete`
- `record.values`
- `field.schema`
- `view.query`
- `view.layout`
- `view.calc`
- `document.activeViewId`
- `external.version`

不再读取任何 dataview-core 私有 payload 字段。

### 8.3 trace / performance 的最终位置

trace / performance 是 `dataview-engine` 自己的 runtime 观测能力，不是 `dataview-core` mutation 协议的一部分。

因此：

- `dataview-core` 删除 `operations/trace.ts`
- `dataview-engine` 自己基于 `commit + delta + projection trace` 生成性能 trace
- `runtime/performance.ts` 保留，但只总结标准 delta

## 9. 必须删除的旧文件与旧层

这一轮最终必须删除或重写掉下面这些旧层：

### 9.1 dataview-core

- `src/operations/mutation.ts`
- `src/operations/trace.ts`
- `src/operations/internal/impact.ts`
- `src/operations/internal/context.ts`
- `src/operations/compile.ts`
- `src/operations/internal/compile/scope.ts`
- `src/operations/internal/compile/records.ts`
- `src/operations/internal/compile/fields.ts`
- `src/operations/internal/compile/views.ts`
- `src/types/commit.ts`
- `src/index.ts` 中的 `operations` 聚合导出
- `src/operations/index.ts` 中的 `operations` 聚合命名空间

### 9.2 dataview-engine

- 对 `record.patch` / `document.activeView` / `fieldAspects` / `viewQueryAspects` / `viewCalculationFields` 的依赖
- 对 dataview-core trace / impact 的依赖

## 10. 实施阶段

### Phase 1. 收口 dataview-core 对外 surface

必须完成：

- 新建最终态出口：`intent` / `op` / `entities` / `custom` / `compile`
- 删除 root `operations` 聚合导出
- 删除 `operations/index.ts` 里的 `operations` 命名空间拼装
- `plan` 相关 helper 退出 dataview-core 对外 surface

阶段产物：

- `dataview-core` 对外只剩 `intent`、`op`、`entities`、`custom`、`compile`

### Phase 2. 重写 op 与 entities 语义

必须完成：

- 删除 `document.*` 旧 operation 类型命名
- 建立最终 `DataviewOp` 联合类型
- 修正 `view.query` / `view.layout` / `view.calc` spec
- 删除 `record.patch` 这类非 spec delta bucket
- 明确 custom op 与 canonical op 的最终边界

阶段产物：

- dataview 的 op 语义只剩 canonical entity op + 少量 custom op
- delta key 与 entities spec 一致

### Phase 3. 删除 compile scope 体系

必须完成：

- 删除 `createCompileScope`
- 删除 `CompileScope`
- 删除 `operations/internal/compile/*` runtime 分层
- 直接用 shared compile handler 输入重写 compile

阶段产物：

- `compile` 只剩 handler table
- compile helper 只剩普通纯函数

### Phase 4. 删除旧 mutation reduce / trace / impact 体系

必须完成：

- 删除 `operations/mutation.ts` 的手工 delta 拼装
- 删除 `operations/trace.ts`
- 删除 `internal/impact.ts`
- 删除 `types/commit.ts`
- canonical inverse 全部下沉给 shared
- custom inverse 全部改为 reducer 直接返回 op 列表

阶段产物：

- dataview-core 不再维护私有 mutation runtime 协议

### Phase 5. dataview-engine 切到 delta-first

必须完成：

- `createEngine.ts` 直接接最终 `entities/custom/compile`
- `dirty.ts` 改成只读 spec key + path prefix
- `performance.ts` 改成只总结标准 delta
- 删除对 dataview trace / impact 的依赖

阶段产物：

- dataview-engine 只依赖 commit / delta
- projection 侧不再知道 dataview-core 的旧 mutation internals

## 11. 最终验收标准

全部完成后，必须同时满足下面这些条件：

- `dataview-core` 不再存在旧 mutation spec / reduce spec / compile scope 体系
- dataview concrete op 已经收口为 canonical entity op + 明确列出的 custom op
- dataview delta key 与 entities spec 完全一致
- inverse 统一为 shared canonical inverse + custom reducer inverse op
- mutation 层 trace / impact 协议已经删除
- `dataview-core` 对外只暴露 `intent`、`op`、`entities`、`custom`、`compile`
- `dataview-engine` 只吃 `commit` / `MutationDelta`
- 不保留兼容层、adapter、wrapper、re-export 中间层

