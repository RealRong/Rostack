# PR-94 Unify Writer Prepare And Finish

更新时间：2026-03-06

## 目标

继续收敛 `Writer` 内部结构，把当前的两条私有提交路径改成：

`prepare -> finishCommit`

保持公开入口仍为单一的 `writer.commit(...)`，但让内部实现也满足单漏斗原则。

## 问题

当前 `Writer` 对外已经只剩一个 `commit(...)`，但内部仍存在两条近似平级的私有提交流程：

1. `commitOperations(...)`
2. `commitWholeDocument(...)`

这会带来两个问题：

1. 阅读上仍像是两个 commit 子系统，而不是同一提交事务的两种输入。
2. 两条路径的尾段逻辑高度重复：
   - `document.commit(doc)`
   - `read.applyInvalidation(readHints)`
   - `document.notifyChange(doc)`
   - `publish(change)`

另外，`runtime.ts` 内部的 `commitOperations(...)` helper 实际承担的是 write policy + history capture，不是纯 commit stage，命名也会制造噪音。

## 设计

### 1. Writer 改为两段式

内部结构收敛为：

1. `prepareOperations(...)`
2. `prepareDocument(...)`
3. `finishCommit(...)`

职责边界：

- `prepareXxx(...)`
  - 负责把输入变成“已准备好的提交包”
  - 产出：
    - `doc`
    - `trace`
    - `notify`
    - `impact`
    - `result`

- `finishCommit(...)`
  - 负责执行统一尾段：
    1. `document.commit(doc)`
    2. `project(readHints)`
    3. `notifyChange(doc)`
    4. `publish(change)`
  - 最后返回 `prepareXxx(...)` 产出的业务结果

### 2. 保留输入差异，不伪造统一 operation 模型

不会把 whole-document replace 伪装成 operation 提交。

原因：

1. `operations` 路径天然有 `inverse`。
2. `document` 路径本质是直接给出下一份文档，不该伪装出假的 operation 语义。

因此统一点落在“next document 已经准备完成”之后，而不是更早。

### 3. runtime helper 改名

`runtime.ts` 中的：

- `commitOperations(...)`

改为：

- `applyOperations(...)`

因为它的职责是：

1. 调用 `writer.commit(...)`
2. 追加 history capture policy
3. 用于 history replay

这不是 commit stage 本身，而是 write 层内部的 operation apply helper。

## 预期结果

1. `Writer` 内部从双 commit 分支收敛成单一 commit 尾段。
2. `commitWholeDocument` 这类多余命名被删除。
3. `runtime.ts` 的 helper 语义与职责对齐。
4. 主链仍保持不变：

`commands -> write -> plan -> commit -> read -> reactions`

但 commit 层内部更直：

`prepare -> finishCommit`
