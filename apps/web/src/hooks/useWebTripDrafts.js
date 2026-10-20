import { useEffect, useRef, useState } from "react";
import { createEmptyForm } from "../lib/tripUtils.js";
import { clearWebTripDraft, readWebTripDraft, saveWebTripDraft } from "../lib/tripDraftStore.js";

export function useWebTripDrafts({ user, form, tripEdit, showCreateTrip, setForm, setTripEdit, setShowCreateTrip, peopleProfiles }) {
  const [readyUser, setReadyUser] = useState(null);
  const [pendingRestore, setPendingRestore] = useState(null);
  const [storageError, setStorageError] = useState(false);
  const latest = useRef(null);
  const timer = useRef(null);
  const rememberPeople = (draft) => draft ? { ...draft, person_names_by_id: {
    ...(draft.person_names_by_id || {}),
    ...Object.fromEntries(peopleProfiles.filter((person) => draft.selected_person_ids.includes(person.id)).map((person) => [person.id, person.name])),
  } } : null;
  latest.current = user && readyUser === user && !pendingRestore ? { user, snapshot: { form: rememberPeople(form), tripEdit: rememberPeople(tripEdit), showCreateTrip } } : null;

  useEffect(() => {
    const saved = readWebTripDraft(localStorage, user);
    setPendingRestore(saved);
    setForm(createEmptyForm());
    setTripEdit(null);
    setShowCreateTrip(false);
    setStorageError(false);
    setReadyUser(user);
  }, [user, setForm, setTripEdit, setShowCreateTrip]);

  function flush() {
    clearTimeout(timer.current);
    const current = latest.current;
    if (current) setStorageError(!saveWebTripDraft(localStorage, current.user, current.snapshot));
  }
  useEffect(() => {
    if (!latest.current) return;
    timer.current = setTimeout(flush, 350);
    return () => clearTimeout(timer.current);
  }, [user, readyUser, pendingRestore, form, tripEdit, showCreateTrip, peopleProfiles]);

  useEffect(() => {
    // pagehide also covers mobile browser suspension; flush the latest keystroke.
    const save = () => flush();
    window.addEventListener("pagehide", save);
    window.addEventListener("beforeunload", save);
    return () => { window.removeEventListener("pagehide", save); window.removeEventListener("beforeunload", save); };
  }, []);

  function clear() {
    clearTimeout(timer.current);
    latest.current = null;
    clearWebTripDraft(localStorage, user);
  }
  function restore() {
    if (!pendingRestore) return;
    setForm(pendingRestore.form);
    setTripEdit(pendingRestore.tripEdit);
    setShowCreateTrip(!pendingRestore.tripEdit);
    setPendingRestore(null);
  }
  function discard() { clear(); setPendingRestore(null); }
  return { pendingRestore, storageError, restore, discard, clear, flush };
}
