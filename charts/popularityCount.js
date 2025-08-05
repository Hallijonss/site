import { defaultLayout, defaultHover, defaultMarker } from './chartStyle.js';

export function renderPopularityCount(data) {
  const voteBins = {};

  for (const row of data) {
    let votes = parseInt(row["Num Votes"].replace(/,/g, ""));
    if (!isNaN(votes)) {
      const rounded = Math.round(votes / 10000) * 10000;
      voteBins[rounded] = (voteBins[rounded] || 0) + 1;
    }
  }

  const x = Object.keys(voteBins).map(Number).sort((a, b) => a - b);
  const y = x.map(v => voteBins[v]);

  const trace = {
    x,
    y,
    type: 'bar',
    marker: defaultMarker,
    hovertext: x.map((val, i) => `Votes: ${val.toLocaleString()}<br>Movies: ${y[i]}`),
    hoverinfo: 'text',
    ...defaultHover,
    name: ''
  };

  const layout = {
    ...defaultLayout,
    xaxis: {
      ...defaultLayout.xaxis,
      tickformat: ','
    },
    yaxis: {
      ...defaultLayout.yaxis
    }
  };

  Plotly.newPlot('chart-popularity-count', [trace], layout, { displayModeBar: false });
}
