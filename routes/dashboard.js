const express = require('express');
const fs = require('fs');
const path = require('path');
const router = express.Router();

router.get('/dashboard', (req, res) => {
  fs.readFile(path.join(__dirname, '../rpcRequests.log'), 'utf8', (err, data) => {
    if (err) {
      console.error('Error reading log file:', err);
      return res.status(500).send('Error reading log file');
    }

    try {
      console.log('Processing log entries...');
      const logEntries = data.trim().split('\n').map(line => {
        const [utcTimestamp, epochTime, reqHost, peerId, method, params, duration] = line.split('|');
        return { utcTimestamp, epochTime, reqHost, peerId, method, params, duration: parseFloat(duration) };
      });

      console.log(`Found ${logEntries.length} log entries`);

      // Group data by peerId for box plot
      const peerData = {};
      logEntries.forEach(entry => {
        if (!peerData[entry.peerId]) {
          peerData[entry.peerId] = [];
        }
        peerData[entry.peerId].push(entry.duration);
      });

      // Prepare data for line plot
      const timestamps = logEntries.map(entry => entry.utcTimestamp);
      const durations = logEntries.map(entry => entry.duration);

      // Prepare data for box plot
      const peerIds = Object.keys(peerData);
      const boxPlotData = peerIds.map(peerId => ({
        y: peerData[peerId],
        name: peerId,
        type: 'box',
        boxpoints: false
      }));

      console.log('Rendering response...');

      res.send(`
        <html>
          <head>
            <script src="https://cdn.plot.ly/plotly-latest.min.js"></script>
            <style>
              .chart-container {
                margin: 20px;
                padding: 20px;
                border: 1px solid #ddd;
              }
            </style>
          </head>
          <body>
            <div class="chart-container">
              <h2>RPC Request Durations Over Time</h2>
              <div id="lineChart"></div>
            </div>
            <div class="chart-container">
              <h2>Request Duration Distribution by Node</h2>
              <div id="boxChart"></div>
            </div>
            <script>
              try {
                console.log('Initializing plots...');

                // Line plot
                const lineData = [{
                  x: ${JSON.stringify(timestamps)},
                  y: ${JSON.stringify(durations)},
                  type: 'scatter',
                  mode: 'lines',
                  name: 'Duration'
                }];

                const lineLayout = {
                  title: 'Request Durations Over Time',
                  xaxis: {
                    title: 'Timestamp'
                  },
                  yaxis: {
                    title: 'Duration (ms)'
                  },
                  height: 500
                };

                Plotly.newPlot('lineChart', lineData, lineLayout);
                console.log('Line plot created');

                // Box plot
                const boxPlotData = ${JSON.stringify(boxPlotData)};
                const boxLayout = {
                  title: 'Request Duration Distribution by Node',
                  yaxis: {
                    title: 'Duration (ms)',
                    autorange: true
                  },
                  xaxis: {
                    tickangle: 45
                  },
                  height: 600,
                  margin: {
                    b: 200  // Increase bottom margin for rotated labels
                  }
                };

                Plotly.newPlot('boxChart', boxPlotData, boxLayout);
                console.log('Box plot created');

              } catch (error) {
                console.error('Error creating plots:', error);
              }
            </script>
          </body>
        </html>
      `);
      
      console.log('Response sent');
    } catch (error) {
      console.error('Error processing data:', error);
      res.status(500).send(`Error processing data: ${error.message}`);
    }
  });
});

module.exports = router;