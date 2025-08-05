import { defaultLayout, defaultHover, defaultMarker } from './chartStyle.js';

export function renderGenreCountChart(data) {
  const genreCount = {};

  for (const row of data) {
    const firstGenre = row["Genres"]?.split(",")[0]?.trim().replace(/^"|"$/g, '');
    if (!firstGenre) continue;
    genreCount[firstGenre] = (genreCount[firstGenre] || 0) + 1;
  }

  const topGenres = Object.entries(genreCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([genre, count]) => ({ genre, count }))
    .reverse(); // top genre on top

  const y = topGenres.map(g => g.genre);
  const x = topGenres.map(g => g.count);

  const trace = {
    x,
    y,
    type: 'bar',
    orientation: 'h',
    marker: defaultMarker,
    hovertext: y.map((genre, i) => `Genre: ${genre}<br>Movies: ${x[i]}`),
    hoverinfo: 'text',
    ...defaultHover,
    name: ''
  };

  const layout = {
    ...defaultLayout,
    yaxis: {
      ...defaultLayout.yaxis,
      automargin: true
    },
    xaxis: {
      ...defaultLayout.xaxis
    }
  };

  Plotly.newPlot('chart-genre-count', [trace], layout, { displayModeBar: false });
}
