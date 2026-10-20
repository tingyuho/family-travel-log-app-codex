from __future__ import annotations

from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, Field, model_validator


class RoutePoint(BaseModel):
    lat: float = Field(ge=-90, le=90)
    lng: float = Field(ge=-180, le=180)
    label: str | None = Field(default=None, max_length=160)
    order: int | None = Field(default=None, ge=0)


class Accommodation(BaseModel):
    name: str = Field(min_length=1)
    location: str = ""
    check_in: date | None = None
    check_out: date | None = None
    notes: str = ""

    @model_validator(mode="after")
    def validate_date_range(self) -> "Accommodation":
        if self.check_in and self.check_out and self.check_out < self.check_in:
            raise ValueError("Accommodation check-out cannot be before check-in")
        return self


class ItineraryEvent(BaseModel):
    date: date
    time: str = Field(default="", max_length=20)
    activity: str = Field(min_length=1, max_length=160)
    location: str = Field(default="", max_length=160)
    notes: str = Field(default="", max_length=300)


class TripBase(BaseModel):
    title: str = Field(min_length=1, max_length=140)
    trip_kind: Literal["past", "wishlist"] = "past"
    start_date: date | None = None
    end_date: date | None = None
    notes: str = ""
    route: list[RoutePoint] = Field(default_factory=list)
    people: list[str] = Field(default_factory=list)
    accommodations: list[Accommodation] = Field(default_factory=list)
    itinerary: list[ItineraryEvent] = Field(default_factory=list)

    @model_validator(mode="after")
    def validate_date_range(self) -> "TripBase":
        if self.start_date and self.end_date and self.end_date < self.start_date:
            raise ValueError("Trip end date cannot be before start date")
        return self


class TripCreate(TripBase):
    pass


class TripUpdate(TripBase):
    version: int | None = Field(default=None, ge=1)


class TripStopCreate(BaseModel):
    point: RoutePoint
    itinerary_event: ItineraryEvent | None = None


class Trip(TripBase):
    version: int = Field(default=1, ge=1)
    id: int
    created_at: datetime
    updated_at: datetime


class PersonProfileBase(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    relationship: str = Field(default="", max_length=80)
    notes: str = Field(default="", max_length=250)


class PersonProfileCreate(PersonProfileBase):
    pass


class PersonProfileUpdate(PersonProfileBase):
    pass


class PersonProfile(PersonProfileBase):
    id: int
    sort_order: int = 0
    created_at: datetime


class PersonProfileReorder(BaseModel):
    ordered_ids: list[int] = Field(default_factory=list, min_length=1)


class PackingTemplateBase(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    items: list[str] = Field(default_factory=list)


class PackingTemplateCreate(PackingTemplateBase):
    pass


class PackingTemplateUpdate(PackingTemplateBase):
    pass


class PackingTemplate(PackingTemplateBase):
    id: int
    created_at: datetime
    updated_at: datetime


class UserRegister(BaseModel):
    user_id: str = Field(min_length=3, max_length=40, pattern=r"^[A-Za-z0-9_\-]+$")
    email: str = Field(
        min_length=5,
        max_length=254,
        pattern=r"^[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}$",
    )
    password: str = Field(min_length=8, max_length=120)


class UserLogin(BaseModel):
    user_id: str = Field(min_length=3, max_length=40, pattern=r"^[A-Za-z0-9_\-]+$")
    password: str = Field(min_length=8, max_length=120)


class PasswordResetRequest(BaseModel):
    user_id: str = Field(min_length=3, max_length=40, pattern=r"^[A-Za-z0-9_\-]+$")
    new_password: str = Field(min_length=8, max_length=120)
    email_code: str = Field(min_length=4, max_length=12)
    reset_key: str = Field(default="", max_length=120)


class AuthToken(BaseModel):
    token: str
    user_id: str


class PasswordResetEmailRequest(BaseModel):
    user_id: str = Field(min_length=3, max_length=40, pattern=r"^[A-Za-z0-9_\-]+$")


class UserProfile(BaseModel):
    user_id: str
    email: str


class UserProfileUpdate(BaseModel):
    email: str = Field(
        min_length=5,
        max_length=254,
        pattern=r"^[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}$",
    )


class LocationSuggestion(BaseModel):
    place_id: str
    display_name: str
    lat: str
    lon: str
