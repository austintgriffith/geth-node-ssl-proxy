const express = require('express');
const fs = require('fs');
const path = require('path');
const { fallbackUrl } = require('../config');
const router = express.Router();
const { getDbPool } = require('../utils/dbUtils');

router.get('/dashboard', (req, res) => {
  console.log('/dashboard');
  fs.readFile(path.join(__dirname, '../rpcRequests.log'), 'utf8', async (err, data) => {
    if (err) {
      console.error('Error reading log file:', err);
      return res.status(500).send('Error reading log file');
    }

    try {
      const pool = await getDbPool();
      const client = await pool.connect();
      try {
        console.log('Processing log entries...');
        const logEntries = data.trim().split('\n').map(line => {
          const [utcTimestamp, epochTime, reqHost, peerId, method, params, duration, messageId, success] = line.split('|');
          return { 
            utcTimestamp, 
            epochTime, 
            reqHost, 
            peerId, 
            method, 
            params, 
            duration: parseFloat(duration),
            messageId,
            success: success === 'true'  // Convert string to boolean
          };
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

        function calculatePercentiles(data, lowerPercentile, upperPercentile) {
          const sortedData = data.slice().sort((a, b) => a - b);
          const lowerIndex = Math.floor(lowerPercentile * sortedData.length);
          const upperIndex = Math.ceil(upperPercentile * sortedData.length) - 1;
          return {
            lower: sortedData[lowerIndex],
            upper: sortedData[upperIndex]
          };
        }

        // Prepare data for box plot
        const peerIds = Object.keys(peerData);
        const boxPlotData = peerIds.map(peerId => {
          const { lower, upper } = calculatePercentiles(peerData[peerId], 0.05, 0.95);
          return {
            y: peerData[peerId],
            name: peerId,
            type: 'box',
            boxpoints: 'outliers',
            lowerfence: [lower],
            upperfence: [upper],
            marker: {
              color: peerId === fallbackUrl ? '#FFC0CB' : undefined,
              size: 2
            },
            line: {
              color: peerId === fallbackUrl ? '#FFC0CB' : undefined
            }
          };
        });

        // Prepare data for request host box plot
        const reqHosts = Object.keys(reqHostData);
        const reqHostBoxPlotData = reqHosts.map(reqHost => {
          const { lower, upper } = calculatePercentiles(reqHostData[reqHost], 0.05, 0.95);
          return {
            y: reqHostData[reqHost],
            name: reqHost,
            type: 'box',
            boxpoints: 'outliers',
            lowerfence: [lower],
            upperfence: [upper],
            showlegend: true,
            marker: {
              size: 2
            }
          };
        });

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

        // Prepare data for method box plot
        const methodData = {};
        logEntries.forEach(entry => {
          if (!methodData[entry.method]) {
            methodData[entry.method] = [];
          }
          methodData[entry.method].push(entry.duration);
        });

        const methodBoxPlotData = methodNames.map(method => {
          const { lower, upper } = calculatePercentiles(methodData[method], 0.05, 0.95);
          return {
            y: methodData[method],
            name: method,
            type: 'box',
            boxpoints: 'outliers',
            lowerfence: [lower],
            upperfence: [upper],
            showlegend: true,
            marker: {
              size: 2
            }
          };
        });

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

        // Calculate requests and average duration for the last hour
        const now = new Date();
        const oneHourAgo = new Date(now - 60 * 60 * 1000);
        const lastHourEntries = logEntries.filter(entry => {
          const entryTime = new Date(entry.utcTimestamp);
          return entryTime >= oneHourAgo;
        });

        const requestsLastHour = lastHourEntries.length;
        const validDurationEntries = lastHourEntries.filter(entry => typeof entry.duration === 'number' && !isNaN(entry.duration));
        const avgDurationLastHour = validDurationEntries.length > 0 
          ? validDurationEntries.reduce((sum, entry) => sum + entry.duration, 0) / validDurationEntries.length
          : 0;

        const fallbackRequestsLastHour = lastHourEntries.filter(entry => 
          entry.peerId === fallbackUrl
        ).length;

        const failedRequestsLastHour = lastHourEntries.filter(entry => 
          entry.success === false
        ).length;

        // Group requests by hour, separating fallback and node requests
        const requestsByHour = {};
        const fallbackRequestsByHour = {};
        const failedRequestsByHour = {};
        
        logEntries.forEach(entry => {
          const entryDate = new Date(entry.utcTimestamp);
          const hour = entryDate.toISOString().slice(0, 13) + ':00:00';
          
          // Initialize if not exists
          if (!requestsByHour[hour]) {
            requestsByHour[hour] = 0;
            fallbackRequestsByHour[hour] = 0;
            failedRequestsByHour[hour] = 0;
          }
          
          // Count fallback vs node requests separately
          if (entry.peerId === fallbackUrl) {
            fallbackRequestsByHour[hour]++;
          } else {
            requestsByHour[hour]++;
          }
          
          // Count failed requests
          if (!entry.success) {
            failedRequestsByHour[hour]++;
          }
        });

        // Convert to arrays for plotting
        const timePoints = Object.keys(requestsByHour).sort();
        
        const nodeRequestsPerHour = timePoints.map(hour => requestsByHour[hour]);
        const fallbackRequestsPerHour = timePoints.map(hour => fallbackRequestsByHour[hour]);
        const failedRequestsPerHour = timePoints.map(hour => failedRequestsByHour[hour]);

        // Prepare data for line plot
        const nodeDurations = logEntries
          .filter(entry => entry.peerId !== fallbackUrl)
          .map(entry => ({ x: entry.utcTimestamp, y: entry.duration }));

        const fallbackDurations = logEntries
          .filter(entry => entry.peerId === fallbackUrl)
          .map(entry => ({ x: entry.utcTimestamp, y: entry.duration }));

        // Query for owner points
        const ownerPointsResult = await client.query(`
          SELECT owner, points
          FROM owner_points
          ORDER BY points DESC
        `);

        const ownerPointsData = ownerPointsResult.rows;

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
                #logTable {
                  width: 100%;
                }
                h2.center {
                  text-align: center;
                }
                .filter-btn {
                  padding: 8px 16px;
                  margin-right: 10px;
                  cursor: pointer;
                  border: 1px solid #ccc;
                  background-color: white;
                  border-radius: 4px;
                }
                .filter-btn.active {
                  background-color: #007bff;
                  color: white;
                  border-color: #0056b3;
                }
                #ownerPointsTable {
                  width: 100%;
                  max-width: 800px;
                  margin: 0 auto;
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
              <h2 class="divider">OWNER POINTS</h2>
              <div class="chart-container">
                <table border="1" cellpadding="5" id="ownerPointsTable">
                  <thead>
                    <tr>
                      <th>Owner</th>
                      <th>Points</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${ownerPointsData.map(row => `
                      <tr>
                        <td>${row.owner}</td>
                        <td>${row.points}</td>
                      </tr>
                    `).join('')}
                  </tbody>
                </table>
              </div>
              <h2 class="divider">BY HOST</h2>
              <div style="margin: 0px auto; max-width: 300px;">
                <input 
                  type="number" 
                  id="hostRequestFilter" 
                  placeholder="Minimum number of requests..." 
                  style="width: 100%; padding: 8px; margin-bottom: 10px; box-sizing: border-box; border: solid 2px black;"
                  oninput="filterHostPlots()"
                >
              </div>
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
                <div style="margin-bottom: 10px;">
                  <button onclick="filterBySuccess(null)" class="filter-btn active">All</button>
                  <button onclick="filterBySuccess(true)" class="filter-btn">Successful</button>
                  <button onclick="filterBySuccess(false)" class="filter-btn">Failed</button>
                </div>
                <input 
                  type="text" 
                  id="searchBox" 
                  placeholder="Search logs..." 
                  style="width: 100%; padding: 8px; margin-bottom: 10px; box-sizing: border-box;"
                >
                <table id="logTable" border="1" cellpadding="5">
                  <thead>
                    <tr>
                      <th>UTC Timestamp</th>
                      <th>Request Host</th>
                      <th>Peer ID</th>
                      <th>Method</th>
                      <th>Params</th>
                      <th>Duration (ms)</th>
                      <th>Message ID</th>
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
                        bar: { color: "#FFC0CB" },
                        bgcolor: "white",
                        borderwidth: 2,
                        bordercolor: "gray",
                      },
                      domain: { row: 0, column: 1 }
                    },
                    {
                      type: "indicator",
                      mode: "gauge+number",
                      value: ${failedRequestsLastHour},
                      title: { text: "Failed Requests in Last Hour" },
                      gauge: {
                        axis: { range: [0, ${Math.max(requestsLastHour * 2, 100)}] },
                        bar: { color: "#FF0000" },
                        bgcolor: "white",
                        borderwidth: 2,
                        bordercolor: "gray",
                      },
                      domain: { row: 0, column: 2 }
                    },
                    {
                      type: "indicator",
                      mode: "gauge+number",
                      value: ${avgDurationLastHour.toFixed(2)},
                      title: { text: "Avg Request Duration Last Hour (ms)" },
                      gauge: {
                        axis: { range: [0, 400] },
                        bar: { color: "#2ca02c" },
                        bgcolor: "white",
                        borderwidth: 2,
                        bordercolor: "gray",
                      },
                      domain: { row: 0, column: 3 }
                    }
                  ];

                  const gaugeLayout = {
                    grid: { rows: 1, columns: 4, pattern: 'independent' },
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
                      line: { color: '#FFC0CB' }  // pink
                    },
                    {
                      x: ${JSON.stringify(timePoints)},
                      y: ${JSON.stringify(failedRequestsPerHour)},
                      type: 'scatter',
                      mode: 'lines',
                      name: 'Failed Requests',
                      line: { color: '#FF0000' }  // red
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
                            count: 1,
                            label: '1d',
                            step: 'day',
                            stepmode: 'backward'
                          },
                          {
                            count: 7,
                            label: '1w',
                            step: 'day',
                            stepmode: 'backward'
                          },
                          {
                            count: 1,
                            label: '1m',
                            step: 'month',
                            stepmode: 'backward'
                          },
                          {
                            step: 'all',
                            label: 'All'
                          }
                        ]
                      },
                      rangeslider: { visible: true },
                      autorange: true,
                      rangemode: 'normal'
                    },
                    yaxis: {
                      title: 'Number of Requests',
                      autorange: true,
                      rangemode: 'normal',
                      fixedrange: false
                    },
                    height: 800,
                    showlegend: true,
                    legend: {
                      y: -0.1,
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
                      line: { color: '#FFC0CB' }  // pink
                    }
                  ];

                  const lineLayout = {
                    title: 'Request Durations Over Time',
                    xaxis: {
                      title: 'Timestamp',
                      rangeselector: {
                        buttons: [
                          {
                            count: 1,
                            label: '1d',
                            step: 'day',
                            stepmode: 'backward'
                          },
                          {
                            count: 7,
                            label: '1w',
                            step: 'day',
                            stepmode: 'backward'
                          },
                          {
                            count: 1,
                            label: '1m',
                            step: 'month',
                            stepmode: 'backward'
                          },
                          {
                            step: 'all',
                            label: 'All'
                          }
                        ]
                      },
                      rangeslider: {},
                      autorange: true,
                      rangemode: 'normal'
                    },
                    yaxis: {
                      title: 'Duration (ms)',
                      autorange: true,
                      rangemode: 'normal',
                      fixedrange: false
                    },
                    height: 800,
                    showlegend: true,
                    legend: {
                      y: -0.1,
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
                      color: ${JSON.stringify(nodeIds.map(id => id === fallbackUrl ? '#FFC0CB' : '#1f77b4'))}  // Pink for fallback, Blue for others
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
                      // Calculate range from all data points' 5th and 95th percentiles
                      range: [
                        Math.min(...boxPlotData.map(d => d.lowerfence[0])) * 0.95,  // Add small buffer
                        Math.max(...boxPlotData.map(d => d.upperfence[0])) * 1.05   // Add small buffer
                      ],
                      autorange: false  // Force our custom range
                    },
                    xaxis: {
                      tickangle: 45
                    },
                    height: 800,
                    margin: {
                      b: 150
                    },
                    showlegend: false,
                  };

                  Plotly.newPlot('boxChart', boxPlotData, boxLayout);

                  // Request Host box plot
                  const reqHostBoxPlotData = ${JSON.stringify(reqHostBoxPlotData)};
                  const reqHostBoxLayout = {
                    title: 'Request Duration Distribution by Host',
                    yaxis: {
                      title: 'Duration (ms)',
                      range: [
                        Math.min(...reqHostBoxPlotData.map(d => d.lowerfence[0])) * 0.95,
                        Math.max(...reqHostBoxPlotData.map(d => d.upperfence[0])) * 1.05
                      ],
                      autorange: false
                    },
                    xaxis: {
                      tickangle: 45
                    },
                    height: 800,
                    margin: {
                      b: 200
                    },
                    showlegend: false
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
                      range: [
                        Math.min(...methodBoxPlotData.map(d => d.lowerfence[0])) * 0.95,
                        Math.max(...methodBoxPlotData.map(d => d.upperfence[0])) * 1.05
                      ],
                      autorange: false
                    },
                    xaxis: {
                      tickangle: 45
                    },
                    height: 800,
                    margin: {
                      b: 200
                    },
                    showlegend: false,
                  };

                  Plotly.newPlot('methodBoxChart', methodBoxPlotData, methodBoxLayout);

                } catch (error) {
                  console.error('Error creating plots:', error);
                }
              </script>
              <script>
                // Initialize variables
                const logEntries = ${JSON.stringify(logEntries)};
                let filteredEntries = [...logEntries];
                let successFilter = null;  // null means show all
                const entriesPerPage = 30;
                let currentPage = 1;

                function filterBySuccess(success) {
                  console.log('Filter value:', success);
                  successFilter = success;
                  currentPage = 1;
                  
                  // Update button styles
                  document.querySelectorAll('.filter-btn').forEach(btn => btn.classList.remove('active'));
                  document.querySelector(\`button[onclick="filterBySuccess(\${success === null ? 'null' : success})"]\`).classList.add('active');
                  
                  // Apply both search and success filters
                  applyFilters();
                }

                function applyFilters() {
                  const searchTerm = document.getElementById('searchBox').value.toLowerCase();
                  
                  filteredEntries = logEntries.filter(entry => {
                    const matchesSearch = 
                      entry.utcTimestamp.toLowerCase().includes(searchTerm) ||
                      entry.reqHost.toLowerCase().includes(searchTerm) ||
                      entry.peerId.toLowerCase().includes(searchTerm) ||
                      entry.method.toLowerCase().includes(searchTerm) ||
                      entry.params.toLowerCase().includes(searchTerm) ||
                      entry.messageId.toLowerCase().includes(searchTerm);
                      
                    const matchesSuccess = successFilter === null || entry.success === successFilter;
                    console.log('Entry success:', entry.success, 'Filter:', successFilter, 'Matches:', matchesSuccess);
                    
                    return matchesSearch && matchesSuccess;
                  });
                  
                  renderTable();
                }

                function renderTable() {
                  const start = (currentPage - 1) * entriesPerPage;
                  const end = start + entriesPerPage;
                  const currentEntries = [...filteredEntries]
                    .reverse()
                    .slice(start, end);

                  const tbody = document.querySelector('#logTable tbody');
                  tbody.innerHTML = currentEntries.map(entry => \`
                      <tr style="background-color: \${entry.success ? 'transparent' : '#ffe6e6'}">
                        <td>\${entry.utcTimestamp || ''}</td>
                        <td>\${entry.reqHost || ''}</td>
                        <td>\${entry.peerId || ''}</td>
                        <td>\${entry.method || ''}</td>
                        <td>\${entry.params || ''}</td>
                        <td>\${typeof entry.duration === 'number' ? entry.duration.toFixed(3) : ''}</td>
                        <td>\${entry.messageId || ''}</td>
                      </tr>
                  \`).join('');

                  document.getElementById('pageInfo').textContent = \`Page \${currentPage} of \${Math.ceil(filteredEntries.length / entriesPerPage)}\`;
                  
                  // Update button states
                  const prevButton = document.querySelector('button[onclick="prevPage()"]');
                  const nextButton = document.querySelector('button[onclick="nextPage()"]');
                  if (prevButton) prevButton.disabled = currentPage === 1;
                  if (nextButton) nextButton.disabled = currentPage >= Math.ceil(filteredEntries.length / entriesPerPage);
                }

                function prevPage() {
                  if (currentPage > 1) {
                    currentPage--;
                    renderTable();
                  }
                }

                function nextPage() {
                  const maxPage = Math.ceil(filteredEntries.length / entriesPerPage);
                  if (currentPage < maxPage) {
                    currentPage++;
                    renderTable();
                  }
                }

                document.getElementById('searchBox').addEventListener('input', function(e) {
                  currentPage = 1;
                  applyFilters();
                });

                // Initial render
                renderTable();

                // Make sure these functions are available in the global scope
                window.prevPage = prevPage;
                window.nextPage = nextPage;
              </script>
              <script>
                // Initialize variables
                const hostNames = ${JSON.stringify(hostNames)};
                const hostCounts = ${JSON.stringify(hostCounts)};
                const reqHostBoxPlotData = ${JSON.stringify(reqHostBoxPlotData)};

                // Define layout variables
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

                const reqHostBoxLayout = {
                  title: 'Request Duration Distribution by Host',
                  yaxis: {
                    title: 'Duration (ms)',
                    range: [
                      Math.min(...reqHostBoxPlotData.map(d => d.lowerfence[0])) * 0.95,
                      Math.max(...reqHostBoxPlotData.map(d => d.upperfence[0])) * 1.05
                    ],
                    autorange: false
                  },
                  xaxis: {
                    tickangle: 45
                  },
                  height: 800,
                  margin: {
                    b: 200
                  },
                  showlegend: false
                };

                function filterHostPlots() {
                  const minRequests = parseInt(document.getElementById('hostRequestFilter').value, 10) || 0;

                  // Filter host data based on the minimum number of requests
                  const filteredHostNames = hostNames.filter((host, index) => hostCounts[index] >= minRequests);
                  const filteredHostCounts = hostCounts.filter(count => count >= minRequests);
                  const filteredReqHostBoxPlotData = reqHostBoxPlotData.filter(data => filteredHostNames.includes(data.name));

                  // Redraw the host bar chart
                  Plotly.react('hostBarChart', [{
                    x: filteredHostNames,
                    y: filteredHostCounts,
                    type: 'bar',
                    name: 'Requests'
                  }], hostBarLayout);

                  // Redraw the request host box plot
                  Plotly.react('reqHostBoxChart', filteredReqHostBoxPlotData, reqHostBoxLayout);
                }
              </script>
            </body>
          </html>
        `);
      } finally {
        client.release();
      }
    } catch (error) {
      console.error('Error processing data:', error);
      res.status(500).send(`Error processing data: ${error.message}`);
    }
  });
});

module.exports = router;