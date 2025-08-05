export const defaultLayout = {
  plot_bgcolor: '#2c2f36',
  paper_bgcolor: '#2c2f36',
  margin: { l: 40, r: 20, t: 20, b: 40 },
  showlegend: false,
  xaxis: {
    title: '',
    color: 'white',
    gridcolor: 'rgba(255, 255, 255, 0.1)',
    tickfont: { color: 'white' }
  },
  yaxis: {
    title: '',
    color: 'white',
    gridcolor: 'rgba(255, 255, 255, 0.1)',
    tickfont: { color: 'white' }
  }
};

export const defaultHover = {
  hoverlabel: {
    bgcolor: 'white',
    font: { color: 'black' }
  }
};

export const defaultMarker = {
  color: '#1c883c',
  line: {
    color: '#2aa14d',  // brighter green outline
    width: 1.5
  }
};

export const defaultScatterMarker = {
  size: 8,
  color: '#4ade80', // soft green
  line: {
    width: 1,
    color: '#2c2f36' // match background
  }
};

export const defaultHistogramMarker = {
  color: '#1c883c',
  line: {
    color: '#34c759',
    width: 1
  }
};
