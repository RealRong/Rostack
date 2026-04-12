# Dataview Engine 复用逻辑迁移清单

## 目标

这份清单只做一件事：审计 `dataview/src/engine` 内部已经出现的重复可复用逻辑，明确哪些应该下沉到 `shared`，哪些应该沉到 `core`，哪些只应该留在 `engine` 内部统一，不再继续散落。

本清单关注的是“长期最优分层”，不是兼容迁移方案。结论标准只有三个：

- 能跨业务域复用，且不依赖 dataview 领域模型的，进 `shared`
- 属于 dataview 领域规则、文档结构、视图数据规则的，进 `core`
- 依赖 engine runtime、store、projection、dispatch、增量索引、facade 装配的，只留在 `engine`

## 分层标准

| 层级 | 应该承载什么 | 不应该承载什么 |
| --- | --- | --- |
| `shared` | 通用字符串处理、去重、集合工具、相等性、store 无关的纯函数 | 任何 `DataDoc`、`View`、`Field`、projection、engine runtime 语义 |
| `core` | dataview 文档结构、字段/视图/记录规则、纯领域变换、纯输入构造 | store、dispatch、active runtime、engine state、索引缓存 |
| `engine` | facade、active state、projection、增量索引、命令执行、写入流程 | 可以在 `shared/core` 表达的基础工具与纯领域逻辑 |

## 审计结论

- 当前重复最多的两类逻辑是“字符串归一化”和“去重/有序集合处理”，这两类都不应继续留在 `engine`
- `core` 里已经有一部分视图/文档纯规则，但 `view duplicate input` 和 `document field existence` 这两块还没有完全收干净
- `engine` 内部最明显的重复是三条线：实体存在校验、索引增量同步模板、view facade patch 写法
- 有几类逻辑虽然也能抽函数，但它们本质上依赖 active runtime 或写入 side effect，不应该下沉，只应该在 `engine` 内统一

## 已完成项

这些项已经完成迁移，不再作为待办，但仍然应该视为后续整理的基线：

| 逻辑 | 原位置 | 当前归属 | 说明 |
| --- | --- | --- | --- |
| 记录字段写入 action 构造 | `dataview/src/engine/facade/view/index.ts` 旧实现 | `dataview/src/core/field/index.ts` | 已沉到 `core`，后续新写法应直接复用 |
| display 插入位置解析 | `dataview/src/engine/facade/view/index.ts` 旧实现 | `dataview/src/core/view/shared.ts` | 已沉到 `core`，不应在 facade 再写一份 |
| JSON 值相等判断 | facade 本地 helper | `shared/core/src/equality.ts` | 已统一到 `shared` |

## Shared 迁移项

### S1. 字符串归一化工具统一下沉

| 项目 | 内容 |
| --- | --- |
| 优先级 | `P0` |
| 当前重复位置 | `dataview/src/engine/command/shared.ts`、`dataview/src/engine/action/lower.ts`、`dataview/src/engine/facade/fields.ts`、`dataview/src/engine/facade/views.ts`、`dataview/src/engine/index/aggregate.ts`、`dataview/src/engine/index/search/index.ts`、`dataview/src/engine/index/group/bucket.ts` |
| 典型重复 | `isNonEmptyString`、`value.trim()`、`value.trim().toLowerCase()`、空字符串转无效值 |
| 目标层 | `shared` |
| 建议落点 | `shared/core/src/string.ts` |
| 建议 API | `isNonEmptyString`、`trimToUndefined`、`trimLowercase`、`trimmedOr` |
| 动作 | `extract` |
| 说明 | 这类逻辑完全不依赖 dataview 领域模型。继续放在 `engine` 会导致 action、command、index、facade 同时维护自己的归一化规则。 |

### S2. 去重与有序列表工具统一下沉

| 项目 | 内容 |
| --- | --- |
| 优先级 | `P0` |
| 当前重复位置 | `dataview/src/engine/command/shared.ts`、`dataview/src/engine/facade/records.ts`、`dataview/src/engine/store/active/read.ts`、`dataview/src/engine/index/demand.ts`、`dataview/src/engine/index/search/index.ts` |
| 典型重复 | `Array.from(new Set(...))`、`filter((item, index, source) => source.indexOf(item) === index)`、去重后排序 |
| 目标层 | `shared` |
| 建议落点 | `shared/core/src/collection.ts` |
| 建议 API | `unique`、`uniqueBy`、`uniqueSorted` |
| 动作 | `extract` |
| 说明 | 这类逻辑现在一部分用于 `recordIds`，一部分用于 token，一部分用于 active move 规划。共性是集合操作，不是 dataview 领域规则。 |

### S3. 只保留真正通用的相等性工具，禁止 engine 再造同类 helper

| 项目 | 内容 |
| --- | --- |
| 优先级 | `P1` |
| 当前重复位置 | `dataview/src/engine/project/equality.ts`、`dataview/src/engine/project/publish/view.ts` |
| 目标层 | `shared` 仅限“基础相等性”部分 |
| 建议落点 | 继续使用 `shared/core/src/equality.ts` |
| 动作 | `merge` |
| 说明 | `sameValue`、`sameOrder`、`sameJsonValue` 这种基础能力已经在 `shared`。后续如果再出现 `sameList` 一类纯基础工具，可以继续补到 `shared`；但 projection/domain 相等性不要一起下沉。 |

## Core 迁移项

### C1. duplicate view 输入构造下沉到 core/view

| 项目 | 内容 |
| --- | --- |
| 优先级 | `P0` |
| 当前重复位置 | `dataview/src/engine/facade/views.ts` |
| 当前问题 | `duplicate` 直接在 facade 里手动拷贝 `search/filter/sort/group/calc/display/options/orders`，属于纯领域复制规则，却放在 engine facade |
| 目标层 | `core` |
| 建议落点 | `dataview/src/core/view/duplicate.ts`，然后从 `dataview/src/core/view/index.ts` 导出 |
| 建议 API | `createDuplicateViewInput(view, preferredName)` 或 `createDuplicateView(view, preferredName)` |
| 动作 | `extract` |
| 说明 | view duplicate 的拷贝范围、哪些字段保留、哪些字段重命名，都是视图领域规则，不应该散落在 facade 层。 |

### C2. document field existence helper 补齐为完整家族

| 项目 | 内容 |
| --- | --- |
| 优先级 | `P0` |
| 当前重复位置 | `dataview/src/engine/action/lower.ts`、`dataview/src/engine/index/shared.ts`、`dataview/src/engine/command/context.ts`、`dataview/src/engine/command/runCommands.ts` |
| 当前问题 | `core/document` 已有 `hasDocumentCustomField`、`hasDocumentRecord`、`hasDocumentView`，但缺少对 `FieldId` 的统一 `hasDocumentField`，导致 engine 反复 `Boolean(getDocumentFieldById(...))` |
| 目标层 | `core` |
| 建议落点 | `dataview/src/core/document/fields.ts` |
| 建议 API | `hasDocumentField(document, fieldId)` |
| 动作 | `extract` |
| 说明 | `FieldId` 包含 title 与 custom field，这是 dataview 文档模型规则，应由 `core/document` 一次表达清楚。 |

### C3. 纯领域复制/归一化规则继续只放在 core，不再回流到 facade

| 项目 | 内容 |
| --- | --- |
| 优先级 | `P1` |
| 当前重复位置 | `dataview/src/engine/facade/view/index.ts`、`dataview/src/engine/facade/views.ts` |
| 当前问题 | 部分 view patch 前的纯规则已经在 `core`，部分还残留在 facade 层做输入整理 |
| 目标层 | `core` |
| 建议落点 | 继续补在 `dataview/src/core/view/*`、`dataview/src/core/field/*` |
| 动作 | `merge` |
| 说明 | 原则很简单：只要某段逻辑不依赖 `dispatch`、active state、projection、index，就不要留在 facade。 |

## Engine 内部收拢项

### E1. 实体存在校验统一成一套 engine validation

| 项目 | 内容 |
| --- | --- |
| 优先级 | `P0` |
| 当前重复位置 | `dataview/src/engine/command/runCommands.ts`、`dataview/src/engine/action/lower.ts` |
| 典型重复 | `validateRecordExists`、`validateFieldExists`、`validateViewExists` |
| 目标层 | `engine` |
| 建议落点 | `dataview/src/engine/validation/entity.ts` |
| 建议 API | `validateRecordExists`、`validateFieldExists`、`validateViewExists`，统一 issue/source/index 传参结构 |
| 动作 | `merge` |
| 说明 | 这部分会产出 command/action 的 issue，天然依赖 engine 语义，不该下沉到 `core`，但必须只保留一套。 |

### E2. document entity read 适配器统一

| 项目 | 内容 |
| --- | --- |
| 优先级 | `P1` |
| 当前重复位置 | `dataview/src/engine/store/read.ts`、`dataview/src/engine/command/context.ts` |
| 当前问题 | 两处都在把 `core/document` 的 `get/list/has` 组织成 engine 自己的读接口，只是一个面向 store，一个面向 command document snapshot |
| 目标层 | `engine` |
| 建议落点 | `dataview/src/engine/read/entities.ts` 或并入 `dataview/src/engine/store/read.ts` 提供无 store 版本 |
| 建议 API | `createDocumentEntityRead(document)`、`createStoreEntityRead(store)` |
| 动作 | `merge` |
| 说明 | 这不是 `core` 逻辑，因为输出接口形状是 engine 侧消费方式；但继续分散会让读取能力在 command/store 两边长期漂移。 |

### E3. 增量索引同步模板统一

| 项目 | 内容 |
| --- | --- |
| 优先级 | `P0` |
| 当前重复位置 | `dataview/src/engine/index/calculations.ts`、`dataview/src/engine/index/search/index.ts`、`dataview/src/engine/index/sort/state.ts`、`dataview/src/engine/index/group/state.ts` |
| 当前问题 | 多个索引都在重复做“收集受影响字段/记录 -> 遇到 all 则重建 -> 删除失效字段 -> 增量更新”的同一种流程 |
| 目标层 | `engine` |
| 建议落点 | `dataview/src/engine/index/runtime/sync.ts` 或扩充 `dataview/src/engine/index/shared.ts` |
| 建议 API | `syncFieldScopedIndex`、`pruneMissingFields`、`resolveTouchedRecordIds`、`shouldRebuildAll` |
| 动作 | `merge` |
| 说明 | 这是典型 engine runtime 逻辑，不能进 `core`。但目前四套索引几乎都带着自己的同步脚手架，维护成本很高。 |

### E4. project projection 复用与相等判断统一

| 项目 | 内容 |
| --- | --- |
| 优先级 | `P1` |
| 当前重复位置 | `dataview/src/engine/project/equality.ts`、`dataview/src/engine/project/publish/view.ts` |
| 典型重复 | `equalList`、`equalIds`、`equalOptionalList`、`equalProjection`、`reuseProjection` |
| 目标层 | `engine` |
| 建议落点 | `dataview/src/engine/project/reuse.ts` 或合并进 `dataview/src/engine/project/equality.ts` |
| 建议 API | `sameList`、`sameOptionalList`、`reuseIfEqual` |
| 动作 | `merge` |
| 说明 | 这些 helper 面向的是 engine projection/read model，不是 `DataDoc` 纯领域对象，因此应留在 engine project 层统一。 |

### E5. view facade patch 管线收拢

| 项目 | 内容 |
| --- | --- |
| 优先级 | `P0` |
| 当前重复位置 | `dataview/src/engine/facade/view/index.ts` |
| 当前问题 | `withView`、`commitPatch`、大量 `withView(... commitPatch(...))` 小函数形成了很厚的转发层，实际只有少数几种 patch 模式 |
| 目标层 | `engine` |
| 建议落点 | 继续留在 `dataview/src/engine/facade/view/index.ts`，但收敛成更短的写入流水线 |
| 建议 API | `patchView`、`patchSearch`、`patchFilter`、`patchSort`、`patchGroup`、`patchDisplay`，其余方法尽量内联到这一层 |
| 动作 | `merge` + `delete wrapper` |
| 说明 | 这里不是要下沉层级，而是要把 facade 从“几十个几乎一样的转发器”收成“少数稳定写入口”。 |

### E6. shared 提取后，删除 engine 本地集合/字符串小工具

| 项目 | 内容 |
| --- | --- |
| 优先级 | `P0` |
| 当前重复位置 | `dataview/src/engine/command/shared.ts`、`dataview/src/engine/action/lower.ts`、`dataview/src/engine/store/active/read.ts` |
| 当前问题 | 即使完成下沉，如果旧 helper 不删干净，engine 很快又会长出第二套实现 |
| 目标层 | `engine` |
| 建议落点 | 删除本地 helper，只保留对 `shared/core` 或 `core` 的引用 |
| 动作 | `delete wrapper` |
| 说明 | 这项不是新能力，而是清理要求。必须和 S1/S2、C1/C2 同步完成。 |

## 明确不迁移的逻辑

下面这些逻辑即使也能抽函数，也不应该迁到 `shared` 或 `core`：

| 逻辑 | 当前位置 | 原因 | 结论 |
| --- | --- | --- | --- |
| `createGroupWriteActions` | `dataview/src/engine/facade/view/index.ts` | 会组合 group value patch、appearance/record 批量写入，是 engine 写入编排，不是纯领域规则 | 留在 `engine`，仅内部收拢 |
| `planMove` | `dataview/src/engine/store/active/read.ts` | 依赖 active sections、appearances、before target、section move 规划，是 active runtime 逻辑 | 留在 `engine` |
| active store/select 组合 | `dataview/src/engine/store/active/*` | 直接依赖 engine state/store/read store | 留在 `engine` |
| `items.move/create/remove`、`cells.set/clear` 这一类 facade 操作 | `dataview/src/engine/facade/view/index.ts` | 需要读取 active state、生成多条 action、触发 dispatch | 留在 `engine` |

## 最终文件落点建议

| 层级 | 新增或收拢文件 |
| --- | --- |
| `shared` | `shared/core/src/string.ts`、`shared/core/src/collection.ts` |
| `core` | `dataview/src/core/view/duplicate.ts`、`dataview/src/core/document/fields.ts` 补 `hasDocumentField` |
| `engine` | `dataview/src/engine/validation/entity.ts`、`dataview/src/engine/read/entities.ts`、`dataview/src/engine/index/runtime/sync.ts`、`dataview/src/engine/project/reuse.ts` |

## 迁移执行顺序

1. 先做 `shared` 的字符串与集合工具抽取，立即替换 engine 内所有本地重复实现。
2. 再做 `core` 的 `duplicate view input` 与 `hasDocumentField`，让 facade 和 action/command 不再直接写纯领域规则。
3. 然后收拢 `engine` 内部的三套大重复：实体校验、索引同步模板、project projection reuse。
4. 最后清理 `engine` 本地 helper、薄包装、重复转发，确保代码库中只剩一套实现。

## 落地验收标准

- `engine` 中不再存在第二套字符串 trim/非空校验工具
- `engine` 中不再存在第二套去重/unique helper
- `view duplicate` 不再由 facade 手写字段拷贝
- `Boolean(getDocumentFieldById(...))` 这一类 field existence 判断不再散落
- action 与 command 的实体存在校验只剩一套实现
- search/sort/group/calculations 不再各自维护一份同构的增量同步脚手架
- 完成后应删除旧 helper、旧 wrapper、旧转发实现，不保留并行方案
