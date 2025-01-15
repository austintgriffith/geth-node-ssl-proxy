const express = require('express');
const { pendingMessageChecks } = require('../globalState');

const router = express.Router();

router.get('/listpendingmessagechecks', (req, res) => {
    const pendingChecks = [];
    
    // Convert Map entries to array for display
    for (const [messageId, data] of pendingMessageChecks) {
        pendingChecks.push({
            messageId,
            peerId: data.peerId,
            responseHash: data.responseHash
        });
    }

    // Return HTML response
    res.send(`
        <html>
            <head>
                <title>Pending Message Checks</title>
                <style>
                    body {
                        font-family: Arial, sans-serif;
                        margin: 20px;
                        background: #f5f5f5;
                    }
                    h1 {
                        color: #333;
                    }
                    .checks {
                        background: white;
                        border-radius: 8px;
                        padding: 20px;
                        box-shadow: 0 2px 4px rgba(0,0,0,0.1);
                    }
                    table {
                        width: 100%;
                        border-collapse: collapse;
                        margin-top: 20px;
                    }
                    th, td {
                        padding: 12px;
                        text-align: left;
                        border-bottom: 1px solid #ddd;
                    }
                    th {
                        background: #f8f9fa;
                        font-weight: bold;
                    }
                    tr:hover {
                        background: #f8f9fa;
                    }
                    .empty {
                        text-align: center;
                        padding: 20px;
                        color: #666;
                    }
                </style>
            </head>
            <body>
                <h1>Pending Message Checks</h1>
                <div class="checks">
                    ${pendingChecks.length > 0 ? `
                        <table>
                            <tr>
                                <th>Message ID</th>
                                <th>Peer ID</th>
                                <th>Response Hash</th>
                            </tr>
                            ${pendingChecks.map(check => `
                                <tr>
                                    <td>${check.messageId}</td>
                                    <td>${check.peerId}</td>
                                    <td>${check.responseHash}</td>
                                </tr>
                            `).join('')}
                        </table>
                    ` : `
                        <div class="empty">No pending message checks found</div>
                    `}
                </div>
            </body>
        </html>
    `);
});

module.exports = router;
