import { defaultLayout, defaultHover, defaultScatterMarker } from './chartStyle.js';

export function renderScatterRuntime(data) {
  const x = [];
  const y = [];
  const hoverText = [];

  for (const row of data) {
    const runtime = parseInt(row["Runtime (mins)"]);
    const rating = parseFloat(row["Your Rating"]);
    const title = row["Title"];

    if (!isNaN(runtime) && !isNaN(rating)) {
      x.push(runtime);
      y.push(rating);
      hoverText.push(`Movie: ${title}`);
    }
  }

  const trace = {
    x,
    y,
    text: hoverText,
    mode: 'markers',
    type: 'scatter',
    marker: defaultScatterMarker,
    hoverinfo: 'text',
    ...defaultHover,
    name: ''
  };

  const layout = {
    ...defaultLayout,
    yaxis: {
      ...defaultLayout.yaxis,
      range: [0, 10.1]
    },
    xaxis: {
      ...defaultLayout.xaxis
    }
  };

  Plotly.newPlot('chart-runtime-rating', [trace], layout, { displayModeBar: false });
}
