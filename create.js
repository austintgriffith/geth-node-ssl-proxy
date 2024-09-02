const { Pool } = require('pg');
const { SecretsManagerClient, GetSecretValueCommand } = require("@aws-sdk/client-secrets-manager");
require('dotenv').config();

async function createTables() {
  console.log("Creating/updating tables...");

  const secret_name = process.env.RDS_SECRET_NAME;
  const secretsClient = new SecretsManagerClient({ 
    region: "us-east-1",
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
    }
  });

  let pool;

  try {
    const response = await secretsClient.send(
      new GetSecretValueCommand({
        SecretId: secret_name,
        VersionStage: "AWSCURRENT",
      })
    );
    const secret = JSON.parse(response.SecretString);

    const dbConfig = {
      host: 'bgclientdb.cluster-cjoo0gi8an8c.us-east-1.rds.amazonaws.com',
      user: secret.username,
      password: secret.password,
      database: secret.dbname || 'postgres',
      port: 5432,
      ssl: {
        rejectUnauthorized: false
      }
    };

    pool = new Pool(dbConfig);

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
        execution_peers BIGINT,
        consensus_peers BIGINT
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

    const addExecutionPeersColumnQuery = `
      DO $$ 
      BEGIN 
        IF NOT EXISTS (
          SELECT FROM information_schema.columns 
          WHERE table_name = 'node_status' AND column_name = 'execution_peers'
        ) THEN 
          ALTER TABLE node_status 
          ADD COLUMN execution_peers BIGINT;
        END IF; 
      END $$;
    `;

    const addConsensusPeersColumnQuery = `
      DO $$ 
      BEGIN 
        IF NOT EXISTS (
          SELECT FROM information_schema.columns 
          WHERE table_name = 'node_status' AND column_name = 'consensus_peers'
        ) THEN 
          ALTER TABLE node_status 
          ADD COLUMN consensus_peers BIGINT;
        END IF; 
      END $$;
    `;

    const removePeerCountColumnQuery = `
      DO $$ 
      BEGIN 
        IF EXISTS (
          SELECT FROM information_schema.columns 
          WHERE table_name = 'node_status' AND column_name = 'peer_count'
        ) THEN 
          ALTER TABLE node_status 
          DROP COLUMN peer_count;
        END IF; 
      END $$;
    `;

    const client = await pool.connect();
    try {
      await client.query(createTableQuery);
      await client.query(addLastCheckinColumnQuery);
      await client.query(addIpAddressColumnQuery);
      await client.query(addExecutionPeersColumnQuery);
      await client.query(addConsensusPeersColumnQuery);
      await client.query(removePeerCountColumnQuery);
      console.log("Tables created/updated successfully");
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('Error creating/updating tables:', err);
  } finally {
    if (pool) {
      await pool.end();
    }
  }
}

createTables();