# PR-95 Document Mode Policy

更新时间：2026-03-06

## 目标

继续收敛 whole-document 链路，把内部的布尔策略：

- `notify: true`
- `notify: false`

提升为显式语义：

- `mode: 'load'`
- `mode: 'replace'`

同时把 `write.load / write.replace` 的内部实现收敛到同一个 helper。

## 问题

当前 whole-document 路径虽然公开面已经清晰，但内部仍有两个噪音点：

1. `Writer` 的 `DocumentCommitInput` 使用 `notify?: boolean`。
2. `write.load` / `write.replace` 在 runtime 里基本只有一个布尔值差异。

这会带来两个问题：

1. `notify` 只是执行细节，不是业务语义；从调用点看不出这是 `load` 还是 `replace`。
2. whole-document 语义已经在 public API 层显式命名为 `load / replace`，内部再退化成布尔值，会削弱语义一致性。

## 设计

### 1. Document commit 使用显式 mode

把：

```ts
{
  kind: 'document'
  doc: Document
  notify?: boolean
}
```

改成：

```ts
{
  kind: 'document'
  mode: 'load' | 'replace'
  doc: Document
}
```

语义：

1. `mode: 'load'`
   - clear history
   - full read projection
   - 不触发 `document.notifyChange`

2. `mode: 'replace'`
   - clear history
   - full read projection
   - 触发 `document.notifyChange`

### 2. Writer 内部由 mode 推导提交策略

`prepareDocument(...)` 不再接收 `notify`，而是接收 `mode`，内部统一推导：

1. `notify = mode === 'replace'`
2. `impact = FULL_MUTATION_IMPACT`
3. 产出 synthetic `changes`

这样 whole-document 语义在 `Writer` 内部保持显式，不再依赖调用方传布尔值。

### 3. write 顶层收敛 whole-document helper

runtime 中新增单一 helper：

- `applyDocument(mode, doc)`

职责：

1. `history.clear()`
2. 调用 `writer.commit({ kind: 'document', mode, ... })`
3. 返回标准 `DispatchResult`

对外仍保留：

- `write.load(doc)`
- `write.replace(doc)`

但它们只作为 public 语义入口，不再各自复制整段内部流程。

### 4. facade 同步收敛

`instance.commands.doc.load / replace` 仍然保留，但内部通过统一 helper 执行：

1. clear transient state
2. 转发到 `write[mode](doc)`

## 预期结果

1. whole-document 链路从布尔控制改为显式 mode。
2. `load / replace` 的语义在 public API、write runtime、Writer 三层保持一致。
3. 内部不再出现 `notify: true / false` 这类弱语义参数。
