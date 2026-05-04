import { store } from '@shared/core';
import type { EditorScene } from '@whiteboard/editor-scene';
import type { NodeTypeSupport } from '@whiteboard/editor/node';
import type { EditorDefaults } from '@whiteboard/editor/schema/defaults';
import { EMPTY_EDGE_GUIDE, isEdgeGuideEqual } from '@whiteboard/editor/state/preview-edge';
import { resolveSelectionOverlay } from '@whiteboard/editor/scene-ui/selection-policy-overlay';
import { resolveSelectionToolbar } from '@whiteboard/editor/scene-ui/selection-policy-toolbar';
import type { EditorMarqueePreview, EditorSceneUiChrome, EditorSceneUiSelection, EditorState } from '@whiteboard/editor/scene-ui/types';
export const createEditorChromeUi = (input: {
    scene: EditorScene;
    state: EditorState;
    selection: EditorSceneUiSelection;
    nodeType: NodeTypeSupport;
    defaults: EditorDefaults['selection'];
}): EditorSceneUiChrome => {
    const chromeState = input.scene.stores.graph.state.chrome;
    const marquee = store.value(() => {
        store.read(input.state.viewport.value);
        const current = store.read(chromeState).preview.marquee;
        if (!current) {
            return undefined;
        }
        const start = input.state.viewport.worldToScreen({
            x: current.worldRect.x,
            y: current.worldRect.y
        });
        const end = input.state.viewport.worldToScreen({
            x: current.worldRect.x + current.worldRect.width,
            y: current.worldRect.y + current.worldRect.height
        });
        return current
            ? {
                rect: {
                    x: start.x,
                    y: start.y,
                    width: end.x - start.x,
                    height: end.y - start.y
                },
                match: current.match
            }
            : undefined;
    }, {
        isEqual: (left: EditorMarqueePreview | undefined, right: EditorMarqueePreview | undefined) => (left === right
            || (left?.match === right?.match
                && left?.rect.x === right?.rect.x
                && left?.rect.y === right?.rect.y
                && left?.rect.width === right?.rect.width
                && left?.rect.height === right?.rect.height))
    });
    const draw = store.value(() => store.read(chromeState).preview.draw);
    const snapGuides = store.value(() => store.read(chromeState).preview.guides);
    const edgeGuide = store.value(() => store.read(chromeState).preview.edgeGuide ?? EMPTY_EDGE_GUIDE, {
        isEqual: isEdgeGuideEqual
    });
    const overlay = store.value(() => {
        const interaction = store.read(input.state.interaction);
        return resolveSelectionOverlay({
            summary: store.read(input.selection.summary),
            affordance: store.read(input.selection.affordance),
            tool: store.read(input.state.tool),
            edit: store.read(input.state.edit),
            interactionChrome: interaction.chrome,
            transforming: interaction.transforming
        });
    });
    const toolbar = store.value(() => {
        const interaction = store.read(input.state.interaction);
        return resolveSelectionToolbar({
            members: store.read(input.selection.members),
            summary: store.read(input.selection.summary),
            affordance: store.read(input.selection.affordance),
            nodeStats: store.read(input.selection.node.stats),
            edgeStats: store.read(input.selection.edge.stats),
            nodeScope: store.read(input.selection.node.scope),
            edgeScope: store.read(input.selection.edge.scope),
            nodeType: input.nodeType,
            tool: store.read(input.state.tool),
            edit: store.read(input.state.edit),
            interactionChrome: interaction.chrome,
            editingEdge: interaction.editingEdge,
            readMindmapStructure: input.scene.mindmaps.structure,
            defaults: input.defaults
        });
    });
    return {
        selection: {
            marquee,
            snapGuides,
            toolbar,
            overlay
        },
        draw: {
            preview: draw
        },
        edge: {
            guide: edgeGuide
        }
    };
};
