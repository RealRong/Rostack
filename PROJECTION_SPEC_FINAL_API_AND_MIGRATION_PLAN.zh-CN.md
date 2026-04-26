# Projection Spec 最终 API 设计与迁移方案

## 1. 目标

这份文档只讨论：

- 不兼容
- 一步到位
- 长期最优
- 最 spec 化
- 重复最少
- 代码最少
- 类型最少

结论先说：

- shared 层最终只保留两个正式基础设施包：
  - `@shared/delta`
  - `@shared/projection`
- `@shared/projection` 的 public API 必须极小
- whiteboard 和 dataview 都只写各自的 **projection spec**
- phase graph、scope merge、surface store、trace、fanout 都收进 `@shared/projection` 内部
- `Family` 这类纯结构类型 **默认不进 shared public API**

---

## 2. shared 层最终边界

## 2.1 应该放进 shared 的东西

只有两类东西应该进入 shared：

### A. 真正的通用行为

也就是：

- 两个以上 domain 都会复用
- 不是某个 domain 语义
- 不只是一个类型别名
- 放进去之后能减少真实实现重复

最终包括：

- `@shared/delta`
  - `idDelta`
  - `entityDelta`
  - `changeState`
  - 其它真正的 delta primitive
- `@shared/projection`
  - projection runtime
  - phase DAG 调度
  - scope normalize / merge / emptiness 判断
  - emit fanout
  - revision
  - surface reactive store
  - trace

### B. 少量正式 contract

shared public API 只暴露“外部必须知道”的 contract：

- `Revision`
- `ProjectionSpec`
- `ProjectionRuntime`
- `ProjectionTrace`
- `createProjectionRuntime`

---

## 2.2 不应该放进 shared 的东西

以下东西不应该进入 shared public API：

### A. 纯结构别名

例如：

- `Family<TKey, TValue>`
- `NodeFamily`
- `GraphCapture`
- `ActivePublishView`

原因很简单：

- 它们没有行为
- 只是一个很薄的结构包装
- 放进 shared 只会增加公共类型面
- shared 一旦公开它们，所有 domain 都会被迫围着这些别名建模

`Family` 的最终判断：

- **不作为 `@shared/projection` 的 public export**
- 如果 whiteboard 内部大量复用，就在 whiteboard 自己定义 `EntityFamily`
- 如果 dataview 内部也需要，就在 dataview 自己定义
- 如果将来两个 domain 的正式 public contract 都大量暴露同一结构，再单独评估是否抽成 `@shared/read-model-types`
- 但在当前目标下，**不要提前抽**

### B. builder / helper 风格 API

例如：

- `defineProjectionModel(...)`
- `defineScope(...)`
- `flag()`
- `set()`
- `slot()`
- `createPlan(...)`
- `mergePlans(...)`
- `family(...)`
- `value(...)`

这些 API 的问题不是“不能用”，而是：

- 增加心智负担
- 增加类型层数
- 增加导出面
- 让 domain 看起来像在“拼 projection 元件”，而不是在“写 projection spec”

长期最优里，domain 直接写 plain object spec。

### C. 领域中间层

例如：

- dataview 的 `projector/planner/publisher`
- whiteboard 的 projection builder wrapper
- `DataviewEngineRuntime` 这种只做转发的组合层

这些都应该删除。

---

## 3. `@shared/projection` 的最终 public API

最终只保留：

```ts
export type Revision
export type ProjectionTrace
export type ProjectionSpec
export type ProjectionRuntime

export function createProjectionRuntime(spec): ProjectionRuntime
```

除了上面这些，`@shared/projection` 不再公开任何 helper。

---

## 4. `ProjectionSpec` 的最终设计

## 4.1 设计原则

`ProjectionSpec` 必须满足三个原则：

1. domain 写法直接
2. public 类型尽量少
3. 运行时细节尽量藏起来

所以最终 spec 应该长这样：

```ts
const spec = {
  createState() {
    ...
  },
  createRead(runtime) {
    ...
  },
  surface: {
    ...
  },
  plan({ input, state, read, revision }) {
    return {
      phases: ['graph', 'view'],
      scope: {
        graph: {
          reset: false,
          nodes: ['n1', 'n2']
        }
      }
    }
  },
  capture({ state, read, revision }) {
    ...
  },
  phases: {
    graph: {
      after: [],
      scope: {
        kind: 'scope',
        fields: {
          reset: { kind: 'flag' },
          nodes: { kind: 'set' }
        }
      },
      run(ctx) {
        return {
          action: 'sync',
          emit: {
            view: {
              nodes: ctx.scope.nodes
            }
          }
        }
      }
    },
    view: {
      after: ['graph'],
      run(ctx) {
        return {
          action: 'sync'
        }
      }
    }
  }
} satisfies ProjectionSpec<...>
```

这个形态有几个关键点：

- `spec` 是 plain object
- `phases` 是 record，不是数组
- phase 名字只写一次，不再 `name: 'graph'`
- `after` 比 `deps` 更直观
- scope schema 直接写字面量对象
- `surface` 直接写字面量对象
- domain 不再 import builder

---

## 4.2 surface 的最终设计

`surface` 保留两种叶子节点：

- `value`
- `family`

但这两种只作为 **字面量协议** 存在，不作为 public builder export：

```ts
surface: {
  count: {
    kind: 'value',
    read: (state) => state.count
  },
  nodes: {
    kind: 'family',
    read: (state) => ({
      ids: [...state.nodes.keys()],
      byId: state.nodes
    })
  }
}
```

最终判断：

- 保留 `kind: 'value' | 'family'` 这两个协议
- 不再导出 `value(...)` / `family(...)`
- `Family<TKey, TValue>` 不作为 public 类型导出

因为：

- `family` 本质只是 surface leaf 协议的一部分
- 它不是值得被独立命名并暴露为 shared 公共概念的“设施”

---

## 4.3 scope 的最终设计

scope 也只保留 **字面量 schema 协议**，不保留 builder：

```ts
const graphScope = {
  kind: 'scope',
  fields: {
    reset: { kind: 'flag' },
    nodes: { kind: 'set' },
    anchor: { kind: 'slot' }
  }
} as const
```

最终判断：

- runtime 内部继续支持 `flag / set / slot`
- 但 public API 不再导出这些 helper
- domain 直接写 schema 字面量

原因：

- helper 减少不了多少代码
- 但会显著增加 public API 面积
- 类型推导也会变复杂

---

## 4.4 plan 的最终设计

`plan` 最终只返回最小结构：

```ts
{
  phases?: readonly PhaseName[]
  scope?: Partial<Record<PhaseName, unknown>>
}
```

最终判断：

- 不再保留 `createPlan(...)`
- 不再保留 `mergePlans(...)`
- scope 合并由 runtime 内部完成

domain 只负责：

- 说“这次要跑哪些 phase”
- 说“这些 phase 吃什么 scope input”

---

## 5. `@shared/delta` 的最终边界

projection 只负责“怎么跑读模型”。

delta primitive 统一归 `@shared/delta`：

- `idDelta`
- `entityDelta`
- `changeState`
- 与实体变化聚合直接相关的 primitive

不应该再出现：

- projection 包自己带一套 delta helper
- domain 自己再各写一份 touched / merge / reset 逻辑

最终链路是：

```text
domain mutation / source change
  -> @shared/delta 表达变化
  -> @shared/projection 运行 spec
  -> domain capture / publish / query
```

---

## 6. whiteboard 迁移方案

## 6.1 whiteboard 最终定位

whiteboard 不是简单索引投影。

它至少同时处理：

- document
- session
- interaction orchestration
- scene runtime
- index / spatial
- render / query

因此 whiteboard 的 projection 不会像 dataview 那么薄，但基础设施仍然应该完全统一。

whiteboard 只保留：

- 自己的 scene spec
- 自己的 capture / query / render 领域类型
- 自己的 patch 逻辑

不再保留：

- shared projection builder 依赖
- 领域内再包一层 projection runtime helper

---

## 6.2 whiteboard 具体迁移

### 第一步：scene projection 改成纯 spec

把现有：

- `defineProjectionModel(...)`
- `createPlan(...)`
- `defineScope(...)`
- `flag() / set() / slot()`
- `value(...) / family(...)`

全部改成 plain object 写法。

### 第二步：`Family` 留在 whiteboard 本地

whiteboard 如果需要复用：

```ts
type EntityFamily<TKey extends string, TValue> = {
  ids: readonly TKey[]
  byId: ReadonlyMap<TKey, TValue>
}
```

就直接在 whiteboard 本地定义。

不要从 shared 引。

### 第三步：scene runtime 只吃 `createProjectionRuntime`

whiteboard scene runtime 最终只依赖：

- `createProjectionRuntime(spec)`
- `Revision`
- `ProjectionTrace`

其它 projection 细节都不应该出现在 scene 侧 import 列表里。

### 第四步：如果 whiteboard 将来有第二套 projection，也继续按 spec 写

例如未来：

- session-derived projection
- scene query cache projection
- viewport derived projection

都应该继续写成 domain spec，而不是长出新的 shared wrapper。

---

## 7. dataview 迁移方案

## 7.1 dataview 最终定位

dataview 本质上是：

- document projection
- index projection
- active projection

它比 whiteboard 简单，因为没有复杂 session 编排，但它更适合把 projection 这套底座跑到极致一致。

---

## 7.2 dataview 具体迁移

### 第一步：删除 projector 体系

删除：

- `active/projector/spec.ts`
- `active/projector/planner.ts`
- `active/projector/publisher.ts`
- 其它只是围绕 projector 概念存在的 wrapper

把 active 收成一个正式 projection spec。

### 第二步：index 也收成 projection spec

不要保留：

- 一套 index derive 机制
- 一套 active projector 机制

最终 dataview 内部只有一套读模型底座：

- 都是 projection spec
- 都是 `createProjectionRuntime(...)`

### 第三步：mutation publish 退化成 adapter

dataview mutation publish 最终只做：

- 组织 projection input
- 推进 runtime
- 读取 capture / publish
- 写回 mutation publish record

不再手工做：

- active delta 组装
- index delta 组装
- 各种 planner / publisher glue

### 第四步：`Family` 同样不要进 shared

如果 dataview 的 capture / publish 内部也需要 `{ ids, byId }` 结构：

- 直接本地定义
- 或者直接内联结构

不要为了一个结构别名把 shared 再扩一个 public 类型。

---

## 8. 最终命名设计

最终只保留以下正式名词：

- `delta`
- `projection`
- `spec`
- `runtime`
- `capture`
- `trace`
- `surface`
- `revision`

明确不再保留或不再扩散的名词：

- `projector`
- `planner`
- `publisher`
- `model`（如果只是 spec 包装名）
- `Family`（shared public 名词）
- `ProjectionModel`
- `InputChangeSpec`

原因：

- `projector` 太像历史实现名词，不够稳定
- `planner / publisher` 是 runtime 内部阶段角色，不该变成 public 架构层
- `Family` 只是一个结构，不值得升级成 shared 基础设施概念
- `ProjectionModel` 比 `ProjectionSpec` 更容易让人误会成状态对象

最终推荐：

- shared：`ProjectionSpec`
- domain：`createXxxProjectionSpec`
- runtime：`createProjectionRuntime`

---

## 9. 最终实施顺序

### Phase 1：收口 shared public API

- `@shared/projection` 只导出：
  - `createProjectionRuntime`
  - `ProjectionSpec`
  - `ProjectionRuntime`
  - `ProjectionTrace`
  - `Revision`
- 删除 public builder export

### Phase 2：whiteboard 迁移到 plain spec

- 本地 scope schema
- 本地 `EntityFamily`
- 本地 surface leaf 字面量
- scene runtime 只吃正式 runtime

### Phase 3：dataview 删除 projector wrapper

- active 改成 projection spec
- index 改成 projection spec
- document delta / publish 只做 adapter

### Phase 4：清理重复中间层

- 删除 domain runtime wrapper
- 删除 planner / publisher 残留
- 删除只做转发的类型别名和工厂

---

## 10. 最终结论

长期最优的最终状态是：

- shared 正式基础设施只有 `@shared/delta` 和 `@shared/projection`
- `@shared/projection` public API 极小
- `Family` 不进入 shared public API
- whiteboard 和 dataview 都只写各自的 projection spec
- 所有 phase / scope / surface / fanout / trace 运行机制都封装在 runtime 内部

一句话总结：

- **shared 只保留真正有行为的基础设施，不保留为了“统一写法”而抽出来的薄类型和 builder。**
