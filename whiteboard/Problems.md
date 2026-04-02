createEdgeViewStore -> createEdgeDomain -> createIndexedState

createEdgeViewStore

const preview = (): EdgePreviewView => emptyPreview

需要吗？

const selectedEndpoints = (): EdgeEndpoints | undefined => {
const selectedEdgeId = readState('selection').selectedEdgeId
if (!selectedEdgeId) return undefined
const edge = getEdge(selectedEdgeId)
if (!edge) return undefined
return getEndpoints(edge)
}

这个是react层实时计算还是放到engine?

const applyCommit = (commit: ProjectionCommit) => {
pathStore.applyCommit(commit)
}

commit不能一眼看到是什么变化

EdgeDomain也有recompute和commit，职责不清

我希望你研究一下整个edge，包括api, 临时state，写入管线，职责在engine层还是react层等问题