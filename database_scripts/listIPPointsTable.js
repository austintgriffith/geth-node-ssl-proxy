const { Pool } = require('pg');
const { SecretsManagerClient, GetSecretValueCommand } = require("@aws-sdk/client-secrets-manager");
const { dbHost } = require('../config');
require('dotenv').config();

async function listPointsTable() {
  console.log("Listing ip_points table...");

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
      host: dbHost,
      user: secret.username,
      password: secret.password,
      database: secret.dbname || 'postgres',
      port: 5432,
      ssl: {
        rejectUnauthorized: false
      }
    };

    pool = new Pool(dbConfig);

    const client = await pool.connect();
    try {
      const result = await client.query('SELECT ip_address, points::bigint FROM ip_points ORDER BY points DESC');
      console.log("ip_points table contents:");
      console.table(result.rows.map(row => ({
        ip_address: row.ip_address,
        points: BigInt(row.points) // Ensure it's treated as a BigInt in JavaScript
      })));
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('Error listing ip_points table:', err);
  } finally {
    if (pool) {
      await pool.end();
    }
  }
}

listPointsTable();