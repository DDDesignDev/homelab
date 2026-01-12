/* Grocery List: meals (person + date range) + manual recipes */

const statusEl = document.getElementById("status");

const chkUseMeals = document.getElementById("chkUseMeals");
const personSelect = document.getElementById("personSelect");
const fromDateEl = document.getElementById("fromDate");
const toDateEl = document.getElementById("toDate");

const recipeSearchEl = document.getElementById("recipeSearch");
const btnSearch = document.getElementById("btnSearch");
const searchStatusEl = document.getElementById("searchStatus");
const recipeResultsEl = document.getElementById("recipeResults");
const selectedRecipesEl = document.getElementById("selectedRecipes");
const btnClearSelected = document.getElementById("btnClearSelected");

const multiplierEl = document.getElementById("multiplier");
const chkGroup = document.getElementById("chkGroup");

const btnBuild = document.getElementById("btnBuild");
const btnCopy = document.getElementById("btnCopy");
const btnPrint = document.getElementById("btnPrint");

const resultsEl = document.getElementById("results");

// state: Map<recipeId, {id, title, factor}>
const selectedRecipeMap = new Map();

function setStatus(t) {
  statusEl.textContent = t || "";
}
function setSearchStatus(t) {
  searchStatusEl.textContent = t || "";
}

function fmtYmd(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function parseISODate(s) {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}
function clampMultiplier(n) {
  if (!Number.isFinite(n) || n <= 0) return 1;
  return Math.min(Math.max(n, 0.01), 100);
}

async function apiGet(url) {
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Request failed (${res.status}): ${text || url}`);
  }
  return res.json();
}

/* ---------------- Ingredient parsing + aggregation ---------------- */

function splitIngredients(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.filter(Boolean).map(String);
  return String(raw)
    .split(/\r?\n|•|\u2022/)
    .map((s) => s.trim())
    .filter(Boolean);
}

const CATEGORY_HINTS = [
  { name: "Produce", re: /\b(onion|garlic|tomato|lettuce|spinach|pepper|carrot|celery|broccoli|lime|lemon|apple|banana|mushroom|potato|sweet potato|cucumber|avocado)\b/i },
  { name: "Meat & Seafood", re: /\b(chicken|beef|pork|turkey|bacon|sausage|salmon|tuna|shrimp|cod)\b/i },
  { name: "Dairy", re: /\b(milk|butter|cheese|yogurt|cream|sour cream|parmesan|mozzarella|cheddar)\b/i },
  { name: "Pantry", re: /\b(rice|pasta|flour|sugar|salt|pepper|oil|olive oil|vinegar|soy sauce|broth|stock|beans|lentils|tomato paste|canned)\b/i },
  { name: "Spices", re: /\b(paprika|cumin|chili|oregano|basil|thyme|cinnamon|nutmeg|garam|curry)\b/i },
  { name: "Bakery", re: /\b(bread|bun|tortilla|pita)\b/i },
];

function guessCategory(name) {
  for (const c of CATEGORY_HINTS) if (c.re.test(name)) return c.name;
  return "Other";
}

function normalizeName(s) {
  return String(s)
    .toLowerCase()
    .replace(/\([^)]*\)/g, " ")
    .replace(/[,;]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function toNumber(token) {
  if (!token) return 0;
  if (token.includes("/")) {
    const [n, d] = token.split("/").map(Number);
    if (!d) return NaN;
    return n / d;
  }
  return Number(token);
}

function parseIngredientLine(line) {
  const original = String(line).trim();
  if (!original) return null;

  // "2 tbsp olive oil", "2 1/2 cups flour", "1/2 cup milk"
  const m = original.match(
    /^(\d+(?:\.\d+)?|\d+\/\d+)(?:\s+(\d+\/\d+))?\s*([a-zA-Z]+)?\s*(.*)$/
  );
  if (!m) return { qty: null, unit: "", name: original, key: normalizeName(original) };

  const a = m[1];
  const b = m[2];
  const unit = (m[3] || "").toLowerCase();
  const rest = (m[4] || "").trim();
  const qty = toNumber(a) + (b ? toNumber(b) : 0);

  const name = rest || original;
  return { qty: Number.isFinite(qty) ? qty : null, unit, name, key: normalizeName(name) };
}

function addToAggregate(map, item, factor) {
  const qty = item.qty == null ? null : item.qty * factor;
  const unit = item.unit || "";
  const key = `${item.key}__${unit}`;

  if (!map.has(key)) {
    map.set(key, {
      displayName: item.name,
      unit,
      qty,
      category: guessCategory(item.name),
    });
    return;
  }

  const existing = map.get(key);
  if (existing.qty != null && qty != null) existing.qty += qty;
  else existing.qty = existing.qty ?? null;
}

function formatQty(q) {
  if (q == null) return "";
  const rounded = Math.round(q * 100) / 100;
  return String(rounded).replace(/\.0+$/, "").replace(/(\.\d*[1-9])0+$/, "$1");
}

function renderList(items, grouped) {
  resultsEl.innerHTML = "";

  if (!items.length) {
    resultsEl.innerHTML = `<p class="muted">No ingredients found.</p>`;
    return;
  }

  if (!grouped) {
    const ul = document.createElement("ul");
    ul.className = "list";
    for (const it of items) {
      const li = document.createElement("li");
      const qty = it.qty != null ? `${formatQty(it.qty)} ${it.unit}`.trim() : "";
      li.textContent = qty ? `${qty} — ${it.displayName}` : it.displayName;
      ul.appendChild(li);
    }
    resultsEl.appendChild(ul);
    return;
  }

  const byCat = new Map();
  for (const it of items) {
    const c = it.category || "Other";
    if (!byCat.has(c)) byCat.set(c, []);
    byCat.get(c).push(it);
  }

  for (const [cat, arr] of byCat.entries()) {
    const section = document.createElement("div");
    section.className = "group";

    const h = document.createElement("h3");
    h.textContent = cat;
    section.appendChild(h);

    const ul = document.createElement("ul");
    ul.className = "list";
    arr.forEach((it) => {
      const li = document.createElement("li");
      const qty = it.qty != null ? `${formatQty(it.qty)} ${it.unit}`.trim() : "";
      li.textContent = qty ? `${qty} — ${it.displayName}` : it.displayName;
      ul.appendChild(li);
    });

    section.appendChild(ul);
    resultsEl.appendChild(section);
  }
}

/* ---------------- Selected recipes UI ---------------- */

function renderSelectedRecipes() {
  selectedRecipesEl.innerHTML = "";

  if (selectedRecipeMap.size === 0) {
    selectedRecipesEl.innerHTML = `<p class="muted">No recipes selected.</p>`;
    return;
  }

  for (const r of selectedRecipeMap.values()) {
    const row = document.createElement("div");
    row.className = "row";
    row.style.justifyContent = "space-between";
    row.style.alignItems = "center";
    row.style.gap = "1rem";

    const left = document.createElement("div");
    left.textContent = r.title || `Recipe ${r.id}`;

    const factorWrap = document.createElement("label");
    factorWrap.className = "row";
    factorWrap.style.gap = ".5rem";
    factorWrap.style.alignItems = "center";
    factorWrap.innerHTML = `<span class="muted">Factor</span>`;

    const factorInput = document.createElement("input");
    factorInput.type = "number";
    factorInput.min = "0.25";
    factorInput.step = "0.25";
    factorInput.value = String(r.factor ?? 1);
    factorInput.style.width = "90px";

    factorInput.addEventListener("change", () => {
      const v = clampMultiplier(Number(factorInput.value));
      factorInput.value = String(v);
      selectedRecipeMap.set(String(r.id), { ...r, factor: v });
    });

    factorWrap.appendChild(factorInput);

    const btnRemove = document.createElement("button");
    btnRemove.className = "btn";
    btnRemove.textContent = "Remove";
    btnRemove.addEventListener("click", () => {
      selectedRecipeMap.delete(String(r.id));
      renderSelectedRecipes();
    });

    row.appendChild(left);
    row.appendChild(factorWrap);
    row.appendChild(btnRemove);
    selectedRecipesEl.appendChild(row);
  }
}

function addSelectedRecipe(recipe) {
  const id = String(recipe.id);
  if (!id) return;
  if (selectedRecipeMap.has(id)) return;

  selectedRecipeMap.set(id, {
    id,
    title: recipe.title || recipe.name || `Recipe ${id}`,
    factor: 1,
  });
  renderSelectedRecipes();
}

/* ---------------- Load people + recipe search ---------------- */

async function loadPeople() {
  // Your backend returns list[str]
  const people = await apiGet("/api/people");

  personSelect.innerHTML = "";
  for (const p of people) {
    const opt = document.createElement("option");
    opt.value = p;
    opt.textContent = p;
    personSelect.appendChild(opt);
  }
}

function setDefaultDates() {
  const today = new Date();
  const start = new Date(today);
  const end = new Date(today);
  end.setDate(end.getDate() + 6);
  fromDateEl.value = fmtYmd(start);
  toDateEl.value = fmtYmd(end);
}

async function searchRecipes() {
  const q = recipeSearchEl.value.trim();
  recipeResultsEl.innerHTML = "";
  if (!q) {
    setSearchStatus("Type something to search.");
    return;
  }

  btnSearch.disabled = true;
  setSearchStatus("Searching…");

  try {
    // ✅ YOUR API uses q=
    const results = await apiGet(`/api/recipes?q=${encodeURIComponent(q)}`);

    if (!Array.isArray(results) || results.length === 0) {
      setSearchStatus("No results.");
      return;
    }

    setSearchStatus(`${results.length} found`);

    results.forEach((r) => {
      const id = String(r.id);
      const title = r.title || `Recipe ${id}`;
      const already = selectedRecipeMap.has(id);

      const row = document.createElement("div");
      row.className = "row";
      row.style.justifyContent = "space-between";
      row.style.alignItems = "center";
      row.style.padding = ".25rem 0";

      const t = document.createElement("div");
      t.textContent = title;

      const btnAdd = document.createElement("button");
      btnAdd.className = "btn";
      btnAdd.textContent = already ? "Added" : "Add";
      btnAdd.disabled = already;

      btnAdd.addEventListener("click", () => {
        addSelectedRecipe(r);
        btnAdd.textContent = "Added";
        btnAdd.disabled = true;
      });

      row.appendChild(t);
      row.appendChild(btnAdd);
      recipeResultsEl.appendChild(row);
    });
  } catch (e) {
    setSearchStatus(e?.message || "Search failed.");
  } finally {
    btnSearch.disabled = false;
  }
}

/* ---------------- Build grocery list from BOTH sources ---------------- */

async function buildGroceryList() {
  const useMeals = chkUseMeals.checked;
  const person = personSelect.value;
  const from = fromDateEl.value;
  const to = toDateEl.value;

  const globalMult = clampMultiplier(Number(multiplierEl.value));

  // If meals enabled, validate range
  if (useMeals) {
    if (!from || !to) {
      setStatus("Pick a date range for meals.");
      return;
    }
    const fromD = parseISODate(from);
    const toD = parseISODate(to);
    if (toD < fromD) {
      setStatus("End date must be after start date.");
      return;
    }
  }

  btnBuild.disabled = true;
  btnCopy.disabled = true;
  btnPrint.disabled = true;
  resultsEl.innerHTML = "";
  setStatus("Building grocery list…");

  try {
    // Collect recipe IDs from meals + manual selection
    // Map recipe_id -> factor (so meals can count multiple times properly)
    const recipeFactorById = new Map();

    // A) from meals (optional): factor = sum of meal.servings
    if (useMeals) {
      setStatus("Loading meals…");
      const url =
        `/api/meals?start=${encodeURIComponent(from)}&end=${encodeURIComponent(to)}&person=${encodeURIComponent(person)}`;

      const meals = await apiGet(url);

      for (const m of meals || []) {
        const id = String(m.recipe_id);
        const servings = clampMultiplier(Number(m.servings ?? 1));
        const prev = recipeFactorById.get(id) || 0;
        recipeFactorById.set(id, prev + servings);
      }
    }

    // B) manual selected recipes (optional): add their factor
    for (const [id, r] of selectedRecipeMap.entries()) {
      const factor = clampMultiplier(Number(r.factor ?? 1));
      const prev = recipeFactorById.get(id) || 0;
      recipeFactorById.set(id, prev + factor);
    }

    const allIds = Array.from(recipeFactorById.keys());
    if (allIds.length === 0) {
      setStatus("Nothing selected. Enable meals and/or add recipes manually.");
      renderList([], chkGroup.checked);
      return;
    }

    setStatus(`Loading ${allIds.length} recipes…`);

    const recipes = await Promise.all(
      allIds.map((id) => apiGet(`/api/recipes/${encodeURIComponent(id)}`).catch(() => null))
    );

    setStatus("Aggregating ingredients…");
    const agg = new Map();

    for (const recipe of recipes.filter(Boolean)) {
      const id = String(recipe.id);
      const baseFactor = recipeFactorById.get(id) || 1;

      // final factor: (meals servings + manual factor) * globalMult
      const finalFactor = baseFactor * globalMult;

      const lines = splitIngredients(recipe.ingredients);
      for (const line of lines) {
        const parsed = parseIngredientLine(line);
        if (!parsed) continue;
        addToAggregate(agg, parsed, finalFactor);
      }
    }

    const items = Array.from(agg.values()).sort((a, b) => {
      if (a.category !== b.category) return a.category.localeCompare(b.category);
      return a.displayName.localeCompare(b.displayName);
    });

    renderList(items, chkGroup.checked);

    btnCopy.disabled = false;
    btnPrint.disabled = false;
    setStatus(`Done — ${items.length} unique items.`);
  } catch (e) {
    setStatus(e?.message || "Failed to build grocery list.");
  } finally {
    btnBuild.disabled = false;
  }
}

/* ---------------- Events ---------------- */

btnSearch.addEventListener("click", searchRecipes);
recipeSearchEl.addEventListener("keydown", (e) => {
  if (e.key === "Enter") searchRecipes();
});

btnClearSelected.addEventListener("click", () => {
  selectedRecipeMap.clear();
  renderSelectedRecipes();
  recipeResultsEl.innerHTML = "";
  setSearchStatus("");
});

chkGroup.addEventListener("change", () => btnBuild.click());

btnCopy.addEventListener("click", async () => {
  const text = resultsEl.innerText.trim();
  if (!text) return;
  try {
    await navigator.clipboard.writeText(text);
    setStatus("Copied to clipboard.");
  } catch {
    setStatus("Could not copy (browser blocked).");
  }
});

btnPrint.addEventListener("click", () => window.print());
btnBuild.addEventListener("click", buildGroceryList);

chkUseMeals.addEventListener("change", () => {
  // optional: disable inputs when unchecked
  const disabled = !chkUseMeals.checked;
  personSelect.disabled = disabled;
  fromDateEl.disabled = disabled;
  toDateEl.disabled = disabled;
});

/* ---------------- Init ---------------- */

(async function init() {
  try {
    setDefaultDates();
    renderSelectedRecipes();
    setStatus("Loading people…");
    await loadPeople();
    setStatus("");
  } catch (e) {
    setStatus(e?.message || "Failed to initialize grocery list page.");
  }
})();
