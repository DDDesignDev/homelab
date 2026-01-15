import os
import json
import re
from datetime import datetime
from typing import List, Optional

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Query
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field, HttpUrl
import requests
from sqlalchemy import create_engine, text
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column
from ai import router as ai_router

load_dotenv()

PORT = int(os.getenv("PORT", "8000"))
RECIPE_SCRAPER_URL = os.getenv("RECIPE_SCRAPER_URL", "http://localhost:8010").rstrip("/")

DB_HOST = os.getenv("DB_HOST", "postgres")
DB_PORT = os.getenv("DB_PORT", "5432")
DB_NAME = os.getenv("DB_NAME", "")
DB_USER = os.getenv("DB_USER", "")
DB_PASSWORD = os.getenv("DB_PASSWORD", "")

if not DB_PASSWORD:
    raise RuntimeError("DB_PASSWORD is missing in .env")

DATABASE_URL = (
    f"postgresql+psycopg2://{DB_USER}:{DB_PASSWORD}@{DB_HOST}:{DB_PORT}/{DB_NAME}"
)

engine = create_engine(DATABASE_URL, pool_pre_ping=True)


class Base(DeclarativeBase):
    pass


class Recipe(Base):
    __tablename__ = "recipes"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    title: Mapped[str]
    description: Mapped[Optional[str]]
    servings: Mapped[Optional[int]]
    prep_minutes: Mapped[Optional[int]]
    cook_minutes: Mapped[Optional[int]]
    ingredients: Mapped[str]  # newline-separated
    steps: Mapped[str]  # newline-separated
    tags: Mapped[Optional[str]]  # comma-separated
    nutrition_json: Mapped[Optional[str]]
    created_at: Mapped[datetime] = mapped_column(default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(default=datetime.utcnow)


class NutritionFacts(BaseModel):
    # store as "per serving" by default
    serving_size: Optional[str] = None  # e.g. "1 bowl (350g)"
    calories: Optional[int] = None  # kcal

    # macros in grams
    carbs_g: Optional[float] = None
    sugar_g: Optional[float] = None
    fat_g: Optional[float] = None
    saturated_fat_g: Optional[float] = None
    trans_fat_g: Optional[float] = None
    protein_g: Optional[float] = None
    fiber_g: Optional[float] = None

    # micros in mg / mcg / IU
    vitamin_a_iu: Optional[float] = None
    vitamin_b6_mg: Optional[float] = None
    vitamin_b12_mcg: Optional[float] = None
    vitamin_d_iu: Optional[float] = None
    vitamin_c_mg: Optional[float] = None
    calcium_mg: Optional[float] = None
    iron_mg: Optional[float] = None
    potassium_mg: Optional[float] = None
    sodium_mg: Optional[float] = None
    cholesterol_mg: Optional[float] = None


class RecipeCreate(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    description: Optional[str] = None
    servings: Optional[int] = None
    prep_minutes: Optional[int] = None
    cook_minutes: Optional[int] = None
    ingredients: List[str] = []
    steps: List[str] = []
    tags: List[str] = []
    nutrition: Optional[NutritionFacts] = None


class RecipeUpdate(BaseModel):
    title: Optional[str] = Field(default=None, min_length=1, max_length=200)
    description: Optional[str] = None
    servings: Optional[int] = None
    prep_minutes: Optional[int] = None
    cook_minutes: Optional[int] = None
    ingredients: Optional[List[str]] = None
    steps: Optional[List[str]] = None
    tags: Optional[List[str]] = None
    # IMPORTANT: None means "no change". If you want "clear nutrition", we can add a separate flag later.
    nutrition: Optional[NutritionFacts] = None


class RecipeOut(BaseModel):
    id: int
    title: str
    description: Optional[str]
    servings: Optional[int]
    prep_minutes: Optional[int]
    cook_minutes: Optional[int]
    ingredients: List[str]
    steps: List[str]
    tags: List[str]
    nutrition: Optional[NutritionFacts] = None
    created_at: datetime
    updated_at: datetime


def _parse_nutrition(nutrition_json: Optional[str]) -> Optional[NutritionFacts]:
    if not nutrition_json:
        return None
    try:
        data = json.loads(nutrition_json)
        if not isinstance(data, dict):
            return None
        return NutritionFacts(**data)
    except Exception:
        # If old/bad JSON exists, don't crash the whole endpoint
        return None


def to_out(r: Recipe) -> RecipeOut:
    return RecipeOut(
        id=r.id,
        title=r.title,
        description=r.description,
        servings=r.servings,
        prep_minutes=r.prep_minutes,
        cook_minutes=r.cook_minutes,
        ingredients=[x for x in (r.ingredients or "").split("\n") if x.strip()],
        steps=[x for x in (r.steps or "").split("\n") if x.strip()],
        tags=[t.strip() for t in (r.tags or "").split(",") if t.strip()],
        nutrition=_parse_nutrition(getattr(r, "nutrition_json", None)),
        created_at=r.created_at,
        updated_at=r.updated_at,
    )


app = FastAPI(title="Home Recipes")
app.include_router(ai_router)

from meal_planner import ensure_meal_planner_schema, register_meal_planner_routes  # noqa: E402

register_meal_planner_routes(app, engine)

@app.on_event("startup")
def startup():
    # Create table if not exists (simple v1)
    Base.metadata.create_all(engine)
    ensure_meal_planner_schema(engine)
    # Sanity check connectivity
    with engine.connect() as conn:
        conn.execute(text("SELECT 1"))


# ---------------- API ----------------


@app.get("/api/recipes", response_model=list[RecipeOut])
def list_recipes(
    q: Optional[str] = Query(default=None, description="Search title/description/tags"),
    tag: Optional[str] = Query(default=None, description="Filter by single tag"),
):
    where = []
    params = {}

    if q:
        where.append(
            "(LOWER(title) LIKE :q OR LOWER(COALESCE(description,'')) LIKE :q OR LOWER(COALESCE(tags,'')) LIKE :q)"
        )
        params["q"] = f"%{q.lower()}%"
    if tag:
        where.append("LOWER(COALESCE(tags,'')) LIKE :tag")
        params["tag"] = f"%{tag.lower()}%"

    sql = "SELECT * FROM recipes"
    if where:
        sql += " WHERE " + " AND ".join(where)
    sql += " ORDER BY updated_at DESC"

    with engine.connect() as conn:
        rows = conn.execute(text(sql), params).mappings().all()

    out: list[RecipeOut] = []
    for row in rows:
        r = Recipe(
            id=row["id"],
            title=row["title"],
            description=row["description"],
            servings=row["servings"],
            prep_minutes=row["prep_minutes"],
            cook_minutes=row["cook_minutes"],
            ingredients=row["ingredients"],
            steps=row["steps"],
            tags=row["tags"],
            nutrition_json=row.get("nutrition_json"),
            created_at=row["created_at"],
            updated_at=row["updated_at"],
        )
        out.append(to_out(r))
    return out


@app.get("/api/recipes/{recipe_id}", response_model=RecipeOut)
def get_recipe(recipe_id: int):
    with engine.connect() as conn:
        row = (
            conn.execute(
                text("SELECT * FROM recipes WHERE id = :id"), {"id": recipe_id}
            )
            .mappings()
            .first()
        )
    if not row:
        raise HTTPException(status_code=404, detail="Recipe not found")

    r = Recipe(
        id=row["id"],
        title=row["title"],
        description=row["description"],
        servings=row["servings"],
        prep_minutes=row["prep_minutes"],
        cook_minutes=row["cook_minutes"],
        ingredients=row["ingredients"],
        steps=row["steps"],
        tags=row["tags"],
        nutrition_json=row.get("nutrition_json"),
        created_at=row["created_at"],
        updated_at=row["updated_at"],
    )
    return to_out(r)


@app.post("/api/recipes", response_model=RecipeOut)
def create_recipe(body: RecipeCreate):
    now = datetime.utcnow()
    ingredients = "\n".join([i.strip() for i in body.ingredients if i.strip()])
    steps = "\n".join([s.strip() for s in body.steps if s.strip()])
    tags = ",".join(sorted({t.strip().lower() for t in body.tags if t.strip()}))

    nutrition_json = None
    if body.nutrition:
        payload = body.nutrition.model_dump(exclude_none=True)
        nutrition_json = json.dumps(payload) if payload else None

    with engine.begin() as conn:
        row = (
            conn.execute(
                text(
                    """
            INSERT INTO recipes
              (title, description, servings, prep_minutes, cook_minutes, ingredients, steps, tags, nutrition_json, created_at, updated_at)
            VALUES
              (:title, :description, :servings, :prep, :cook, :ingredients, :steps, :tags, :nutrition_json, :created_at, :updated_at)
            RETURNING *
          """
                ),
                {
                    "title": body.title,
                    "description": body.description,
                    "servings": body.servings,
                    "prep": body.prep_minutes,
                    "cook": body.cook_minutes,
                    "ingredients": ingredients,
                    "steps": steps,
                    "tags": tags,
                    "nutrition_json": nutrition_json,
                    "created_at": now,
                    "updated_at": now,
                },
            )
            .mappings()
            .first()
        )

    r = Recipe(
        id=row["id"],
        title=row["title"],
        description=row["description"],
        servings=row["servings"],
        prep_minutes=row["prep_minutes"],
        cook_minutes=row["cook_minutes"],
        ingredients=row["ingredients"],
        steps=row["steps"],
        tags=row["tags"],
        nutrition_json=row.get("nutrition_json"),
        created_at=row["created_at"],
        updated_at=row["updated_at"],
    )
    return to_out(r)


@app.put("/api/recipes/{recipe_id}", response_model=RecipeOut)
def update_recipe(recipe_id: int, body: RecipeUpdate):
    with engine.connect() as conn:
        existing = (
            conn.execute(text("SELECT * FROM recipes WHERE id = :id"), {"id": recipe_id})
            .mappings()
            .first()
        )
    if not existing:
        raise HTTPException(status_code=404, detail="Recipe not found")

    title = body.title if body.title is not None else existing["title"]
    description = (
        body.description if body.description is not None else existing["description"]
    )
    servings = body.servings if body.servings is not None else existing["servings"]
    prep = body.prep_minutes if body.prep_minutes is not None else existing["prep_minutes"]
    cook = body.cook_minutes if body.cook_minutes is not None else existing["cook_minutes"]

    ingredients = existing["ingredients"]
    if body.ingredients is not None:
        ingredients = "\n".join([i.strip() for i in body.ingredients if i.strip()])

    steps = existing["steps"]
    if body.steps is not None:
        steps = "\n".join([s.strip() for s in body.steps if s.strip()])

    tags = existing["tags"]
    if body.tags is not None:
        tags = ",".join(sorted({t.strip().lower() for t in body.tags if t.strip()}))

    nutrition_json = existing.get("nutrition_json")
    if body.nutrition is not None:
        payload = body.nutrition.model_dump(exclude_none=True)
        nutrition_json = json.dumps(payload) if payload else None

    now = datetime.utcnow()

    with engine.begin() as conn:
        row = (
            conn.execute(
                text(
                    """
            UPDATE recipes
            SET title=:title,
                description=:description,
                servings=:servings,
                prep_minutes=:prep,
                cook_minutes=:cook,
                ingredients=:ingredients,
                steps=:steps,
                tags=:tags,
                nutrition_json=:nutrition_json,
                updated_at=:updated_at
            WHERE id=:id
            RETURNING *
          """
                ),
                {
                    "id": recipe_id,
                    "title": title,
                    "description": description,
                    "servings": servings,
                    "prep": prep,
                    "cook": cook,
                    "ingredients": ingredients,
                    "steps": steps,
                    "tags": tags,
                    "nutrition_json": nutrition_json,
                    "updated_at": now,
                },
            )
            .mappings()
            .first()
        )

    r = Recipe(
        id=row["id"],
        title=row["title"],
        description=row["description"],
        servings=row["servings"],
        prep_minutes=row["prep_minutes"],
        cook_minutes=row["cook_minutes"],
        ingredients=row["ingredients"],
        steps=row["steps"],
        tags=row["tags"],
        nutrition_json=row.get("nutrition_json"),
        created_at=row["created_at"],
        updated_at=row["updated_at"],
    )
    return to_out(r)


@app.delete("/api/recipes/{recipe_id}")
def delete_recipe(recipe_id: int):
    with engine.begin() as conn:
        res = conn.execute(text("DELETE FROM recipes WHERE id=:id"), {"id": recipe_id})
    if res.rowcount == 0:
        raise HTTPException(status_code=404, detail="Recipe not found")
    return {"ok": True}


# ---------------- Scraper proxy ----------------
class ScrapeRequest(BaseModel):
    url: HttpUrl


class ScrapeOut(BaseModel):
    title: Optional[str] = None
    servings: Optional[int] = None
    prep_minutes: Optional[int] = None
    cook_minutes: Optional[int] = None
    ingredients: list[str] = []
    steps: list[str] = []
    nutrition: Optional[NutritionFacts] = None


def _parse_first_int(s: Optional[str]) -> Optional[int]:
    if not s:
        return None
    m = re.search(r"(\d+)", str(s))
    return int(m.group(1)) if m else None


def _parse_number(v) -> Optional[float]:
    if v is None:
        return None
    if isinstance(v, (int, float)) and v == v:  # NaN check for floats
        return float(v)
    if isinstance(v, str):
        m = re.search(r"[-+]?\d*\.?\d+", v.replace(",", ""))
        if m:
            try:
                return float(m.group(0))
            except Exception:
                return None
    return None


def _lower_keys(d: dict) -> dict:
    out = {}
    for k, v in (d or {}).items():
        if isinstance(k, str):
            out[k.strip().lower()] = v
    return out


def _nutrition_from_scraper(nut: object) -> Optional[NutritionFacts]:
    if not isinstance(nut, dict) or not nut:
        return None

    n = _lower_keys(nut)
    serving_size = n.get("servingsize") or n.get("serving size") or n.get("serving_size")

    calories = n.get("calories") or n.get("caloriecontent") or n.get("energy")
    carbs = n.get("carbohydratecontent") or n.get("carbs") or n.get("carbohydrates")
    sugar = n.get("sugarcontent") or n.get("sugars")
    fat = n.get("fatcontent") or n.get("fat")
    sat_fat = n.get("saturatedfatcontent") or n.get("saturated fat")
    trans_fat = n.get("transfatcontent") or n.get("trans fat")
    protein = n.get("proteincontent") or n.get("protein")
    fiber = n.get("fibercontent") or n.get("fibrecontent") or n.get("fiber")
    sodium = n.get("sodiumcontent") or n.get("sodium")
    cholesterol = n.get("cholesterolcontent") or n.get("cholesterol")
    potassium = n.get("potassiumcontent") or n.get("potassium")
    calcium = n.get("calciumcontent") or n.get("calcium")
    iron = n.get("ironcontent") or n.get("iron")
    vit_a = n.get("vitamina") or n.get("vitamina_iu") or n.get("vitaminacontent")
    vit_b6 = n.get("vitaminb6") or n.get("vitaminb6content")
    vit_b12 = n.get("vitaminb12") or n.get("vitaminb12content")
    vit_c = n.get("vitaminc") or n.get("vitaminccontent")
    vit_d = n.get("vitamind") or n.get("vitamindcontent")

    facts = NutritionFacts(
        serving_size=str(serving_size).strip() if isinstance(serving_size, str) and serving_size.strip() else None,
        calories=int(_parse_number(calories)) if _parse_number(calories) is not None else None,
        carbs_g=_parse_number(carbs),
        sugar_g=_parse_number(sugar),
        fat_g=_parse_number(fat),
        saturated_fat_g=_parse_number(sat_fat),
        trans_fat_g=_parse_number(trans_fat),
        protein_g=_parse_number(protein),
        fiber_g=_parse_number(fiber),
        sodium_mg=_parse_number(sodium),
        cholesterol_mg=_parse_number(cholesterol),
        potassium_mg=_parse_number(potassium),
        calcium_mg=_parse_number(calcium),
        iron_mg=_parse_number(iron),
        vitamin_a_iu=_parse_number(vit_a),
        vitamin_b6_mg=_parse_number(vit_b6),
        vitamin_b12_mcg=_parse_number(vit_b12),
        vitamin_c_mg=_parse_number(vit_c),
        vitamin_d_iu=_parse_number(vit_d),
    )

    payload = facts.model_dump(exclude_none=True)
    return NutritionFacts(**payload) if payload else None


@app.post("/api/scrape", response_model=ScrapeOut)
def scrape_url(req: ScrapeRequest):
    try:
        r = requests.post(
            f"{RECIPE_SCRAPER_URL}/api/scrape",
            json={"url": str(req.url)},
            timeout=25,
        )
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Scraper request failed: {e}")

    if not r.ok:
        detail = None
        try:
            detail = r.json()
        except Exception:
            detail = r.text
        raise HTTPException(status_code=502, detail={"status": r.status_code, "error": detail})

    data = r.json() if r.content else {}
    ingredients = data.get("ingredients") if isinstance(data, dict) else None
    steps = (data.get("instructions") if isinstance(data, dict) else None) or []

    prep = data.get("prep_time_minutes") if isinstance(data, dict) else None
    cook = data.get("cook_time_minutes") if isinstance(data, dict) else None
    total = data.get("total_time_minutes") if isinstance(data, dict) else None
    if cook is None and isinstance(total, int):
        cook = total

    out = ScrapeOut(
        title=(data.get("title") if isinstance(data, dict) else None),
        servings=_parse_first_int(data.get("yields")) if isinstance(data, dict) else None,
        prep_minutes=prep if isinstance(prep, int) else None,
        cook_minutes=cook if isinstance(cook, int) else None,
        ingredients=ingredients if isinstance(ingredients, list) else [],
        steps=steps if isinstance(steps, list) else [],
        nutrition=_nutrition_from_scraper(data.get("nutrition")) if isinstance(data, dict) else None,
    )
    return out


# ---------------- Frontend ----------------
# Mount static LAST so /api routes work
app.mount("/", StaticFiles(directory="public", html=True), name="public")
