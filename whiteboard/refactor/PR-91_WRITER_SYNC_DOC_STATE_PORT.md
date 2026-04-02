# PR-91 Writer Sync Doc State Port

更新时间：2026-03-06

## 目标

把 `Writer` 从 Jotai `readModelRevisionAtom` 和 `runtime.store` 的实现细节中解耦出来，同时保留提交主链里的同步职责。

## 问题

当前 `Writer` 直接依赖：

1. `readModelRevisionAtom`
2. `instance.runtime.store`
3. `instance.viewport.setViewport(...)`

这意味着 `Writer` 知道：

1. read revision 存在 atom 里
2. 要通过 store 才能写入
3. viewport host 是具体同步载体

这不是 commit 语义，而是宿主状态实现细节。

## 设计

### 1. 注入 `syncDocState(doc)`

由 write runtime / engine 装配层提供：

```ts
syncDocState: (doc: Document) => void
```

其职责只包括提交后的确定性镜像同步：

1. `readModelRevision++`
2. `viewport <- doc.viewport`

### 2. `Writer` 仍保留主链顺序控制

`Writer` 仍然负责：

1. `document.set(doc)`
2. `syncDocState(doc)`
3. `project(readHints)`
4. `notifyChange(doc)`
5. `publish(change)`

也就是说，注入的是同步动作，不是把主链拆成观察者模式。

### 3. 清理 write 依赖面

因此可以删除：

1. `readModelRevisionAtom`
2. `WriteInstance.runtime.store`

## 为什么不是 `bumpReadRevision()`

因为当前提交后同步的动作天然成组：

1. revision
2. viewport

若只注入 `bumpReadRevision()`，下一步仍会继续把 viewport 再拆成第二个 port，边界会变得零碎。

## 预期结果

1. `Writer` 只依赖语义 port，不依赖 atom/store。
2. commit 主链顺序保持不变。
3. write 层依赖面进一步收窄。
