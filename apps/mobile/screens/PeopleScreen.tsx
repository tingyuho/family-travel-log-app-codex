import { useEffect, useMemo, useRef, useState } from "react";
import { Alert, Animated, PanResponder, Pressable, Text, View } from "react-native";

import type { PersonProfile } from "../api";
import type { PersonDraft } from "../forms";
import type { AppStyles, FieldComponent, StateSetter } from "../screenTypes";

const PERSON_ROW_DRAG_STEP = 74;

export type PeopleScreenProps = {
  styles: AppStyles;
  Field: FieldComponent;
  title?: string;
  personEditingId: number | null;
  personDraft: PersonDraft;
  setPersonDraft: StateSetter<PersonDraft>;
  emptyPersonDraft: PersonDraft;
  handleSavePerson: () => void;
  setPersonEditingId: (id: number | null) => void;
  people: PersonProfile[];
  startPersonEdit: (person: PersonProfile) => void;
  reorderPerson: (personId: number, targetIndex: number) => void;
  deletePeopleProfile: (id: number) => Promise<null>;
  loadAll: () => Promise<void>;
  setError: (message: string | null) => void;
  messageFromError: (error: unknown) => string;
  getTravelTripCount?: (person: PersonProfile) => number;
  onOpenTravelHistory?: (person: PersonProfile) => void;
};

export default function PeopleScreen(props: PeopleScreenProps) {
  const {
    styles,
    Field,
    title = "People",
    personEditingId,
    personDraft,
    setPersonDraft,
    emptyPersonDraft,
    handleSavePerson,
    setPersonEditingId,
    people,
    startPersonEdit,
    reorderPerson,
    deletePeopleProfile,
    loadAll,
    setError,
    messageFromError,
    getTravelTripCount,
    onOpenTravelHistory,
  } = props;
  const [showPersonForm, setShowPersonForm] = useState(Boolean(personEditingId));

  useEffect(() => {
    if (personEditingId) setShowPersonForm(true);
  }, [personEditingId]);

  return (
    <View style={styles.panel}>
      <View style={styles.sectionHeader}>
        <View>
          <Text style={styles.sectionTitle}>{title}</Text>
          <Text style={styles.meta}>{people.length} profile{people.length === 1 ? "" : "s"}</Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={showPersonForm ? "Close profile form" : "Add family profile"}
          style={styles.primaryMiniButton}
          onPress={() => {
            if (personEditingId) {
              setPersonEditingId(null);
              setPersonDraft(emptyPersonDraft);
              setShowPersonForm(false);
              return;
            }
            setShowPersonForm((prev) => !prev);
          }}
        >
          <Text style={styles.primaryMiniText}>{showPersonForm ? "Close" : "Add Profile"}</Text>
        </Pressable>
      </View>

      {showPersonForm || personEditingId ? (
      <View style={styles.formBlock}>
        <Text style={styles.formTitle}>{personEditingId ? "Edit Profile" : "New Profile"}</Text>
        <Field label="Name" value={personDraft.name} onChangeText={(name: string) => setPersonDraft((prev) => ({ ...prev, name }))} />
        <Field
          label="Relationship"
          value={personDraft.relationship}
          onChangeText={(relationship: string) => setPersonDraft((prev) => ({ ...prev, relationship }))}
        />
        <Field label="Notes" value={personDraft.notes} onChangeText={(notes: string) => setPersonDraft((prev) => ({ ...prev, notes }))} multiline />
        <View style={styles.actionRow}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={personEditingId ? "Save family profile" : "Add family profile"}
            style={styles.primaryButton}
            onPress={handleSavePerson}
          >
            <Text style={styles.primaryButtonText}>{personEditingId ? "Save Person" : "Add Person"}</Text>
          </Pressable>
          {personEditingId ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Cancel profile edit"
              style={styles.secondaryButton}
              onPress={() => {
                setPersonEditingId(null);
                setPersonDraft(emptyPersonDraft);
                setShowPersonForm(false);
              }}
            >
              <Text style={styles.secondaryButtonText}>Cancel</Text>
            </Pressable>
          ) : null}
        </View>
      </View>
      ) : null}

      {people.map((person, index) => (
        <DraggablePersonRow
          key={person.id}
          person={person}
          index={index}
          peopleCount={people.length}
          styles={styles}
          startPersonEdit={startPersonEdit}
          reorderPerson={reorderPerson}
          tripCount={getTravelTripCount?.(person) || 0}
          onOpenTravelHistory={onOpenTravelHistory ? () => onOpenTravelHistory(person) : undefined}
          onDelete={() =>
            Alert.alert("Delete profile?", "This removes the profile from shared database.", [
              { text: "Cancel", style: "cancel" },
              {
                text: "Delete",
                style: "destructive",
                onPress: () => {
                  void deletePeopleProfile(person.id).then(() => loadAll()).catch((e: unknown) => setError(messageFromError(e)));
                },
              },
            ])
          }
        />
      ))}
    </View>
  );
}

function DraggablePersonRow({
  person,
  index,
  peopleCount,
  styles,
  startPersonEdit,
  reorderPerson,
  tripCount,
  onOpenTravelHistory,
  onDelete,
}: {
  person: PersonProfile;
  index: number;
  peopleCount: number;
  styles: AppStyles;
  startPersonEdit: (person: PersonProfile) => void;
  reorderPerson: (personId: number, targetIndex: number) => void;
  tripCount: number;
  onOpenTravelHistory?: () => void;
  onDelete: () => void;
}) {
  const [dragging, setDragging] = useState(false);
  const translateY = useRef(new Animated.Value(0)).current;
  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => false,
        onMoveShouldSetPanResponder: (_, gesture) =>
          Math.abs(gesture.dy) > 8 && Math.abs(gesture.dy) > Math.abs(gesture.dx) * 1.2,
        onPanResponderGrant: () => {
          setDragging(true);
          translateY.setValue(0);
        },
        onPanResponderMove: (_, gesture) => {
          translateY.setValue(gesture.dy);
        },
        onPanResponderRelease: (_, gesture) => {
          const offset = Math.round(gesture.dy / PERSON_ROW_DRAG_STEP);
          const targetIndex = Math.max(0, Math.min(index + offset, peopleCount - 1));
          setDragging(false);
          Animated.spring(translateY, {
            toValue: 0,
            useNativeDriver: true,
            speed: 24,
            bounciness: 4,
          }).start();
          if (targetIndex !== index) {
            reorderPerson(person.id, targetIndex);
          }
        },
        onPanResponderTerminationRequest: () => false,
        onPanResponderTerminate: () => {
          setDragging(false);
          Animated.spring(translateY, {
            toValue: 0,
            useNativeDriver: true,
            speed: 24,
            bounciness: 4,
          }).start();
        },
      }),
    [index, peopleCount, person.id, reorderPerson, translateY]
  );

  return (
    <Animated.View
      style={[
        styles.personRowCard,
        dragging && styles.personRowCardDragging,
        {
          transform: [{ translateY }],
        },
      ]}
    >
      <View
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel={`${person.name}. Drag up or down to reorder.`}
        style={styles.personRowDragArea}
        {...panResponder.panHandlers}
      >
        <View style={styles.personRowText}>
          <Text style={styles.cardTitleSmall}>{person.name}</Text>
          {person.relationship ? <Text style={styles.cardMeta}>{person.relationship}</Text> : null}
          {onOpenTravelHistory ? (
            <Text style={styles.cardMeta}>{tripCount} trip{tripCount === 1 ? "" : "s"} together</Text>
          ) : null}
          {person.notes ? <Text style={styles.cardText} numberOfLines={2}>{person.notes}</Text> : null}
        </View>
      </View>
      <View style={styles.personRowActions}>
        {onOpenTravelHistory ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`View travel history for ${person.name}`}
            style={styles.actionMiniButton}
            onPress={onOpenTravelHistory}
          >
            <Text style={styles.actionMiniText}>History</Text>
          </Pressable>
        ) : null}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Edit ${person.name}`}
          style={styles.actionMiniButton}
          onPress={() => startPersonEdit(person)}
        >
          <Text style={styles.actionMiniText}>Edit</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Remove ${person.name}`}
          style={styles.actionMiniButtonDanger}
          onPress={onDelete}
        >
          <Text style={styles.actionMiniTextDanger}>Remove</Text>
        </Pressable>
      </View>
    </Animated.View>
  );
}
