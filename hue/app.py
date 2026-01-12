import os
from typing import Optional, Dict, Any, List

import httpx
from fastapi import FastAPI, HTTPException
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from dotenv import load_dotenv

load_dotenv()

HUE_BRIDGE_IP = os.getenv("HUE_BRIDGE_IP")
HUE_USERNAME = os.getenv("HUE_USERNAME")

if not HUE_BRIDGE_IP or not HUE_USERNAME:
    raise RuntimeError("Missing HUE_BRIDGE_IP or HUE_USERNAME in .env")

HUE_BASE = f"http://{HUE_BRIDGE_IP}/api/{HUE_USERNAME}"

app = FastAPI(title="Hue Dashboard API")

# ----------------------------
# Models (MUST be before routes)
# ----------------------------
class LightState(BaseModel):
    on: Optional[bool] = None
    bri: Optional[int] = None
    hue: Optional[int] = None
    sat: Optional[int] = None


class AllState(BaseModel):
    on: bool


# ----------------------------
# Hue helpers
# ----------------------------
async def hue_get(path: str) -> Any:
    async with httpx.AsyncClient(timeout=6.0) as client:
        r = await client.get(f"{HUE_BASE}{path}")
        if r.status_code != 200:
            raise HTTPException(status_code=500, detail=r.text)
        return r.json()


async def hue_put(path: str, payload: Dict[str, Any]) -> Any:
    async with httpx.AsyncClient(timeout=6.0) as client:
        r = await client.put(f"{HUE_BASE}{path}", json=payload)
        if r.status_code != 200:
            raise HTTPException(status_code=500, detail=r.text)
        return r.json()


# ----------------------------
# API routes
# ----------------------------
@app.get("/api/lights")
async def list_lights() -> List[Dict[str, Any]]:
    lights = await hue_get("/lights")
    out = []
    for lid, l in lights.items():
        st = l.get("state", {})
        out.append(
            {
                "id": lid,
                "name": l.get("name"),
                "on": st.get("on"),
                "bri": st.get("bri"),
                "reachable": st.get("reachable"),
            }
        )
    out.sort(key=lambda x: (x["name"] or "").lower())
    return out


@app.put("/api/lights/{light_id}/state")
async def set_light_state(light_id: str, state: LightState):
    payload: Dict[str, Any] = {}

    # allow-list + clamp ranges
    if state.on is not None:
        payload["on"] = bool(state.on)
    if state.bri is not None:
        payload["bri"] = max(1, min(254, int(state.bri)))
    if state.hue is not None:
        payload["hue"] = max(0, min(65535, int(state.hue)))
    if state.sat is not None:
        payload["sat"] = max(0, min(254, int(state.sat)))

    if not payload:
        raise HTTPException(status_code=400, detail="No valid fields provided")

    return await hue_put(f"/lights/{light_id}/state", payload)


@app.put("/api/all")
async def set_all(state: AllState):
    lights = await hue_get("/lights")
    ids = list(lights.keys())

    # Sequential avoids spamming the bridge
    for lid in ids:
        await hue_put(f"/lights/{lid}/state", {"on": state.on})

    return {"ok": True, "count": len(ids)}


# ----------------------------
# Static frontend (MOUNT LAST)
# ----------------------------
app.mount("/", StaticFiles(directory="public", html=True), name="public")
