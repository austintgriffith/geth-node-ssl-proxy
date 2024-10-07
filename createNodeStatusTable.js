const { Pool } = require('pg');
const { SecretsManagerClient, GetSecretValueCommand } = require("@aws-sdk/client-secrets-manager");
require('dotenv').config();

const removeMultiAddrColumnQuery = `
  DO $$ 
  BEGIN 
    IF EXISTS (
      SELECT FROM information_schema.columns 
      WHERE table_name = 'node_status' AND column_name = 'multi_addr'
    ) THEN 
      ALTER TABLE node_status 
      DROP COLUMN multi_addr;
    END IF; 
  END $$;
`;

const addSocketIdColumnQuery = `
  DO $$ 
  BEGIN 
    IF NOT EXISTS (
      SELECT FROM information_schema.columns 
      WHERE table_name = 'node_status' AND column_name = 'socket_id'
    ) THEN 
      ALTER TABLE node_status 
      ADD COLUMN socket_id VARCHAR(255);
    END IF; 
  END $$;
`;

const addNRpcRequestsColumnQuery = `
  DO $$ 
  BEGIN 
    IF NOT EXISTS (
      SELECT FROM information_schema.columns 
      WHERE table_name = 'node_status' AND column_name = 'n_rpc_requests'
    ) THEN 
      ALTER TABLE node_status 
      ADD COLUMN n_rpc_requests INTEGER;
    END IF; 
  END $$;
`;

const addCountryColumnQuery = `
  DO $$ 
  BEGIN 
    IF NOT EXISTS (
      SELECT FROM information_schema.columns 
      WHERE table_name = 'node_status' AND column_name = 'country'
    ) THEN 
      ALTER TABLE node_status 
      ADD COLUMN country VARCHAR(255);
    END IF; 
  END $$;
`;

const addCountryCodeColumnQuery = `
  DO $$ 
  BEGIN 
    IF NOT EXISTS (
      SELECT FROM information_schema.columns 
      WHERE table_name = 'node_status' AND column_name = 'country_code'
    ) THEN 
      ALTER TABLE node_status 
      ADD COLUMN country_code VARCHAR(10);
    END IF; 
  END $$;
`;

const addRegionColumnQuery = `
  DO $$ 
  BEGIN 
    IF NOT EXISTS (
      SELECT FROM information_schema.columns 
      WHERE table_name = 'node_status' AND column_name = 'region'
    ) THEN 
      ALTER TABLE node_status 
      ADD COLUMN region VARCHAR(255);
    END IF; 
  END $$;
`;

const addCityColumnQuery = `
  DO $$ 
  BEGIN 
    IF NOT EXISTS (
      SELECT FROM information_schema.columns 
      WHERE table_name = 'node_status' AND column_name = 'city'
    ) THEN 
      ALTER TABLE node_status 
      ADD COLUMN city VARCHAR(255);
    END IF; 
  END $$;
`;

const addLatColumnQuery = `
  DO $$ 
  BEGIN 
    IF NOT EXISTS (
      SELECT FROM information_schema.columns 
      WHERE table_name = 'node_status' AND column_name = 'lat'
    ) THEN 
      ALTER TABLE node_status 
      ADD COLUMN lat FLOAT;
    END IF; 
  END $$;
`;

const addLonColumnQuery = `
  DO $$ 
  BEGIN 
    IF NOT EXISTS (
      SELECT FROM information_schema.columns 
      WHERE table_name = 'node_status' AND column_name = 'lon'
    ) THEN 
      ALTER TABLE node_status 
      ADD COLUMN lon FLOAT;
    END IF; 
  END $$;
`;

const renameSecSinceIpLocColumnQuery = `
  DO $$
  BEGIN
    IF EXISTS (
      SELECT FROM information_schema.columns 
      WHERE table_name = 'node_status' AND column_name = 'sec_since_ip_loc'
    ) AND NOT EXISTS (
      SELECT FROM information_schema.columns 
      WHERE table_name = 'node_status' AND column_name = 'ip_loc_lookup_epoch'
    ) THEN
      ALTER TABLE node_status
      RENAME COLUMN sec_since_ip_loc TO ip_loc_lookup_epoch;
    END IF;
  END $$;
`;

const removeSecSinceIpLocColumnQuery = `
  DO $$ 
  BEGIN 
    IF EXISTS (
      SELECT FROM information_schema.columns 
      WHERE table_name = 'node_status' AND column_name = 'sec_since_ip_loc'
    ) THEN 
      ALTER TABLE node_status 
      DROP COLUMN sec_since_ip_loc;
    END IF; 
  END $$;
`;

const addContinentColumnQuery = `
  DO $$ 
  BEGIN 
    IF NOT EXISTS (
      SELECT FROM information_schema.columns 
      WHERE table_name = 'node_status' AND column_name = 'continent'
    ) THEN 
      ALTER TABLE node_status 
      ADD COLUMN continent VARCHAR(255);
    END IF; 
  END $$;
`;

const addOwnerColumnQuery = `
  DO $$ 
  BEGIN 
    IF NOT EXISTS (
      SELECT FROM information_schema.columns 
      WHERE table_name = 'node_status' AND column_name = 'owner'
    ) THEN 
      ALTER TABLE node_status 
      ADD COLUMN owner VARCHAR(255);
    END IF; 
  END $$;
`;

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
  let client;

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

    const addGitBranchColumnQuery = `
      DO $$ 
      BEGIN 
        IF NOT EXISTS (
          SELECT FROM information_schema.columns 
          WHERE table_name = 'node_status' AND column_name = 'git_branch'
        ) THEN 
          ALTER TABLE node_status 
          ADD COLUMN git_branch VARCHAR(255);
        END IF; 
      END $$;
    `;

    const addLastCommitColumnQuery = `
      DO $$ 
      BEGIN 
        IF NOT EXISTS (
          SELECT FROM information_schema.columns 
          WHERE table_name = 'node_status' AND column_name = 'last_commit'
        ) THEN 
          ALTER TABLE node_status 
          ADD COLUMN last_commit VARCHAR(40);
        END IF; 
      END $$;
    `;

    const addCommitHashColumnQuery = `
      DO $$ 
      BEGIN 
        IF NOT EXISTS (
          SELECT FROM information_schema.columns 
          WHERE table_name = 'node_status' AND column_name = 'commit_hash'
        ) THEN 
          ALTER TABLE node_status 
          ADD COLUMN commit_hash VARCHAR(40);
        END IF; 
      END $$;
    `;

    const addEnodeColumnQuery = `
      DO $$ 
      BEGIN 
        IF NOT EXISTS (
          SELECT FROM information_schema.columns 
          WHERE table_name = 'node_status' AND column_name = 'enode'
        ) THEN 
          ALTER TABLE node_status 
          ADD COLUMN enode VARCHAR(255);
        END IF; 
      END $$;
    `;

    const addPeerIDColumnQuery = `
      DO $$ 
      BEGIN 
        IF NOT EXISTS (
          SELECT FROM information_schema.columns 
          WHERE table_name = 'node_status' AND column_name = 'peerid'
        ) THEN 
          ALTER TABLE node_status 
          ADD COLUMN peerID VARCHAR(255);
        END IF; 
      END $$;
    `;

    const addConsensusTcpPortColumnQuery = `
      DO $$ 
      BEGIN 
        IF NOT EXISTS (
          SELECT FROM information_schema.columns 
          WHERE table_name = 'node_status' AND column_name = 'consensus_tcp_port'
        ) THEN 
          ALTER TABLE node_status 
          ADD COLUMN consensus_tcp_port INTEGER;
        END IF; 
      END $$;
    `;

    const addConsensusUdpPortColumnQuery = `
      DO $$ 
      BEGIN 
        IF NOT EXISTS (
          SELECT FROM information_schema.columns 
          WHERE table_name = 'node_status' AND column_name = 'consensus_udp_port'
        ) THEN 
          ALTER TABLE node_status 
          ADD COLUMN consensus_udp_port INTEGER;
        END IF; 
      END $$;
    `;

    const addMultiAddrColumnQuery = `
      DO $$ 
      BEGIN 
        IF NOT EXISTS (
          SELECT FROM information_schema.columns 
          WHERE table_name = 'node_status' AND column_name = 'multi_addr'
        ) THEN 
          ALTER TABLE node_status 
          ADD COLUMN multi_addr TEXT;
        END IF; 
      END $$;
    `;

    const removeMultiAddrColumnQuery = `
      DO $$ 
      BEGIN 
        IF EXISTS (
          SELECT FROM information_schema.columns 
          WHERE table_name = 'node_status' AND column_name = 'multi_addr'
        ) THEN 
          ALTER TABLE node_status 
          DROP COLUMN multi_addr;
        END IF; 
      END $$;
    `;

    const addEnrColumnQuery = `
      DO $$ 
      BEGIN 
        IF NOT EXISTS (
          SELECT FROM information_schema.columns 
          WHERE table_name = 'node_status' AND column_name = 'enr'
        ) THEN 
          ALTER TABLE node_status 
          ADD COLUMN enr TEXT;
        END IF; 
      END $$;
    `;

    const addOwnerColumnQuery = `
      DO $$ 
      BEGIN 
        IF NOT EXISTS (
          SELECT FROM information_schema.columns 
          WHERE table_name = 'node_status' AND column_name = 'owner'
        ) THEN 
          ALTER TABLE node_status 
          ADD COLUMN owner VARCHAR(255);
        END IF; 
      END $$;
    `;

    client = await pool.connect();
    try {
      await client.query(createTableQuery);
      await client.query(addLastCheckinColumnQuery);
      await client.query(addIpAddressColumnQuery);
      await client.query(addExecutionPeersColumnQuery);
      await client.query(addConsensusPeersColumnQuery);
      await client.query(removePeerCountColumnQuery);
      await client.query(addGitBranchColumnQuery);
      await client.query(addLastCommitColumnQuery);
      await client.query(addCommitHashColumnQuery);
      await client.query(addEnodeColumnQuery);
      await client.query(addPeerIDColumnQuery);
      await client.query(addConsensusTcpPortColumnQuery);
      await client.query(addConsensusUdpPortColumnQuery);
      await client.query(removeMultiAddrColumnQuery);
      await client.query(addEnrColumnQuery);
      await client.query(addOwnerColumnQuery);
      await client.query(addSocketIdColumnQuery);
      await client.query(addNRpcRequestsColumnQuery);
      await client.query(addCountryColumnQuery);
      await client.query(addCountryCodeColumnQuery);
      await client.query(addRegionColumnQuery);
      await client.query(addCityColumnQuery);
      await client.query(addLatColumnQuery);
      await client.query(addLonColumnQuery);
      await client.query(renameSecSinceIpLocColumnQuery);
      await client.query(removeSecSinceIpLocColumnQuery);
      await client.query(addContinentColumnQuery);

      const checkColumnQuery = `
        SELECT column_name, data_type, character_maximum_length
        FROM information_schema.columns
        WHERE table_name = 'node_status' AND column_name = 'peerid';
      `;

      const checkColumnResult = await client.query(checkColumnQuery);
      console.log('Existing peerID column:', checkColumnResult.rows[0]);

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