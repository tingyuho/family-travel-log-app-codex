import { useState } from "react";

import type { PersonProfile } from "../api";
import { emptyPersonDraft, type PersonDraft } from "../forms";

export function useFamilyProfiles() {
  const [people, setPeople] = useState<PersonProfile[]>([]);
  const [personDraft, setPersonDraft] = useState<PersonDraft>(emptyPersonDraft);
  const [personEditingId, setPersonEditingId] = useState<number | null>(null);

  function startPersonEdit(person: PersonProfile) {
    setPersonEditingId(person.id);
    setPersonDraft({
      name: person.name,
      relationship: person.relationship || "",
      notes: person.notes || "",
    });
  }

  function resetPersonEditor() {
    setPersonEditingId(null);
    setPersonDraft(emptyPersonDraft);
  }

  return {
    people,
    setPeople,
    clearPeople: () => setPeople([]),
    personDraft,
    setPersonDraft,
    personEditingId,
    setPersonEditingId,
    startPersonEdit,
    resetPersonEditor,
  };
}
