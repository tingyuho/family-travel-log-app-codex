from __future__ import annotations

import os

from fastapi import Depends, FastAPI, Header, HTTPException, Query, Response, status
from fastapi.middleware.cors import CORSMiddleware

from .auth import generate_reset_code
from .db import DatabaseIntegrityError, get_connection, init_db, is_postgres
from .mailer import is_mailer_configured, send_password_reset_email
from .repository import (
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
    get_trip,
    get_user_profile,
    get_user_by_token,
    list_packing_templates,
    list_people_profiles,
    list_trips,
    reset_user_password,
    revoke_session,
    update_packing_template,
    update_person_profile,
    update_trip,
    update_user_email,
)
from .schemas import (
    AuthToken,
    PackingTemplate,
    PackingTemplateCreate,
    PackingTemplateUpdate,
    PasswordResetEmailRequest,
    PasswordResetRequest,
    PersonProfile,
    PersonProfileCreate,
    PersonProfileUpdate,
    Trip,
    TripCreate,
    TripUpdate,
    UserLogin,
    UserProfile,
    UserProfileUpdate,
    UserRegister,
)


app = FastAPI(title="Family Travel Log API", version="2.0.0")
PASSWORD_RESET_KEY = os.getenv("PASSWORD_RESET_KEY", "").strip()


def _cors_origins() -> list[str]:
    configured = [origin.strip() for origin in os.getenv("FRONTEND_ORIGINS", "").split(",") if origin.strip()]
    if configured:
        return configured
    return ["http://127.0.0.1:5173", "http://localhost:5173"]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins(),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
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
    return {"status": "ok"}


@app.get("/health/db")
def health_db() -> dict[str, str]:
    try:
        with get_connection() as conn:
            conn.execute("SELECT 1")
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=f"DB check failed: {exc}") from exc
    return {"status": "ok", "database": "postgres" if is_postgres() else "sqlite"}


@app.post("/api/auth/register", response_model=AuthToken, status_code=status.HTTP_201_CREATED)
def register(payload: UserRegister) -> AuthToken:
    created = create_user(payload.user_id.strip(), payload.email.strip().lower(), payload.password)
    if not created:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="User ID already exists")
    token = create_session(payload.user_id.strip())
    return AuthToken(token=token, user_id=payload.user_id.strip())


@app.post("/api/auth/login", response_model=AuthToken)
def login(payload: UserLogin) -> AuthToken:
    user_id = payload.user_id.strip()
    if not authenticate_user(user_id, payload.password):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid username or password")
    token = create_session(user_id)
    return AuthToken(token=token, user_id=user_id)


@app.post("/api/auth/reset-password", status_code=status.HTTP_204_NO_CONTENT)
def reset_password(payload: PasswordResetRequest) -> Response:
    if not consume_password_reset_code(payload.user_id.strip(), payload.email_code.strip()):
        if PASSWORD_RESET_KEY and payload.reset_key.strip() == PASSWORD_RESET_KEY:
            pass
        else:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Invalid or expired verification code")
    updated = reset_user_password(payload.user_id.strip(), payload.new_password)
    if not updated:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@app.post("/api/auth/request-password-reset", status_code=status.HTTP_204_NO_CONTENT)
def request_password_reset(payload: PasswordResetEmailRequest) -> Response:
    if not is_mailer_configured():
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Email sending is not configured on the server",
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
    current_user_id: str = Depends(get_current_user_id),
) -> list[Trip]:
    return list_trips(current_user_id, query=q)


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
    updated = update_trip(current_user_id, trip_id, payload)
    if updated is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Trip not found")
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
    except DatabaseIntegrityError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A profile with that name already exists",
        ) from exc


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
    except DatabaseIntegrityError as exc:
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
    except DatabaseIntegrityError as exc:
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
    except DatabaseIntegrityError as exc:
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
