import { defaultLayout, defaultHover, defaultHistogramMarker } from './chartStyle.js';

export function renderRatingDifferenceHistogram(data) {
  const ratingDifferences = data.map(row => {
    const yourRating = parseFloat(row["Your Rating"]);
    const imdbRating = parseFloat(row["IMDb Rating"]);
    return !isNaN(yourRating) && !isNaN(imdbRating)
      ? yourRating - imdbRating
      : null;
  }).filter(diff => diff !== null);

  const trace = {
    x: ratingDifferences,
    type: 'histogram',
    xbins: {
      start: -5,
      end: 5,
      size: 0.5
    },
    marker: defaultHistogramMarker,
    hoverinfo: 'x+y',
    ...defaultHover,
    name: ''
  };

  const layout = {
    ...defaultLayout,
    xaxis: {
      ...defaultLayout.xaxis,
      title: 'Rating Difference',
      dtick: 1
    },
    yaxis: {
      ...defaultLayout.yaxis,
      title: 'Count'
    }
  };

  Plotly.newPlot('chart-rating-diff-hist', [trace], layout, { displayModeBar: false });
}
