import type { AccommodationInput, ItineraryEventInput } from "./api";
import type { TripDraftShape } from "./utils";

export type Tab = "trips" | "map" | "hub";
export type AuthMode = "login" | "register" | "reset";
export type TripFilterKind = "all" | "past" | "wishlist";

export type TripDraftForm = TripDraftShape;

export type PersonDraft = {
  name: string;
  relationship: string;
  notes: string;
};

export type PackingDraft = {
  name: string;
  itemsText: string;
};

export type ResetForm = {
  user_id: string;
  email_code: string;
  new_password: string;
  confirm_password: string;
  reset_key: string;
};

export const emptyResetForm: ResetForm = {
  user_id: "",
  email_code: "",
  new_password: "",
  confirm_password: "",
  reset_key: "",
};

export const emptyTripDraft: TripDraftForm = {
  title: "",
  trip_kind: "past",
  start_date: "",
  end_date: "",
  notes: "",
  route_text: "",
  selected_people: [],
  accommodations: [emptyAccommodation()],
  itinerary: [emptyItinerary()],
};

export const emptyPersonDraft: PersonDraft = {
  name: "",
  relationship: "",
  notes: "",
};

export const emptyPackingDraft: PackingDraft = {
  name: "",
  itemsText: "",
};

export function emptyAccommodation(): AccommodationInput {
  return {
    name: "",
    location: "",
    check_in: "",
    check_out: "",
    notes: "",
  };
}

export function emptyItinerary(): ItineraryEventInput {
  return {
    date: "",
    time: "",
    activity: "",
    location: "",
    notes: "",
  };
}
