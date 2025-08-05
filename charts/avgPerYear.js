import { defaultLayout, defaultHover } from './chartStyle.js';

export function renderAveragePerYear(data) {
  const ratingsByYear = {};

  for (const row of data) {
    const year = parseInt(row["Year"], 10);
    const rating = parseFloat(row["Your Rating"]);
    const title = row["Title"];

    if (!isNaN(year) && year >= 1900 && !isNaN(rating)) {
      if (!ratingsByYear[year]) ratingsByYear[year] = [];
      ratingsByYear[year].push({ rating, title });
    }
  }

  const years = [];
  const avgRatings = [];
  const minRatings = [];
  const maxRatings = [];
  const minTitles = [];
  const maxTitles = [];

  const sortedYears = Object.keys(ratingsByYear).map(Number).sort((a, b) => a - b);

  for (const year of sortedYears) {
    const ratings = ratingsByYear[year];
    if (ratings.length === 0) continue;

    const avg = ratings.reduce((sum, obj) => sum + obj.rating, 0) / ratings.length;

    const minObj = ratings.reduce((a, b) => (a.rating < b.rating ? a : b));
    const maxObj = ratings.reduce((a, b) => (a.rating > b.rating ? a : b));

    years.push(year);
    avgRatings.push(+avg.toFixed(2));
    minRatings.push(minObj.rating);
    maxRatings.push(maxObj.rating);
    minTitles.push(`${minObj.title} (${minObj.rating})`);
    maxTitles.push(`${maxObj.title} (${maxObj.rating})`);
  }

  const traceAvg = {
    x: years,
    y: avgRatings,
    type: 'scatter',
    mode: 'lines',
    name: 'Avg Rating',
    line: { color: '#00ff7f', width: 2 },
    hoverinfo: 'x+y'
  };

  const traceMin = {
    x: years,
    y: minRatings,
    type: 'scatter',
    mode: 'lines',
    line: { color: 'transparent' },
    fill: 'tonexty',
    fillcolor: 'rgba(0, 255, 127, 0.2)',
    text: minTitles,
    hoverinfo: 'text',
    showlegend: false
  };

  const traceMax = {
    x: years,
    y: maxRatings,
    type: 'scatter',
    mode: 'lines',
    line: { color: 'transparent' },
    fill: 'none',
    text: maxTitles,
    hoverinfo: 'text',
    showlegend: false
  };

  const layout = {
    ...defaultLayout,
    xaxis: {
      ...defaultLayout.xaxis,
      title: 'Year',
      type: 'category',
      tickvals: years.filter(year => year % 10 === 0)
    },
    yaxis: {
      ...defaultLayout.yaxis,
      title: 'Average Rating',
      range: [0, 10]
    },
    hovermode: 'x'
  };

  Plotly.newPlot('chart-year-count', [traceMax, traceMin, traceAvg], layout, { displayModeBar: false });
}
