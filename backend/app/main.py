from __future__ import annotations

import json
import os
from contextlib import asynccontextmanager
from typing import Literal
from urllib.parse import urlencode
from urllib.request import Request as UrlRequest, urlopen

from fastapi import Depends, FastAPI, Header, HTTPException, Query, Request, Response, status
from fastapi.middleware.cors import CORSMiddleware

from .auth import generate_reset_code
from .db import DatabaseIntegrityError, get_connection, init_db, is_postgres
from .env import configured_frontend_origins, is_production_environment
from .mailer import is_mailer_configured, send_password_reset_email
from .operations import OperationsMiddleware, release_identifier
from .repository import (
    append_trip_stop,
    TripConflictError,
    TripVersionRequiredError,
    authenticate_user,
    consume_password_reset_code,
    create_person_profile,
    create_packing_template,
    create_password_reset_code,
    create_session,
    create_trip,
    create_user,
    delete_packing_template,
    delete_person_profile,
    delete_trip,
    enforce_rate_limit,
    get_trip,
    get_cached_location_search,
    get_user_profile,
    get_user_by_token,
    list_packing_templates,
    list_people_profiles,
    list_trips,
    reorder_people_profiles,
    reset_user_password,
    revoke_session,
    save_location_search_cache,
    update_packing_template,
    update_person_profile,
    update_trip,
    update_user_email,
)
from .schemas import (
    AuthToken,
    LocationSuggestion,
    PackingTemplate,
    PackingTemplateCreate,
    PackingTemplateUpdate,
    PasswordResetEmailRequest,
    PasswordResetRequest,
    PersonProfile,
    PersonProfileCreate,
    PersonProfileReorder,
    PersonProfileUpdate,
    Trip,
    TripCreate,
    TripUpdate,
    TripStopCreate,
    UserLogin,
    UserProfile,
    UserProfileUpdate,
    UserRegister,
)


@asynccontextmanager
async def lifespan(_: FastAPI):
    init_db()
    yield


app = FastAPI(title="Family Travel Log API", version="2.0.0", lifespan=lifespan)
PASSWORD_RESET_KEY = os.getenv("PASSWORD_RESET_KEY", "").strip()
PASSWORD_RESET_ADMIN_KEY_ENABLED = os.getenv("PASSWORD_RESET_ADMIN_KEY_ENABLED", "false").strip().lower() == "true"
AUTH_LOGIN_RATE_LIMIT_PER_MINUTE = max(1, int(os.getenv("AUTH_LOGIN_RATE_LIMIT_PER_MINUTE", "8")))
PASSWORD_RESET_RATE_LIMIT_PER_MINUTE = max(1, int(os.getenv("PASSWORD_RESET_RATE_LIMIT_PER_MINUTE", "4")))
GEOCODER_TTL_SECONDS = max(30, int(os.getenv("GEOCODER_CACHE_TTL_SECONDS", "900")))
GEOCODER_RATE_LIMIT_PER_MINUTE = max(1, int(os.getenv("GEOCODER_RATE_LIMIT_PER_MINUTE", "30")))
GOOGLE_PLACES_PROVIDER = "google_places"
NOMINATIM_PROVIDER = "nominatim"
GEOCODER_PROVIDER = os.getenv("GEOCODER_PROVIDER", GOOGLE_PLACES_PROVIDER).strip().lower()
GOOGLE_PLACES_API_KEY = (os.getenv("GOOGLE_PLACES_API_KEY") or os.getenv("GOOGLE_MAPS_API_KEY", "")).strip()
GEOCODER_USER_AGENT = (
    os.getenv("GEOCODER_USER_AGENT", "FamilyTravelLog/2.0 (local development; configure GEOCODER_USER_AGENT with contact email)")
    .strip()
)


def _cors_origins() -> list[str]:
    configured = configured_frontend_origins()
    if configured:
        return configured
    return [
        "http://127.0.0.1:5173",
        "http://localhost:5173",
        "http://127.0.0.1:5174",
        "http://localhost:5174",
        "http://127.0.0.1:5175",
        "http://localhost:5175",
    ]


def _cors_origin_regex() -> str | None:
    if is_production_environment():
        return None
    configured = os.getenv("FRONTEND_ORIGIN_REGEX", "").strip()
    if configured:
        return configured
    # Local development: allow localhost/127.0.0.1 on any port (Vite may auto-pick new ports).
    return r"^https?://(localhost|127\.0\.0\.1)(:\d+)?$"


def _client_ip(request: Request) -> str:
    forwarded_for = request.headers.get("x-forwarded-for", "")
    if forwarded_for:
        return forwarded_for.split(",", 1)[0].strip() or "unknown"
    return request.client.host if request.client else "unknown"


def _enforce_request_rate_limit(action: str, identifiers: list[str], limit: int, message: str) -> None:
    for identifier in identifiers:
        if not identifier:
            continue
        bucket = f"{action}:{identifier}"
        if not enforce_rate_limit(bucket, limit, 60):
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=message,
            )


def _enforce_geocoder_rate_limit(request: Request, current_user_id: str) -> None:
    _enforce_request_rate_limit(
        "geocoder",
        [f"user:{current_user_id}", f"ip:{_client_ip(request)}"],
        GEOCODER_RATE_LIMIT_PER_MINUTE,
        "Location search is temporarily rate-limited. Wait a minute, then try again.",
    )


def _enforce_login_rate_limit(request: Request, user_id: str) -> None:
    _enforce_request_rate_limit(
        "login",
        [f"user:{user_id.strip().lower()}", f"ip:{_client_ip(request)}"],
        AUTH_LOGIN_RATE_LIMIT_PER_MINUTE,
        "Too many login attempts. Wait a minute, then try again.",
    )


def _enforce_password_reset_rate_limit(request: Request, user_id: str) -> None:
    _enforce_request_rate_limit(
        "password_reset",
        [f"user:{user_id.strip().lower()}", f"ip:{_client_ip(request)}"],
        PASSWORD_RESET_RATE_LIMIT_PER_MINUTE,
        "Too many password reset attempts. Wait a minute, then try again.",
    )


def _normalized_geocoder_provider() -> str:
    provider = GEOCODER_PROVIDER.strip().lower()
    if provider in {"google", "places", "google_places"}:
        return GOOGLE_PLACES_PROVIDER
    if provider in {"osm", "openstreetmap", "nominatim"}:
        return NOMINATIM_PROVIDER
    return provider


def _search_places(query: str, limit: int) -> list[dict[str, str]]:
    provider = _normalized_geocoder_provider()
    cached = get_cached_location_search(query, limit, provider)
    if cached is not None:
        return cached

    if provider == GOOGLE_PLACES_PROVIDER:
        results = _fetch_google_places(query, limit)
    elif provider == NOMINATIM_PROVIDER:
        results = _fetch_nominatim_places(query, limit)
    else:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Location search provider is not configured. Use google_places or nominatim.",
        )

    save_location_search_cache(query, limit, provider, results, GEOCODER_TTL_SECONDS)
    return results


def _fetch_google_places(query: str, limit: int) -> list[dict[str, str]]:
    if not GOOGLE_PLACES_API_KEY:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Location search is not configured. Set GOOGLE_PLACES_API_KEY on the backend.",
        )

    request_body = json.dumps(
        {
            "textQuery": query,
            "pageSize": min(max(limit, 1), 20),
            "languageCode": "en",
        }
    ).encode("utf-8")
    req = UrlRequest(
        "https://places.googleapis.com/v1/places:searchText",
        data=request_body,
        headers={
            "Content-Type": "application/json",
            "X-Goog-Api-Key": GOOGLE_PLACES_API_KEY,
            "X-Goog-FieldMask": "places.id,places.displayName,places.formattedAddress,places.location",
        },
    )
    try:
        with urlopen(req, timeout=8) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Google Places search is unavailable right now. Try again later or enter route stops manually.",
        ) from exc

    results: list[dict[str, str]] = []
    for place in payload.get("places", []) if isinstance(payload, dict) else []:
        location = place.get("location", {}) if isinstance(place, dict) else {}
        lat = str(location.get("latitude", "")).strip() if isinstance(location, dict) else ""
        lon = str(location.get("longitude", "")).strip() if isinstance(location, dict) else ""
        display_name = _google_place_display_name(place)
        if not lat or not lon or not display_name:
            continue
        results.append(
            {
                "place_id": _google_place_id(place, lat, lon),
                "display_name": display_name,
                "lat": lat,
                "lon": lon,
            }
        )

    return results


def _google_place_display_name(place: dict) -> str:
    display_name = place.get("displayName", {})
    name = str(display_name.get("text", "")).strip() if isinstance(display_name, dict) else ""
    address = str(place.get("formattedAddress", "")).strip()
    if name and address and not address.lower().startswith(name.lower()):
        return f"{name}, {address}"
    return address or name


def _google_place_id(place: dict, lat: str, lon: str) -> str:
    place_id = str(place.get("id", "")).strip()
    if place_id:
        return place_id

    resource_name = str(place.get("name", "")).strip()
    if resource_name.startswith("places/"):
        return resource_name.removeprefix("places/")
    return resource_name or f"{lat},{lon}"


def _fetch_nominatim_places(query: str, limit: int) -> list[dict[str, str]]:
    if not GEOCODER_USER_AGENT:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Location search is not configured. Set GEOCODER_USER_AGENT on the backend.",
        )

    params = urlencode(
        {
            "q": query,
            "format": "jsonv2",
            "addressdetails": "1",
            "limit": str(limit),
        }
    )
    req = UrlRequest(
        f"https://nominatim.openstreetmap.org/search?{params}",
        headers={
            "Accept-Language": "en-US",
            "User-Agent": GEOCODER_USER_AGENT,
        },
    )
    try:
        with urlopen(req, timeout=8) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Location search is unavailable right now. Try again later or enter route stops manually.",
        ) from exc

    results: list[dict[str, str]] = []
    for row in payload if isinstance(payload, list) else []:
        lat = str(row.get("lat", "")).strip()
        lon = str(row.get("lon", "")).strip()
        display_name = str(row.get("display_name", "")).strip()
        if not lat or not lon or not display_name:
            continue
        results.append(
            {
                "place_id": str(row.get("place_id", "")) or f"{lat},{lon}",
                "display_name": display_name,
                "lat": lat,
                "lon": lon,
            }
        )

    return results


app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins(),
    allow_origin_regex=_cors_origin_regex(),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.add_middleware(OperationsMiddleware)


def startup() -> None:
    init_db()


def get_current_user_id(authorization: str | None = Header(default=None)) -> str:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing bearer token")
    token = authorization.split(" ", 1)[1].strip()
    user_id = get_user_by_token(token)
    if not user_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")
    return user_id


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "release": release_identifier()}


@app.get("/health/db")
def health_db() -> dict[str, str]:
    try:
        with get_connection() as conn:
            conn.execute("SELECT 1")
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=f"DB check failed: {exc}") from exc
    return {
        "status": "ok",
        "database": "postgres" if is_postgres() else "sqlite",
        "release": release_identifier(),
    }


@app.post("/api/auth/register", response_model=AuthToken, status_code=status.HTTP_201_CREATED)
def register(payload: UserRegister) -> AuthToken:
    created = create_user(payload.user_id.strip(), payload.email.strip().lower(), payload.password)
    if not created:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="User ID already exists")
    token = create_session(payload.user_id.strip())
    return AuthToken(token=token, user_id=payload.user_id.strip())


@app.post("/api/auth/login", response_model=AuthToken)
def login(payload: UserLogin, request: Request) -> AuthToken:
    user_id = payload.user_id.strip()
    _enforce_login_rate_limit(request, user_id)
    if not authenticate_user(user_id, payload.password):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid username or password")
    token = create_session(user_id)
    return AuthToken(token=token, user_id=user_id)


@app.post("/api/auth/reset-password", status_code=status.HTTP_204_NO_CONTENT)
def reset_password(payload: PasswordResetRequest, request: Request) -> Response:
    _enforce_password_reset_rate_limit(request, payload.user_id.strip())
    if not consume_password_reset_code(payload.user_id.strip(), payload.email_code.strip()):
        if PASSWORD_RESET_ADMIN_KEY_ENABLED and PASSWORD_RESET_KEY and payload.reset_key.strip() == PASSWORD_RESET_KEY:
            pass
        else:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Invalid or expired verification code")
    updated = reset_user_password(payload.user_id.strip(), payload.new_password)
    if not updated:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@app.post("/api/auth/request-password-reset", status_code=status.HTTP_204_NO_CONTENT)
def request_password_reset(payload: PasswordResetEmailRequest, request: Request) -> Response:
    _enforce_password_reset_rate_limit(request, payload.user_id.strip())
    if not is_mailer_configured():
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Password reset email is not configured yet. Ask the app owner to set SMTP settings.",
        )

    user_id = payload.user_id.strip()
    code = generate_reset_code()
    email = create_password_reset_code(user_id, code)
    if email:
        try:
            send_password_reset_email(email, user_id, code)
        except Exception as exc:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail=f"Failed to send reset email: {exc}",
            ) from exc
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@app.get("/api/auth/me", response_model=UserProfile)
def me(current_user_id: str = Depends(get_current_user_id)) -> UserProfile:
    profile = get_user_profile(current_user_id)
    if profile is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    return profile


@app.put("/api/auth/me", response_model=UserProfile)
def update_me(payload: UserProfileUpdate, current_user_id: str = Depends(get_current_user_id)) -> UserProfile:
    profile = update_user_email(current_user_id, payload.email.strip().lower())
    if profile is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    return profile


@app.post("/api/auth/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(authorization: str | None = Header(default=None)) -> Response:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing bearer token")
    token = authorization.split(" ", 1)[1].strip()
    revoke_session(token)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@app.get("/api/trips", response_model=list[Trip])
def get_trips(
    q: str | None = Query(default=None, max_length=120),
    trip_kind: Literal["past", "wishlist"] | None = Query(default=None),
    current_user_id: str = Depends(get_current_user_id),
) -> list[Trip]:
    return list_trips(current_user_id, query=q, trip_kind=trip_kind)


@app.get("/api/trips/{trip_id}", response_model=Trip)
def get_trip_by_id(trip_id: int, current_user_id: str = Depends(get_current_user_id)) -> Trip:
    trip = get_trip(current_user_id, trip_id)
    if trip is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Trip not found")
    return trip


@app.post("/api/trips", response_model=Trip, status_code=status.HTTP_201_CREATED)
def post_trip(payload: TripCreate, current_user_id: str = Depends(get_current_user_id)) -> Trip:
    return create_trip(current_user_id, payload)


@app.put("/api/trips/{trip_id}", response_model=Trip)
def put_trip(trip_id: int, payload: TripUpdate, current_user_id: str = Depends(get_current_user_id)) -> Trip:
    try:
        updated = update_trip(current_user_id, trip_id, payload)
    except TripVersionRequiredError:
        raise HTTPException(status_code=428, detail="Update the app and reopen this trip before editing. Your draft has been kept.")
    except TripConflictError:
        raise HTTPException(status_code=409, detail="This trip changed on another device. Your draft has been kept. Review the latest trip before editing again.")
    if updated is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Trip not found")
    return updated


@app.post("/api/trips/{trip_id}/stops", response_model=Trip, status_code=status.HTTP_201_CREATED)
def post_trip_stop(trip_id: int, payload: TripStopCreate, current_user_id: str = Depends(get_current_user_id)) -> Trip:
    try:
        updated = append_trip_stop(current_user_id, trip_id, payload)
    except TripConflictError:
        raise HTTPException(status_code=409, detail="This trip is being edited. Your stop has not been saved; try again.")
    if updated is None:
        raise HTTPException(status_code=404, detail="Trip not found")
    return updated


@app.delete("/api/trips/{trip_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_trip(trip_id: int, current_user_id: str = Depends(get_current_user_id)) -> Response:
    deleted = delete_trip(current_user_id, trip_id)
    if not deleted:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Trip not found")
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@app.get("/api/people", response_model=list[PersonProfile])
def get_people_profiles(current_user_id: str = Depends(get_current_user_id)) -> list[PersonProfile]:
    return list_people_profiles(current_user_id)


@app.post("/api/people", response_model=PersonProfile, status_code=status.HTTP_201_CREATED)
def post_people_profile(
    payload: PersonProfileCreate,
    current_user_id: str = Depends(get_current_user_id),
) -> PersonProfile:
    try:
        return create_person_profile(current_user_id, payload)
    except (DatabaseIntegrityError, ValueError) as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A profile with that name already exists",
        ) from exc


@app.put("/api/people/reorder", response_model=list[PersonProfile])
def put_people_profile_order(
    payload: PersonProfileReorder,
    current_user_id: str = Depends(get_current_user_id),
) -> list[PersonProfile]:
    ordered = reorder_people_profiles(current_user_id, payload.ordered_ids)
    if ordered is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid profile order payload")
    return ordered


@app.delete("/api/people/{person_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_people_profile(person_id: int, current_user_id: str = Depends(get_current_user_id)) -> Response:
    deleted = delete_person_profile(current_user_id, person_id)
    if not deleted:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Person profile not found")
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@app.put("/api/people/{person_id}", response_model=PersonProfile)
def put_people_profile(
    person_id: int,
    payload: PersonProfileUpdate,
    current_user_id: str = Depends(get_current_user_id),
) -> PersonProfile:
    try:
        updated = update_person_profile(current_user_id, person_id, payload)
    except (DatabaseIntegrityError, ValueError) as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A profile with that name already exists",
        ) from exc
    if updated is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Person profile not found")
    return updated


@app.get("/api/packing-templates", response_model=list[PackingTemplate])
def get_packing_templates(current_user_id: str = Depends(get_current_user_id)) -> list[PackingTemplate]:
    return list_packing_templates(current_user_id)


@app.post("/api/packing-templates", response_model=PackingTemplate, status_code=status.HTTP_201_CREATED)
def post_packing_template(
    payload: PackingTemplateCreate,
    current_user_id: str = Depends(get_current_user_id),
) -> PackingTemplate:
    try:
        return create_packing_template(current_user_id, payload)
    except (DatabaseIntegrityError, ValueError) as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A packing template with that name already exists",
        ) from exc


@app.put("/api/packing-templates/{template_id}", response_model=PackingTemplate)
def put_packing_template(
    template_id: int,
    payload: PackingTemplateUpdate,
    current_user_id: str = Depends(get_current_user_id),
) -> PackingTemplate:
    try:
        updated = update_packing_template(current_user_id, template_id, payload)
    except (DatabaseIntegrityError, ValueError) as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A packing template with that name already exists",
        ) from exc
    if updated is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Packing template not found")
    return updated


@app.delete("/api/packing-templates/{template_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_packing_template(template_id: int, current_user_id: str = Depends(get_current_user_id)) -> Response:
    deleted = delete_packing_template(current_user_id, template_id)
    if not deleted:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Packing template not found")
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@app.get("/api/locations/search", response_model=list[LocationSuggestion])
def search_locations(
    request: Request,
    q: str = Query(min_length=2, max_length=120),
    limit: int = Query(default=8, ge=1, le=12),
    current_user_id: str = Depends(get_current_user_id),
) -> list[LocationSuggestion]:
    _enforce_geocoder_rate_limit(request, current_user_id)
    return [LocationSuggestion(**item) for item in _search_places(q.strip(), limit)]
