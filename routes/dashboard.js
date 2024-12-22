const express = require('express');
const fs = require('fs');
const path = require('path');
const { fallbackUrl } = require('../config');
const router = express.Router();

router.get('/dashboard', (req, res) => {
  console.log('/dashboard');
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

      // Group data by hour for requests/hour plot
      const hourlyData = {};
      logEntries.forEach(entry => {
        // Get the hour from the UTC timestamp (format: "YYYY-MM-DD HH:mm:ss")
        const hour = entry.utcTimestamp.substring(0, 13); // Gets "YYYY-MM-DD HH"
        if (!hourlyData[hour]) {
          hourlyData[hour] = 0;
        }
        hourlyData[hour]++;
      });

      // Convert to arrays for plotting, sorted by hour
      const hours = Object.keys(hourlyData).sort();
      const requestsPerHour = hours.map(hour => hourlyData[hour]);

      // Count requests per method
      const methodRequestCounts = {};
      logEntries.forEach(entry => {
        if (!methodRequestCounts[entry.method]) {
          methodRequestCounts[entry.method] = 0;
        }
        methodRequestCounts[entry.method]++;
      });

      // Convert to arrays for plotting
      const methodNames = Object.keys(methodRequestCounts);
      const methodCounts = methodNames.map(method => methodRequestCounts[method]);

      // Group data by method for box plot
      const methodData = {};
      logEntries.forEach(entry => {
        if (!methodData[entry.method]) {
          methodData[entry.method] = [];
        }
        methodData[entry.method].push(entry.duration);
      });

      // Prepare data for method box plot
      const methodBoxPlotData = methodNames.map(method => ({
        y: methodData[method],
        name: method,
        type: 'box',
        boxpoints: false,
        showlegend: true
      }));

      // Calculate requests and average duration for the last hour
      const now = new Date();
      const oneHourAgo = new Date(now - 60 * 60 * 1000);
      const lastHourEntries = logEntries.filter(entry => {
        const entryTime = new Date(entry.utcTimestamp);
        return entryTime >= oneHourAgo;
      });
      const requestsLastHour = lastHourEntries.length;
      const avgDurationLastHour = lastHourEntries.length > 0 
        ? lastHourEntries.reduce((sum, entry) => sum + entry.duration, 0) / lastHourEntries.length
        : 0;
      const fallbackRequestsLastHour = lastHourEntries.filter(entry => 
        entry.peerId === fallbackUrl
      ).length;

      // Group requests by hour, separating fallback and node requests
      const requestsByHour = {};
      const fallbackRequestsByHour = {};
      
      logEntries.forEach(entry => {
        const entryDate = new Date(entry.utcTimestamp);
        // Format the hour consistently
        const hour = entryDate.toISOString().slice(0, 13) + ':00:00';
        
        // Initialize if not exists
        if (!requestsByHour[hour]) {
          requestsByHour[hour] = 0;
          fallbackRequestsByHour[hour] = 0;
        }
        
        // Count fallback vs node requests separately
        if (entry.peerId === fallbackUrl) {
          fallbackRequestsByHour[hour]++;
        } else {
          requestsByHour[hour]++;
        }
      });

      // Convert to arrays for plotting
      const timePoints = Object.keys(requestsByHour).sort();
      
      const nodeRequestsPerHour = timePoints.map(hour => requestsByHour[hour]);
      const fallbackRequestsPerHour = timePoints.map(hour => fallbackRequestsByHour[hour]);

      // Prepare data for line plot
      const nodeDurations = logEntries
        .filter(entry => entry.peerId !== fallbackUrl)
        .map(entry => ({ x: entry.utcTimestamp, y: entry.duration }));

      const fallbackDurations = logEntries
        .filter(entry => entry.peerId === fallbackUrl)
        .map(entry => ({ x: entry.utcTimestamp, y: entry.duration }));

      res.send(`
        <html>
          <head>
            <script src="https://cdn.plot.ly/plotly-latest.min.js"></script>
            <style>
              .chart-container {
                margin: 20px;
                padding: 20px;
                border: 2px solid #8c8c8c;
              }
              .divider {
                text-align: center;
                font-weight: bold;
                margin: 60px 0px;
              }
            </style>
          </head>
          <body>
            <div class="chart-container">
              <div id="gaugeChart"></div>
            </div>
            <div class="chart-container">
              <div id="requestsPerHourChart"></div>
            </div>
            <div class="chart-container">
              <div id="lineChart"></div>
            </div>
            <h2 class="divider">BY NODE</h2>
            <div class="chart-container">
              <div id="barChart"></div>
            </div>
            <div class="chart-container">
              <div id="boxChart"></div>
            </div>
            <h2 class="divider">BY HOST</h2>
            <div class="chart-container">
              <div id="hostBarChart"></div>
            </div>
            <div class="chart-container">
              <div id="reqHostBoxChart"></div>
            </div>
            <h2 class="divider">BY METHOD</h2>
            <div class="chart-container">
              <div id="methodBarChart"></div>
            </div>
            <div class="chart-container">
              <div id="methodBoxChart"></div>
            </div>
            <div class="chart-container">
              <h2 class="divider">RPC Requests Log</h2>
              <table id="logTable" border="1" cellpadding="5">
                <thead>
                  <tr>
                    <th>UTC Timestamp</th>
                    <th>Epoch Time</th>
                    <th>Request Host</th>
                    <th>Peer ID</th>
                    <th>Method</th>
                    <th>Params</th>
                    <th>Duration (ms)</th>
                  </tr>
                </thead>
                <tbody>
                  <!-- Log entries will be inserted here by JavaScript -->
                </tbody>
              </table>
              <div id="pagination">
                <button onclick="prevPage()">Previous</button>
                <span id="pageInfo"></span>
                <button onclick="nextPage()">Next</button>
              </div>
            </div>
            <script>
              try {
                // Gauge charts for requests and duration in last hour
                const gaugeData = [
                  {
                    type: "indicator",
                    mode: "gauge+number",
                    value: ${requestsLastHour},
                    title: { text: "Total Requests in Last Hour" },
                    gauge: {
                      axis: { range: [null, ${Math.max(requestsLastHour * 2, 100)}] },
                      bar: { color: "#1f77b4" },
                      bgcolor: "white",
                      borderwidth: 2,
                      bordercolor: "gray",
                    },
                    domain: { row: 0, column: 0 }
                  },
                  {
                    type: "indicator",
                    mode: "gauge+number",
                    value: ${fallbackRequestsLastHour},
                    title: { text: "Fallback Requests in Last Hour" },
                    gauge: {
                      axis: { range: [0, ${Math.max(requestsLastHour * 2, 100)}] },
                      bar: { color: "#ff0000" },
                      bgcolor: "white",
                      borderwidth: 2,
                      bordercolor: "gray",
                    },
                    domain: { row: 0, column: 1 }
                  },
                  {
                    type: "indicator",
                    mode: "gauge+number",
                    value: ${avgDurationLastHour.toFixed(2)},
                    title: { text: "Avg Duration Last Hour (ms)" },
                    gauge: {
                      axis: { range: [0, ${Math.max(avgDurationLastHour * 2, 100)}] },
                      bar: { color: "#2ca02c" },
                      bgcolor: "white",
                      borderwidth: 2,
                      bordercolor: "gray",
                    },
                    domain: { row: 0, column: 2 }
                  }
                ];

                const gaugeLayout = {
                  grid: { rows: 1, columns: 3, pattern: 'independent' },
                  height: 300,
                  margin: { t: 50, r: 25, l: 25, b: 25 }
                };

                Plotly.newPlot('gaugeChart', gaugeData, gaugeLayout);

                // Requests per hour line plot
                const hourlyLineData = [
                  {
                    x: ${JSON.stringify(timePoints)},
                    y: ${JSON.stringify(nodeRequestsPerHour)},
                    type: 'scatter',
                    mode: 'lines',
                    name: 'Node Requests',
                    line: { color: '#1f77b4' }  // Blue
                  },
                  {
                    x: ${JSON.stringify(timePoints)},
                    y: ${JSON.stringify(fallbackRequestsPerHour)},
                    type: 'scatter',
                    mode: 'lines',
                    name: 'Fallback Requests',
                    line: { color: '#ff0000' }  // Red
                  }
                ];

                const hourlyLineLayout = {
                  title: 'Requests per Hour',
                  xaxis: {
                    title: 'Hour (UTC)',
                    tickangle: 45,
                    rangeselector: {
                      buttons: [
                        {
                          step: 'hour',
                          stepmode: 'backward',
                          count: 1,
                          label: '1h'
                        },
                        {
                          step: 'day',
                          stepmode: 'backward',
                          count: 1,
                          label: '1d'
                        },
                        {
                          step: 'all',
                          label: 'All'
                        }
                      ]
                    },
                    rangeslider: {}
                  },
                  yaxis: {
                    title: 'Number of Requests'
                  },
                  height: 800,
                  showlegend: true,
                  legend: {
                    y: -0.1,  // Move legend below chart
                    x: 0.5,
                    xanchor: 'center',
                    orientation: 'h'
                  }
                };

                Plotly.newPlot('requestsPerHourChart', hourlyLineData, hourlyLineLayout);

                // Line plot for request durations over time
                const lineData = [
                  {
                    x: ${JSON.stringify(nodeDurations.map(d => d.x))},
                    y: ${JSON.stringify(nodeDurations.map(d => d.y))},
                    type: 'scatter',
                    mode: 'lines',
                    name: 'Node Request Duration',
                    line: { color: '#1f77b4' }  // Blue
                  },
                  {
                    x: ${JSON.stringify(fallbackDurations.map(d => d.x))},
                    y: ${JSON.stringify(fallbackDurations.map(d => d.y))},
                    type: 'scatter',
                    mode: 'lines',
                    name: 'Fallback Request Duration',
                    line: { color: '#ff0000' }  // Red
                  }
                ];

                const lineLayout = {
                  title: 'Request Durations Over Time',
                  xaxis: {
                    title: 'Timestamp',
                    rangeslider: {}
                  },
                  yaxis: {
                    title: 'Duration (ms)'
                  },
                  height: 800,
                  showlegend: true,
                  legend: {
                    y: -0.1,  // Move legend below chart
                    x: 0.5,
                    xanchor: 'center',
                    orientation: 'h'
                  }
                };

                Plotly.newPlot('lineChart', lineData, lineLayout);

                // Bar plot
                const barData = [{
                  x: ${JSON.stringify(nodeIds)},
                  y: ${JSON.stringify(requestCounts)},
                  type: 'bar',
                  name: 'Requests',
                  marker: {
                    color: ${JSON.stringify(nodeIds.map(id => id === fallbackUrl ? '#ff0000' : '#1f77b4'))}  // Red for fallback, Blue for others
                  }
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
                  height: 800,
                  margin: {
                    b: 150  // Increase bottom margin for rotated labels
                  }
                };

                Plotly.newPlot('barChart', barData, barLayout);

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
                  height: 800,
                  margin: {
                    b: 200  // Increase bottom margin for rotated labels
                  },
                  showlegend: true,
                  legend: {
                    orientation: 'h',     // horizontal legend
                    y: -0.5,             // position below the plot
                    x: 0.5,              // center horizontally
                    xanchor: 'center'    // anchor point for centering
                  }
                };

                Plotly.newPlot('boxChart', boxPlotData, boxLayout);

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
                  height: 800,
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
                  height: 800,
                  margin: {
                    b: 150  // Increase bottom margin for rotated labels
                  }
                };

                Plotly.newPlot('hostBarChart', hostBarData, hostBarLayout);

                // Method Bar plot
                const methodBarData = [{
                  x: ${JSON.stringify(methodNames)},
                  y: ${JSON.stringify(methodCounts)},
                  type: 'bar',
                  name: 'Requests'
                }];

                const methodBarLayout = {
                  title: 'Number of Requests per Method',
                  xaxis: {
                    title: 'Method',
                    tickangle: 45
                  },
                  yaxis: {
                    title: 'Number of Requests'
                  },
                  height: 800,
                  margin: {
                    b: 150  // Increase bottom margin for rotated labels
                  }
                };

                Plotly.newPlot('methodBarChart', methodBarData, methodBarLayout);

                // Method box plot
                const methodBoxPlotData = ${JSON.stringify(methodBoxPlotData)};
                const methodBoxLayout = {
                  title: 'Request Duration Distribution by Method',
                  yaxis: {
                    title: 'Duration (ms)',
                    autorange: true
                  },
                  xaxis: {
                    tickangle: 45
                  },
                  height: 800,
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

                Plotly.newPlot('methodBoxChart', methodBoxPlotData, methodBoxLayout);

              } catch (error) {
                console.error('Error creating plots:', error);
              }
            </script>
            <script>
              const logEntries = ${JSON.stringify(logEntries)};
              const entriesPerPage = 100;
              let currentPage = 1;

              function renderTable() {
                const start = (currentPage - 1) * entriesPerPage;
                const end = start + entriesPerPage;
                const currentEntries = logEntries.slice(start, end);

                const tbody = document.querySelector('#logTable tbody');
                tbody.innerHTML = currentEntries.map(entry => \`
                    <tr>
                      <td>\${entry.utcTimestamp}</td>
                      <td>\${entry.epochTime}</td>
                      <td>\${entry.reqHost}</td>
                      <td>\${entry.peerId}</td>
                      <td>\${entry.method}</td>
                      <td>\${entry.params}</td>
                      <td>\${entry.duration.toFixed(3)}</td>
                    </tr>
                \`).join('');

                document.getElementById('pageInfo').textContent = \`Page \${currentPage} of \${Math.ceil(logEntries.length / entriesPerPage)}\`;
              }

              function prevPage() {
                if (currentPage > 1) {
                  currentPage--;
                  renderTable();
                }
              }

              function nextPage() {
                if (currentPage < Math.ceil(logEntries.length / entriesPerPage)) {
                  currentPage++;
                  renderTable();
                }
              }

              renderTable();
            </script>
          </body>
        </html>
      `);
    } catch (error) {
      console.error('Error processing data:', error);
      res.status(500).send(`Error processing data: ${error.message}`);
    }
  });
});

module.exports = router;