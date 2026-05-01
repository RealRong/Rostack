import { useCallback, useEffect, useMemo, useRef, type RefObject } from 'react';
import { equal, store } from '@shared/core';
import { elementRectIn, observeElementSize, type Rect } from '@shared/dom';
import { useStoreValue } from '@shared/react';
import type { ItemId, Section, SectionId } from '@dataview/engine';
import { buildBoardLayout, type BoardLayout } from '@dataview/react/views/kanban/drag';
import type { KanbanVisibilityRuntime } from '@dataview/react/views/kanban/runtime/visibility';
import { useMeasuredHeights } from '@dataview/react/virtual';
export interface KanbanLayoutRuntime {
    board: store.ReadStore<BoardLayout | null>;
    body: store.KeyedReadStore<SectionId, Rect | undefined>;
    measure: {
        body: (sectionId: SectionId) => (node: HTMLDivElement | null) => void;
        card: (id: ItemId) => (node: HTMLElement | null) => void;
    };
}
export const useKanbanLayout = (input: {
    containerRef: RefObject<HTMLDivElement | null>;
    sections: readonly Section[];
    sectionsStore: store.ReadStore<readonly Section[]>;
    visibility: KanbanVisibilityRuntime;
}): KanbanLayoutRuntime => {
    const visibilityVersion = useStoreValue(input.visibility.version);
    const visibleIds = useMemo(() => input.sections.flatMap(section => (input.visibility.all().get(section.id)?.ids ?? section.itemIds)), [input.sections, input.visibility, visibilityVersion]);
    const measured = useMeasuredHeights({
        ids: visibleIds
    });
    const bodyStore = useMemo(() => store.keyed<SectionId, Rect | undefined>({
        emptyValue: undefined,
        isEqual: equal.sameOptionalRect
    }), []);
    const bodyVersion = useMemo(() => store.value(0), []);
    const heightStore = useMemo(() => store.value<ReadonlyMap<ItemId, number>>(new Map<ItemId, number>(), {
        isEqual: equal.sameMap
    }), []);
    const bodyNodeBySectionIdRef = useRef(new Map<SectionId, HTMLDivElement>());
    const cleanupBySectionIdRef = useRef(new Map<SectionId, () => void>());
    const bodyMeasureRefBySectionIdRef = useRef(new Map<SectionId, (node: HTMLDivElement | null) => void>());
    const bumpBodyVersion = useCallback(() => {
        bodyVersion.update(current => current + 1);
    }, [bodyVersion]);
    useEffect(() => {
        heightStore.set(measured.heightById);
    }, [heightStore, measured.heightById]);
    const syncBodyRect = useCallback((sectionId: SectionId) => {
        const container = input.containerRef.current;
        const node = bodyNodeBySectionIdRef.current.get(sectionId);
        if (!container || !node) {
            if (bodyStore.get(sectionId) === undefined) {
                return;
            }
            bodyStore.delete(sectionId);
            bumpBodyVersion();
            return;
        }
        const nextRect = elementRectIn(container, node);
        const previousRect = bodyStore.get(sectionId);
        if (equal.sameOptionalRect(previousRect, nextRect)) {
            return;
        }
        bodyStore.set(sectionId, nextRect);
        bumpBodyVersion();
    }, [
        bodyStore,
        bumpBodyVersion,
        input.containerRef
    ]);
    useEffect(() => {
        const activeSectionIds = new Set(input.sections.map(section => section.id));
        Array.from(bodyNodeBySectionIdRef.current.keys()).forEach(sectionId => {
            if (activeSectionIds.has(sectionId)) {
                return;
            }
            cleanupBySectionIdRef.current.get(sectionId)?.();
            cleanupBySectionIdRef.current.delete(sectionId);
            bodyNodeBySectionIdRef.current.delete(sectionId);
            bodyMeasureRefBySectionIdRef.current.delete(sectionId);
            if (bodyStore.get(sectionId) !== undefined) {
                bodyStore.delete(sectionId);
                bumpBodyVersion();
            }
        });
    }, [bodyStore, bumpBodyVersion, input.sections]);
    useEffect(() => () => {
        cleanupBySectionIdRef.current.forEach(cleanup => {
            cleanup();
        });
        cleanupBySectionIdRef.current.clear();
        bodyNodeBySectionIdRef.current.clear();
        bodyMeasureRefBySectionIdRef.current.clear();
        bodyStore.clear();
    }, [bodyStore]);
    const measureBody = useCallback((sectionId: SectionId) => {
        const cached = bodyMeasureRefBySectionIdRef.current.get(sectionId);
        if (cached) {
            return cached;
        }
        const ref = (node: HTMLDivElement | null) => {
            const previousNode = bodyNodeBySectionIdRef.current.get(sectionId);
            if (previousNode === node) {
                if (node) {
                    syncBodyRect(sectionId);
                }
                return;
            }
            cleanupBySectionIdRef.current.get(sectionId)?.();
            cleanupBySectionIdRef.current.delete(sectionId);
            if (!node) {
                bodyNodeBySectionIdRef.current.delete(sectionId);
                syncBodyRect(sectionId);
                return;
            }
            bodyNodeBySectionIdRef.current.set(sectionId, node);
            cleanupBySectionIdRef.current.set(sectionId, observeElementSize(node, {
                emitInitial: false,
                onChange: () => {
                    syncBodyRect(sectionId);
                }
            }));
            syncBodyRect(sectionId);
        };
        bodyMeasureRefBySectionIdRef.current.set(sectionId, ref);
        return ref;
    }, [syncBodyRect]);
    const board = useMemo(() => store.value<BoardLayout | null>(() => {
        store.read(bodyVersion);
        store.read(input.visibility.version);
        const sections = store.read(input.sectionsStore);
        const heightById = store.read(heightStore);
        const bodyRectBySectionId = new Map<SectionId, Rect>();
        bodyStore.all().forEach((rect, sectionId) => {
            if (rect) {
                bodyRectBySectionId.set(sectionId, rect);
            }
        });
        return buildBoardLayout({
            sections,
            visibilityBySection: input.visibility.all(),
            bodyRectBySectionId,
            heightById
        });
    }), [
        bodyStore,
        bodyVersion,
        heightStore,
        input.sectionsStore,
        input.visibility
    ]);
    return useMemo(() => ({
        board,
        body: bodyStore,
        measure: {
            body: measureBody,
            card: measured.measure
        }
    }), [
        board,
        bodyStore,
        measureBody,
        measured.measure
    ]);
};
