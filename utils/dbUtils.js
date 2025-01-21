const { SecretsManagerClient, GetSecretValueCommand } = require("@aws-sdk/client-secrets-manager");
const { Pool } = require('pg');
require('dotenv').config();

let pool;

async function getDbConfig() {
  const secret_name = process.env.RDS_SECRET_NAME;
  const client = new SecretsManagerClient({ 
    region: "us-east-1",
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
    }
  });

  try {
    const response = await client.send(
      new GetSecretValueCommand({
        SecretId: secret_name,
        VersionStage: "AWSCURRENT",
      })
    );
    const secret = JSON.parse(response.SecretString);

    return {
      host: process.env.DB_HOST,
      user: secret.username,
      password: secret.password,
      database: secret.dbname || 'postgres',
      port: 5432,
      ssl: {
        rejectUnauthorized: true,
        ca: require('ssl-root-cas').create().addFile('./rds-ca-2019-root.pem')
      },
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
      maxUses: 7500
    };
  } catch (error) {
    console.error("Error fetching database secret:", error);
    throw error;
  }
}

// RDS certificate downloaded using:
// curl -o rds-ca-2019-root.pem https://truststore.pki.rds.amazonaws.com/global/global-bundle.pem

async function getDbPool() {
  if (!pool) {
    const config = await getDbConfig();
    pool = new Pool({
      ...config,
      // Add connection timeout and retry settings
      connectionTimeoutMillis: 10000, // 10 seconds
      idleTimeoutMillis: 30000, // 30 seconds
      max: 20, // Maximum number of clients in the pool
      retryDelay: 1000, // 1 second delay between retries
      maxRetries: 3 // Maximum number of connection retries
    });

    // Add error handler for the pool
    pool.on('error', (err, client) => {
      console.error('Unexpected error on idle client', err);
      // Attempt to recreate the pool on next request
      pool = null;
    });
  }
  return pool;
}

// Function to safely end the pool - only use in scripts, not in the main application
async function endPool() {
  if (pool && !pool.ended) {
    await pool.end();
  }
}

module.exports = {
  getDbPool,
  endPool
};