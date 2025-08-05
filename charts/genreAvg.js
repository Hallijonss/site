import { defaultLayout, defaultHover, defaultMarker } from './chartStyle.js';

export function renderGenreAverageChart(data) {
  const genreCount = {};
  const genreRatings = {};

  for (const row of data) {
    const firstGenre = row["Genres"]?.split(",")[0]?.trim().replace(/^"|"$/g, '');
    const rating = parseFloat(row["Your Rating"]);
    if (!firstGenre || isNaN(rating)) continue;

    genreCount[firstGenre] = (genreCount[firstGenre] || 0) + 1;

    if (!genreRatings[firstGenre]) {
      genreRatings[firstGenre] = { total: 0, count: 0 };
    }

    genreRatings[firstGenre].total += rating;
    genreRatings[firstGenre].count += 1;
  }

  const topGenres = Object.entries(genreCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([genre]) => genre);

  const genreAvgArray = topGenres.map(genre => {
    const avg = genreRatings[genre].total / genreRatings[genre].count;
    return { genre, avg };
  }).sort((a, b) => b.avg - a.avg).reverse();  // top genre on top

  const y = genreAvgArray.map(g => g.genre);
  const x = genreAvgArray.map(g => g.avg);

  const trace = {
    x,
    y,
    type: 'bar',
    orientation: 'h',
    marker: defaultMarker,
    hovertext: y.map((genre, i) => `Genre: ${genre}<br>Avg Rating: ${x[i].toFixed(2)}`),
    hoverinfo: 'text',
    ...defaultHover,
    name: ''
  };

  const layout = {
    ...defaultLayout,
    xaxis: {
      ...defaultLayout.xaxis,
      range: [0, 10]
    },
    yaxis: {
      ...defaultLayout.yaxis,
      automargin: true
    }
  };

  Plotly.newPlot('chart-genre-avg', [trace], layout, { displayModeBar: false });
}
