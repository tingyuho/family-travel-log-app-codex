import { useEffect, useMemo, useState } from "react";
import Storage from "expo-sqlite/kv-store";

import type { PackingTemplate } from "../api";
import { emptyPackingDraft, type PackingDraft } from "../forms";
import { normalizeText } from "../utils";

export function usePacking(sessionUser: string) {
  const [packingTemplates, setPackingTemplates] = useState<PackingTemplate[]>([]);
  const [packingDraft, setPackingDraft] = useState<PackingDraft>(emptyPackingDraft);
  const [packingEditingId, setPackingEditingId] = useState<number | null>(null);
  const [activePackingTemplateId, setActivePackingTemplateId] = useState<number | null>(null);
  const [checkedPackingItems, setCheckedPackingItems] = useState<Record<number, string[]>>({});

  const activePackingTemplate = useMemo(
    () =>
      activePackingTemplateId
        ? packingTemplates.find((template) => template.id === activePackingTemplateId) || null
        : null,
    [activePackingTemplateId, packingTemplates]
  );

  useEffect(() => {
    if (!sessionUser) return;
    try {
      const raw = Storage.getItemSync(getChecklistStorageKey(sessionUser));
      setCheckedPackingItems(raw ? (JSON.parse(raw) as Record<number, string[]>) : {});
    } catch {
      setCheckedPackingItems({});
    }
  }, [sessionUser]);

  useEffect(() => {
    if (!sessionUser) return;
    try {
      Storage.setItemSync(getChecklistStorageKey(sessionUser), JSON.stringify(checkedPackingItems));
    } catch {
      // best effort only
    }
  }, [checkedPackingItems, sessionUser]);

  useEffect(() => {
    if (!packingTemplates.length) {
      setActivePackingTemplateId(null);
      return;
    }
    if (!activePackingTemplateId || !packingTemplates.some((template) => template.id === activePackingTemplateId)) {
      setActivePackingTemplateId(packingTemplates[0].id);
    }
  }, [activePackingTemplateId, packingTemplates]);

  useEffect(() => {
    setCheckedPackingItems((prev) => pruneChecklist(prev, packingTemplates));
  }, [packingTemplates]);

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
    clearPackingTemplates: () => setPackingTemplates([]),
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
