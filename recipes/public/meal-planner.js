/* Meal Planner Frontend (no frameworks) */

const statusEl = document.getElementById("status");
const startEl = document.getElementById("start");
const daysEl = document.getElementById("days");
const btnLoad = document.getElementById("btnLoad");
const btnBack = document.getElementById("btnBack");
const personSelect = document.getElementById("personSelect");
const btnAddPerson = document.getElementById("btnAddPerson");
const btnList = document.getElementById("btnList");

const fDay = document.getElementById("fDay");
const fSlot = document.getElementById("fSlot");
const fServings = document.getElementById("fServings");
const fRecipe = document.getElementById("fRecipe");
const fRecipeSearch = document.getElementById("fRecipeSearch");
const fRecipeHint = document.getElementById("fRecipeHint");
const fNotes = document.getElementById("fNotes");
const btnAddMeal = document.getElementById("btnAddMeal");

const editModal = document.getElementById("editModal");
const btnEditClose = document.getElementById("btnEditClose");
const btnEditSave = document.getElementById("btnEditSave");
const editStatus = document.getElementById("editStatus");

const eDay = document.getElementById("eDay");
const eSlot = document.getElementById("eSlot");
const eServings = document.getElementById("eServings");
const eRecipe = document.getElementById("eRecipe");
const eRecipeSearch = document.getElementById("eRecipeSearch");
const eRecipeHint = document.getElementById("eRecipeHint");
const eNotes = document.getElementById("eNotes");

const reportRoot = document.getElementById("nutritionReport");

// Track meals so we can open edit by id
let mealsById = new Map();
let editingMealId = null;
let editingMealPerson = null;

const DEFAULT_PERSON = "Household";
const PERSON_STORAGE_KEY = "mealPlannerPerson";

// Separate recipe lists for edit modal filtering
let editFilteredRecipes = [];

const mealsRoot = document.getElementById("meals");

let recipesById = new Map();

// keep full list for filtering
let allRecipes = []; // [{id, title, ...}]
let filteredRecipes = []; // same shape

function setStatus(t) {
  statusEl.textContent = t;
}

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

function isoDate(d) {
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

function addDays(yyyyMmDd, n) {
  const d = new Date(yyyyMmDd + "T00:00:00");
  d.setDate(d.getDate() + n);
  return isoDate(d);
}

function parseServingsValue(value) {
  const num = Number(value);
  if (!Number.isFinite(num) || num <= 0) {
    return null;
  }
  return num;
}

function normalizePersonName(name) {
  return String(name || "").trim().replace(/\s+/g, " ");
}

function getSelectedPerson() {
  if (!personSelect) return DEFAULT_PERSON;
  return normalizePersonName(personSelect.value || DEFAULT_PERSON) || DEFAULT_PERSON;
}

function renderPersonOptions(people, selected) {
  if (!personSelect) return;
  personSelect.innerHTML = people
    .map((p) => `<option value="${escapeHtml(p)}">${escapeHtml(p)}</option>`)
    .join("");
  personSelect.value = selected || people[0] || DEFAULT_PERSON;
}

async function loadPeople() {
  let list = [];
  try {
    list = await api("/api/people");
  } catch (e) {
    list = [];
  }

  const stored = normalizePersonName(localStorage.getItem(PERSON_STORAGE_KEY) || "");
  const items = [];
  const seen = new Set();

  [DEFAULT_PERSON, ...list, stored].forEach((name) => {
    const cleaned = normalizePersonName(name);
    const key = cleaned.toLowerCase();
    if (!cleaned || seen.has(key)) return;
    seen.add(key);
    items.push(cleaned);
  });

  const selected = stored && items.includes(stored) ? stored : items[0];
  renderPersonOptions(items, selected);
  if (selected) localStorage.setItem(PERSON_STORAGE_KEY, selected);
}

function addPersonOption(name) {
  if (!personSelect) return;
  const cleaned = normalizePersonName(name);
  if (!cleaned) return;
  const existing = Array.from(personSelect.options).map((o) => o.value.toLowerCase());
  if (!existing.includes(cleaned.toLowerCase())) {
    const opt = document.createElement("option");
    opt.value = cleaned;
    opt.textContent = cleaned;
    personSelect.appendChild(opt);
  }
  personSelect.value = cleaned;
  localStorage.setItem(PERSON_STORAGE_KEY, cleaned);
}

// ----------------------------
// Edit Modal
// ----------------------------

function openModal() {
  editModal.classList.add("open");
  editModal.setAttribute("aria-hidden", "false");
}

function closeModal() {
  editModal.classList.remove("open");
  editModal.setAttribute("aria-hidden", "true");
  editingMealId = null;
  editingMealPerson = null;
  if (editStatus) editStatus.textContent = "";
}

function setEditStatus(t) {
  if (editStatus) editStatus.textContent = t || "";
}

function renderRecipeOptionsInto(selectEl, hintEl, list, { keepSelected = true } = {}) {
  const prev = keepSelected ? selectEl.value : "";
  selectEl.innerHTML = "";

  if (!list.length) {
    selectEl.disabled = true;
    selectEl.innerHTML = `<option value="">No matches…</option>`;
    if (hintEl) hintEl.textContent = "0 matches";
    return;
  }

  selectEl.disabled = false;

  selectEl.innerHTML = list
    .map((r) => `<option value="${r.id}">#${r.id} • ${escapeHtml(r.title)}</option>`)
    .join("");

  if (keepSelected && prev) {
    const exists = list.some((r) => String(r.id) === String(prev));
    if (exists) selectEl.value = prev;
  }

  if (!selectEl.value && selectEl.options.length > 0) selectEl.selectedIndex = 0;

  if (hintEl) {
    const total = allRecipes.length;
    const shown = list.length;
    hintEl.textContent = shown === total ? `${total} recipes` : `${shown} match(es)`;
  }
}

function applyEditRecipeFilter() {
  const q = (eRecipeSearch?.value || "").trim().toLowerCase();
  editFilteredRecipes = !q
    ? allRecipes.slice()
    : allRecipes.filter((r) => (r.title || "").toLowerCase().includes(q));

  renderRecipeOptionsInto(eRecipe, eRecipeHint, editFilteredRecipes, { keepSelected: true });
}

// ----------------------------
// Nutrition Report
// ----------------------------
function fmtNum(n, digits = 0) {
  const x = Number(n || 0);
  return x.toLocaleString(undefined, { maximumFractionDigits: digits });
}

function renderDailyTotalsTable(dailyRows, start, end) {
  if (!dailyRows || dailyRows.length === 0) {
    return `<div class="muted" style="margin-top:10px">No daily totals for this range.</div>`;
  }

  const rowsHtml = dailyRows.map((d) => `
    <tr>
      <td>${escapeHtml(d.day)}</td>
      <td style="text-align:right">${fmtNum(d.meals_count)}</td>
      <td style="text-align:right">${fmtNum(d.calories)}</td>
      <td style="text-align:right">${fmtNum(d.protein_g, 1)}</td>
      <td style="text-align:right">${fmtNum(d.carbs_g, 1)}</td>
      <td style="text-align:right">${fmtNum(d.fat_g, 1)}</td>
    </tr>
  `).join("");

  return `
    <div class="hr"></div>
    <div class="sectionTitle">Daily totals</div>

    <table class="nutTable" style="margin-top:10px">
      <thead>
        <tr>
          <td style="font-weight:700">Day</td>
          <td style="font-weight:700; text-align:right">Meals</td>
          <td style="font-weight:700; text-align:right">Calories</td>
          <td style="font-weight:700; text-align:right">Protein (g)</td>
          <td style="font-weight:700; text-align:right">Carbs (g)</td>
          <td style="font-weight:700; text-align:right">Fat (g)</td>
        </tr>
      </thead>
      <tbody>
        ${rowsHtml}
      </tbody>
    </table>

    <div class="muted" style="margin-top:8px">
      Showing calories + macros per day (fiber/sugar/sodium are still in the totals above).
    </div>
  `;
}

function renderNutritionReport(report, daily, start, end, person) {
  if (!reportRoot) return;

  const t = report?.totals || {};
  const mealsCount = Number(t.meals_count || 0);

  reportRoot.innerHTML = `
    <div class="card">
      <div class="title">
        <div style="font-size:16px">Nutrition totals</div>
        <div class="muted">${escapeHtml(start)} → ${escapeHtml(end)} • ${mealsCount} meal(s) • ${escapeHtml(person)}</div>
      </div>

      <div class="nutGrid">
        <div class="nutRow"><div class="pill">Calories</div><div style="text-align:right">${fmtNum(t.calories)} kcal</div></div>
        <div class="nutRow"><div class="pill">Protein</div><div style="text-align:right">${fmtNum(t.protein_g, 1)} g</div></div>
        <div class="nutRow"><div class="pill">Carbs</div><div style="text-align:right">${fmtNum(t.carbs_g, 1)} g</div></div>
        <div class="nutRow"><div class="pill">Fat</div><div style="text-align:right">${fmtNum(t.fat_g, 1)} g</div></div>
        <div class="nutRow"><div class="pill">Fiber</div><div style="text-align:right">${fmtNum(t.fiber_g, 1)} g</div></div>
        <div class="nutRow"><div class="pill">Sugar</div><div style="text-align:right">${fmtNum(t.sugar_g, 1)} g</div></div>
        <div class="nutRow"><div class="pill">Sodium</div><div style="text-align:right">${fmtNum(t.sodium_mg)} mg</div></div>
      </div>

      ${renderDailyTotalsTable(daily, start, end)}
    </div>
  `;
}

function renderNutritionReportError(message, person) {
  if (!reportRoot) return;
  reportRoot.innerHTML = `
    <div class="card">
      <div class="title">
        <div style="font-size:16px">Nutrition totals</div>
        <div class="muted">Unavailable • ${escapeHtml(person || DEFAULT_PERSON)}</div>
      </div>
      <div class="muted" style="margin-top:10px">${escapeHtml(message || "Unknown error")}</div>
    </div>
  `;
}

// ----------------------------
// Recipe dropdown + search
// ----------------------------

function renderRecipeOptions(list, { keepSelected = true } = {}) {
  const prev = keepSelected ? fRecipe.value : "";
  fRecipe.innerHTML = "";

  if (!list.length) {
    fRecipe.disabled = true;
    fRecipe.innerHTML = `<option value="">No matches…</option>`;
    if (fRecipeHint) fRecipeHint.textContent = "0 matches";
    return;
  }

  fRecipe.disabled = false;

  // Render options
  fRecipe.innerHTML = list
    .map((r) => `<option value="${r.id}">#${r.id} • ${escapeHtml(r.title)}</option>`)
    .join("");

  // Try to keep existing selection if it still exists
  if (keepSelected && prev) {
    const exists = list.some((r) => String(r.id) === String(prev));
    if (exists) fRecipe.value = prev;
  }

  // If nothing selected, select first
  if (!fRecipe.value && fRecipe.options.length > 0) {
    fRecipe.selectedIndex = 0;
  }

  if (fRecipeHint) {
    const total = allRecipes.length;
    const shown = list.length;
    fRecipeHint.textContent =
      shown === total ? `${total} recipes` : `${shown} match(es)`;
  }
}

function applyRecipeFilter() {
  const q = (fRecipeSearch?.value || "").trim().toLowerCase();

  if (!q) {
    filteredRecipes = allRecipes.slice();
  } else {
    filteredRecipes = allRecipes.filter((r) =>
      (r.title || "").toLowerCase().includes(q)
    );
  }

  renderRecipeOptions(filteredRecipes, { keepSelected: true });
}

function wireRecipeSearch() {
  if (!fRecipeSearch) return;

  // Filter as user types
  fRecipeSearch.addEventListener("input", applyRecipeFilter);

  // UX: ArrowDown moves focus to the select
  fRecipeSearch.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      fRecipe.focus();
    }
    if (e.key === "Escape") {
      fRecipeSearch.value = "";
      applyRecipeFilter();
      fRecipeSearch.blur();
    }
    // Optional: Enter selects first match
    if (e.key === "Enter") {
      e.preventDefault();
      if (filteredRecipes.length > 0) {
        fRecipe.value = String(filteredRecipes[0].id);
      }
    }
  });
}

async function loadRecipes() {
  // you already use /api/listRecipes — keep it
  const items = await api("/api/listRecipes");

  // store for filtering (sorted)
  allRecipes = items
    .slice()
    .sort((a, b) => (a.title || "").localeCompare(b.title || ""));

  filteredRecipes = allRecipes.slice();

  recipesById = new Map(items.map((r) => [r.id, r]));

  // initial render
  renderRecipeOptions(filteredRecipes, { keepSelected: false });

  // reset search box/hint
  if (fRecipeSearch) fRecipeSearch.value = "";
  if (fRecipeHint) fRecipeHint.textContent = `${allRecipes.length} recipes`;
}

// ----------------------------


function groupByDay(meals) {
  const m = new Map();
  meals.forEach((x) => {
    const key = x.day; // ISO date
    if (!m.has(key)) m.set(key, []);
    m.get(key).push(x);
  });
  m.forEach((arr) => {
    arr.sort((a, b) => (a.slot || "").localeCompare(b.slot || "") || a.id - b.id);
  });
  return m;
}

function renderDayCard(day, meals) {
  const el = document.createElement("div");
  el.className = "card";
  el.style.marginTop = "14px";

  const list = (meals || [])
    .map((m) => {
      const r = recipesById.get(m.recipe_id);
      const title = r ? r.title : `Recipe #${m.recipe_id}`;
      const notes = m.notes ? `<div class="muted" style="margin-top:4px">${escapeHtml(m.notes)}</div>` : "";
      return `
        <div style="padding:10px 0; border-top: 1px solid rgba(255,255,255,.08)">
          <div class="title" style="gap:10px">
            <div>
              <span class="badge">${escapeHtml(m.slot)}</span>
              <span style="margin-left:10px">${escapeHtml(title)}</span>
            </div>
            <div class="row" style="margin-top:0">
              <button data-action="edit" data-id="${m.id}">Edit</button>
              <button data-action="delete" data-id="${m.id}">Delete</button>
            </div>
          </div>
          ${notes}
        </div>
      `;
    })
    .join("");

  el.innerHTML = `
    <div class="title">
      <div style="font-size:16px">${escapeHtml(day)}</div>
      <div class="muted">${(meals || []).length} meal(s)</div>
    </div>
    <div>${list || `<div class="muted" style="margin-top:10px">No meals yet.</div>`}</div>
  `;

  // Edit/Delete button handler
  el.addEventListener("click", async (ev) => {
    const btn = ev.target.closest("button");
    if (!btn) return;

    const action = btn.dataset.action;
    const id = Number(btn.dataset.id);

    if (action === "delete") {
      if (!confirm("Delete this meal?")) return;
      try {
        await api(`/api/meals/${id}`, { method: "DELETE" });
        await loadMeals();
      } catch (e) {
        alert(e.message);
      }
      return;
    }

    if (action === "edit") {
      const meal = mealsById.get(id);
      if (!meal) {
        alert("Meal not found.");
        return;
      }
      
      editingMealId = id;
      editingMealPerson = meal.person || null;
      eDay.value = meal.day;
      eSlot.value = meal.slot;
      if (eServings) eServings.value = String(meal.servings || 1);
      eNotes.value = meal.notes || "";

      editFilteredRecipes = allRecipes.slice();
      renderRecipeOptionsInto(eRecipe, eRecipeHint, editFilteredRecipes, { keepSelected: false });
      eRecipe.value = String(meal.recipe_id);

      // Reset Search
      if (eRecipeSearch) eRecipeSearch.value = "";
      applyEditRecipeFilter();
      setEditStatus("");
      openModal();
      return;
    }
  });
  return el;
}

async function loadMeals() {
  const start = startEl.value;
  const days = Math.max(1, Math.min(31, Number(daysEl.value || 7)));
  const end = addDays(start, days - 1);
  const person = getSelectedPerson();
  const personParam =
    person && person !== DEFAULT_PERSON
      ? `&person=${encodeURIComponent(person)}`
      : "";

  setStatus("Loading…");

  let meals = [];
  try {
    const [mealsRes, reportRes, dailyRes] = await Promise.all([
      api(`/api/meals?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}${personParam}`),
      api(`/api/meals/nutritionReport?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}${personParam}`),
      api(`/api/meals/nutritionReport/daily?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}${personParam}`),
    ]);

    meals = mealsRes;
    renderNutritionReport(reportRes, dailyRes, start, end, person);
  } catch (e) {
      // try to load meals even if report fails
      try {
        meals = await api(`/api/meals?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}${personParam}`);
      } catch (e2) {
        setStatus("Error: " + e2.message);
        renderNutritionReportError(e.message, person);
        return;
      }
      renderNutritionReportError(e.message, person);
  }

  mealsById = new Map(meals.map((m) => [m.id, m]));
  const byDay = groupByDay(meals);

  mealsRoot.innerHTML = "";
  for (let i = 0; i < days; i++) {
    const day = addDays(start, i);
    mealsRoot.appendChild(renderDayCard(day, byDay.get(day) || []));
  }
  setStatus(`Ready • ${meals.length} meal(s) • ${person}`);
}

async function addMeal() {
  const recipeId = Number(fRecipe.value);

  // If search filter hides everything, select will be disabled
  if (!recipeId || fRecipe.disabled) {
    alert("Select a recipe (or clear your search).");
    return;
  }

  const day = fDay.value;
  if (!day) {
    alert("Pick a date.");
    return;
  }
  const slot = fSlot.value;
  const person = getSelectedPerson();
  const servings = parseServingsValue(fServings?.value || "1");
  if (!servings) {
    alert("Enter a servings value greater than 0.");
    return;
  }

  btnAddMeal.disabled = true;
  try {
    await api("/api/meals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        day,
        slot,
        person,
        servings,
        recipe_id: recipeId,
        notes: (fNotes.value || "").trim() || null,
      }),
    });
    fNotes.value = "";
    await loadMeals();
  } catch (e) {
    alert(e.message);
  } finally {
    btnAddMeal.disabled = false;
  }
}

async function boot() {
  const today = isoDate(new Date());
  startEl.value = today;
  fDay.value = today;

  try {
    wireRecipeSearch();   // ✅ NEW
    await loadRecipes();  // will render initial list
    await loadPeople();
    await loadMeals();
  } catch (e) {
    setStatus("Error: " + e.message);
  }
}

btnLoad.addEventListener("click", loadMeals);
btnBack.addEventListener("click", () => {
  window.location.href = "/";
});
btnAddMeal.addEventListener("click", addMeal);

if (personSelect) {
  personSelect.addEventListener("change", () => {
    const name = getSelectedPerson();
    localStorage.setItem(PERSON_STORAGE_KEY, name);
    loadMeals();
  });
}

if (btnAddPerson) {
  btnAddPerson.addEventListener("click", () => {
    const name = prompt("Person name");
    if (!name) return;
    addPersonOption(name);
    loadMeals();
  });
}

startEl.addEventListener("change", () => {
  fDay.value = startEl.value;
  loadMeals();
});
daysEl.addEventListener("change", loadMeals);

btnEditClose.addEventListener("click", closeModal);

// close if clicking outside modal-innder
editModal.addEventListener("click", (ev) => {
  if (ev.target === editModal) closeModal();
});

// searchable recipe list in edit modal
eRecipeSearch.addEventListener("input", applyEditRecipeFilter);
eRecipeSearch.addEventListener("keydown", (e) => {
  if (e.key === "ArrowDown") {
    e.preventDefault();
    eRecipe.focus();
  }
  if (e.key === "Escape") {
    eRecipeSearch.value = "";
    applyEditRecipeFilter();
    eRecipeSearch.blur();
  }
  if (e.key === "Enter") {
    e.preventDefault();
    if (editFilteredRecipes.length > 0) {
      eRecipe.value = String(editFilteredRecipes[0].id);
    }
  }
});

// Save edits
btnEditSave.addEventListener("click", async () => {
  if (!editingMealId) {
    alert("No meal is being edited.");
    return;
  }

  const recipeId = Number(eRecipe.value);
  if (!recipeId || eRecipe.disabled) {
    alert("Select a recipe.");
    return;
  }
  if (!eDay.value) {
    alert("Pick a date.");
    return;
  }
  const servings = parseServingsValue(eServings?.value || "1");
  if (!servings) {
    alert("Enter a servings value greater than 0.");
    return;
  }

  btnEditSave.disabled = true;
  setEditStatus("Saving…");

  try {
    await api(`/api/meals/${editingMealId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        day: eDay.value,
        slot: eSlot.value,
        person: editingMealPerson || getSelectedPerson(),
        servings,
        recipe_id: recipeId,
        notes: (eNotes.value || "").trim() || null,
      }),
    });
    setEditStatus("Saved.");
    await loadMeals();
    closeModal();
  } catch (e) {
    setEditStatus("Error: " + e.message);
  } finally {
    btnEditSave.disabled = false;
  }
});

btnList.addEventListener("click", () => { window.location.href = "/grocery-list.html"; });


boot();
