from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models import User
from app.schemas.journey import TaskAnswer
from app.services.activities import available_activities, verify_activity
from app.services.journey import mutate_journey, owned_journey
from app.services.session import get_current_user

router = APIRouter(prefix="/api", tags=["optional exploration"])


@router.get("/activities")
def activities(journey_id: str | None = None, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    return {"items": available_activities(owned_journey(db, user, journey_id))}


@router.post("/activities/{activity_id}/verify")
def verify(activity_id: str, body: TaskAnswer, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    journey = owned_journey(db, user, body.journey_id)
    return mutate_journey(db, journey, body.state_version, body.request_id, "activity:" + activity_id,
                          body.model_dump(), lambda current: verify_activity(db, current, activity_id, body.answer))
