/* script.js — cleaned + refined */

// =========================
// Imports for charts
// =========================
import { renderAveragePerYear } from './charts/avgPerYear.js';
import { renderScatterRatings } from './charts/scatterRatings.js';
import { renderRatingDifferenceHistogram } from './charts/ratingDifferenceHistogram.js';
import { renderGenreAverageChart } from './charts/genreAvg.js';
import { renderGenreCountChart } from './charts/genreCount.js';
import { renderDecadeAverageChart } from './charts/decadeAvg.js';
import { renderDecadeCountChart } from './charts/decadeCount.js';
import { renderScatterRuntime } from './charts/runtimeScatter.js';
import { renderRuntimeCount } from './charts/runtimeCount.js';
import { renderDirectorRating } from './charts/directorRating.js';
import { renderDirectorCount } from './charts/directorCount.js';
import { renderPopularityScatter } from './charts/popularityScatter.js';
import { renderPopularityCount } from './charts/popularityCount.js';
import { renderRatingDistribution } from './charts/ratingDistribution.js';

// =========================
// Global state
// =========================
let parsedData = [];
let dataSource = localStorage.getItem("dataSource") || null;

// Elo persistent state
const eloRatings = new Map(JSON.parse(localStorage.getItem("eloRatings") || "[]"));
const eloWins    = new Map(JSON.parse(localStorage.getItem("eloWins") || "[]"));
const eloLosses  = new Map(JSON.parse(localStorage.getItem("eloLosses") || "[]"));
let   eloHistory = JSON.parse(localStorage.getItem("eloHistory") || "[]");
let   eloRecentPairs = JSON.parse(localStorage.getItem("eloRecentPairs") || "[]");
const RECENT_PAIR_WINDOW = 8;

function pairKey(a, b) { return [a, b].sort().join("|"); }
function recordRecentPair(a, b) {
  eloRecentPairs.push(pairKey(a, b));
  if (eloRecentPairs.length > 400) eloRecentPairs = eloRecentPairs.slice(-400);
}
function wasRecentlyPaired(a, b) {
  const pk = pairKey(a, b);
  const start = Math.max(0, eloRecentPairs.length - RECENT_PAIR_WINDOW);
  for (let i = eloRecentPairs.length - 1; i >= start; i--) {
    if (eloRecentPairs[i] === pk) return true;
  }
  return false;
}

let eloMoviePool = [];
let currentPair = [];

// Find Movie Rating (provisional) state
let findSession = null; // { title, year, key, elo, opponents: [keys], cursor, wins, losses, history: [] }
let findSearchTimer = null;
let findSearchResults = [];
let findSelected = null; // { title, year }

// =========================
// TMDb constants & helpers
// =========================
const TMDB_API_KEY = '59922b7b936e3dc2101dd523e49ffa70';
const TMDB_BASE_URL = 'https://api.themoviedb.org/3';
const TMDB_IMAGE_BASE = 'https://image.tmdb.org/t/p';
function tmdbImageUrl(path, size = 'w780') {
  if (!path) return '';
  return `${TMDB_IMAGE_BASE}/${size}${path}`;
}

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function normalizeTitle(s) {
  return (s || "")
    .toLowerCase()
    .replace(/[\u2019']/g, "")      // apostrophes
    .replace(/[^a-z0-9]+/g, " ")    // non-alnum -> space
    .replace(/\b(the|a|an)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function tmdbFindIdByTitleYear(title, year=null) {
  const q = encodeURIComponent(title);
  const withYear = `${TMDB_BASE_URL}/search/movie?api_key=${TMDB_API_KEY}&query=${q}${year?`&year=${year}`:""}&include_adult=false`;
  try {
    let r = await fetch(withYear); let j = await r.json();
    if (Array.isArray(j.results) && j.results.length) return j.results[0].id;
    const noYear = `${TMDB_BASE_URL}/search/movie?api_key=${TMDB_API_KEY}&query=${q}&include_adult=false`;
    r = await fetch(noYear); j = await r.json();
    return (Array.isArray(j.results) && j.results.length) ? j.results[0].id : null;
  } catch { return null; }
}

async function tmdbGetBackdrops(movieId) {
  // Prioritize textless (null language) & non-poster aspect ratios
  const trySets = ["null","null,en","en,null","en","en,xx,null"];
  for (const langs of trySets) {
    const url = `${TMDB_BASE_URL}/movie/${movieId}/images?api_key=${TMDB_API_KEY}&include_image_language=${langs}`;
    try {
      const res = await fetch(url);
      const json = await res.json();
      const arr = Array.isArray(json?.backdrops) ? json.backdrops : [];
      if (!arr.length) continue;
      const preferred = arr
        .filter(b => b?.file_path)
        .map(b => ({ path: b.file_path, lang: b.iso_639_1 ?? null, votes: b.vote_count||0, ar: b.aspect_ratio||0 }))
        .filter(b => !b.ar || b.ar >= 1.2) // avoid poster-ish ratios
        .sort((a,b) => ((a.lang===null)!==(b.lang===null)) ? ((a.lang===null)?-1:1) : (b.votes - a.votes));
      if (preferred.length) return shuffle(preferred).map(p => p.path);
    } catch {}
  }
  return [];
}

async function tmdbGetMovieDetails(movieId, language = "en-US") {
  const url = `${TMDB_BASE_URL}/movie/${movieId}?api_key=${TMDB_API_KEY}&language=${language}`;
  try { const res = await fetch(url); return await res.json(); } catch { return null; }
}

async function tmdbPickPopularMovieId() {
  const page = 1 + Math.floor(Math.random() * 5);
  const url = `${TMDB_BASE_URL}/movie/popular?api_key=${TMDB_API_KEY}&page=${page}`;
  try {
    const res = await fetch(url);
    const json = await res.json();
    const results = Array.isArray(json?.results) ? json.results : [];
    if (!results.length) return null;
    const pick = results[Math.floor(Math.random() * results.length)];
    return pick?.id ?? null;
  } catch { return null; }
}

async function tmdbSearchMovies(query) {
  if (!query || query.trim().length < 2) return [];
  const url = `${TMDB_BASE_URL}/search/movie?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(query)}&include_adult=false`;
  try {
    const res = await fetch(url);
    const json = await res.json();
    const items = Array.isArray(json?.results) ? json.results : [];
    return items.map(it => ({
      title: it.title || it.name || "",
      year: it.release_date ? parseInt(it.release_date.slice(0,4), 10) : null,
      tmdbId: it.id,
      popularity: it.popularity ?? 0
    })).filter(r => r.title).sort((a,b)=>b.popularity - a.popularity);
  } catch { return []; }
}

// =========================
// Elo helpers
// =========================
const BASE_K = 24;
function kFor(key) {
  const g = getGamesCount(key);
  if (g < 10) return 32;
  if (g > 50) return 16;
  return BASE_K;
}
function kBatchScale(totalBatchSize) {
  if (!totalBatchSize || totalBatchSize <= 1) return BASE_K;
  return Math.max(10, BASE_K / Math.sqrt(totalBatchSize - 1));
}

let quickBatch = [];
let quickSelectedKeys = new Set();

// DOM helpers
function $(id){ return document.getElementById(id); }
function toggle(id, on){ $(id)?.classList.toggle("hidden", !on); }

function eloKey(title, year) {
  const t = (title || "").trim();
  const y = parseInt(year, 10);
  return `${t}_${isNaN(y) ? "NA" : y}`;
}
function getGamesCount(key) {
  return (eloWins.get(key) || 0) + (eloLosses.get(key) || 0);
}
function getElo(key) {
  return eloRatings.get(key) ?? 1000;
}

function keyToMeta(key) {
  if (!keyToMeta._cache) {
    const m = new Map();
    parsedData.forEach(row => {
      const k = eloKey(row["Title"], row["Year"]);
      if (!m.has(k)) m.set(k, { title: (row["Title"] || "").trim(), year: row["Year"] ?? null });
    });
    keyToMeta._cache = m;
  }
  return keyToMeta._cache.get(key) || { title: key.split("_")[0] || "?", year: null };
}
function nameOf(key) {
  const m = keyToMeta(key);
  return m.year ? `${m.title} (${m.year})` : m.title;
}
function pct(x) { if (x == null || isNaN(x)) return ""; return (x * 100).toFixed(1) + "%"; }
function signed(n){ if (n == null || isNaN(n)) return ""; return n>0 ? `+${n}` : `${n}`; }

// CSV history download
function downloadEloHistoryCSV() {
  const rows = Array.isArray(eloHistory) ? eloHistory : [];
  if (rows.length === 0) { alert("No matches recorded yet."); return; }
  const header = [
    "timestamp","winner_key","winner","loser_key","loser",
    "p_winner","elo_winner_before","elo_loser_before","delta_winner","delta_loser","mode"
  ];
  const lines = [header.join(",")];

  for (const m of rows) {
    const line = [
      m.t ?? "",
      m.winner ?? "",
      nameOf(m.winner ?? ""),
      m.loser ?? "",
      nameOf(m.loser ?? ""),
      (m.pWinner != null ? m.pWinner.toFixed(6) : ""),
      m.eloWinner_before ?? "",
      m.eloLoser_before ?? "",
      m.deltaWinner ?? "",
      m.deltaLoser ?? "",
      m.mode ?? "regular"
    ].map(x => String(x).replaceAll('"','""'));
    lines.push(line.map(v => /[",\n]/.test(v) ? `"${v}"` : v).join(","));
  }

  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = "elo_match_log.csv";
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}

// Baseline helpers (rank deltas)
function getBaseline() {
  const stored = localStorage.getItem("eloBaseline");
  return stored ? new Map(JSON.parse(stored)) : null;
}
function setBaselineFromCurrentElo() {
  const rows = Array.from(eloRatings.entries()).sort((a, b) => b[1] - a[1]);
  const map = new Map();
  rows.forEach(([key], i) => map.set(key, i + 1));
  localStorage.setItem("eloBaseline", JSON.stringify([...map.entries()]));
  return map;
}
function ensureBaseline() {
  const base = getBaseline();
  const keys = new Set(Array.from(eloRatings.keys()));
  if (!base) return setBaselineFromCurrentElo();
  if (base.size !== keys.size) return setBaselineFromCurrentElo();
  for (const k of keys) if (!base.has(k)) return setBaselineFromCurrentElo();
  return base;
}

function hasEl(id) {
  return !!document.getElementById(id);
}
function renderIfExists(id, fn) {
  if (!hasEl(id)) return;
  try { fn(); } catch (e) { console.warn(`Skip chart ${id}:`, e); }
}


// =========================
// Init (DOMContentLoaded)
// =========================
document.addEventListener("DOMContentLoaded", () => {
  const input = $("csvUpload");
  const message = $("message");

  toggle("app-content", false);
  toggle("elo-live", false);
  toggle("elo-empty", false); // hide at boot; updateEloVisibility() will flip it correctly

// --- Soften Find hover to match Elo ---
const style = document.createElement("style");
style.textContent = `
  #find-left, #find-right {
    transition: background-color .15s ease, transform .15s ease, box-shadow .15s ease;
  }
  #find-left:hover, #find-right:hover {
    background-color: rgba(255,255,255,.08) !important;
    transform: none !important;
    box-shadow: none !important;
  }
`;
document.head.appendChild(style);

  // GUESS tab wiring (switch + controls)
  $("guess-start")?.addEventListener("click", () => {
    const source = $("guessSourceSwitch")?.checked ? "popular" : "elo";
    startGuessRound(source);
  });
  $("guess-submit")?.addEventListener("click", onSubmitGuess);
  $("guess-input")?.addEventListener("keydown", (e) => { if (e.key === "Enter") onSubmitGuess(); });
  $("guess-reveal")?.addEventListener("click", onRevealAnswer);
  $("guess-skip")?.addEventListener("click", onSkipRound);
  $("guess-tab")?.addEventListener("shown.bs.tab", () => {
    $("guess-feedback").textContent = "";
    $("guess-image-msg").textContent = "";
    const img = $("guess-image");
    if (img) { img.style.display = "none"; img.removeAttribute("src"); }
    guessGame = null;
  });
let guessSearchTimer = null;

$("guess-input")?.addEventListener("input", () => {
  clearTimeout(guessSearchTimer);
  const q = $("guess-input").value || "";
  if (q.trim().length < 2) { renderGuessResults([]); return; }
  guessSearchTimer = setTimeout(async () => {
    const results = await tmdbSearchMovies(q.trim());
    renderGuessResults(results);
  }, 250);
});

$("guess-input")?.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    // If the dropdown is shown, auto-pick the first suggestion
    const first = $("#guess-results button");
    if (first) { first.click(); e.preventDefault(); }
    onSubmitGuess();
  }
});

  // Load cached CSV (if any)
  const savedCSV = localStorage.getItem("csvData");
  if (savedCSV) {
    try {
      const data = JSON.parse(savedCSV);
      if (hasUsableMovieRows(data)) {
        parsedData = data;
        dataSource = localStorage.getItem("dataSource") || detectSource(Object.keys(parsedData[0] || {}));
        message.textContent = "";
        toggle("upload-block", false);
        toggle("app-content", true);
        toggle("elo-live", true);
        applyVisibilityBySource(dataSource);
        processParsedData(parsedData);
        updateEloVisibility();

      } else {
        toggle("upload-block", true); toggle("app-content", false); toggle("elo-live", false);
      }
    } catch {
      toggle("upload-block", true); toggle("app-content", false); toggle("elo-live", false);
    }
  } else {
    toggle("upload-block", true); toggle("app-content", false); toggle("elo-live", false);
  }

  // CSV Upload
  input?.addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (!file || !file.name.endsWith(".csv")) {
      message.textContent = "Please upload a valid CSV file.";
      return;
    }
    const reader = new FileReader();
    reader.onload = (event) => {
      const csvText = event.target.result;
      Papa.parse(csvText, {
        header: true,
        skipEmptyLines: true,
        complete: function (results) {
          const rows = results.data || [];
          const fields = results.meta?.fields || [];
          const source = detectSource(fields);
          dataSource = source;
          localStorage.setItem("dataSource", dataSource);
          const data = (source === "letterboxd") ? normalizeLetterboxd(rows) : rows;

          if (!hasUsableMovieRows(data)) {
            message.textContent = "No movie rows found in the CSV. Please export your ratings and try again.";
            toggle("app-content", false); toggle("upload-block", true); toggle("elo-live", false);
            return;
          }
          parsedData = data;
          localStorage.setItem("csvData", JSON.stringify(parsedData));
          message.textContent = "";
          toggle("upload-block", false); toggle("app-content", true); toggle("elo-live", true);
          applyVisibilityBySource(dataSource);
          processParsedData(parsedData);
          updateEloVisibility();
        }
      });
    };
    reader.readAsText(file);
  });

  // Elo mode switch (checkbox)
  $("eloModeSwitch")?.addEventListener("change", onEloModeChange);

  // FIND tab wiring
  $("find-start")?.addEventListener("click", () => {
    if (!findSelected) {
      const raw = ($("find-search")?.value || "").trim();
      const m = raw.match(/^(.*)\s+\((\d{4})\)$/);
      if (m) findSelected = { title: m[1].trim(), year: parseInt(m[2],10) };
    }
    if (!findSelected || !findSelected.title) {
      alert("Please search and select a movie first.");
      return;
    }
    if (eloRatings.size < 5) {
      alert("Play a few Elo matches first so I have opponents to compare against.");
      return;
    }
    startFindSession(findSelected.title, findSelected.year ?? null);
  });
  $("find-cancel")?.addEventListener("click", cancelFindSession);
  $("find-left")  ?.addEventListener("click", () => applyFindVote(true));
  $("find-right") ?.addEventListener("click", () => applyFindVote(false));
  $("find-save")  ?.addEventListener("click", saveFindSession);
  $("find-discard")?.addEventListener("click", cancelFindSession);
  $("find-tab")?.addEventListener("shown.bs.tab", () => {
    cancelFindSession();
    const input = $("find-search");
    const box = $("find-results");
    if (input) input.value = "";
    if (box) box.innerHTML = "";
    findSelected = null;
    findSearchResults = [];
  });

  // FIND search box
  const findSearch = $("find-search");
  findSearch?.addEventListener("input", () => {
    clearTimeout(findSearchTimer);
    const q = findSearch.value || "";
    findSelected = null;
    if (q.trim().length < 2) {
      renderFindResults([]);
      return;
    }
    findSearchTimer = setTimeout(async () => {
      const results = await tmdbSearchMovies(q.trim());
      findSearchResults = results;
      renderFindResults(results);
    }, 250);
  });
  findSearch?.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !findSelected && findSearchResults.length > 0) {
      const first = findSearchResults[0];
      findSelected = { title: first.title, year: first.year };
      findSearch.value = first.year ? `${first.title} (${first.year})` : first.title;
      renderFindResults([]);
    }
  });

  // Elo Stats tab: render on show
  $("elo-stats-tab")?.addEventListener("shown.bs.tab", () => {
    renderEloStats();
  });

  // History CSV download
  $("download-elo-history")?.addEventListener("click", downloadEloHistoryCSV);

  // guess stats
  renderGuessStats();
});

// =========================
// Processing + Rendering
// =========================
function haveDataLoaded() {
  return Array.isArray(parsedData) && parsedData.length > 0;
}

function updateEloVisibility() {
  const okPool = haveDataLoaded() && eloMoviePool.length >= 2;
  toggle("elo-live", okPool);

  const alertEl = $("elo-empty");
  if (alertEl) {
    alertEl.textContent = okPool
      ? ""
      : (haveDataLoaded()
          ? "Need at least 2 rated movies to play Elo (make sure your CSV has Your Rating)."
          : "Load data first (upload your IMDb or Letterboxd CSV in the Dashboard tab).");
  }
}


function processParsedData(data) {
  parsedData = data.filter(row => row["Title"] && (row["Title Type"] || "").trim() === "Movie");

// Rating distribution (always)
renderIfExists("chart-rating-distribution", () =>
  renderRatingDistribution(parsedData, dataSource)
);

// Charts (only if visible AND the element exists)
if (!$("section-year")?.classList.contains("hidden")) {
  renderIfExists("chart-year-count", () => renderAveragePerYear(parsedData));
}
if (!$("section-vs-imdb")?.classList.contains("hidden")) {
  renderIfExists("chart-scatter", () => renderScatterRatings(parsedData));
  renderIfExists("chart-rating-diff-hist", () => renderRatingDifferenceHistogram(parsedData));
}
if (!$("section-genres")?.classList.contains("hidden")) {
  renderIfExists("chart-genre-avg", () => renderGenreAverageChart(parsedData));
  renderIfExists("chart-genre-count", () => renderGenreCountChart(parsedData));
}
if (!$("section-decade")?.classList.contains("hidden")) {
  renderIfExists("chart-decade-avg", () => renderDecadeAverageChart(parsedData));
  renderIfExists("chart-decade-count", () => renderDecadeCountChart(parsedData));
}
if (!$("section-runtime")?.classList.contains("hidden")) {
  renderIfExists("chart-runtime-rating", () => renderScatterRuntime(parsedData));
  renderIfExists("chart-runtime-count", () => renderRuntimeCount(parsedData));
}
if (!$("section-directors")?.classList.contains("hidden")) {
  renderIfExists("chart-directors-rating", () => renderDirectorRating(parsedData));
  renderIfExists("chart-directors-count",  () => renderDirectorCount(parsedData));
}
if (!$("section-popularity")?.classList.contains("hidden")) {
  renderIfExists("chart-popularity-rating", () => renderPopularityScatter(parsedData));
  renderIfExists("chart-popularity-count",  () => renderPopularityCount(parsedData));
}


  // Elo seeding
  eloMoviePool = parsedData.filter(row =>
    row["Title"] &&
    row["Your Rating"] != null &&
    !isNaN(parseFloat(row["Your Rating"]))
  );
  eloMoviePool.forEach(movie => {
    const key = eloKey(movie["Title"], movie["Year"]);
    const rating = parseFloat(movie["Your Rating"]); // 0–10 scale
    if (!eloRatings.has(key) && !isNaN(rating)) {
      const seededElo = Math.round(1000 + ((rating - 5) * 50)); // 0→750, 10→1250
      eloRatings.set(key, seededElo);
    }
  });

  localStorage.setItem("eloRatings", JSON.stringify([...eloRatings.entries()]));
  ensureBaseline();

  // First render
  renderEloInterface();
  renderEloTable();
  makeTableSortable();

  // Prep Elo Stats now
  renderEloStats();
    // ... existing code (renderEloStats etc.)
  updateEloVisibility();

}

// Data presence rule
function hasUsableMovieRows(data) {
  if (!Array.isArray(data) || data.length === 0) return false;
  return data.some(row => row["Title"] && ((row["Title Type"] || "").trim() === "Movie"));
}

// Detect + normalize Letterboxd
function detectSource(fields) {
  const set = new Set((fields || []).map(f => (f || "").trim()));
  const imdb = set.has("Const") && set.has("Your Rating") && set.has("Title") && set.has("Title Type");
  const lb   = set.has("Date") && set.has("Name") && set.has("Year") && set.has("Letterboxd URI");
  if (imdb) return "imdb";
  if (lb)   return "letterboxd";
  if (set.has("Name") || set.has("Letterboxd URI")) return "letterboxd";
  return "imdb";
}
function normalizeLetterboxd(rows) {
  return rows.map(r => {
    const starsRaw = (r["Rating"] ?? "").toString().trim();
    const your = starsRaw ? parseFloat(starsRaw) * 2 : null; // internal 0–10
    const yearNum = r["Year"] ? parseInt(r["Year"], 10) : null;
    return {
      "Title": (r["Name"] || "").trim(),
      "Year": isNaN(yearNum) ? null : yearNum,
      "URL": r["Letterboxd URI"] || null,
      "Title Type": "Movie",
      "Your Rating": (your != null && !isNaN(your)) ? your : null,
      "IMDb Rating": null,
      "Runtime (mins)": "",
      "Genres": "",
      "Num Votes": "0",
      "Release Date": "",
      "Directors": ""
    };
  });
}

// Visibility (Letterboxd hides poster sections)
function applyVisibilityBySource(source) {
  const isLB = source === "letterboxd";
  toggle("section-distribution", true);
  toggle("section-year", true);
  toggle("section-decade", true);

  toggle("section-vs-imdb", !isLB);
  toggle("section-genres", !isLB);
  toggle("section-runtime", !isLB);
  toggle("section-directors", !isLB);
  toggle("section-popularity", !isLB);

  toggle("section-posters", !isLB);
  toggle("posters-oldnew", !isLB);
  toggle("posters-overunder", !isLB);
  toggle("posters-length", !isLB);
  toggle("posters-popularity", !isLB);

  if (!isLB) renderAllPosterSections(parsedData);
}

// =========================
// Poster rendering (TMDb)
// =========================
async function fetchPoster(title, year) {
  const withYear = `${TMDB_BASE_URL}/search/movie?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(title)}${year ? `&year=${year}` : ""}`;
  const noYear   = `${TMDB_BASE_URL}/search/movie?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(title)}`;
  try {
    let res = await fetch(withYear);
    let json = await res.json();
    if (!json?.results?.length) {
      res = await fetch(noYear);
      json = await res.json();
    }
    return json.results?.[0]?.poster_path || null;
  } catch { return null; }
}

async function renderPosters(movies, targetId) {
  const container = $(targetId);
  if (!container) return;
  container.innerHTML = "";
  for (const movie of movies) {
    const title = movie["Title"];
    const year = movie["Year"];
    const linkUrl = movie["URL"] || "#";
    const posterPath = await fetchPoster(title, year);
    const wrapper = document.createElement("div");
    wrapper.className = "poster-wrapper text-center";
    if (posterPath) {
      const link = document.createElement("a");
      link.href = linkUrl; link.target = "_blank"; link.rel = "noopener";
      const img = document.createElement("img");
      img.src = tmdbImageUrl(posterPath, 'w342');
      img.referrerPolicy = 'no-referrer';
      img.decoding = 'async';
      img.loading = 'lazy';
      img.alt = title; img.title = `${title} (${year ?? "n.d."})`;
      img.style.height = "220px"; img.style.objectFit = "cover";
      img.style.width = "auto"; img.style.maxWidth = "100%"; img.style.borderRadius = "8px";
      link.appendChild(img); wrapper.appendChild(link);
    } else {
      const fallback = document.createElement("p");
      fallback.textContent = `No poster found for ${title}`;
      wrapper.appendChild(fallback);
    }
    container.appendChild(wrapper);
  }
}

function renderAllPosterSections(data) {
  const valid = data.filter(row => row["Title"] && !isNaN(parseFloat(row["Your Rating"])));
  const sortByYear = (dir = 1) =>
    [...valid].filter(r => !isNaN(parseInt(r["Year"])))
      .sort((a, b) => dir * (parseInt(a["Year"]) - parseInt(b["Year"])));
  const sortByVotes = (dir = 1) =>
    [...valid].filter(r => !isNaN(parseInt(String(r["Num Votes"]).replace(/,/g, ''))))
      .sort((a, b) => dir * (parseInt(String(a["Num Votes"]).replace(/,/g, '')) - parseInt(String(b["Num Votes"]).replace(/,/g, ''))));
  const sortByRuntime = (dir = 1) =>
    [...valid].filter(r => !isNaN(parseInt(r["Runtime (mins)"])))
      .sort((a, b) => dir * (parseInt(a["Runtime (mins)"]) - parseInt(b["Runtime (mins)"])));
  const overrated = valid
    .filter(r => r["IMDb Rating"] != null && parseFloat(r["Your Rating"]) > parseFloat(r["IMDb Rating"]))
    .sort((a, b) =>
      (parseFloat(b["Your Rating"]) - parseFloat(b["IMDb Rating"])) -
      (parseFloat(a["Your Rating"]) - parseFloat(a["IMDb Rating"]))
    ).slice(0, 3);
  const underrated = valid
    .filter(r => r["IMDb Rating"] != null && parseFloat(r["Your Rating"]) < parseFloat(r["IMDb Rating"]))
    .sort((a, b) =>
      (parseFloat(a["Your Rating"]) - parseFloat(a["IMDb Rating"])) -
      (parseFloat(b["Your Rating"]) - parseFloat(b["IMDb Rating"]))
    ).slice(0, 3);

  if (!$("section-posters")?.classList.contains("hidden")) {
    renderPosters(sortByYear(+1).slice(0, 3), "poster-oldest");
    renderPosters(sortByYear(-1).slice(0, 3), "poster-newest");
    renderPosters(underrated, "poster-underrated");
    renderPosters(overrated, "poster-overrated");
    renderPosters(sortByRuntime(+1).slice(0, 3), "poster-shortest");
    renderPosters(sortByRuntime(-1).slice(0, 3), "poster-longest");
    renderPosters(sortByVotes(+1).slice(0, 3), "poster-least-popular");
    renderPosters(sortByVotes(-1).slice(0, 3), "poster-most-popular");
  }
}

// =========================
/* Elo core (calc + pairing) */
// =========================
function calculateElo(winnerKey, loserKey, mode = "regular", kOverride = null) {
  const ratingA = eloRatings.get(winnerKey);
  const ratingB = eloRatings.get(loserKey);
  if (typeof ratingA !== "number" || typeof ratingB !== "number") return;

  const expectedA = 1 / (1 + Math.pow(10, (ratingB - ratingA) / 400));
  const expectedB = 1 - expectedA;

  const KA = kOverride ?? kFor(winnerKey);
  const KB = kOverride ?? kFor(loserKey);

  const newRatingA = ratingA + KA * (1 - expectedA);
  const newRatingB = ratingB + KB * (0 - expectedB);

  const finalA = Math.round(newRatingA);
  const finalB = Math.round(newRatingB);

  eloRatings.set(winnerKey, finalA);
  eloRatings.set(loserKey,  finalB);

  eloWins.set(winnerKey, (eloWins.get(winnerKey) || 0) + 1);
  eloLosses.set(loserKey,  (eloLosses.get(loserKey)  || 0) + 1);

  recordRecentPair(winnerKey, loserKey);
  eloHistory.push({
    t: new Date().toISOString(),
    winner: winnerKey,
    loser:  loserKey,
    eloWinner_before: ratingA,
    eloLoser_before:  ratingB,
    deltaWinner: finalA - ratingA,
    deltaLoser:  finalB - ratingB,
    pWinner: expectedA,
    mode
  });
}
function persistElo() {
  localStorage.setItem("eloRatings", JSON.stringify([...eloRatings.entries()]));
  localStorage.setItem("eloWins", JSON.stringify([...eloWins.entries()]));
  localStorage.setItem("eloLosses", JSON.stringify([...eloLosses.entries()]));
  localStorage.setItem("eloHistory", JSON.stringify(eloHistory));
  localStorage.setItem("eloRecentPairs", JSON.stringify(eloRecentPairs));
}

function computeBiggestUpsets(limit = 10) {
  if (!Array.isArray(eloHistory) || eloHistory.length === 0) return [];
  return eloHistory
    .filter(m => typeof m.pWinner === "number")
    .sort((a,b) => a.pWinner - b.pWinner)
    .slice(0, limit)
    .map(m => ({
      winner: nameOf(m.winner),
      loser:  nameOf(m.loser),
      pwin:   m.pWinner,
      dElo:   m.deltaWinner ?? null,
      date:   m.t?.slice(0,10) || ""
    }));
}
function computeBiggestGains(limit = 10) {
  if (!Array.isArray(eloHistory) || eloHistory.length === 0) return [];
  return [...eloHistory]
    .filter(m => typeof m.deltaWinner === "number")
    .sort((a,b) => (b.deltaWinner) - (a.deltaWinner))
    .slice(0, limit)
    .map(m => ({
      movie:  nameOf(m.winner),
      opp:    nameOf(m.loser),
      delta:  m.deltaWinner,
      pwin:   m.pWinner,
      date:   m.t?.slice(0,10) || ""
    }));
}
function computeBiggestLosses(limit = 10) {
  if (!Array.isArray(eloHistory) || eloHistory.length === 0) return [];
  return [...eloHistory]
    .filter(m => typeof m.deltaLoser === "number")
    .sort((a,b) => (a.deltaLoser) - (b.deltaLoser))
    .slice(0, limit)
    .map(m => ({
      movie:  nameOf(m.loser),
      opp:    nameOf(m.winner),
      delta:  m.deltaLoser,
      pwin:   1 - (m.pWinner ?? 0),
      date:   m.t?.slice(0,10) || ""
    }));
}
function computeStreaks() {
  const byKey = new Map();
  const chron = [...(eloHistory||[])];
  chron.sort((a,b) => (a.t||"") < (b.t||"") ? -1 : 1);
  function touch(k) {
    if (!byKey.has(k)) byKey.set(k, { curWin:0, curLoss:0, bestWin:0, bestLoss:0 });
    return byKey.get(k);
  }
  for (const m of chron) {
    const w = touch(m.winner);
    const l = touch(m.loser);
    w.curWin += 1; if (w.curWin > w.bestWin) w.bestWin = w.curWin; w.curLoss = 0;
    l.curLoss += 1; if (l.curLoss > l.bestLoss) l.bestLoss = l.curLoss; l.curWin = 0;
  }
  const wins = [], losses = [];
  for (const [k, s] of byKey.entries()) {
    if (s.bestWin > 1) wins.push({ movie:nameOf(k), streak:s.bestWin });
    if (s.bestLoss > 1) losses.push({ movie:nameOf(k), streak:s.bestLoss });
  }
  wins.sort((a,b) => b.streak - a.streak);
  losses.sort((a,b) => b.streak - a.streak);
  return { winTop: wins.slice(0, 10), lossTop: losses.slice(0, 10) };
}
function computeMostImproved(lastNGames = 50, limit = 10) {
  if (!Array.isArray(eloHistory) || eloHistory.length === 0) return [];
  const perKey = new Map(); // key -> { deltas: number[] }
  for (let i = eloHistory.length - 1; i >= 0; i--) {
    const m = eloHistory[i];
    if (!perKey.has(m.winner)) perKey.set(m.winner, { deltas: [] });
    if (!perKey.has(m.loser))  perKey.set(m.loser,  { deltas: [] });
    perKey.get(m.winner).deltas.push(m.deltaWinner || 0);
    perKey.get(m.loser).deltas.push(m.deltaLoser || 0);
  }
  const rows = [];
  for (const [k, obj] of perKey.entries()) {
    const arr = obj.deltas.slice(0, lastNGames);
    if (arr.length === 0) continue;
    const sum = arr.reduce((a,b)=>a+b,0);
    rows.push({ movie: nameOf(k), delta: sum, count: arr.length });
  }
  rows.sort((a,b) => b.delta - a.delta);
  return rows.slice(0, limit);
}
function renderTableRows(tbody, rows, colSpec) {
  const el = document.querySelector(tbody);
  if (!el) return;
  el.innerHTML = rows.map(r => {
    const tds = colSpec.map(c => `<td>${c(r)}</td>`).join("");
    return `<tr>${tds}</tr>`;
  }).join("");
}
function renderEloStats() {
  const hasHistory = Array.isArray(eloHistory) && eloHistory.length > 0;
  toggle("elo-stats-empty", !hasHistory);
  toggle("elo-stats-live",  hasHistory);
  if (!hasHistory) return;

  const upsets = computeBiggestUpsets(10);
  renderTableRows("#tbl-upsets tbody", upsets, [
    r => r.winner, r => r.loser, r => pct(r.pwin), r => signed(r.dElo ?? 0), r => r.date
  ]);
  const gains = computeBiggestGains(10);
  renderTableRows("#tbl-gains tbody", gains, [
    r => r.movie, r => r.opp, r => signed(r.delta), r => pct(r.pwin), r => r.date
  ]);
  const losses = computeBiggestLosses(10);
  renderTableRows("#tbl-losses tbody", losses, [
    r => r.movie, r => r.opp, r => signed(r.delta), r => pct(r.pwin), r => r.date
  ]);

  const { winTop, lossTop } = computeStreaks();
  renderTableRows("#tbl-streaks-win tbody", winTop, [ r => r.movie, r => r.streak ]);
  renderTableRows("#tbl-streaks-loss tbody", lossTop, [ r => r.movie, r => r.streak ]);

  const improved = computeMostImproved(50, 10);
  renderTableRows("#tbl-improved tbody", improved, [ r => r.movie, r => signed(r.delta), r => r.count ]);

  const recent = [...eloHistory].slice(-25).reverse().map(m => ({
    date: m.t?.replace("T"," ").slice(0,16) || "",
    winner: nameOf(m.winner),
    loser:  nameOf(m.loser),
    pwin:   m.pWinner,
    dW:     m.deltaWinner,
    dL:     m.deltaLoser,
    mode:   m.mode || "regular"
  }));
  renderTableRows("#tbl-recent tbody", recent, [
    r => r.date, r => r.winner, r => r.loser, r => pct(r.pwin), r => signed(r.dW), r => signed(r.dL), r => r.mode
  ]);
}

// =========================
// Smart pairing
// =========================
function weightedPick(candidates, excludeKeys = new Set()) {
  const items = candidates.filter(row => !excludeKeys.has(eloKey(row["Title"], row["Year"])));
  if (items.length === 0) return null;
  const weights = items.map(row => {
    const key = eloKey(row["Title"], row["Year"]);
    const w = 1 / (1 + getGamesCount(key));
    return Math.max(w, 0.001);
  });
  const sum = weights.reduce((a, b) => a + b, 0);
  let r = Math.random() * sum;
  for (let i = 0; i < items.length; i++) {
    r -= weights[i];
    if (r <= 0) return items[i];
  }
  return items[items.length - 1];
}
function pickSmartPair() {
  if (eloMoviePool.length < 2) return null;
  const first = weightedPick(eloMoviePool);
  if (!first) return null;
  const firstKey = eloKey(first["Title"], first["Year"]);
  const firstElo = getElo(firstKey);

  const sampleCount = Math.min(24, eloMoviePool.length - 1);
  const exclude = new Set([firstKey]);
  const sample = [];
  let guard = 0;
  while (sample.length < sampleCount && guard++ < 200) {
    const pick = weightedPick(eloMoviePool, exclude);
    if (!pick) break;
    const k = eloKey(pick["Title"], pick["Year"]);
    if (!exclude.has(k)) {
      if (!wasRecentlyPaired(firstKey, k)) sample.push(pick);
      exclude.add(k);
    }
  }
  const pool = sample.length ? sample : eloMoviePool.filter(r => eloKey(r["Title"], r["Year"]) !== firstKey);
  let best = null, bestDiff = Infinity;
  for (const cand of pool) {
    const diff = Math.abs(getElo(eloKey(cand["Title"], cand["Year"])) - firstElo);
    if (diff < bestDiff) { best = cand; bestDiff = diff; }
  }
  return best ? [first, best] : null;
}

// =========================
// Regular mode UI
// =========================
function renderEloMatch() {
  if (!Array.isArray(eloMoviePool) || eloMoviePool.length < 2) return;
  const pair = pickSmartPair();
  if (!pair) return;
  currentPair = pair;
  const [left, right] = currentPair;
  renderEloMovie("elo-left", left);
  renderEloMovie("elo-right", right);
}
async function setButtonPoster(btnId, title, year) {
  const btn = $(btnId);
  if (!btn) return;
  btn.innerHTML = "";
  btn.style.padding = "0";
  btn.style.border = "none";

  const img = document.createElement("img");
  img.alt = title; img.title = year ? `${title} (${year})` : title;
  img.style.width = "100%"; img.style.maxWidth = "200px"; img.style.height = "auto";
  img.style.objectFit = "cover"; img.style.borderRadius = "6px"; img.style.margin = "0.5rem";

  const posterPath = await fetchPoster(title, year);
  if (posterPath) {
    img.src = tmdbImageUrl(posterPath, "w342");
    img.referrerPolicy = "no-referrer";
    img.decoding = "async";
    img.loading = "lazy";
  }

  const text = document.createElement("div");
  text.textContent = year ? `${title} (${year})` : title;
  text.style.fontWeight = "bold";
  text.style.textAlign = "center";
  text.style.color = "#fff";
  text.style.marginBottom = "1rem";

  btn.appendChild(img);
  btn.appendChild(text);
}

async function renderEloMovie(targetId, movie) {
  const btn = $(targetId);
  if (!btn || !movie) return;
  const title = movie["Title"];
  const year  = movie["Year"];
  const posterPath = await fetchPoster(title, year);

  btn.innerHTML = "";
  btn.style.padding = "0";
  btn.style.border = "none";

  const img = document.createElement("img");
  img.alt = title; img.title = `${title} (${year ?? "n.d."})`;
  img.style.width = "100%"; img.style.maxWidth = "200px"; img.style.height = "auto";
  img.style.objectFit = "cover"; img.style.borderRadius = "6px"; img.style.margin = "0.5rem";
  if (posterPath) {
    img.src = tmdbImageUrl(posterPath, 'w342');
    img.referrerPolicy = 'no-referrer';
    img.decoding = 'async';
    img.loading = 'lazy';
  }

  const text = document.createElement("div");
  text.textContent = title;
  text.style.fontWeight = "bold";
  text.style.textAlign = "center";
  text.style.color = "#fff";
  text.style.marginBottom = "1rem";

  btn.appendChild(img);
  btn.appendChild(text);
}

// =========================
// Quick mode UI
// =========================
async function dealQuickBatch(size = 14) {
  const hint = $("quick-hint");
  quickSelectedKeys.clear();
  quickBatch = [];

  const poolSize = eloMoviePool.length;
  if (poolSize < 3) {
    $("quick-grid").innerHTML = `<div class="muted">Need at least 3 movies to use Quick rating.</div>`;
    hint.textContent = "";
    return;
  }

  const used = new Set();
  while (quickBatch.length < Math.min(size, poolSize)) {
    const pick = weightedPick(eloMoviePool, used);
    if (!pick) break;
    quickBatch.push(pick);
    used.add(eloKey(pick["Title"], pick["Year"]));
  }

  const grid = $("quick-grid");
  grid.innerHTML = "";
  for (const row of quickBatch) {
    const key = eloKey(row["Title"], row["Year"]);
    const title = row["Title"];
    const year  = row["Year"];
    const card = document.createElement("div");
    card.className = "quick-card";
    card.dataset.key = key;

    fetchPoster(title, year).then(path => {
      const img = document.createElement("img");
      if (path) {
        img.src = tmdbImageUrl(path, 'w342');
        img.referrerPolicy = 'no-referrer';
        img.decoding = 'async';
        img.loading = 'lazy';
      } else {
        img.style.background = "rgba(255,255,255,0.08)";
        img.style.height="220px";
      }
      card.insertBefore(img, card.firstChild);
    });

    const label = document.createElement("div");
    label.className = "quick-title";
    label.textContent = year ? `${title} (${year})` : title;

    card.appendChild(label);
    card.addEventListener("click", () => {
      const selected = card.classList.toggle("selected");
      if (selected) quickSelectedKeys.add(key);
      else quickSelectedKeys.delete(key);
      updateQuickHint();
    });

    grid.appendChild(card);
  }

  updateQuickHint();
}
function updateQuickHint() {
  const hint = $("quick-hint");
  const winners = quickSelectedKeys.size;
  const losers  = Math.max(quickBatch.length - winners, 0);
  if (winners === 0) {
    hint.textContent = "Select one or more winners to apply pairwise wins against the rest of this batch.";
  } else {
    hint.textContent = `Selected ${winners} winner${winners>1?'s':''} vs ${losers} other${losers!==1?'s':''}.`;
  }
}
function submitQuickPicks() {
  if (!quickBatch || quickBatch.length < 2) return;
  const winners = quickBatch.filter(r => quickSelectedKeys.has(eloKey(r["Title"], r["Year"])));
  const losers  = quickBatch.filter(r => !quickSelectedKeys.has(eloKey(r["Title"], r["Year"])));
  if (winners.length === 0) return;

  const total = winners.length + losers.length;
  const kScaled = kBatchScale(total);
  for (const w of winners) {
    const wk = eloKey(w["Title"], w["Year"]);
    for (const l of losers) {
      const lk = eloKey(l["Title"], l["Year"]);
      if (wk === lk) continue;
      const kw = kFor(wk);
      const kl = kFor(lk);
      const kPair = Math.max(10, Math.round(((kw + kl) / 2) * (kScaled / BASE_K)));
      calculateElo(wk, lk, "quick", kPair);
    }
  }

  persistElo();
  renderEloTable();
  dealQuickBatch();
}

// =========================
// Elo table + sorting
// =========================
let currentSortKey = "elo";
let currentSortOrder = "desc";

function renderEloTable(sortKey = currentSortKey, sortOrder = currentSortOrder) {
  currentSortKey = sortKey;
  currentSortOrder = sortOrder;

  const tableBody = document.querySelector("#elo-table tbody");
  if (!tableBody) return;
  tableBody.innerHTML = "";

  const metaByKey = new Map();
  parsedData.forEach(row => {
    const key = eloKey(row["Title"], row["Year"]);
    const y = parseInt(row["Year"], 10);
    if (!metaByKey.has(key)) {
      metaByKey.set(key, { title: (row["Title"] || "").trim(), year: isNaN(y) ? null : y });
    }
  });

  const baseRows = Array.from(eloRatings.entries()).map(([key, elo]) => {
    const meta = metaByKey.get(key) || { title: key.split("_")[0] || "?", year: null };
    return {
      key,
      rawTitle: meta.title,
      title: meta.year ? `${meta.title} (${meta.year})` : meta.title,
      year: meta.year,
      elo,
      wins: eloWins.get(key) || 0,
      losses: eloLosses.get(key) || 0
    };
  });

  const eloOrder = [...baseRows].sort((a, b) => b.elo - a.elo);
  const eloRankMap = new Map();
  eloOrder.forEach((r, i) => eloRankMap.set(r.key, i + 1));

  const baseline = ensureBaseline();
  let rows = baseRows.map(r => {
    const eloRank = eloRankMap.get(r.key);
    const baseRank = baseline.get(r.key);
    const delta = (typeof baseRank === "number") ? (baseRank - eloRank) : 0;
    return { ...r, eloRank, delta };
  });

  rows.sort((a, b) => {
    let cmp = 0;
    switch (sortKey) {
      case "rank":
      case "eloRank": cmp = a.eloRank - b.eloRank; break;
      case "title":   cmp = a.rawTitle.localeCompare(b.rawTitle); break;
      case "wins":    cmp = a.wins - b.wins; break;
      case "losses":  cmp = a.losses - b.losses; break;
      case "delta":   cmp = a.delta - b.delta; break;
      case "elo":
      default:        cmp = a.elo - b.elo; break;
    }
    return sortOrder === "asc" ? cmp : -cmp;
  });

  rows.forEach(movie => {
    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${movie.eloRank}</td>
      <td>${movie.title}</td>
      <td>${movie.elo}</td>
      <td>${movie.delta > 0 ? "+" + movie.delta : movie.delta}</td>
      <td>${movie.wins}</td>
      <td>${movie.losses}</td>
    `;
    tableBody.appendChild(row);
  });
}
function makeTableSortable() {
  const headers = document.querySelectorAll("#elo-table th[data-sort]");
  headers.forEach(header => {
    header.style.cursor = "pointer";
    header.addEventListener("click", () => {
      const sortKey = header.dataset.sort;
      if (sortKey === currentSortKey) {
        currentSortOrder = currentSortOrder === "asc" ? "desc" : "asc";
      } else {
        currentSortKey = sortKey;
        currentSortOrder = "asc";
      }
      renderEloTable(currentSortKey, currentSortOrder);
    });
  });
}

// =========================
// Mode switch & controls
// =========================
function onEloModeChange() {
  const checked = $("eloModeSwitch")?.checked; // true => quick, false => regular
  if (checked) {
    toggle("elo-regular", false);
    toggle("elo-quick", true);
    dealQuickBatch();
  } else {
    toggle("elo-regular", true);
    toggle("elo-quick", false);
    renderEloMatch();
  }
}
function renderEloInterface() {
  onEloModeChange();

  $("elo-left")?.addEventListener("click", () => {
    if (currentPair.length < 2) return;
    const leftKey  = eloKey(currentPair[0]["Title"], currentPair[0]["Year"]);
    const rightKey = eloKey(currentPair[1]["Title"], currentPair[1]["Year"]);
    calculateElo(leftKey, rightKey, "regular");
    persistElo();
    renderEloMatch();
    renderEloTable();
  });

  $("elo-right")?.addEventListener("click", () => {
    if (currentPair.length < 2) return;
    const leftKey  = eloKey(currentPair[0]["Title"], currentPair[0]["Year"]);
    const rightKey = eloKey(currentPair[1]["Title"], currentPair[1]["Year"]);
    calculateElo(rightKey, leftKey, "regular");
    persistElo();
    renderEloMatch();
    renderEloTable();
  });

  $("quick-deal")?.addEventListener("click", () => dealQuickBatch());
  $("quick-submit")?.addEventListener("click", () => submitQuickPicks());

  $("reset-elo-only")?.addEventListener("click", () => {
    if (!confirm("Reset Elo ratings, wins/losses, history and recent-pair memory? Your CSV stays loaded.")) return;

    eloRatings.clear();
    eloWins.clear();
    eloLosses.clear();
    eloHistory = [];
    eloRecentPairs = [];
    localStorage.removeItem("eloBaseline");

    eloMoviePool.forEach(movie => {
      const key = eloKey(movie["Title"], movie["Year"]);
      const rating = parseFloat(movie["Your Rating"]);
      if (!isNaN(rating)) {
        const seededElo = Math.round(1000 + ((rating - 5) * 50));
        eloRatings.set(key, seededElo);
      }
    });

    persistElo();
    ensureBaseline();
    renderEloMatch();
    renderEloTable();
    updateEloVisibility();

  });
}

// =========================
// Find Movie Rating (20 matches)
// =========================
function renderGuessResults(results) {
  const box = $("guess-results");
  if (!box) return;
  if (!results || results.length === 0) { box.innerHTML = ""; return; }

  box.innerHTML = results.slice(0, 12).map(r => `
    <button type="button"
      class="list-group-item list-group-item-action bg-dark text-white d-flex justify-content-between align-items-center"
      data-title="${r.title.replaceAll('"','&quot;')}" data-year="${r.year ?? ''}">
      <span>${r.title}${r.year ? ` (${r.year})` : ""}</span>
      <span class="badge bg-secondary">Pop ${Math.round(r.popularity)}</span>
    </button>
  `).join("");

  Array.from(box.querySelectorAll("button")).forEach(btn => {
    btn.addEventListener("click", () => {
      const title = btn.getAttribute("data-title") || "";
      const yearRaw = btn.getAttribute("data-year") || "";
      const year = yearRaw ? parseInt(yearRaw, 10) : null;
      const input = $("guess-input");
      if (input) input.value = year ? `${title} (${year})` : title;
      box.innerHTML = "";
      input?.focus();
    });
  });
}

function renderFindResults(results) {
  const box = $("find-results");
  if (!box) return;
  if (!results || results.length === 0) {
    box.innerHTML = "";
    return;
  }
  box.innerHTML = results.slice(0, 12).map(r => `
    <button type="button" class="list-group-item list-group-item-action bg-dark text-white d-flex justify-content-between align-items-center" data-title="${r.title.replaceAll('"','&quot;')}" data-year="${r.year ?? ''}">
      <span>${r.title}${r.year ? ` (${r.year})` : ""}</span>
      <span class="badge bg-secondary">Pop ${Math.round(r.popularity)}</span>
    </button>
  `).join("");

  Array.from(box.querySelectorAll("button")).forEach(btn => {
    btn.addEventListener("click", () => {
      const title = btn.getAttribute("data-title") || "";
      const yearRaw = btn.getAttribute("data-year") || "";
      const year = yearRaw ? parseInt(yearRaw, 10) : null;
      findSelected = { title, year };
      const input = $("find-search");
      if (input) input.value = year ? `${title} (${year})` : title;
      box.innerHTML = "";
    });
  });
}

function meanEloOrSeed() {
  const vals = Array.from(eloRatings.values());
  if (vals.length) return Math.round(vals.reduce((a,b)=>a+b,0) / vals.length);
  const rated = parsedData.filter(r => !isNaN(parseFloat(r["Your Rating"])));
  if (rated.length) {
    const avg = rated.reduce((a,r)=>a+parseFloat(r["Your Rating"]),0)/rated.length;
    return Math.round(1000 + 50*(avg - 5));
  }
  return 1000;
}
function pickFindOpponents(n = 10) {
  const rows = [...eloRatings.entries()]
    .map(([k,v]) => ({k:v, key:k}))
    .sort((a,b)=>b.k - a.k);
  if (rows.length === 0) return [];
  const take = Math.min(n, rows.length);
  const thirds = Math.max(1, Math.floor(take/3));
  const top = rows.slice(0, Math.max(1, Math.floor(rows.length*0.2)));
  const mid = rows.slice(Math.floor(rows.length*0.4), Math.floor(rows.length*0.6));
  const bot = rows.slice(Math.max(0, Math.floor(rows.length*0.8)));
  function sample(arr, m) {
    const out = []; const used = new Set();
    while (out.length < Math.min(m, arr.length)) {
      const idx = Math.floor(Math.random()*arr.length);
      if (used.has(idx)) continue;
      used.add(idx);
      out.push(arr[idx].key);
    }
    return out;
  }
  const pick = [...sample(top, thirds), ...sample(mid, thirds), ...sample(bot, take - 2*thirds)];
  return Array.from(new Set(pick)).slice(0, take);
}
function pickRandomOpponents(excludeKeys, n = 10) {
  const all = Array.from(eloRatings.keys()).filter(k => !excludeKeys.has(k));
  shuffle(all);
  return all.slice(0, Math.min(n, all.length));
}

async function renderFindButtons(leftTitle, rightKey) {
  await setButtonPoster("find-left", leftTitle, findSession?.year ?? null);
  const meta = keyToMeta(rightKey);
  await setButtonPoster("find-right", meta.title, meta.year ?? null);
}


// Elo → projected stars (½ to 5★; 1000 → 2.5★, 200 Elo ≈ 1★)
function eloToStars(elo) {
  const stars = 2.5 + (elo - 1000) / 200;
  return Math.max(0.5, Math.min(5, Math.round(stars * 2) / 2));
}

function startFindSession(title, year) {
  const key = eloKey(title, year);
  const mu = meanEloOrSeed();

  // 10 balanced + 10 random (not overlapping)
  const balanced = pickFindOpponents(10);
  const exclude = new Set(balanced.concat([key]));
  const randoms  = pickRandomOpponents(exclude, 10);

  const opponents = shuffle(balanced.concat(randoms));

  findSession = {
    title, year, key,
    elo: mu,
    opponents,
    cursor: 0, wins: 0, losses: 0,
    history: [] // {oppKey, oppElo, winnerKey, pWin, dTemp}
  };
  toggle("find-form", false);
  toggle("find-summary", false);
  toggle("find-live", true);
  $("find-results").innerHTML = "";   // 👈 add
  renderFindMatch();
}

async function renderFindMatch() {
  const fs = findSession; if (!fs) return;
  const i = fs.cursor;
  $("find-progress").textContent = `Match ${i+1} / 20`;
  await renderFindButtons(fs.title, fs.opponents[i]);
}


function applyFindVote(winnerIsLeft) {
  const fs = findSession;
  if (!fs) return;
  const oppKey = fs.opponents[fs.cursor];
  const oppElo = eloRatings.get(oppKey) ?? meanEloOrSeed();

  const EA = 1 / (1 + Math.pow(10, (oppElo - fs.elo)/400));
  const SA = winnerIsLeft ? 1 : 0;
  const Ktemp = 40;
  const before = fs.elo;
  fs.elo = Math.round(fs.elo + Ktemp*(SA - EA));

  fs.history.push({
    oppKey, oppElo,
    winnerKey: winnerIsLeft ? fs.key : oppKey,
    pWin: EA,
    dTemp: fs.elo - before
  });
  if (winnerIsLeft) fs.wins++; else fs.losses++;

  fs.cursor++;
  if (fs.cursor >= fs.opponents.length) finishFindSession();
  else renderFindMatch();
}

// === Percentile -> z-score (normal inverse CDF) ===
// Acklam’s approximation (good enough for UI work)
function ndtri(p) {
  if (p <= 0) return -Infinity;
  if (p >= 1) return Infinity;
  const a = [-3.969683028665376e+01,  2.209460984245205e+02,
             -2.759285104469687e+02,  1.383577518672690e+02,
             -3.066479806614716e+01,  2.506628277459239e+00];
  const b = [-5.447609879822406e+01,  1.615858368580409e+02,
             -1.556989798598866e+02,  6.680131188771972e+01,
             -1.328068155288572e+01];
  const c = [-7.784894002430293e-03, -3.223964580411365e-01,
             -2.400758277161838e+00, -2.549732539343734e+00,
              4.374664141464968e+00,  2.938163982698783e+00];
  const d = [ 7.784695709041462e-03,  3.224671290700398e-01,
              2.445134137142996e+00,  3.754408661907416e+00];

  let q, r;
  if (p < 0.02425) {
    q = Math.sqrt(-2 * Math.log(p));
    return (((((c[0]*q + c[1])*q + c[2])*q + c[3])*q + c[4])*q + c[5]) /
           ((((d[0]*q + d[1])*q + d[2])*q + d[3])*q + 1);
  } else if (p > 1 - 0.02425) {
    q = Math.sqrt(-2 * Math.log(1 - p));
    return -(((((c[0]*q + c[1])*q + c[2])*q + c[3])*q + c[4])*q + c[5]) /
             ((((d[0]*q + d[1])*q + d[2])*q + d[3])*q + 1);
  } else {
    q = p - 0.5;
    r = q * q;
    return (((((a[0]*r + a[1])*r + a[2])*r + a[3])*r + a[4])*r + a[5]) * q /
           (((((b[0]*r + b[1])*r + b[2])*r + b[3])*r + b[4])*r + 1);
  }
}

// Elo → percentile (relative to current pool, higher Elo → higher percentile)
function eloPercentile(eloValue) {
  const values = Array.from(eloRatings.values());
  if (values.length === 0) return 0.5;
  let belowOrEqual = 0;
  for (const v of values) if (v <= eloValue) belowOrEqual++;
  // bottom ≈ 0, top ≈ 1
  return Math.min(1, Math.max(0, belowOrEqual / values.length));
}

// Percentile -> stars via normal model centered at 2.5★
// μ = 2.5, choose σ to control spread. σ≈0.8 works well (2σ ~ [0.9, 4.1]).
function starsFromPercentile(p, mu = 2.5, sigma = 0.8) {
  const z = ndtri(p);
  const s = mu + sigma * z;
  return Math.max(0.5, Math.min(5, Math.round(s * 2) / 2)); // clamp & half-stars
}


function finishFindSession() {
  const fs = findSession;
  if (!fs) return;
  toggle("find-live", false);
  toggle("find-summary", true);
  const ladder = Array.from(eloRatings.values()).sort((a,b)=>b-a);
  let rank = (ladder.findIndex(v => fs.elo > v) + 1);
  if (rank <= 0) rank = ladder.length + 1;
  const p = eloPercentile(fs.elo);
  const stars = starsFromPercentile(p); // normal-model star estimate
  $("find-result").textContent =
    `Provisional Elo: ${fs.elo} — projected rank #${rank} (W-L ${fs.wins}-${fs.losses}) — projected rating: ${stars}★`;
}
function cancelFindSession() {
  findSession = null;
  toggle("find-live", false);
  toggle("find-summary", false);
  toggle("find-form", true);
}
function saveFindSession() {
  const fs = findSession;
  if (!fs) return;
  if (!eloRatings.has(fs.key)) {
    eloRatings.set(fs.key, fs.elo);
    eloWins.set(fs.key, fs.wins);
    eloLosses.set(fs.key, fs.losses);
  } else {
    eloRatings.set(fs.key, fs.elo);
  }
  if (typeof eloHistory !== "undefined") {
    fs.history.forEach(h => {
      const winner = h.winnerKey;
      const loser  = (winner === fs.key) ? h.oppKey : fs.key;
      eloHistory.push({
        t: new Date().toISOString(),
        winner, loser,
        eloWinner_before: null,
        eloLoser_before: null,
        deltaWinner: (winner === fs.key) ? h.dTemp : 0,
        deltaLoser:  (winner === fs.key) ? 0 : h.dTemp,
        pWinner: (winner === fs.key) ? h.pWin : (1 - h.pWin),
        mode: "provisional"
      });
    });
  }
  persistElo();
  ensureBaseline();
  renderEloTable();
  renderEloStats?.();
  cancelFindSession();
}

// =========================
// Guess the Movie (no emojis)
// =========================
let guessGame = null; 

// Guess-the-Movie stats (persisted)
let guessStats = (() => {
  try { return JSON.parse(localStorage.getItem("guessStats")) || {}; } catch { return {}; }
})();
guessStats = {
  wins:   Number.isFinite(guessStats.wins) ? guessStats.wins : 0,
  losses: Number.isFinite(guessStats.losses) ? guessStats.losses : 0,
  streak: Number.isFinite(guessStats.streak) ? guessStats.streak : 0,   // current streak (wins)
  best:   Number.isFinite(guessStats.best) ? guessStats.best : 0        // best win streak
};

function saveGuessStats() {
  localStorage.setItem("guessStats", JSON.stringify(guessStats));
}

function renderGuessStats() {
  const el = document.getElementById("guess-stats");
  if (!el) return; // silently skip if you didn't add a stats element
  el.textContent = `Wins: ${guessStats.wins} • Losses: ${guessStats.losses} • Streak: ${guessStats.streak} (best: ${guessStats.best})`;
}

function recordGuessWin() {
  guessStats.wins += 1;
  guessStats.streak += 1;
  if (guessStats.streak > guessStats.best) guessStats.best = guessStats.streak;
  saveGuessStats();
  renderGuessStats();
}

function recordGuessLoss() {
  guessStats.losses += 1;
  guessStats.streak = 0;
  saveGuessStats();
  renderGuessStats();
}

// { mode:'elo'|'popular', movieId, title, year, images:[file_path...], idx:0, attempts:0, normAnswer }

async function guessPickFromElo() {
  const keys = Array.from(eloRatings.keys());
  if (!keys.length) return null;
  keys.sort((a,b) => (eloRatings.get(b) - eloRatings.get(a)));
  const top = keys.slice(0, Math.max(10, Math.floor(keys.length * 0.5)));
  const pickKey = top[Math.floor(Math.random() * top.length)];
  const meta = keyToMeta(pickKey);
  const id = await tmdbFindIdByTitleYear(meta.title, meta.year ?? null);
  if (!id) return null;
  return { id, title: meta.title, year: meta.year ?? null };
}

async function startGuessRound(mode = "elo") {
  let chosen = null;
  if (mode === "elo") {
    if (eloRatings.size === 0) {
      alert("Your Elo list is empty. Play some matches or switch to Popular.");
      return;
    }
    chosen = await guessPickFromElo();
    if (!chosen) {
      const pid = await tmdbPickPopularMovieId();
      if (!pid) { alert("Could not find a movie to start."); return; }
      const det = await tmdbGetMovieDetails(pid, "en-US");
      chosen = { id: pid, title: det?.title || "", year: det?.release_date?.slice(0,4) || null };
    }
  } else {
    const pid = await tmdbPickPopularMovieId();
    if (!pid) { alert("Could not fetch popular movies."); return; }
    const det = await tmdbGetMovieDetails(pid, "en-US");
    chosen = { id: pid, title: det?.title || "", year: det?.release_date?.slice(0,4) || null };
  }

  const backdrops = await tmdbGetBackdrops(chosen.id);
  if (!backdrops.length) {
    if (mode === "elo") return startGuessRound("popular");
    return startGuessRound(mode);
  }

  guessGame = {
    mode,
    movieId: chosen.id,
    title: chosen.title,
    year: chosen.year,
    images: backdrops,
    idx: 0,
    attempts: 0,
    normAnswer: normalizeTitle(chosen.title),
    resolved: false     // ⬅️ add this
  };

  $("guess-feedback").textContent = "";
  $("guess-input").value = "";
  $("guess-image-msg").textContent = "";
  renderGuessScene();

  
}

function renderGuessScene() {
  const img = $("guess-image");
  const msg = $("guess-image-msg");
  if (!guessGame || !img) return;

  const path = guessGame.images[guessGame.idx];
  if (!path) {
    img.style.display = "none";
    msg.textContent = "No more images for this title.";
    return;
  }
  img.src = tmdbImageUrl(path, 'w780');
  img.referrerPolicy = 'no-referrer';
  img.decoding = 'async';
  img.loading = 'lazy';
  img.style.display = "inline-block";
  msg.textContent = `Hint ${guessGame.idx + 1} of ${guessGame.images.length}`;
}

async function onSubmitGuess() {
  if (!guessGame) return;
  const raw = $("guess-input").value || "";
  let guessNorm = normalizeTitle(raw);
  if (!guessNorm) return;

  // Assist spelling: look up TMDb and use the top result’s title for comparison
  const search = await tmdbSearchMovies(raw.trim());
  if (search.length > 0) guessNorm = normalizeTitle(search[0].title);

  guessGame.attempts += 1;
  const ans = guessGame.normAnswer;
  const ok = (guessNorm === ans) || guessNorm.includes(ans) || ans.includes(guessNorm);

  if (ok) {
  if (!guessGame.resolved) {
    guessGame.resolved = true;
    recordGuessWin();
  }
  $("guess-feedback").textContent = `✅ Well done! It was “${guessGame.title}${guessGame.year ? ` (${guessGame.year})` : ""}”. You got it in ${guessGame.attempts} guess${guessGame.attempts > 1 ? "es" : ""}.`;
} else {
  $("guess-feedback").textContent = `❌ Not it — try another guess.`;
  advanceGuessImage();
}

}
function advanceGuessImage() {
  if (!guessGame) return;
  if (guessGame.idx < guessGame.images.length - 1) {
    guessGame.idx += 1;
    renderGuessScene();
  } else {
    $("guess-image-msg").textContent = "No more images — you can reveal or try another guess.";
    // Optionally mark an unresolved round as a loss now:
    // if (!guessGame.resolved) { guessGame.resolved = true; recordGuessLoss(); }
  }
}


function onRevealAnswer() {
  if (!guessGame) return;

  // Treat a reveal as a loss if the round wasn't already won/lost
  if (!guessGame.resolved) {
    guessGame.resolved = true;
    recordGuessLoss();          // updates totals, streak, localStorage, UI
  }

  $("guess-feedback").textContent =
    `ℹ️ It was “${guessGame.title}${guessGame.year ? ` (${guessGame.year})` : ""}”.`;
}

// Replace your existing onSkipRound with this
function onSkipRound() {
  const mode = $("guessSourceSwitch")?.checked ? "popular" : "elo";

  // Treat a skip as a loss if the round wasn't already resolved
  if (guessGame && !guessGame.resolved) {
    guessGame.resolved = true;
    recordGuessLoss();          // updates totals, streak, localStorage, UI
  }

  startGuessRound(mode);        // new round, same source mode
}

// =========================
// Keyboard shortcuts
// =========================
// =========================
// Keyboard shortcuts
// =========================
document.addEventListener("keydown", (e) => {
  // --- Elo Game (regular mode only) ---
  const eloTabActive   = $("elo")?.classList.contains("active");
  const eloLiveVisible = !$("elo-live")?.classList.contains("hidden");
  const quick          = $("eloModeSwitch")?.checked === true;

  if (eloTabActive && eloLiveVisible && !quick) {
    if (e.key === "ArrowLeft")  { e.preventDefault(); $("elo-left") ?.click(); return; }
    if (e.key === "ArrowRight") { e.preventDefault(); $("elo-right")?.click(); return; }
  }

  // --- Find Movie Rating (when live) ---
  const findTabActive  = $("find-tab")?.classList.contains("active");
  const findLiveShown  = !$("find-live")?.classList.contains("hidden");
  if (findTabActive && findLiveShown) {
    if (e.key === "ArrowLeft")  { e.preventDefault(); $("find-left") ?.click(); return; }
    if (e.key === "ArrowRight") { e.preventDefault(); $("find-right")?.click(); return; }
  }
});


