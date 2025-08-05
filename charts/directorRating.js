import { defaultLayout, defaultHover, defaultMarker } from './chartStyle.js';

export function renderDirectorRating(data) {
  const counts = {};
  const ratings = {};

  for (const row of data) {
    let director = row["Directors"];
    const rating = parseFloat(row["Your Rating"]);

    if (director && !isNaN(rating)) {
      director = director.trim().replace(/^"+|"+$/g, '').replace(/^'+|'+$/g, '');
      counts[director] = (counts[director] || 0) + 1;
      ratings[director] = (ratings[director] || []);
      ratings[director].push(rating);
    }
  }

  const filtered = Object.entries(counts)
    .filter(([_, count]) => count >= 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([name]) => name);

  const avgRatings = filtered.map(director => {
    const allRatings = ratings[director];
    const avg = allRatings.reduce((a, b) => a + b, 0) / allRatings.length;
    return { director, avg };
  }).sort((a, b) => b.avg - a.avg).reverse(); // top-rated at top

  const y = avgRatings.map(d => d.director);
  const x = avgRatings.map(d => d.avg);

  const trace = {
    x,
    y,
    type: 'bar',
    orientation: 'h',
    marker: defaultMarker,
    hovertext: y.map((d, i) => `Director: ${d}<br>Avg Rating: ${x[i].toFixed(2)}`),
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

  Plotly.newPlot('chart-directors-rating', [trace], layout, { displayModeBar: false });
}
