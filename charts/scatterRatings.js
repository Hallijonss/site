import { defaultLayout, defaultHover, defaultScatterMarker } from './chartStyle.js';

export function renderScatterRatings(data, genreFilter = null) {
  const yourRatings = [];
  const imdbRatings = [];
  const titles = [];

  for (const row of data) {
    const yourRating = parseFloat(row["Your Rating"]);
    const imdbRating = parseFloat(row["IMDb Rating"]);
    const title = row["Title"];
    const genres = row["Genres"] || "";

    if (!isNaN(yourRating) && !isNaN(imdbRating)) {
      if (!genreFilter || genres.toLowerCase().includes(genreFilter.toLowerCase())) {
        yourRatings.push(yourRating);
        imdbRatings.push(imdbRating);
        titles.push(title);
      }
    }
  }

  // regression line
  const n = yourRatings.length;
  const meanX = yourRatings.reduce((a, b) => a + b, 0) / n;
  const meanY = imdbRatings.reduce((a, b) => a + b, 0) / n;
  const slope = yourRatings.reduce((acc, x, i) => acc + (x - meanX) * (imdbRatings[i] - meanY), 0) /
                yourRatings.reduce((acc, x) => acc + Math.pow(x - meanX, 2), 0);
  const intercept = meanY - slope * meanX;

  const trendX = [0, 10];
  const trendY = trendX.map(x => slope * x + intercept);

  const tracePoints = {
    x: yourRatings,
    y: imdbRatings,
    text: titles,
    mode: 'markers',
    type: 'scatter',
    marker: defaultScatterMarker,
    hovertemplate: '%{text}<br>Your Rating: %{x}<br>IMDb Rating: %{y}<extra></extra>'
  };

  const traceTrend = {
    x: trendX,
    y: trendY,
    mode: 'lines',
    type: 'scatter',
    line: { color: '#22c55e', width: 2, dash: 'dot' },
    hoverinfo: 'skip',
    showlegend: false
  };

  const layout = {
    ...defaultLayout,
    xaxis: {
      ...defaultLayout.xaxis,
      range: [0, 10.1],
      title: 'Your Rating'
    },
    yaxis: {
      ...defaultLayout.yaxis,
      range: [0, 10],
      title: 'IMDb Rating'
    },
    hovermode: 'closest'
  };

  Plotly.newPlot('chart-scatter', [tracePoints, traceTrend], layout, { displayModeBar: false });
}
