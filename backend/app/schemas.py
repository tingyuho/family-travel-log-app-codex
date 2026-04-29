from __future__ import annotations

from datetime import date, datetime

from pydantic import BaseModel, Field


class RoutePoint(BaseModel):
    lat: float
    lng: float
    label: str | None = None
    order: int | None = None


class Accommodation(BaseModel):
    name: str = Field(min_length=1)
    location: str = ""
    check_in: date | None = None
    check_out: date | None = None
    notes: str = ""


class TripBase(BaseModel):
    title: str = Field(min_length=1, max_length=140)
    start_date: date | None = None
    end_date: date | None = None
    notes: str = ""
    route: list[RoutePoint] = Field(default_factory=list)
    people: list[str] = Field(default_factory=list)
    accommodations: list[Accommodation] = Field(default_factory=list)


class TripCreate(TripBase):
    pass


class TripUpdate(TripBase):
    pass


class Trip(TripBase):
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
    created_at: datetime


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
    password: str = Field(min_length=8, max_length=120)


class UserLogin(UserRegister):
    pass


class PasswordResetRequest(BaseModel):
    user_id: str = Field(min_length=3, max_length=40, pattern=r"^[A-Za-z0-9_\-]+$")
    new_password: str = Field(min_length=8, max_length=120)
    reset_key: str = Field(default="", max_length=120)


class AuthToken(BaseModel):
    token: str
    user_id: str
