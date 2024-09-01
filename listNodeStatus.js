const { Pool } = require('pg');
const { SecretsManagerClient, GetSecretValueCommand } = require("@aws-sdk/client-secrets-manager");
require('dotenv').config();

async function listNodeStatus() {
  console.log("Listing node_status table...");

  const secret_name = process.env.RDS_SECRET_NAME;
  if (!secret_name) {
    console.error("RDS_SECRET_NAME is not set in the environment variables.");
    return;
  }

  const secretsClient = new SecretsManagerClient({ 
    region: "us-east-1",
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
    }
  });

  let pool;

  try {
    console.log("Fetching secret from AWS Secrets Manager...");
    const response = await secretsClient.send(
      new GetSecretValueCommand({
        SecretId: secret_name,
        VersionStage: "AWSCURRENT",
      })
    );
    const secret = JSON.parse(response.SecretString);

    console.log("Creating database connection pool...");
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

    console.log("Connecting to database...");
    const client = await pool.connect();
    try {
      console.log("Executing query...");
      const result = await client.query('SELECT * FROM node_status');
      console.log("node_status table contents:");
      console.table(result.rows);
    } finally {
      console.log("Releasing database client...");
      client.release();
    }
  } catch (err) {
    console.error('Error listing node_status table:', err);
  } finally {
    if (pool) {
      console.log("Ending database pool...");
      await pool.end();
    }
  }
}

listNodeStatus().catch(err => {
  console.error("Unhandled error in listNodeStatus:", err);
});