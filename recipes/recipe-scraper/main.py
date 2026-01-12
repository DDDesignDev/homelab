import re
import requests
from bs4 import BeautifulSoup
from recipe_scrapers import scrape_me
from recipe_scrapers._exceptions import WebsiteNotImplementedError
from typing import Optional, Dict, Any, List
from pydantic import BaseModel, field_validator

def _image_to_url(image_field: Any) -> Optional[str]:
    if not image_field:
        return None
    if isinstance(image_field, str):
        s = image_field.strip()
        return s or None
    if isinstance(image_field, list):
        for item in image_field:
            u = _image_to_url(item)
            if u:
                return u
        return None
    if isinstance(image_field, dict):
        for key in ("url", "contentUrl", "thumbnailUrl"):
            v = image_field.get(key)
            if isinstance(v, str) and v.strip():
                return v.strip()
        return _image_to_url(image_field.get("image"))
    return None

def _clean_lines(lines: List[str]) -> List[str]:
    out = []
    for line in lines or []:
        if not line:
            continue
        s = re.sub(r"\s+", " ", str(line)).strip()
        if s:
            out.append(s)
    seen = set()
    deduped = []
    for s in out:
        if s not in seen:
            seen.add(s)
            deduped.append(s)
    return deduped

def _safe_call(fn, default=None):
    try:
        return fn()
    except Exception:
        return default

def _extract_jsonld_recipe(html: str) -> Dict[str, Any]:
    soup = BeautifulSoup(html, "lxml")
    scripts = soup.find_all("script", attrs={"type": "application/ld+json"})
    import json
    for sc in scripts:
        if not sc.string:
            continue
        try:
            data = json.loads(sc.string)
        except Exception:
            continue

        candidates = []
        if isinstance(data, dict):
            if isinstance(data.get("@graph"), list):
                candidates.extend(data["@graph"])
            else:
                candidates.append(data)
        elif isinstance(data, list):
            candidates.extend(data)

        for item in candidates:
            if not isinstance(item, dict):
                continue
            t = item.get("@type")
            if t == "Recipe" or (isinstance(t, list) and "Recipe" in t):
                return item
    return {}

def _iso8601_duration_to_minutes(val: Optional[str]) -> Optional[int]:
    if not val or not isinstance(val, str):
        return None
    pattern = r"^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?)?$"
    m = re.match(pattern, val.strip().upper())
    if not m:
        return None
    days = int(m.group(1)) if m.group(1) else 0
    hours = int(m.group(2)) if m.group(2) else 0
    mins = int(m.group(3)) if m.group(3) else 0
    return days * 24 * 60 + hours * 60 + mins

class RecipeData(BaseModel):
    url: str
    title: Optional[str] = None
    author: Optional[str] = None
    canonical_url: Optional[str] = None
    total_time_minutes: Optional[int] = None
    prep_time_minutes: Optional[int] = None
    cook_time_minutes: Optional[int] = None
    yields: Optional[str] = None
    image: Optional[str] = None
    ingredients: List[str] = []
    instructions: List[str] = []
    nutrition: Dict[str, Any] = {}

    @field_validator("image", mode="before")
    @classmethod
    def normalize_image(cls, v: Any) -> Optional[str]:
        return _image_to_url(v)

def scrape_recipe(url: str, timeout: int = 20) -> RecipeData:
    headers = {"User-Agent": "Mozilla/5.0 (compatible; RecipeScraper/1.0)"}
    r = requests.get(url, headers=headers, timeout=timeout)
    r.raise_for_status()
    html = r.text

    # Best path: recipe-scrapers
    try:
        scraper = scrape_me(url, html=html)
        return RecipeData(
            url=url,
            title=_safe_call(scraper.title),
            author=_safe_call(scraper.author),
            canonical_url=_safe_call(scraper.canonical_url),
            total_time_minutes=_safe_call(scraper.total_time),
            yields=_safe_call(scraper.yields),
            image=_safe_call(scraper.image),
            ingredients=_clean_lines(_safe_call(scraper.ingredients, default=[]) or []),
            instructions=_clean_lines(_safe_call(scraper.instructions_list, default=[]) or []),
            nutrition=_safe_call(scraper.nutrients, default={}) or {},
        )
    except WebsiteNotImplementedError:
        pass
    except Exception:
        pass

    # Fallback: JSON-LD
    recipe = _extract_jsonld_recipe(html)

    ingredients = recipe.get("recipeIngredient") or []
    if isinstance(ingredients, str):
        ingredients = [ingredients]

    instructions_raw = recipe.get("recipeInstructions") or []
    instructions: List[str] = []
    if isinstance(instructions_raw, str):
        instructions = [instructions_raw]
    elif isinstance(instructions_raw, list):
        for step in instructions_raw:
            if isinstance(step, str):
                instructions.append(step)
            elif isinstance(step, dict) and step.get("text"):
                instructions.append(step["text"])

    nutrition = recipe.get("nutrition") or {}
    if isinstance(nutrition, dict):
        nutrition.pop("@type", None)

    return RecipeData(
        url=url,
        title=recipe.get("name"),
        author=(recipe.get("author", {}).get("name") if isinstance(recipe.get("author"), dict) else None),
        canonical_url=recipe.get("mainEntityOfPage") if isinstance(recipe.get("mainEntityOfPage"), str) else None,
        prep_time_minutes=_iso8601_duration_to_minutes(recipe.get("prepTime")),
        cook_time_minutes=_iso8601_duration_to_minutes(recipe.get("cookTime")),
        total_time_minutes=_iso8601_duration_to_minutes(recipe.get("totalTime")),
        yields=str(recipe.get("recipeYield")) if recipe.get("recipeYield") is not None else None,
        image=recipe.get("image"),
        ingredients=_clean_lines(ingredients if isinstance(ingredients, list) else []),
        instructions=_clean_lines(instructions),
        nutrition=nutrition if isinstance(nutrition, dict) else {},
    )
import re
import requests
from bs4 import BeautifulSoup
from recipe_scrapers import scrape_me
from recipe_scrapers._exceptions import WebsiteNotImplementedError
from typing import Optional, Dict, Any, List
from pydantic import BaseModel, field_validator

def _image_to_url(image_field: Any) -> Optional[str]:
    if not image_field:
        return None
    if isinstance(image_field, str):
        s = image_field.strip()
        return s or None
    if isinstance(image_field, list):
        for item in image_field:
            u = _image_to_url(item)
            if u:
                return u
        return None
    if isinstance(image_field, dict):
        for key in ("url", "contentUrl", "thumbnailUrl"):
            v = image_field.get(key)
            if isinstance(v, str) and v.strip():
                return v.strip()
        return _image_to_url(image_field.get("image"))
    return None

def _clean_lines(lines: List[str]) -> List[str]:
    out = []
    for line in lines or []:
        if not line:
            continue
        s = re.sub(r"\s+", " ", str(line)).strip()
        if s:
            out.append(s)
    seen = set()
    deduped = []
    for s in out:
        if s not in seen:
            seen.add(s)
            deduped.append(s)
    return deduped

def _safe_call(fn, default=None):
    try:
        return fn()
    except Exception:
        return default

def _extract_jsonld_recipe(html: str) -> Dict[str, Any]:
    soup = BeautifulSoup(html, "lxml")
    scripts = soup.find_all("script", attrs={"type": "application/ld+json"})
    import json
    for sc in scripts:
        if not sc.string:
            continue
        try:
            data = json.loads(sc.string)
        except Exception:
            continue

        candidates = []
        if isinstance(data, dict):
            if isinstance(data.get("@graph"), list):
                candidates.extend(data["@graph"])
            else:
                candidates.append(data)
        elif isinstance(data, list):
            candidates.extend(data)

        for item in candidates:
            if not isinstance(item, dict):
                continue
            t = item.get("@type")
            if t == "Recipe" or (isinstance(t, list) and "Recipe" in t):
                return item
    return {}

def _iso8601_duration_to_minutes(val: Optional[str]) -> Optional[int]:
    if not val or not isinstance(val, str):
        return None
    pattern = r"^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?)?$"
    m = re.match(pattern, val.strip().upper())
    if not m:
        return None
    days = int(m.group(1)) if m.group(1) else 0
    hours = int(m.group(2)) if m.group(2) else 0
    mins = int(m.group(3)) if m.group(3) else 0
    return days * 24 * 60 + hours * 60 + mins

class RecipeData(BaseModel):
    url: str
    title: Optional[str] = None
    author: Optional[str] = None
    canonical_url: Optional[str] = None
    total_time_minutes: Optional[int] = None
    prep_time_minutes: Optional[int] = None
    cook_time_minutes: Optional[int] = None
    yields: Optional[str] = None
    image: Optional[str] = None
    ingredients: List[str] = []
    instructions: List[str] = []
    nutrition: Dict[str, Any] = {}

    @field_validator("image", mode="before")
    @classmethod
    def normalize_image(cls, v: Any) -> Optional[str]:
        return _image_to_url(v)

def scrape_recipe(url: str, timeout: int = 20) -> RecipeData:
    headers = {"User-Agent": "Mozilla/5.0 (compatible; RecipeScraper/1.0)"}
    r = requests.get(url, headers=headers, timeout=timeout)
    r.raise_for_status()
    html = r.text

    # Best path: recipe-scrapers
    try:
        scraper = scrape_me(url, html=html)
        return RecipeData(
            url=url,
            title=_safe_call(scraper.title),
            author=_safe_call(scraper.author),
            canonical_url=_safe_call(scraper.canonical_url),
            total_time_minutes=_safe_call(scraper.total_time),
            yields=_safe_call(scraper.yields),
            image=_safe_call(scraper.image),
            ingredients=_clean_lines(_safe_call(scraper.ingredients, default=[]) or []),
            instructions=_clean_lines(_safe_call(scraper.instructions_list, default=[]) or []),
            nutrition=_safe_call(scraper.nutrients, default={}) or {},
        )
    except WebsiteNotImplementedError:
        pass
    except Exception:
        pass

    # Fallback: JSON-LD
    recipe = _extract_jsonld_recipe(html)

    ingredients = recipe.get("recipeIngredient") or []
    if isinstance(ingredients, str):
        ingredients = [ingredients]

    instructions_raw = recipe.get("recipeInstructions") or []
    instructions: List[str] = []
    if isinstance(instructions_raw, str):
        instructions = [instructions_raw]
    elif isinstance(instructions_raw, list):
        for step in instructions_raw:
            if isinstance(step, str):
                instructions.append(step)
            elif isinstance(step, dict) and step.get("text"):
                instructions.append(step["text"])

    nutrition = recipe.get("nutrition") or {}
    if isinstance(nutrition, dict):
        nutrition.pop("@type", None)

    return RecipeData(
        url=url,
        title=recipe.get("name"),
        author=(recipe.get("author", {}).get("name") if isinstance(recipe.get("author"), dict) else None),
        canonical_url=recipe.get("mainEntityOfPage") if isinstance(recipe.get("mainEntityOfPage"), str) else None,
        prep_time_minutes=_iso8601_duration_to_minutes(recipe.get("prepTime")),
        cook_time_minutes=_iso8601_duration_to_minutes(recipe.get("cookTime")),
        total_time_minutes=_iso8601_duration_to_minutes(recipe.get("totalTime")),
        yields=str(recipe.get("recipeYield")) if recipe.get("recipeYield") is not None else None,
        image=recipe.get("image"),
        ingredients=_clean_lines(ingredients if isinstance(ingredients, list) else []),
        instructions=_clean_lines(instructions),
        nutrition=nutrition if isinstance(nutrition, dict) else {},
    )
