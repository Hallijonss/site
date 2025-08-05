import { defaultLayout, defaultHover, defaultMarker } from './chartStyle.js';

export function renderRuntimeCount(data) {
  const binCounts = {};

  for (const row of data) {
    const runtime = parseInt(row["Runtime (mins)"]);
    if (!isNaN(runtime)) {
      const rounded = Math.round(runtime / 10) * 10;
      binCounts[rounded] = (binCounts[rounded] || 0) + 1;
    }
  }

  const x = Object.keys(binCounts).map(Number).sort((a, b) => a - b);
  const y = x.map(bin => binCounts[bin]);

  const trace = {
    x,
    y,
    type: 'bar',
    marker: defaultMarker,
    hovertext: x.map((runtime, i) => `Runtime: ${runtime} min<br>Movies: ${y[i]}`),
    hoverinfo: 'text',
    ...defaultHover,
    name: ''
  };

  const layout = {
    ...defaultLayout,
    xaxis: {
      ...defaultLayout.xaxis
    },
    yaxis: {
      ...defaultLayout.yaxis
    }
  };

  Plotly.newPlot('chart-runtime-count', [trace], layout, { displayModeBar: false });
}
