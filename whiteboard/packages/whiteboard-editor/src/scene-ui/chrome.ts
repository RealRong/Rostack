import { store } from '@shared/core';
import type { EditorScene } from '@whiteboard/editor-scene';
import { EMPTY_EDGE_GUIDE, isEdgeGuideEqual } from '@whiteboard/editor/preview/edge';
import { resolveSelectionOverlay } from '@whiteboard/editor/editor/ui/selection-policy-overlay';
import { resolveSelectionToolbar } from '@whiteboard/editor/editor/ui/selection-policy-toolbar';
import type { EditorMarqueePreview, EditorSceneUiChrome, EditorSceneUiSelection, EditorState } from '@whiteboard/editor/types/editor';
import type { EditorDefaults } from '@whiteboard/editor/types/defaults';
import type { NodeTypeSupport } from '@whiteboard/editor/types/node';
export const createEditorChromeUi = (input: {
    scene: EditorScene;
    state: EditorState;
    selection: EditorSceneUiSelection;
    nodeType: NodeTypeSupport;
    defaults: EditorDefaults['selection'];
}): EditorSceneUiChrome => {
    const marquee = store.value(() => input.scene.overlay.marquee(), {
        isEqual: (left: EditorMarqueePreview | undefined, right: EditorMarqueePreview | undefined) => (left === right
            || (left?.match === right?.match
                && left?.rect.x === right?.rect.x
                && left?.rect.y === right?.rect.y
                && left?.rect.width === right?.rect.width
                && left?.rect.height === right?.rect.height))
    });
    const draw = store.value(() => input.scene.overlay.draw());
    const snapGuides = store.value(() => input.scene.overlay.guides());
    const edgeGuide = store.value(() => input.scene.overlay.edgeGuide() ?? EMPTY_EDGE_GUIDE, {
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
