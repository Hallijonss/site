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







document.addEventListener("DOMContentLoaded", () => {
  const input = document.getElementById("csvUpload");
  const message = document.getElementById("message");

  input.addEventListener("change", (e) => {
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
      let parsedData = results.data;
      message.textContent = "";

          // ✅ Filter: Only include rows where Title Type is "Movie"
     parsedData = parsedData.filter(row => row["Title Type"]?.trim() === "Movie");


        // render Charts
      renderAveragePerYear(parsedData);
      renderScatterRatings(parsedData);
      renderRatingDifferenceHistogram(parsedData);
      renderGenreAverageChart(parsedData);
      renderGenreCountChart(parsedData);
      renderDecadeAverageChart(parsedData);
      renderDecadeCountChart(parsedData);
      renderScatterRuntime(parsedData);
      renderRuntimeCount(parsedData);
      renderDirectorRating(parsedData);
      renderDirectorCount(parsedData);
      renderPopularityScatter(parsedData); 
      renderPopularityCount(parsedData);
      // POsters
      renderAllPosterSections(parsedData);
    }
  });
};

    reader.readAsText(file);
  });
});

function parseCSV(text) {
  const [headerLine, ...lines] = text.trim().split("\n");
  const headers = headerLine.split(",");

  return lines.map(line => {
    const values = line.split(",");
    const obj = {};
    headers.forEach((h, i) => obj[h.trim()] = values[i]?.trim());
    return obj;
  });
}

const TMDB_API_KEY = '59922b7b936e3dc2101dd523e49ffa70';
const TMDB_BASE_URL = 'https://api.themoviedb.org/3';
const TMDB_IMAGE_URL = 'https://image.tmdb.org/t/p/w342';

async function fetchPoster(title, year) {
  const searchUrl = `${TMDB_BASE_URL}/search/movie?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(title)}&year=${year}`;
  try {
    const res = await fetch(searchUrl);
    const json = await res.json();
    return json.results?.[0]?.poster_path || null;
  } catch (err) {
    console.error(`Error fetching poster for ${title}`, err);
    return null;
  }
}

async function renderPosters(movies, targetId) {
  const container = document.getElementById(targetId);
  container.innerHTML = "";

  for (const movie of movies) {
    const title = movie["Title"];
    const year = movie["Year"];
    const imdbUrl = movie["URL"];

    const posterPath = await fetchPoster(title, year);

    const wrapper = document.createElement("div");
    wrapper.className = "poster-wrapper text-center";

    if (posterPath) {
      const link = document.createElement("a");
      link.href = imdbUrl;
      link.target = "_blank";
      link.rel = "noopener";

      const img = document.createElement("img");
      img.src = `${TMDB_IMAGE_URL}${posterPath}`;
      img.alt = title;
      img.title = `${title} (${year})`;
      img.style.height = "220px";
      img.style.objectFit = "cover"; // ensures proper crop/scaling
      img.style.width = "auto";      // maintain aspect ratio
      img.style.maxWidth = "100%";   // prevent overflow
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

  const sortBy = (field, dir = 1) =>
    [...valid].sort((a, b) => dir * (parseFloat(a[field]) - parseFloat(b[field])));

  const sortByYear = (dir = 1) =>
    [...valid].filter(row => !isNaN(parseInt(row["Year"])))
              .sort((a, b) => dir * (parseInt(a["Year"]) - parseInt(b["Year"])));

  const sortByVotes = (dir = 1) =>
    [...valid].filter(row => !isNaN(parseInt(row["Num Votes"].replace(/,/g, ''))))
              .sort((a, b) => dir * (parseInt(a["Num Votes"].replace(/,/g, '')) - parseInt(b["Num Votes"].replace(/,/g, ''))));

  const sortByRuntime = (dir = 1) =>
    [...valid].filter(row => !isNaN(parseInt(row["Runtime (mins)"])))
              .sort((a, b) => dir * (parseInt(a["Runtime (mins)"]) - parseInt(b["Runtime (mins)"])));

  const overrated = valid
    .filter(row => parseFloat(row["Your Rating"]) > parseFloat(row["IMDb Rating"]))
    .sort((a, b) =>
      (parseFloat(b["Your Rating"]) - parseFloat(b["IMDb Rating"])) -
      (parseFloat(a["Your Rating"]) - parseFloat(a["IMDb Rating"]))
    ).slice(0, 3);

  const underrated = valid
    .filter(row => parseFloat(row["Your Rating"]) < parseFloat(row["IMDb Rating"]))
    .sort((a, b) =>
      (parseFloat(a["Your Rating"]) - parseFloat(a["IMDb Rating"])) -
      (parseFloat(b["Your Rating"]) - parseFloat(b["IMDb Rating"]))
    ).slice(0, 3);

  renderPosters(sortByYear(+1).slice(0, 3), "poster-oldest");
  renderPosters(sortByYear(-1).slice(0, 3), "poster-newest");
  renderPosters(underrated, "poster-underrated");
  renderPosters(overrated, "poster-overrated");
  renderPosters(sortByRuntime(+1).slice(0, 3), "poster-shortest");
  renderPosters(sortByRuntime(-1).slice(0, 3), "poster-longest");
  renderPosters(sortByVotes(+1).slice(0, 3), "poster-least-popular");
  renderPosters(sortByVotes(-1).slice(0, 3), "poster-most-popular");
}

