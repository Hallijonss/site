import { defaultLayout, defaultHover, defaultMarker } from './chartStyle.js';

export function renderDecadeAverageChart(data) {
  const decadeStats = {};

  for (const row of data) {
    const year = parseInt(row["Year"]);
    const rating = parseFloat(row["Your Rating"]);

    // ✅ Filter: exclude anything before 1900
    if (isNaN(year) || year < 1900 || isNaN(rating)) continue;

    const decade = year - (year % 10);
    if (!decadeStats[decade]) {
      decadeStats[decade] = { total: 0, count: 0 };
    }

    decadeStats[decade].total += rating;
    decadeStats[decade].count += 1;
  }

  const decadeArray = Object.entries(decadeStats)
    .map(([decade, { total, count }]) => ({
      decade: parseInt(decade),
      avg: total / count
    }))
    .sort((a, b) => a.decade - b.decade);

  const trace = {
    x: decadeArray.map(d => d.decade),
    y: decadeArray.map(d => d.avg),
    type: 'bar',
    marker: defaultMarker,
    hovertext: decadeArray.map(d => `Decade: ${d.decade}<br>Avg Rating: ${d.avg.toFixed(2)}`),
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
      ...defaultLayout.yaxis,
      range: [0, 10]
    }
  };

  Plotly.newPlot('chart-decade-avg', [trace], layout, { displayModeBar: false });
}
