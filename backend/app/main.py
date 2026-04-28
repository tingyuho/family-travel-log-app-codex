from __future__ import annotations

import sqlite3

from fastapi import FastAPI, HTTPException, Query, Response, status
from fastapi.middleware.cors import CORSMiddleware

from .db import init_db
from .repository import (
    create_person_profile,
    create_trip,
    delete_person_profile,
    delete_trip,
    get_trip,
    list_people_profiles,
    list_trips,
    update_trip,
)
from .schemas import PersonProfile, PersonProfileCreate, Trip, TripCreate, TripUpdate


app = FastAPI(title="Family Travel Log API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def startup() -> None:
    init_db()


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/api/trips", response_model=list[Trip])
def get_trips(q: str | None = Query(default=None, max_length=120)) -> list[Trip]:
    return list_trips(query=q)


@app.get("/api/trips/{trip_id}", response_model=Trip)
def get_trip_by_id(trip_id: int) -> Trip:
    trip = get_trip(trip_id)
    if trip is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Trip not found")
    return trip


@app.post("/api/trips", response_model=Trip, status_code=status.HTTP_201_CREATED)
def post_trip(payload: TripCreate) -> Trip:
    return create_trip(payload)


@app.put("/api/trips/{trip_id}", response_model=Trip)
def put_trip(trip_id: int, payload: TripUpdate) -> Trip:
    updated = update_trip(trip_id, payload)
    if updated is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Trip not found")
    return updated


@app.delete("/api/trips/{trip_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_trip(trip_id: int) -> Response:
    deleted = delete_trip(trip_id)
    if not deleted:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Trip not found")
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@app.get("/api/people", response_model=list[PersonProfile])
def get_people_profiles() -> list[PersonProfile]:
    return list_people_profiles()


@app.post("/api/people", response_model=PersonProfile, status_code=status.HTTP_201_CREATED)
def post_people_profile(payload: PersonProfileCreate) -> PersonProfile:
    try:
        return create_person_profile(payload)
    except sqlite3.IntegrityError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A profile with that name already exists",
        ) from exc


@app.delete("/api/people/{person_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_people_profile(person_id: int) -> Response:
    deleted = delete_person_profile(person_id)
    if not deleted:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Person profile not found")
    return Response(status_code=status.HTTP_204_NO_CONTENT)
