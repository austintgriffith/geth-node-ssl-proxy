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

      // Group data by reqHost for box plot
      const reqHostData = {};
      logEntries.forEach(entry => {
        if (!reqHostData[entry.reqHost]) {
          reqHostData[entry.reqHost] = [];
        }
        reqHostData[entry.reqHost].push(entry.duration);
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

      // Prepare data for request host box plot
      const reqHosts = Object.keys(reqHostData);
      const reqHostBoxPlotData = reqHosts.map(reqHost => ({
        y: reqHostData[reqHost],
        name: reqHost,
        type: 'box',
        boxpoints: false,
        showlegend: true
      }));

      // Count requests per node
      const nodeRequestCounts = {};
      logEntries.forEach(entry => {
        if (!nodeRequestCounts[entry.peerId]) {
          nodeRequestCounts[entry.peerId] = 0;
        }
        nodeRequestCounts[entry.peerId]++;
      });

      // Convert to arrays for plotting
      const nodeIds = Object.keys(nodeRequestCounts);
      const requestCounts = nodeIds.map(id => nodeRequestCounts[id]);

      // Count requests per host
      const hostRequestCounts = {};
      logEntries.forEach(entry => {
        if (!hostRequestCounts[entry.reqHost]) {
          hostRequestCounts[entry.reqHost] = 0;
        }
        hostRequestCounts[entry.reqHost]++;
      });

      // Convert to arrays for plotting
      const hostNames = Object.keys(hostRequestCounts);
      const hostCounts = hostNames.map(host => hostRequestCounts[host]);

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
              <h2>Request Count by Node</h2>
              <div id="barChart"></div>
            </div>
            <div class="chart-container">
              <h2>Request Duration Distribution by Node</h2>
              <div id="boxChart"></div>
            </div>
            <div class="chart-container">
              <h2>Request Count by Host</h2>
              <div id="hostBarChart"></div>
            </div>
            <div class="chart-container">
              <h2>Request Duration Distribution by Host</h2>
              <div id="reqHostBoxChart"></div>
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

                // Bar plot
                const barData = [{
                  x: ${JSON.stringify(nodeIds)},
                  y: ${JSON.stringify(requestCounts)},
                  type: 'bar',
                  name: 'Requests'
                }];

                const barLayout = {
                  title: 'Number of Requests per Node',
                  xaxis: {
                    title: 'Node ID',
                    tickangle: 45
                  },
                  yaxis: {
                    title: 'Number of Requests'
                  },
                  height: 500,
                  margin: {
                    b: 150  // Increase bottom margin for rotated labels
                  }
                };

                Plotly.newPlot('barChart', barData, barLayout);
                console.log('Bar plot created');

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

                // Request Host box plot
                const reqHostBoxPlotData = ${JSON.stringify(reqHostBoxPlotData)};
                const reqHostBoxLayout = {
                  title: 'Request Duration Distribution by Host',
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
                  },
                  showlegend: true,
                  legend: {
                    orientation: 'h',
                    y: -0.4,
                    x: 0.5,
                    xanchor: 'center',
                    bgcolor: '#E2E2E2',
                    bordercolor: '#FFFFFF',
                    borderwidth: 2
                  }
                };

                Plotly.newPlot('reqHostBoxChart', reqHostBoxPlotData, reqHostBoxLayout);
                console.log('Request Host box plot created');

                // Host Bar plot
                const hostBarData = [{
                  x: ${JSON.stringify(hostNames)},
                  y: ${JSON.stringify(hostCounts)},
                  type: 'bar',
                  name: 'Requests'
                }];

                const hostBarLayout = {
                  title: 'Number of Requests per Host',
                  xaxis: {
                    title: 'Host',
                    tickangle: 45
                  },
                  yaxis: {
                    title: 'Number of Requests'
                  },
                  height: 500,
                  margin: {
                    b: 150  // Increase bottom margin for rotated labels
                  }
                };

                Plotly.newPlot('hostBarChart', hostBarData, hostBarLayout);
                console.log('Host Bar plot created');

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