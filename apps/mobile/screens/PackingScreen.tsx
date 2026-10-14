import { useEffect, useState } from "react";
import { Alert, Pressable, Text, View } from "react-native";

import type { PackingTemplate } from "../api";
import type { PackingDraft } from "../forms";
import type { AppStyles, FieldComponent, StateSetter } from "../screenTypes";

export type PackingScreenProps = {
  styles: AppStyles;
  Field: FieldComponent;
  title?: string;
  packingEditingId: number | null;
  packingDraft: PackingDraft;
  setPackingDraft: StateSetter<PackingDraft>;
  emptyPackingDraft: PackingDraft;
  handleSavePacking: () => void;
  setPackingEditingId: (id: number | null) => void;
  packingTemplates: PackingTemplate[];
  activePackingTemplateId: number | null;
  setActivePackingTemplateId: (id: number | null) => void;
  activePackingTemplate: PackingTemplate | null;
  setCheckedPackingItems: StateSetter<Record<number, string[]>>;
  checkedPackingItems: Record<number, string[]>;
  normalizeText: (value: string) => string;
  togglePackingItem: (templateId: number, item: string) => void;
  startPackingEdit: (template: PackingTemplate) => void;
  deletePackingTemplate: (id: number) => Promise<null>;
  loadAll: () => Promise<void>;
  setError: (message: string | null) => void;
  messageFromError: (error: unknown) => string;
};

export default function PackingScreen(props: PackingScreenProps) {
  const {
    styles,
    Field,
    packingEditingId,
    packingDraft,
    setPackingDraft,
    emptyPackingDraft,
    handleSavePacking,
    setPackingEditingId,
    packingTemplates,
    activePackingTemplateId,
    setActivePackingTemplateId,
    activePackingTemplate,
    setCheckedPackingItems,
    checkedPackingItems,
    normalizeText,
    togglePackingItem,
    startPackingEdit,
    deletePackingTemplate,
    loadAll,
    setError,
    messageFromError,
    title = "Packing",
  } = props;
  const [showTemplateEditor, setShowTemplateEditor] = useState(Boolean(packingEditingId));

  useEffect(() => {
    if (packingEditingId) setShowTemplateEditor(true);
  }, [packingEditingId]);

  return (
    <View style={styles.panel}>
      <View style={styles.sectionHeader}>
        <View>
          <Text style={styles.sectionTitle}>{title}</Text>
          <Text style={styles.meta}>{packingTemplates.length} template{packingTemplates.length === 1 ? "" : "s"}</Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={showTemplateEditor ? "Close packing template form" : "Add packing template"}
          style={styles.primaryMiniButton}
          onPress={() => {
            if (packingEditingId) {
              setPackingEditingId(null);
              setPackingDraft(emptyPackingDraft);
              setShowTemplateEditor(false);
              return;
            }
            setShowTemplateEditor((prev) => !prev);
          }}
        >
          <Text style={styles.primaryMiniText}>{showTemplateEditor ? "Close" : "Add Template"}</Text>
        </Pressable>
      </View>

      {packingTemplates.length ? (
        <View style={styles.formBlock}>
          <Text style={styles.formTitle}>Active Checklist</Text>
          <View style={styles.segmentWrap}>
            {packingTemplates.map((template) => {
              const active = activePackingTemplateId === template.id;
              return (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Select packing checklist ${template.name}`}
                  accessibilityState={{ selected: active }}
                  key={`active-template-${template.id}`}
                  style={[styles.filterChip, active && styles.filterChipActive]}
                  onPress={() => setActivePackingTemplateId(template.id)}
                >
                  <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>{template.name}</Text>
                </Pressable>
              );
            })}
          </View>
          {activePackingTemplate ? (
            <View style={styles.inlineCard}>
              <View style={styles.rowSpaceBetween}>
                <Text style={styles.cardTitleSmall}>{activePackingTemplate.name}</Text>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Reset ${activePackingTemplate.name} checklist`}
                  style={styles.textButton}
                  onPress={() =>
                    setCheckedPackingItems((prev) => ({
                      ...prev,
                      [activePackingTemplate.id]: [],
                    }))
                  }
                >
                  <Text style={styles.textButtonLabel}>Reset</Text>
                </Pressable>
              </View>
              {activePackingTemplate.items.map((item: string) => {
                const checked = (checkedPackingItems[activePackingTemplate.id] || []).some(
                  (entry: string) => normalizeText(entry) === normalizeText(item)
                );
                return (
                  <Pressable
                    accessibilityRole="checkbox"
                    accessibilityLabel={`${checked ? "Uncheck" : "Check"} ${item}`}
                    accessibilityState={{ checked }}
                    key={`check-${activePackingTemplate.id}-${item}`}
                    style={[styles.checkItem, checked && styles.checkItemActive]}
                    onPress={() => togglePackingItem(activePackingTemplate.id, item)}
                  >
                    <Text style={[styles.checkItemText, checked && styles.checkItemTextActive]}>
                      {checked ? "[x]" : "[ ]"} {item}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          ) : null}
        </View>
      ) : null}

      {showTemplateEditor || packingEditingId ? (
      <View style={styles.formBlock}>
        <Text style={styles.formTitle}>{packingEditingId ? "Edit Template" : "New Template"}</Text>
        <Field label="Template Name" value={packingDraft.name} onChangeText={(name: string) => setPackingDraft((prev) => ({ ...prev, name }))} />
        <Field
          label="Items (one per line)"
          value={packingDraft.itemsText}
          onChangeText={(itemsText: string) => setPackingDraft((prev) => ({ ...prev, itemsText }))}
          multiline
        />
        <View style={styles.actionRow}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={packingEditingId ? "Save packing template" : "Add packing template"}
            style={styles.primaryButton}
            onPress={handleSavePacking}
          >
            <Text style={styles.primaryButtonText}>{packingEditingId ? "Save Template" : "Add Template"}</Text>
          </Pressable>
          {packingEditingId ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Cancel packing template edit"
              style={styles.secondaryButton}
              onPress={() => {
                setPackingEditingId(null);
                setPackingDraft(emptyPackingDraft);
                setShowTemplateEditor(false);
              }}
            >
              <Text style={styles.secondaryButtonText}>Cancel</Text>
            </Pressable>
          ) : null}
        </View>
      </View>
      ) : null}

      {packingTemplates.map((template) => (
        <View key={template.id} style={styles.card}>
          <Text style={styles.cardTitle}>{template.name}</Text>
          <Text style={styles.cardText}>{template.items.length} item(s)</Text>
          <View style={styles.actionRowWrap}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Edit packing template ${template.name}`}
              style={styles.actionMiniButton}
              onPress={() => startPackingEdit(template)}
            >
              <Text style={styles.actionMiniText}>Edit</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Remove packing template ${template.name}`}
              style={styles.actionMiniButtonDanger}
              onPress={() =>
                Alert.alert("Delete template?", "This removes the template from shared database.", [
                  { text: "Cancel", style: "cancel" },
                  {
                    text: "Delete",
                    style: "destructive",
                    onPress: () => {
                      void deletePackingTemplate(template.id).then(() => loadAll()).catch((e: unknown) => setError(messageFromError(e)));
                    },
                  },
                ])
              }
            >
              <Text style={styles.actionMiniTextDanger}>Remove</Text>
            </Pressable>
          </View>
        </View>
      ))}
    </View>
  );
}
