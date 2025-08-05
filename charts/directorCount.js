import { defaultLayout, defaultHover, defaultMarker } from './chartStyle.js';

export function renderDirectorCount(data) {
  const counts = {};

  for (const row of data) {
    let director = row["Directors"];
    if (director) {
      director = director.trim().replace(/^"+|"+$/g, '').replace(/^'+|'+$/g, '');
      counts[director] = (counts[director] || 0) + 1;
    }
  }

  const topDirectors = Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([name, count]) => ({ director: name, count }))
    .reverse(); // top at top

  const y = topDirectors.map(d => d.director);
  const x = topDirectors.map(d => d.count);

  const trace = {
    x,
    y,
    type: 'bar',
    orientation: 'h',
    marker: defaultMarker,
    hovertext: y.map((d, i) => `Director: ${d}<br>Movies: ${x[i]}`),
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

  Plotly.newPlot('chart-directors-count', [trace], layout, { displayModeBar: false });
}
