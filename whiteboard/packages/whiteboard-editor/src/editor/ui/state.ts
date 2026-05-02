import { geometry as geometryApi } from '@whiteboard/core/geometry';
import { store } from '@shared/core';
import { isHoverStateEqual } from '@whiteboard/editor/input/hover/store';
import { isEdgeInteractionMode } from '@whiteboard/editor/input/interaction/mode';
import { isDrawEqual, isEditSessionEqual, isInteractionStateEqual, isPreviewEqual, isSelectionEqual, isToolEqual, isViewportEqual, type EditorInteractionStateValue, type EditorStateDocument } from '@whiteboard/editor/state-engine/document';
import type { EditorStateRuntime } from '@whiteboard/editor/state-engine/runtime';
import type { EditorState, ToolRead } from '@whiteboard/editor/types/editor';
export type EditorStateStores = {
    tool: store.ReadStore<EditorStateDocument['state']['tool']>;
    draw: store.ReadStore<EditorStateDocument['state']['draw']>;
    selection: store.ReadStore<EditorStateDocument['state']['selection']>;
    edit: store.ReadStore<EditorStateDocument['state']['edit']>;
    interaction: store.ReadStore<EditorInteractionStateValue>;
    preview: store.ReadStore<EditorStateDocument['overlay']['preview']>;
    viewport: store.ReadStore<EditorStateDocument['state']['viewport']>;
};
export const createEditorStateStores = (runtime: EditorStateRuntime): EditorStateStores => ({
    tool: store.value({
        get: () => runtime.snapshot().state.tool,
        subscribe: runtime.commits.subscribe,
        isEqual: isToolEqual
    }),
    draw: store.value({
        get: () => runtime.snapshot().state.draw,
        subscribe: runtime.commits.subscribe,
        isEqual: isDrawEqual
    }),
    selection: store.value({
        get: () => runtime.snapshot().state.selection,
        subscribe: runtime.commits.subscribe,
        isEqual: isSelectionEqual
    }),
    edit: store.value({
        get: () => runtime.snapshot().state.edit,
        subscribe: runtime.commits.subscribe,
        isEqual: isEditSessionEqual
    }),
    interaction: store.value({
        get: () => {
            const snapshot = runtime.snapshot();
            return {
                mode: snapshot.state.interaction.mode,
                chrome: snapshot.state.interaction.chrome,
                space: snapshot.state.interaction.space,
                hover: snapshot.overlay.hover
            };
        },
        subscribe: runtime.commits.subscribe,
        isEqual: (left, right) => (isInteractionStateEqual(left, right)
            && isHoverStateEqual(left.hover, right.hover))
    }),
    preview: store.value({
        get: () => runtime.snapshot().overlay.preview,
        subscribe: runtime.commits.subscribe,
        isEqual: isPreviewEqual
    }),
    viewport: store.value({
        get: () => runtime.snapshot().state.viewport,
        subscribe: runtime.commits.subscribe,
        isEqual: isViewportEqual
    })
});
export const createEditorStateView = (input: {
    stores: EditorStateStores;
    runtime: EditorStateRuntime;
}): EditorState => {
    const interaction = store.value(() => {
        const current = store.read(input.stores.interaction);
        const mode = current.mode;
        return {
            busy: mode !== 'idle',
            chrome: current.chrome,
            transforming: mode === 'node-transform',
            drawing: mode === 'draw',
            panning: mode === 'viewport-pan',
            selecting: (mode === 'press'
                || mode === 'marquee'
                || mode === 'node-drag'
                || mode === 'mindmap-drag'
                || mode === 'node-transform'),
            editingEdge: isEdgeInteractionMode(mode),
            space: current.space
        };
    }, {
        isEqual: (left, right) => (left.busy === right.busy
            && left.chrome === right.chrome
            && left.transforming === right.transforming
            && left.drawing === right.drawing
            && left.panning === right.panning
            && left.selecting === right.selecting
            && left.editingEdge === right.editingEdge
            && left.space === right.space)
    });
    const zoom = store.value<number>(() => store.read(input.stores.viewport).zoom, {
        isEqual: (left, right) => left === right
    });
    const center = store.value(() => store.read(input.stores.viewport).center, {
        isEqual: geometryApi.equal.point
    });
    return {
        tool: {
            get: input.stores.tool.get,
            subscribe: input.stores.tool.subscribe,
            type: () => input.stores.tool.get().type,
            value: () => {
                const tool = input.stores.tool.get();
                return 'mode' in tool
                    ? tool.mode
                    : undefined;
            },
            is: (type, value) => {
                const tool = input.stores.tool.get();
                if (tool.type !== type) {
                    return false;
                }
                if (value === undefined) {
                    return true;
                }
                return tool.type === 'draw'
                    ? tool.mode === value
                    : false;
            }
        } satisfies ToolRead,
        draw: input.stores.draw,
        edit: input.stores.edit,
        selection: input.stores.selection,
        interaction,
        preview: input.stores.preview,
        viewport: {
            get: input.stores.viewport.get,
            subscribe: input.stores.viewport.subscribe,
            pointer: input.runtime.viewport.pointer,
            worldToScreen: input.runtime.viewport.worldToScreen,
            worldRect: input.runtime.viewport.worldRect,
            screenPoint: input.runtime.viewport.screenPoint,
            size: input.runtime.viewport.size,
            value: input.stores.viewport,
            zoom,
            center
        }
    };
};
