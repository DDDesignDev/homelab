from __future__ import annotations

from datetime import date, datetime, timedelta
from typing import Optional

from fastapi import FastAPI, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import text


DEFAULT_PERSON = "Household"


def ensure_meal_planner_schema(engine) -> None:
    with engine.begin() as conn:
        conn.execute(
            text(
                """
                CREATE TABLE IF NOT EXISTS meals (
                  id SERIAL PRIMARY KEY,
                  day DATE NOT NULL,
                  slot TEXT NOT NULL,
                  person TEXT NOT NULL DEFAULT 'Household',
                  servings DOUBLE PRECISION NOT NULL DEFAULT 1,
                  recipe_id INTEGER NOT NULL,
                  notes TEXT,
                  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                )
                """
            )
        )
        conn.execute(
            text(
                """
                ALTER TABLE meals
                ADD COLUMN IF NOT EXISTS person TEXT NOT NULL DEFAULT 'Household'
                """
            )
        )
        conn.execute(
            text(
                """
                ALTER TABLE meals
                ADD COLUMN IF NOT EXISTS servings DOUBLE PRECISION NOT NULL DEFAULT 1
                """
            )
        )
        conn.execute(text("CREATE INDEX IF NOT EXISTS idx_meals_day ON meals(day)"))
        conn.execute(
            text(
                "CREATE INDEX IF NOT EXISTS idx_meals_person_day ON meals(person, day)"
            )
        )
        conn.execute(
            text("CREATE INDEX IF NOT EXISTS idx_meals_recipe_id ON meals(recipe_id)")
        )


class MealCreate(BaseModel):
    day: date
    slot: str = Field(min_length=1, max_length=40)
    person: str = Field(default=DEFAULT_PERSON, min_length=1, max_length=80)
    servings: float = Field(default=1, gt=0)
    recipe_id: int
    notes: Optional[str] = Field(default=None, max_length=2000)


class MealUpdate(BaseModel):
    day: Optional[date] = None
    slot: Optional[str] = Field(default=None, min_length=1, max_length=40)
    person: Optional[str] = Field(default=None, min_length=1, max_length=80)
    servings: Optional[float] = Field(default=None, gt=0)
    recipe_id: Optional[int] = None
    notes: Optional[str] = Field(default=None, max_length=2000)


class MealOut(BaseModel):
    id: int
    day: date
    slot: str
    person: str
    servings: float
    recipe_id: int
    notes: Optional[str] = None
    created_at: datetime
    updated_at: datetime

class RecipeListItem(BaseModel):
    id: int
    title: str

class NutritionDayTotals(BaseModel):
    day: date
    meals_count: int = 0
    calories: float = 0
    protein_g: float = 0
    carbs_g: float = 0
    fat_g: float = 0
    fiber_g: float = 0
    sugar_g: float = 0
    sodium_mg: float = 0

class NutritionTotals(BaseModel):
    meals_count: int = 0
    calories: float = 0
    protein_g: float = 0
    carbs_g: float = 0
    fat_g: float = 0
    fiber_g: float = 0
    sugar_g: float = 0
    sodium_mg: float = 0

class NutritionReport(BaseModel):
    start: date
    end: date
    totals: NutritionTotals

def _normalize_slot(slot: str) -> str:
    slot = (slot or "").strip().lower()
    slot = " ".join(slot.split())
    if not slot:
        raise HTTPException(status_code=400, detail="slot is required")
    return slot


def _normalize_person(person: str) -> str:
    person = (person or "").strip()
    person = " ".join(person.split())
    if not person:
        raise HTTPException(status_code=400, detail="person is required")
    return person


def _normalize_servings(servings: float) -> float:
    try:
        value = float(servings)
    except (TypeError, ValueError):
        raise HTTPException(status_code=400, detail="servings must be a number")
    if value <= 0:
        raise HTTPException(status_code=400, detail="servings must be > 0")
    return value


def _ensure_recipe_exists(engine, recipe_id: int) -> None:
    with engine.connect() as conn:
        exists = (
            conn.execute(text("SELECT 1 FROM recipes WHERE id = :id"), {"id": recipe_id})
            .first()
            is not None
        )
    if not exists:
        raise HTTPException(status_code=400, detail="Recipe does not exist")


def register_meal_planner_routes(app: FastAPI, engine) -> None:
    @app.get("/api/listRecipes", response_model=list[RecipeListItem])
    def list_recipes():
        with engine.connect() as conn:
            rows = (
                conn.execute(
                    text("SELECT id, title FROM recipes ORDER BY title ASC")
                )
                .mappings()
                .all()
            )
        return [RecipeListItem(**dict(r)) for r in rows]
    
    @app.get("/api/meals", response_model=list[MealOut])
    def list_meals(
        start: Optional[date] = Query(default=None),
        end: Optional[date] = Query(default=None),
        person: Optional[str] = Query(default=None),
    ):
        if start is None and end is None:
            start = date.today()
            end = start + timedelta(days=6)
        if start and end and end < start:
            raise HTTPException(status_code=400, detail="end must be >= start")

        where = []
        params = {}
        if start is not None:
            where.append("day >= :start")
            params["start"] = start
        if end is not None:
            where.append("day <= :end")
            params["end"] = end
        if person:
            person = _normalize_person(person)
            if person != DEFAULT_PERSON:
                where.append("person = :person")
                params["person"] = person

        sql = "SELECT * FROM meals"
        if where:
            sql += " WHERE " + " AND ".join(where)
        sql += " ORDER BY day ASC, slot ASC, id ASC"

        with engine.connect() as conn:
            rows = conn.execute(text(sql), params).mappings().all()
        return [MealOut(**dict(r)) for r in rows]

    @app.post("/api/meals", response_model=MealOut)
    def create_meal(body: MealCreate):
        slot = _normalize_slot(body.slot)
        person = _normalize_person(body.person)
        servings = _normalize_servings(body.servings)
        _ensure_recipe_exists(engine, body.recipe_id)

        with engine.begin() as conn:
            row = (
                conn.execute(
                    text(
                        """
                        INSERT INTO meals (day, slot, person, servings, recipe_id, notes)
                        VALUES (:day, :slot, :person, :servings, :recipe_id, :notes)
                        RETURNING *
                        """
                    ),
                    {
                        "day": body.day,
                        "slot": slot,
                        "person": person,
                        "servings": servings,
                        "recipe_id": body.recipe_id,
                        "notes": body.notes,
                    },
                )
                .mappings()
                .first()
            )
        return MealOut(**dict(row))

    @app.put("/api/meals/{meal_id}", response_model=MealOut)
    def update_meal(meal_id: int, body: MealUpdate):
        with engine.connect() as conn:
            existing = (
                conn.execute(text("SELECT * FROM meals WHERE id = :id"), {"id": meal_id})
                .mappings()
                .first()
            )
        if not existing:
            raise HTTPException(status_code=404, detail="Meal not found")

        day = body.day if body.day is not None else existing["day"]
        slot = (
            _normalize_slot(body.slot) if body.slot is not None else existing["slot"]
        )
        person = (
            _normalize_person(body.person)
            if body.person is not None
            else existing["person"]
        )
        servings = (
            _normalize_servings(body.servings)
            if body.servings is not None
            else existing["servings"]
        )
        recipe_id = (
            body.recipe_id if body.recipe_id is not None else existing["recipe_id"]
        )
        notes = body.notes if body.notes is not None else existing["notes"]

        if recipe_id != existing["recipe_id"]:
            _ensure_recipe_exists(engine, recipe_id)

        with engine.begin() as conn:
            row = (
                conn.execute(
                    text(
                        """
                        UPDATE meals
                        SET day = :day,
                            slot = :slot,
                            person = :person,
                            servings = :servings,
                            recipe_id = :recipe_id,
                            notes = :notes,
                            updated_at = NOW()
                        WHERE id = :id
                        RETURNING *
                        """
                    ),
                    {
                        "id": meal_id,
                        "day": day,
                        "slot": slot,
                        "person": person,
                        "servings": servings,
                        "recipe_id": recipe_id,
                        "notes": notes,
                    },
                )
                .mappings()
                .first()
            )
        return MealOut(**dict(row))

    @app.get("/api/people", response_model=list[str])
    def list_people():
        with engine.connect() as conn:
            rows = (
                conn.execute(
                    text(
                        "SELECT DISTINCT person FROM meals WHERE person IS NOT NULL ORDER BY person ASC"
                    )
                )
                .mappings()
                .all()
            )
        people = [r["person"] for r in rows if r.get("person")]
        if not people:
            return [DEFAULT_PERSON]
        if DEFAULT_PERSON not in people:
            return [DEFAULT_PERSON, *people]
        return people

    @app.delete("/api/meals/{meal_id}")
    def delete_meal(meal_id: int):
        with engine.begin() as conn:
            res = conn.execute(text("DELETE FROM meals WHERE id = :id"), {"id": meal_id})
        if res.rowcount == 0:
            raise HTTPException(status_code=404, detail="Meal not found")
        return {"ok": True}
    
    @app.get("/api/meals/nutritionReport/daily", response_model=list[NutritionDayTotals])
    def get_nutrition_report_daily(
        start: date = Query(...),
        end: date = Query(...),
        person: Optional[str] = Query(default=None),
    ):
        if end < start:
            raise HTTPException(status_code=400, detail="end must be >= start")

        person_filter = ""
        params = {"start": start, "end": end}
        if person:
            person = _normalize_person(person)
            if person != DEFAULT_PERSON:
                person_filter = " AND m.person = :person"
                params["person"] = person

        sql = f"""
        SELECT
        m.day AS day,
        COUNT(m.id) AS meals_count,

        COALESCE(SUM(COALESCE((r.nutrition_json::jsonb ->> 'calories')::double precision, 0) * COALESCE(m.servings, 1)), 0) AS calories,
        COALESCE(SUM(COALESCE((r.nutrition_json::jsonb ->> 'protein_g')::double precision, 0) * COALESCE(m.servings, 1)), 0) AS protein_g,
        COALESCE(SUM(COALESCE((r.nutrition_json::jsonb ->> 'carbs_g')::double precision, 0) * COALESCE(m.servings, 1)), 0) AS carbs_g,
        COALESCE(SUM(COALESCE((r.nutrition_json::jsonb ->> 'fat_g')::double precision, 0) * COALESCE(m.servings, 1)), 0) AS fat_g,
        COALESCE(SUM(COALESCE((r.nutrition_json::jsonb ->> 'fiber_g')::double precision, 0) * COALESCE(m.servings, 1)), 0) AS fiber_g,
        COALESCE(SUM(COALESCE((r.nutrition_json::jsonb ->> 'sugar_g')::double precision, 0) * COALESCE(m.servings, 1)), 0) AS sugar_g,
        COALESCE(SUM(COALESCE((r.nutrition_json::jsonb ->> 'sodium_mg')::double precision, 0) * COALESCE(m.servings, 1)), 0) AS sodium_mg

        FROM meals m
        JOIN recipes r ON m.recipe_id = r.id
        WHERE m.day >= :start AND m.day <= :end {person_filter}
        GROUP BY m.day
        ORDER BY m.day ASC
        """

        with engine.connect() as conn:
            rows = conn.execute(text(sql), params).mappings().all()

        return [NutritionDayTotals(**dict(r)) for r in rows]

    
    @app.get("/api/meals/nutritionReport", response_model=NutritionReport)
    def get_nutrition_report(
        start: date = Query(...),
        end: date = Query(...),
        person: Optional[str] = Query(default=None),
    ):
        if end < start:
            raise HTTPException(status_code=400, detail="end must be >= start")

        person_filter = ""
        params = {"start": start, "end": end}
        if person:
            person = _normalize_person(person)
            if person != DEFAULT_PERSON:
                person_filter = " AND m.person = :person"
                params["person"] = person

        sql = f"""
        SELECT
        COUNT(m.id) AS meals_count,

        COALESCE(SUM(COALESCE((r.nutrition_json::jsonb ->> 'calories')::double precision, 0) * COALESCE(m.servings, 1)), 0) AS calories,
        COALESCE(SUM(COALESCE((r.nutrition_json::jsonb ->> 'protein_g')::double precision, 0) * COALESCE(m.servings, 1)), 0) AS protein_g,
        COALESCE(SUM(COALESCE((r.nutrition_json::jsonb ->> 'carbs_g')::double precision, 0) * COALESCE(m.servings, 1)), 0) AS carbs_g,
        COALESCE(SUM(COALESCE((r.nutrition_json::jsonb ->> 'fat_g')::double precision, 0) * COALESCE(m.servings, 1)), 0) AS fat_g,
        COALESCE(SUM(COALESCE((r.nutrition_json::jsonb ->> 'fiber_g')::double precision, 0) * COALESCE(m.servings, 1)), 0) AS fiber_g,
        COALESCE(SUM(COALESCE((r.nutrition_json::jsonb ->> 'sugar_g')::double precision, 0) * COALESCE(m.servings, 1)), 0) AS sugar_g,
        COALESCE(SUM(COALESCE((r.nutrition_json::jsonb ->> 'sodium_mg')::double precision, 0) * COALESCE(m.servings, 1)), 0) AS sodium_mg

        FROM meals m
        JOIN recipes r ON m.recipe_id = r.id
        WHERE m.day >= :start AND m.day <= :end {person_filter}
        """

        with engine.connect() as conn:
            row = conn.execute(text(sql), params).mappings().first()

        totals = NutritionTotals(**dict(row))
        return NutritionReport(start=start, end=end, totals=totals)
