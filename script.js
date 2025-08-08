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

let parsedData = [];
let dataSource = localStorage.getItem("dataSource") || null;

const eloRatings = new Map(JSON.parse(localStorage.getItem("eloRatings") || "[]"));
const eloWins = new Map(JSON.parse(localStorage.getItem("eloWins") || "[]"));
const eloLosses = new Map(JSON.parse(localStorage.getItem("eloLosses") || "[]"));
let eloMoviePool = [];
let currentPair = [];
const K = 32;

/* ---------- Helpers ---------- */
function $(id){ return document.getElementById(id); }
function toggle(id, on){ $(id)?.classList.toggle("hidden", !on); }

function eloKey(title, year) {
  const t = (title || "").trim();
  const y = parseInt(year, 10);
  return `${t}_${isNaN(y) ? "NA" : y}`;
}

function hasUsableMovieRows(data) {
  if (!Array.isArray(data) || data.length === 0) return false;
  return data.some(row => (row["Title Type"] || "").trim() === "Movie");
}

/* ---------- Source detect + normalize ---------- */
function detectSource(fields) {
  const set = new Set((fields || []).map(f => (f || "").trim()));
  const imdb = set.has("Const") && set.has("Your Rating") && set.has("Title") && set.has("Title Type");
  const lb = set.has("Date") && set.has("Name") && set.has("Year") && set.has("Letterboxd URI");
  if (imdb) return "imdb";
  if (lb) return "letterboxd";
  if (set.has("Name") || set.has("Letterboxd URI")) return "letterboxd";
  return "imdb";
}

function normalizeLetterboxd(rows) {
  return rows.map(r => {
    const starsRaw = (r["Rating"] ?? "").toString().trim();   // "" | "3" | "2.5"
    const your = starsRaw ? parseFloat(starsRaw) * 2 : null;   // 1–5★ → 2–10 (internal 0–10)
    const yearNum = r["Year"] ? parseInt(r["Year"], 10) : null;
    return {
      "Title": (r["Name"] || "").trim(),
      "Year": isNaN(yearNum) ? null : yearNum,
      "URL": r["Letterboxd URI"] || null,
      "Title Type": "Movie",
      "Your Rating": (your != null && !isNaN(your)) ? your : null,
      // safe defaults
      "IMDb Rating": null,
      "Runtime (mins)": "",
      "Genres": "",
      "Num Votes": "0",
      "Release Date": "",
      "Directors": ""
    };
  });
}

/* ---------- UI toggles ---------- */
function showDashboard(show) {
  toggle("app-content", show);
}
function showUploadBlock(show) {
  toggle("upload-block", show);
}
function setEloLive(show) {
  toggle("elo-live", show);
  toggle("elo-empty", !show);
}

/* LB-only visibility rules (kept) */
function applyVisibilityBySource(source) {
  const isLB = source === "letterboxd";

  toggle("section-distribution", true);     // always show (scales by source)
  toggle("section-year", true);
  toggle("section-decade", true);

  toggle("section-vs-imdb", !isLB);
  toggle("section-genres", !isLB);
  toggle("section-runtime", !isLB);
  toggle("section-directors", !isLB);
  toggle("section-popularity", !isLB);

  toggle("section-posters", true);
  toggle("posters-oldnew", true);
  toggle("posters-overunder", !isLB);
  toggle("posters-length", !isLB);
  toggle("posters-popularity", !isLB);
}

/* ---------- Init ---------- */
document.addEventListener("DOMContentLoaded", () => {
  const input = $("csvUpload");
  const message = $("message");

  showDashboard(false);
  setEloLive(false);

  const savedCSV = localStorage.getItem("csvData");
  if (savedCSV) {
    try {
      const data = JSON.parse(savedCSV);
      if (hasUsableMovieRows(data)) {
        parsedData = data;
        message.textContent = "";
        showUploadBlock(false);
        showDashboard(true);
        setEloLive(true);
        applyVisibilityBySource(dataSource);
        processParsedData(parsedData);
      } else {
        showUploadBlock(true);
        showDashboard(false);
        setEloLive(false);
      }
    } catch {
      showUploadBlock(true);
      showDashboard(false);
      setEloLive(false);
    }
  } else {
    showUploadBlock(true);
    showDashboard(false);
    setEloLive(false);
  }

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
            showDashboard(false);
            showUploadBlock(true);
            setEloLive(false);
            return;
          }

          parsedData = data;
          localStorage.setItem("csvData", JSON.stringify(parsedData));
          message.textContent = "";

          showUploadBlock(false);
          showDashboard(true);
          setEloLive(true);
          applyVisibilityBySource(dataSource);

          processParsedData(parsedData);
        }
      });
    };
    reader.readAsText(file);
  });
});

/* ---------- Process & Render ---------- */
function processParsedData(data) {
  parsedData = data.filter(row => row["Title"] && (row["Title Type"] || "").trim() === "Movie");

  // Rating distribution (new): adapts to source scale
  renderRatingDistribution(parsedData, dataSource);

  // Charts (only if visible)
  if (!$("section-year")?.classList.contains("hidden")) {
    renderAveragePerYear(parsedData);
  }
  if (!$("section-vs-imdb")?.classList.contains("hidden")) {
    renderScatterRatings(parsedData);
    renderRatingDifferenceHistogram(parsedData);
  }
  if (!$("section-genres")?.classList.contains("hidden")) {
    renderGenreAverageChart(parsedData);
    renderGenreCountChart(parsedData);
  }
  if (!$("section-decade")?.classList.contains("hidden")) {
    renderDecadeAverageChart(parsedData);
    renderDecadeCountChart(parsedData);
  }
  if (!$("section-runtime")?.classList.contains("hidden")) {
    renderScatterRuntime(parsedData);
    renderRuntimeCount(parsedData);
  }
  if (!$("section-directors")?.classList.contains("hidden")) {
    renderDirectorRating(parsedData);
    renderDirectorCount(parsedData);
  }
  if (!$("section-popularity")?.classList.contains("hidden")) {
    renderPopularityScatter(parsedData);
    renderPopularityCount(parsedData);
  }

  // Elo seeding — now centered 1000 with ~±250 range
  eloMoviePool = parsedData.filter(row =>
    row["Title"] &&
    row["Your Rating"] != null &&
    !isNaN(parseFloat(row["Your Rating"]))
  );

  eloMoviePool.forEach(movie => {
    const key = eloKey(movie["Title"], movie["Year"]);
    const rating = parseFloat(movie["Your Rating"]); // 0–10 for both sources (LB normalized earlier)
    if (!eloRatings.has(key) && !isNaN(rating)) {
      const seededElo = Math.round(1000 + ((rating - 5) * 50)); // 0→750, 10→1250
      eloRatings.set(key, seededElo);
    }
  });

  localStorage.setItem("eloRatings", JSON.stringify([...eloRatings.entries()]));
  ensureBaseline();

  renderEloMatch();
  renderEloTable();
  makeTableSortable();
}

/* ---------- Posters (TMDb) ---------- */
const TMDB_API_KEY = '59922b7b936e3dc2101dd523e49ffa70';
const TMDB_BASE_URL = 'https://api.themoviedb.org/3';
const TMDB_IMAGE_URL = 'https://image.tmdb.org/t/p/w342';

async function fetchPoster(title, year) {
  const withYear = `${TMDB_BASE_URL}/search/movie?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(title)}${year ? `&year=${year}` : ""}`;
  const noYear = `${TMDB_BASE_URL}/search/movie?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(title)}`;
  try {
    let res = await fetch(withYear);
    let json = await res.json();
    if (!json?.results?.length) {
      res = await fetch(noYear);
      json = await res.json();
    }
    return json.results?.[0]?.poster_path || null;
  } catch (err) {
    console.error(`Error fetching poster for ${title}`, err);
    return null;
  }
}

async function renderPosters(movies, targetId) {
  const container = $(targetId);
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
      link.href = linkUrl;
      link.target = "_blank";
      link.rel = "noopener";

      const img = document.createElement("img");
      img.src = `${TMDB_IMAGE_URL}${posterPath}`;
      img.alt = title;
      img.title = `${title} (${year ?? "n.d."})`;
      img.style.height = "220px";
      img.style.objectFit = "cover";
      img.style.width = "auto";
      img.style.maxWidth = "100%";
      img.style.borderRadius = "8px";

      link.appendChild(img);
      wrapper.appendChild(link);
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

  // Oldest/Newest always when posters section visible
  if (!$("section-posters")?.classList.contains("hidden")) {
    renderPosters(sortByYear(+1).slice(0, 3), "poster-oldest");
    renderPosters(sortByYear(-1).slice(0, 3), "poster-newest");
  }

  if (!$("posters-overunder")?.classList.contains("hidden")) {
    renderPosters(underrated, "poster-underrated");
    renderPosters(overrated, "poster-overrated");
  }
  if (!$("posters-length")?.classList.contains("hidden")) {
    renderPosters(sortByRuntime(+1).slice(0, 3), "poster-shortest");
    renderPosters(sortByRuntime(-1).slice(0, 3), "poster-longest");
  }
  if (!$("posters-popularity")?.classList.contains("hidden")) {
    renderPosters(sortByVotes(+1).slice(0, 3), "poster-least-popular");
    renderPosters(sortByVotes(-1).slice(0, 3), "poster-most-popular");
  }
}

/* ---------- Elo core ---------- */
function calculateElo(winnerKey, loserKey) {
  const ratingA = eloRatings.get(winnerKey);
  const ratingB = eloRatings.get(loserKey);
  if (typeof ratingA !== "number" || typeof ratingB !== "number") return;

  const expectedA = 1 / (1 + Math.pow(10, (ratingB - ratingA) / 400));
  const newRatingA = ratingA + K * (1 - expectedA);
  const newRatingB = ratingB + K * (0 - (1 - expectedA));

  eloRatings.set(winnerKey, Math.round(newRatingA));
  eloRatings.set(loserKey, Math.round(newRatingB));

  eloWins.set(winnerKey, (eloWins.get(winnerKey) || 0) + 1);
  eloLosses.set(loserKey, (eloLosses.get(loserKey) || 0) + 1);

  localStorage.setItem("eloRatings", JSON.stringify([...eloRatings.entries()]));
  localStorage.setItem("eloWins", JSON.stringify([...eloWins.entries()]));
  localStorage.setItem("eloLosses", JSON.stringify([...eloLosses.entries()]));
}

function renderEloMatch() {
  if (!Array.isArray(eloMoviePool) || eloMoviePool.length < 2) return;

  const shuffled = [...eloMoviePool].sort(() => 0.5 - Math.random());
  currentPair = [shuffled[0], shuffled[1]];

  const [left, right] = currentPair;
  renderEloMovie("elo-left", left);
  renderEloMovie("elo-right", right);
}

async function renderEloMovie(targetId, movie) {
  const btn = $(targetId);
  if (!btn || !movie) return;

  const title = movie["Title"];
  const year = movie["Year"];

  const posterPath = await fetchPoster(title, year);

  btn.innerHTML = "";
  btn.style.padding = "0";
  btn.style.border = "none";

  const img = document.createElement("img");
  img.alt = title;
  img.title = `${title} (${year ?? "n.d."})`;
  img.style.width = "100%";
  img.style.maxWidth = "200px";
  img.style.height = "auto";
  img.style.objectFit = "cover";
  img.style.borderRadius = "6px";
  img.style.margin = "0.5rem";

  if (posterPath) {
    img.src = `${TMDB_IMAGE_URL}${posterPath}`;
  } else {
    img.alt = "No poster found";
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
      metaByKey.set(key, {
        title: (row["Title"] || "").trim(),
        year: isNaN(y) ? null : y
      });
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

/* ---------- Elo voting handlers + keyboard ---------- */
const leftBtn = $("elo-left");
const rightBtn = $("elo-right");

if (leftBtn && rightBtn) {
  leftBtn.addEventListener("click", () => {
    if (currentPair.length < 2) return;
    const leftKey = eloKey(currentPair[0]["Title"], currentPair[0]["Year"]);
    const rightKey = eloKey(currentPair[1]["Title"], currentPair[1]["Year"]);
    calculateElo(leftKey, rightKey);
    renderEloMatch();
    renderEloTable();
  });

  rightBtn.addEventListener("click", () => {
    if (currentPair.length < 2) return;
    const leftKey = eloKey(currentPair[0]["Title"], currentPair[0]["Year"]);
    const rightKey = eloKey(currentPair[1]["Title"], currentPair[1]["Year"]);
    calculateElo(rightKey, leftKey);
    renderEloMatch();
    renderEloTable();
  });
}

// Keyboard pick support on Elo tab (Left/Right arrows)
document.addEventListener("keydown", (e) => {
  const eloTabActive = $("elo")?.classList.contains("active");
  const eloLiveVisible = !$("elo-live")?.classList.contains("hidden");
  if (!eloTabActive || !eloLiveVisible) return;

  if (e.key === "ArrowLeft") {
    e.preventDefault();
    $("elo-left")?.click();
  } else if (e.key === "ArrowRight") {
    e.preventDefault();
    $("elo-right")?.click();
  }
});
