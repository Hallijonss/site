import { defaultLayout, defaultHover, defaultScatterMarker } from './chartStyle.js';

export function renderPopularityScatter(data) {
  const x = [];
  const y = [];
  const hoverText = [];

  for (const row of data) {
    const votes = parseInt(row["Num Votes"].replace(/,/g, ""));
    const rating = parseFloat(row["Your Rating"]);
    const title = row["Title"];

    if (!isNaN(votes) && !isNaN(rating)) {
      x.push(votes);
      y.push(rating);
      hoverText.push(`Movie: ${title}`);
    }
  }

  const n = x.length;
  const xMean = x.reduce((a, b) => a + b, 0) / n;
  const yMean = y.reduce((a, b) => a + b, 0) / n;

  let num = 0, den = 0;
  for (let i = 0; i < n; i++) {
    num += (x[i] - xMean) * (y[i] - yMean);
    den += (x[i] - xMean) ** 2;
  }

  const slope = num / den;
  const intercept = yMean - slope * xMean;
  const xMin = Math.min(...x);
  const xMax = Math.max(...x);

  const regLine = {
    x: [xMin, xMax],
    y: [slope * xMin + intercept, slope * xMax + intercept],
    mode: 'lines',
    type: 'scatter',
    line: { color: '#cccccc', dash: 'dot', width: 2 },
    hoverinfo: 'skip',
    showlegend: false
  };

  const scatter = {
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
    xaxis: {
      ...defaultLayout.xaxis,
      tickformat: ','
    },
    yaxis: {
      ...defaultLayout.yaxis,
      range: [0, 10.1]
    }
  };

  Plotly.newPlot('chart-popularity-rating', [scatter, regLine], layout, { displayModeBar: false });
}
