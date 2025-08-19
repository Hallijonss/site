import { defaultLayout, defaultHover, defaultMarker } from './chartStyle.js';

export function renderRatingDistribution(data, source) {
  const values = [];

  for (const row of data) {
    let r = parseFloat(row["Your Rating"]);
    if (isNaN(r)) continue;
    // Display scale: IMDb 0–10, LB 1–5
    if (source === "letterboxd") r = r / 2;
    values.push(r);
  }

  if (values.length === 0) {
    // Clear chart if no data
    const el = document.getElementById('chart-rating-distribution');
    if (el) el.innerHTML = '';
    return;
  }

  const isLB = source === "letterboxd";
  const xStart = isLB ? 0.5 : 0;
  const xEnd   = isLB ? 5.0 : 10.0;
  const bin    = isLB ? 0.5 : 1;

  const trace = {
    x: values,
    type: 'histogram',
    xbins: { start: xStart, end: xEnd, size: bin },
    marker: defaultMarker,
    hoverlabel: defaultHover?.hoverlabel
  };

  const layout = {
    ...defaultLayout,
    xaxis: {
      ...defaultLayout.xaxis,
      title: isLB ? 'Rating (★ 1–5)' : 'Rating (0–10)',
      range: [xStart, xEnd],
      dtick: bin
    },
    yaxis: {
      ...defaultLayout.yaxis,
      title: 'Number of Movies'
    },
    bargap: 0.05,
    hovermode: 'x'
  };

  Plotly.newPlot('chart-rating-distribution', [trace], layout, { displayModeBar: false });
}
