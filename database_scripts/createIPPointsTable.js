const { Pool } = require('pg');
const { SecretsManagerClient, GetSecretValueCommand } = require("@aws-sdk/client-secrets-manager");
const { dbHost } = require('../config');
require('dotenv').config();
const readline = require('readline');

async function createPointsTable() {
  console.log("Preparing to create/reset ip_points table...");

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  const confirmation = await new Promise(resolve => {
    rl.question('Are you sure you want to create/reset the ip_points table? (yes/no): ', answer => {
      resolve(answer.toLowerCase());
      rl.close();
    });
  });

  if (confirmation !== 'yes') {
    console.log('Operation cancelled.');
    return;
  }

  console.log("Proceeding with table creation/reset...");

  const secret_name = process.env.RDS_SECRET_NAME;
  const client = new SecretsManagerClient({ 
    region: "us-east-1",
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
    }
  });

  let pool;

  try {
    const response = await client.send(
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

    const dropTableQuery = `
      DROP TABLE IF EXISTS ip_points;
    `;

    const createTableQuery = `
      CREATE TABLE ip_points (
        ip_address VARCHAR(45) PRIMARY KEY,
        points BIGINT DEFAULT 0
      );
    `;

    try {
      const dbClient = await pool.connect();
      try {
        // Drop the existing table
        await dbClient.query(dropTableQuery);
        console.log("Existing ip_points table dropped (if it existed)");

        // Create the new table
        await dbClient.query(createTableQuery);
        console.log("ip_points table created successfully with BIGINT points column");
      } finally {
        dbClient.release();
      }
    } catch (err) {
      console.error('Error recreating ip_points table:', err);
    } finally {
      await pool.end();
    }
  } catch (err) {
    console.error('Error creating ip_points table:', err);
  }
}

createPointsTable();