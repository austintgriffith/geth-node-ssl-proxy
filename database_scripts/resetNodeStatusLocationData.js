const { Pool } = require('pg');
const { SecretsManagerClient, GetSecretValueCommand } = require("@aws-sdk/client-secrets-manager");
const { dbHost } = require('../config');
require('dotenv').config();

async function resetNodeStatusLocationData() {
  console.log("Resetting location data in node_status table...");

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
      const resetQuery = `
        UPDATE node_status
        SET country = NULL,
            country_code = NULL,
            region = NULL,
            city = NULL,
            lat = NULL,
            lon = NULL,
            ip_loc_lookup_epoch = NULL,
            continent = NULL;
      `;

      await client.query(resetQuery);
      console.log("Location data in node_status table has been reset to NULL.");
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('Error resetting location data in node_status table:', err);
  } finally {
    if (pool) {
      await pool.end();
    }
  }
}

resetNodeStatusLocationData();
