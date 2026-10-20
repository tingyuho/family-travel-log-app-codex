import { useCallback, useEffect, useMemo, useState, type SetStateAction } from "react";
import Storage from "expo-sqlite/kv-store";

import type { PackingTemplate } from "../api";
import { emptyPackingDraft, type PackingDraft } from "../forms";
import { normalizeText } from "../utils";

export function usePacking(sessionUser: string) {
  const [templateState, setTemplateState] = useState<{ user: string; templates: PackingTemplate[]; loaded: boolean }>({ user: "", templates: [], loaded: false });
  const packingTemplates = useMemo(() => templateState.user === sessionUser ? templateState.templates : [], [templateState, sessionUser]);
  const setPackingTemplates = useCallback((templates: PackingTemplate[]) => {
    setTemplateState({ user: sessionUser, templates, loaded: true });
  }, [sessionUser]);
  const [packingDraft, setPackingDraft] = useState<PackingDraft>(emptyPackingDraft);
  const [packingEditingId, setPackingEditingId] = useState<number | null>(null);
  const [activePackingTemplateId, setActivePackingTemplateId] = useState<number | null>(null);
  const [checkState, setCheckState] = useState<{ user: string; items: Record<number, string[]> }>({ user: "", items: {} });
  const checkedPackingItems = checkState.user === sessionUser ? checkState.items : {};
  const setCheckedPackingItems = useCallback((action: SetStateAction<Record<number, string[]>>) => {
    setCheckState((previous) => {
      const current = previous.user === sessionUser ? previous.items : {};
      return { user: sessionUser, items: typeof action === "function" ? action(current) : action };
    });
  }, [sessionUser]);

  const activePackingTemplate = useMemo(
    () =>
      activePackingTemplateId
        ? packingTemplates.find((template) => template.id === activePackingTemplateId) || null
        : null,
    [activePackingTemplateId, packingTemplates]
  );

  useEffect(() => {
    let items: Record<number, string[]> = {};
    if (sessionUser) {
      try {
        const raw = JSON.parse(Storage.getItemSync(getChecklistStorageKey(sessionUser)) || "{}");
        if (raw && typeof raw === "object" && !Array.isArray(raw)) {
          for (const [key, value] of Object.entries(raw)) {
            if (Array.isArray(value)) items[Number(key)] = value.filter((item): item is string => typeof item === "string");
          }
        }
      } catch { /* A damaged cache must not prevent opening the checklist. */ }
    }
    setCheckState({ user: sessionUser, items });
  }, [sessionUser]);

  useEffect(() => {
    if (!sessionUser || checkState.user !== sessionUser) return;
    try {
      Storage.setItemSync(getChecklistStorageKey(sessionUser), JSON.stringify(checkState.items));
    } catch { /* Keep the checklist usable if local storage is unavailable. */ }
  }, [checkState, sessionUser]);

  useEffect(() => {
    if (!packingTemplates.length) {
      setActivePackingTemplateId(null);
    } else if (!activePackingTemplateId || !packingTemplates.some((template) => template.id === activePackingTemplateId)) {
      setActivePackingTemplateId(packingTemplates[0].id);
    }
  }, [activePackingTemplateId, packingTemplates]);

  useEffect(() => {
    if (!sessionUser || !templateState.loaded || templateState.user !== sessionUser) return;
    setCheckState((previous) => {
      if (previous.user !== sessionUser) return previous;
      const items = pruneChecklist(previous.items, templateState.templates);
      return JSON.stringify(items) === JSON.stringify(previous.items) ? previous : { user: sessionUser, items };
    });
  }, [sessionUser, templateState]);

  function startPackingEdit(template: PackingTemplate) {
    setPackingEditingId(template.id);
    setPackingDraft({
      name: template.name,
      itemsText: template.items.join("\n"),
    });
  }

  function resetPackingEditor() {
    setPackingEditingId(null);
    setPackingDraft(emptyPackingDraft);
  }

  function togglePackingItem(templateId: number, item: string) {
    setCheckedPackingItems((prev) => {
      const current = prev[templateId] || [];
      const hasItem = current.some((entry) => normalizeText(entry) === normalizeText(item));
      return {
        ...prev,
        [templateId]: hasItem
          ? current.filter((entry) => normalizeText(entry) !== normalizeText(item))
          : [...current, item],
      };
    });
  }

  return {
    packingTemplates,
    setPackingTemplates,
    clearPackingTemplates: () => setTemplateState({ user: "", templates: [], loaded: false }),
    packingDraft,
    setPackingDraft,
    packingEditingId,
    setPackingEditingId,
    activePackingTemplateId,
    setActivePackingTemplateId,
    activePackingTemplate,
    checkedPackingItems,
    setCheckedPackingItems,
    startPackingEdit,
    resetPackingEditor,
    togglePackingItem,
  };
}

function getChecklistStorageKey(userId: string) {
  return `travel_log_packing_checks_${userId}`;
}

function pruneChecklist(checks: Record<number, string[]>, templates: PackingTemplate[]) {
  const ids = new Set(templates.map((template) => template.id));
  const next: Record<number, string[]> = {};
  Object.entries(checks).forEach(([key, items]) => {
    const id = Number(key);
    if (!ids.has(id)) return;
    const template = templates.find((entry) => entry.id === id);
    if (!template) return;
    next[id] = (items || []).filter((item) =>
      template.items.some((templateItem) => normalizeText(templateItem) === normalizeText(item))
    );
  });
  return next;
}
