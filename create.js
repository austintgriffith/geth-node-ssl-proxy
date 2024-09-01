const { Pool } = require('pg');

async function createRoute(req, res) {
  console.log("/CREATE", req.headers.referer);

  if (!req.app.locals.pool) {
    return res.status(500).send("Database connection not initialized");
  }

  const createTableQuery = `
    CREATE TABLE IF NOT EXISTS node_status (
      id VARCHAR(255) PRIMARY KEY,
      node_version VARCHAR(50),
      execution_client VARCHAR(100),
      consensus_client VARCHAR(100),
      cpu_usage DECIMAL(5,2),
      memory_usage DECIMAL(5,2),
      storage_usage DECIMAL(5,2),
      block_number BIGINT,
      block_hash VARCHAR(66),
      last_checkin TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      ip_address VARCHAR(45),
      peer_count BIGINT
    );
  `;

  const addLastCheckinColumnQuery = `
    DO $$ 
    BEGIN 
      IF NOT EXISTS (
        SELECT FROM information_schema.columns 
        WHERE table_name = 'node_status' AND column_name = 'last_checkin'
      ) THEN 
        ALTER TABLE node_status 
        ADD COLUMN last_checkin TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
      END IF; 
    END $$;
  `;

  const addIpAddressColumnQuery = `
    DO $$ 
    BEGIN 
      IF NOT EXISTS (
        SELECT FROM information_schema.columns 
        WHERE table_name = 'node_status' AND column_name = 'ip_address'
      ) THEN 
        ALTER TABLE node_status 
        ADD COLUMN ip_address VARCHAR(45);
      END IF; 
    END $$;
  `;

  const addPeerCountColumnQuery = `
    DO $$ 
    BEGIN 
      IF NOT EXISTS (
        SELECT FROM information_schema.columns 
        WHERE table_name = 'node_status' AND column_name = 'peer_count'
      ) THEN 
        ALTER TABLE node_status 
        ADD COLUMN peer_count BIGINT;
      END IF; 
    END $$;
  `;

  try {
    const client = await req.app.locals.pool.connect();
    try {
      await client.query(createTableQuery);
      await client.query(addLastCheckinColumnQuery);
      await client.query(addIpAddressColumnQuery);
      await client.query(addPeerCountColumnQuery);
      res.send(`
        <html>
          <body>
            <div style='padding:20px;font-size:18px'>
              <h1>TABLE CREATED/UPDATED SUCCESSFULLY</h1>
              <p>The 'node_status' table has been created or updated with the 'last_checkin', 'ip_address', and 'peer_count' columns.</p>
            </div>
          </body>
        </html>
      `);
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('Error creating/updating table:', err);
    res.status(500).send(`
      <html>
        <body>
          <div style='padding:20px;font-size:18px'>
            <h1>ERROR CREATING/UPDATING TABLE</h1>
            <p>An error occurred while trying to create or update the 'node_status' table.</p>
            <p>Error: ${err.message}</p>
          </div>
        </body>
      </html>
    `);
  }
}

module.exports = createRoute;