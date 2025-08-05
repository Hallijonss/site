import { defaultLayout, defaultHover, defaultMarker } from './chartStyle.js';

export function renderDecadeCountChart(data) {
  const decadeCounts = {};

  for (const row of data) {
    const year = parseInt(row["Year"]);
    if (isNaN(year) || year < 1900) continue;

    const decade = year - (year % 10);
    decadeCounts[decade] = (decadeCounts[decade] || 0) + 1;
  }

  const decadeArray = Object.entries(decadeCounts)
    .map(([decade, count]) => ({ decade: parseInt(decade), count }))
    .sort((a, b) => a.decade - b.decade);

  const trace = {
    x: decadeArray.map(d => d.decade),
    y: decadeArray.map(d => d.count),
    type: 'bar',
    marker: defaultMarker,
    hovertext: decadeArray.map(d => `Decade: ${d.decade}<br>Movies: ${d.count}`),
    hoverinfo: 'text',
    ...defaultHover,
    name: ''
  };

  const layout = {
    ...defaultLayout,
    xaxis: {
      ...defaultLayout.xaxis,
      tickformat: 'd'
    },
    yaxis: {
      ...defaultLayout.yaxis
    }
  };

  Plotly.newPlot('chart-decade-count', [trace], layout, { displayModeBar: false });
}
