/* Home Recipes Frontend (no frameworks) */

const grid = document.getElementById("grid");
const statusEl = document.getElementById("status");
const searchEl = document.getElementById("search");

const btnAdd = document.getElementById("btnAdd");
const btnPlanner = document.getElementById("btnPlanner");
const btnList = document.getElementById("btnList");
const btnRefresh = document.getElementById("btnRefresh");

const viewModal = document.getElementById("viewModal");
const viewCard = document.getElementById("viewCard");

const formModal = document.getElementById("formModal");
const formTitleEl = document.getElementById("formTitle");
const editBadge = document.getElementById("editBadge");
const nutEditHint = document.getElementById("nutEditHint");

const btnFormClose = document.getElementById("btnFormClose");
const btnSave = document.getElementById("btnSave");
const btnCancelEdit = document.getElementById("btnCancelEdit");
const urlEl = document.getElementById("fUrl");
const btnScrape = document.getElementById("btnScrape");

let editingId = null;

function setStatus(t) { statusEl.textContent = t; }

function escapeHtml(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

async function api(path, options) {
  const res = await fetch(path, options);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.detail || data.error || ("HTTP " + res.status));
  return data;
}

function pill(text) { return `<span class="pill">${escapeHtml(text)}</span>`; }

function fmtNum(n, suffix = "") {
  if (n === null || n === undefined || n === "") return null;
  const x = Number(n);
  if (!Number.isFinite(x)) return null;
  const v = Number.isInteger(x) ? String(x) : String(Math.round(x * 10) / 10);
  return v + suffix;
}

// ---------- Rendering ----------
function card(r) {
  const el = document.createElement("div");
  el.className = "card clickable";
  el.onclick = () => openView(r.id);

  const tags = (r.tags || []).slice(0, 4).map(pill).join("");
  const meta = [
    (r.servings ? `Serves ${r.servings}` : null),
    (r.prep_minutes ? `Prep ${r.prep_minutes}m` : null),
    (r.cook_minutes ? `Cook ${r.cook_minutes}m` : null)
  ].filter(Boolean).join(" • ");

  const cal = r.nutrition && r.nutrition.calories ? ` • ${r.nutrition.calories} kcal` : "";

  el.innerHTML = `
    <div class="title">
      <div>${escapeHtml(r.title)}</div>
      <div class="muted">#${r.id}</div>
    </div>
    <div class="muted" style="margin-top:6px">${escapeHtml(r.description || "")}</div>
    <div style="margin-top:10px">${tags}</div>
    <div class="muted" style="margin-top:10px">${meta}${cal}</div>
  `;
  return el;
}

async function load() {
  setStatus("Loading…");
  const q = searchEl.value.trim();
  const url = q ? `/api/recipes?q=${encodeURIComponent(q)}` : "/api/recipes";

  try {
    const items = await api(url);
    grid.innerHTML = "";
    items.forEach(r => grid.appendChild(card(r)));
    setStatus(`Ready • ${items.length} recipes`);
  } catch (e) {
    setStatus("Error: " + e.message);
  }
}

// ---------- Nutrition rendering ----------
function nutRow(label, value) {
  if (value === null || value === undefined || value === "") return "";
  return `<tr><td class="muted">${escapeHtml(label)}</td><td>${escapeHtml(String(value))}</td></tr>`;
}

function renderNutrition(n) {
  if (!n) return "";

  const rows = [];
  if (n.serving_size) rows.push(nutRow("Serving size", n.serving_size));
  if (n.calories != null) rows.push(nutRow("Calories", `${n.calories} kcal`));
  rows.push(nutRow("Carbs", fmtNum(n.carbs_g, " g")));
  rows.push(nutRow("Sugar", fmtNum(n.sugar_g, " g")));
  rows.push(nutRow("Fat", fmtNum(n.fat_g, " g")));
  rows.push(nutRow("Saturated fat", fmtNum(n.saturated_fat_g, " g")));
  rows.push(nutRow("Trans fat", fmtNum(n.trans_fat_g, " g")));
  rows.push(nutRow("Protein", fmtNum(n.protein_g, " g")));
  rows.push(nutRow("Fiber", fmtNum(n.fiber_g, " g")));
  rows.push(nutRow("Sodium", fmtNum(n.sodium_mg, " mg")));
  rows.push(nutRow("Cholesterol", fmtNum(n.cholesterol_mg, " mg")));
  rows.push(nutRow("Potassium", fmtNum(n.potassium_mg, " mg")));
  rows.push(nutRow("Calcium", fmtNum(n.calcium_mg, " mg")));
  rows.push(nutRow("Iron", fmtNum(n.iron_mg, " mg")));
  rows.push(nutRow("Vitamin A", fmtNum(n.vitamin_a_iu, " IU")));
  rows.push(nutRow("Vitamin B6", fmtNum(n.vitamin_b6_mg, " mg")));
  rows.push(nutRow("Vitamin B12", fmtNum(n.vitamin_b12_mcg, " mcg")));
  rows.push(nutRow("Vitamin C", fmtNum(n.vitamin_c_mg, " mg")));
  rows.push(nutRow("Vitamin D", fmtNum(n.vitamin_d_iu, " IU")));

  const body = rows.filter(Boolean).join("");
  if (!body) return "";

  return `
    <div style="margin-top:14px">
      <div class="title" style="font-size:16px"><div>Nutrition Facts</div></div>
      <table class="nutTable">${body}</table>
    </div>
  `;
}

// ---------- View modal ----------
async function openView(id) {
  setStatus("Loading recipe…");
  try {
    const r = await api(`/api/recipes/${id}`);
    const tags = (r.tags || []).map(pill).join("");
    const meta = [
      (r.servings ? `Serves ${r.servings}` : null),
      (r.prep_minutes ? `Prep ${r.prep_minutes}m` : null),
      (r.cook_minutes ? `Cook ${r.cook_minutes}m` : null)
    ].filter(Boolean).join(" • ");

    const ing = (r.ingredients || []).map(x => `<li>${escapeHtml(x)}</li>`).join("");
    const steps = (r.steps || []).map(x => `<li>${escapeHtml(x)}</li>`).join("");

    viewCard.innerHTML = `
      <div class="title">
        <div style="font-size:20px">${escapeHtml(r.title)}</div>
        <div class="row">
          <button data-action="edit" data-id="${r.id}">Edit</button>
          <button data-action="delete" data-id="${r.id}">Delete</button>
          <button data-action="closeView">Close</button>
        </div>
      </div>

      <div class="muted" style="margin-top:6px">${escapeHtml(r.description || "")}</div>
      <div style="margin-top:10px">${tags}</div>
      <div class="muted" style="margin-top:10px">${meta}</div>

      <div style="margin-top:14px">
        <div class="title" style="font-size:16px"><div>Ingredients</div></div>
        <ol>${ing}</ol>
      </div>

      <div style="margin-top:14px">
        <div class="title" style="font-size:16px"><div>Steps</div></div>
        <ol>${steps}</ol>
      </div>

      ${renderNutrition(r.nutrition)}
    `;

    viewModal.classList.add("open");
    setStatus("Ready");
  } catch (e) {
    setStatus("Error: " + e.message);
  }
}

function closeViewIfBackdrop(ev) {
  if (ev.target !== viewModal) return;
  viewModal.classList.remove("open");
}

async function delRecipe(id) {
  if (!confirm("Delete this recipe?")) return;
  try {
    await api(`/api/recipes/${id}`, { method: "DELETE" });
    viewModal.classList.remove("open");
    await load();
  } catch (e) {
    alert(e.message);
  }
}

// View modal button delegation
viewCard.addEventListener("click", (ev) => {
  const btn = ev.target.closest("button");
  if (!btn) return;
  const action = btn.dataset.action;

  if (action === "closeView") viewModal.classList.remove("open");
  if (action === "delete") delRecipe(btn.dataset.id);
  if (action === "edit") startEdit(btn.dataset.id);
});

// ---------- Form helpers ----------
function get(id) { return document.getElementById(id); }
function val(id) { return (get(id).value || "").trim(); }
function toNum(v) {
  if (v === "" || v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
function num(id) { return toNum(val(id)); }
function lines(v) { return v.split("\n").map(x => x.trim()).filter(Boolean); }

function clearForm() {
  [
    "fUrl",
    "fTitle","fDesc","fServ","fPrep","fCook","fTags","fIng","fSteps",
    "fNutServing","fNutCalories","fNutCarbs","fNutSugar","fNutFat","fNutSatFat","fNutTransFat",
    "fNutProtein","fNutFiber","fNutSodium","fNutChol","fNutPotassium","fNutCalcium","fNutIron",
    "fNutVitA","fNutB6","fNutB12","fNutVitC","fNutVitD","fNutVitD2"
  ].forEach(id => { const el = get(id); if (el) el.value = ""; });
}

function setIfPresent(id, value) {
  const el = get(id);
  if (!el) return;
  el.value = (value === null || value === undefined) ? "" : String(value);
}

function fillFormFromRecipe(r) {
  setIfPresent("fUrl", "");
  setIfPresent("fTitle", r.title);
  setIfPresent("fDesc", r.description || "");
  setIfPresent("fServ", r.servings);
  setIfPresent("fPrep", r.prep_minutes);
  setIfPresent("fCook", r.cook_minutes);
  setIfPresent("fTags", (r.tags || []).join(", "));
  setIfPresent("fIng", (r.ingredients || []).join("\n"));
  setIfPresent("fSteps", (r.steps || []).join("\n"));

  const n = r.nutrition || null;
  setIfPresent("fNutServing", n && n.serving_size);
  setIfPresent("fNutCalories", n && n.calories);
  setIfPresent("fNutCarbs", n && n.carbs_g);
  setIfPresent("fNutSugar", n && n.sugar_g);
  setIfPresent("fNutFat", n && n.fat_g);
  setIfPresent("fNutSatFat", n && n.saturated_fat_g);
  setIfPresent("fNutTransFat", n && n.trans_fat_g);
  setIfPresent("fNutProtein", n && n.protein_g);
  setIfPresent("fNutFiber", n && n.fiber_g);
  setIfPresent("fNutSodium", n && n.sodium_mg);
  setIfPresent("fNutChol", n && n.cholesterol_mg);
  setIfPresent("fNutPotassium", n && n.potassium_mg);
  setIfPresent("fNutCalcium", n && n.calcium_mg);
  setIfPresent("fNutIron", n && n.iron_mg);
  setIfPresent("fNutVitA", n && n.vitamin_a_iu);
  setIfPresent("fNutB6", n && n.vitamin_b6_mg);
  setIfPresent("fNutB12", n && n.vitamin_b12_mcg);
  setIfPresent("fNutVitC", n && n.vitamin_c_mg);
  setIfPresent("fNutVitD", n && n.vitamin_d_iu);
}

function fillFormFromScrape(s) {
  if (!s) return;
  if (s.title) setIfPresent("fTitle", s.title);
  if (s.servings != null) setIfPresent("fServ", s.servings);
  if (s.prep_minutes != null) setIfPresent("fPrep", s.prep_minutes);
  if (s.cook_minutes != null) setIfPresent("fCook", s.cook_minutes);
  if (Array.isArray(s.ingredients) && s.ingredients.length) setIfPresent("fIng", s.ingredients.join("\n"));
  if (Array.isArray(s.steps) && s.steps.length) setIfPresent("fSteps", s.steps.join("\n"));

  const n = s.nutrition || null;
  if (n) {
    setIfPresent("fNutServing", n.serving_size);
    setIfPresent("fNutCalories", n.calories);
    setIfPresent("fNutCarbs", n.carbs_g);
    setIfPresent("fNutSugar", n.sugar_g);
    setIfPresent("fNutFat", n.fat_g);
    setIfPresent("fNutSatFat", n.saturated_fat_g);
    setIfPresent("fNutTransFat", n.trans_fat_g);
    setIfPresent("fNutProtein", n.protein_g);
    setIfPresent("fNutFiber", n.fiber_g);
    setIfPresent("fNutSodium", n.sodium_mg);
    setIfPresent("fNutChol", n.cholesterol_mg);
    setIfPresent("fNutPotassium", n.potassium_mg);
    setIfPresent("fNutCalcium", n.calcium_mg);
    setIfPresent("fNutIron", n.iron_mg);
    setIfPresent("fNutVitA", n.vitamin_a_iu);
    setIfPresent("fNutB6", n.vitamin_b6_mg);
    setIfPresent("fNutB12", n.vitamin_b12_mcg);
    setIfPresent("fNutVitC", n.vitamin_c_mg);
    setIfPresent("fNutVitD", n.vitamin_d_iu);
  }
}

async function importFromUrl() {
  const url = val("fUrl");
  if (!url) { alert("Paste a recipe URL first."); return; }

  const hasContent =
    !!val("fTitle") ||
    !!val("fDesc") ||
    !!val("fTags") ||
    !!val("fIng") ||
    !!val("fSteps") ||
    !!val("fServ") ||
    !!val("fPrep") ||
    !!val("fCook");

  if (hasContent && !confirm("Replace current form fields with imported data?")) return;

  const prevText = btnScrape.textContent;
  btnScrape.disabled = true;
  btnScrape.textContent = "Importing…";
  setStatus("Importing recipe…");

  try {
    const data = await api("/api/scrape", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url })
    });
    fillFormFromScrape(data);
    setStatus("Imported");
  } catch (e) {
    setStatus("Ready");
    alert(e.message);
  } finally {
    btnScrape.disabled = false;
    btnScrape.textContent = prevText;
  }
}

// ---------- Form modes ----------
function beginAddMode() {
  editingId = null;
  formTitleEl.textContent = "Add Recipe";
  editBadge.style.display = "none";
  nutEditHint.style.display = "none";
  btnSave.textContent = "Save";
  btnCancelEdit.style.display = "none";
  clearForm();
}

function beginEditMode(id) {
  editingId = Number(id);
  formTitleEl.textContent = "Edit Recipe";
  editBadge.style.display = "inline-block";
  nutEditHint.style.display = "inline";
  btnSave.textContent = "Update";
  btnCancelEdit.style.display = "inline-block";
}

function openForm() { formModal.classList.add("open"); }
function closeForm() { formModal.classList.remove("open"); }

function closeFormIfBackdrop(ev) {
  if (ev.target !== formModal) return;
  closeForm();
}

async function startEdit(id) {
  try {
    const r = await api(`/api/recipes/${id}`);
    beginEditMode(id);
    fillFormFromRecipe(r);
    viewModal.classList.remove("open");
    openForm();
  } catch (e) {
    alert(e.message);
  }
}

// ---------- Nutrition payload ----------
function buildNutrition() {
  const nutrition = {
    serving_size: val("fNutServing") || null,
    calories: num("fNutCalories"),
    carbs_g: num("fNutCarbs"),
    sugar_g: num("fNutSugar"),
    fat_g: num("fNutFat"),
    saturated_fat_g: num("fNutSatFat"),
    trans_fat_g: num("fNutTransFat"),
    protein_g: num("fNutProtein"),
    fiber_g: num("fNutFiber"),
    sodium_mg: num("fNutSodium"),
    cholesterol_mg: num("fNutChol"),
    potassium_mg: num("fNutPotassium"),
    calcium_mg: num("fNutCalcium"),
    iron_mg: num("fNutIron"),
    vitamin_a_iu: num("fNutVitA"),
    vitamin_b6_mg: num("fNutB6"),
    vitamin_b12_mcg: num("fNutB12"),
    vitamin_c_mg: num("fNutVitC"),
    vitamin_d_iu: num("fNutVitD"),
  };

  const hasAny = Object.entries(nutrition).some(([k, v]) => v !== null && v !== undefined && v !== "");
  if (!hasAny) return null;

  Object.keys(nutrition).forEach(k => {
    if (nutrition[k] === null || nutrition[k] === undefined || nutrition[k] === "") delete nutrition[k];
  });
  return nutrition;
}

// ---------- Submit ----------
async function submit() {
  const body = {
    title: val("fTitle"),
    description: val("fDesc") || null,
    servings: num("fServ"),
    prep_minutes: num("fPrep"),
    cook_minutes: num("fCook"),
    tags: (val("fTags") || "").split(",").map(x => x.trim()).filter(Boolean),
    ingredients: lines(get("fIng").value || ""),
    steps: lines(get("fSteps").value || ""),
  };

  const nutrition = buildNutrition();
  if (nutrition) body.nutrition = nutrition;

  if (!body.title) { alert("Title is required."); return; }

  try {
    if (editingId) {
      await api(`/api/recipes/${editingId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
    } else {
      await api("/api/recipes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
    }

    closeForm();
    beginAddMode();
    await load();
  } catch (e) {
    alert(e.message);
  }
}

// ---------- Wire up events ----------
btnAdd.addEventListener("click", () => { beginAddMode(); openForm(); });
btnPlanner.addEventListener("click", () => { window.location.href = "/meal-planner.html"; });
btnList.addEventListener("click", () => { window.location.href = "/grocery-list.html"; });
btnRefresh.addEventListener("click", load);

btnFormClose.addEventListener("click", closeForm);
btnSave.addEventListener("click", submit);
btnCancelEdit.addEventListener("click", () => { beginAddMode(); closeForm(); });

btnScrape.addEventListener("click", importFromUrl);
urlEl.addEventListener("keydown", (ev) => {
  if (ev.key === "Enter") { ev.preventDefault(); importFromUrl(); }
});

viewModal.addEventListener("click", closeViewIfBackdrop);
formModal.addEventListener("click", closeFormIfBackdrop);

searchEl.addEventListener("input", () => {
  clearTimeout(window.__t);
  window.__t = setTimeout(load, 250);
});

// boot
load();
