const { Pool } = require('pg');
const { SecretsManagerClient, GetSecretValueCommand } = require("@aws-sdk/client-secrets-manager");
const { dbHost } = require('../config');
require('dotenv').config();

async function assignPoints() {
  console.log("Assigning points to active node owners...");

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

    const dbClient = await pool.connect();
    try {
      // Get active nodes and their owners from the last 5 minutes
      const activeNodesQuery = `
        SELECT owner, COUNT(*) as active_count
        FROM node_status
        WHERE last_checkin > NOW() - INTERVAL '5 minutes'
          AND owner IS NOT NULL
        GROUP BY owner;
      `;
      const activeNodesResult = await dbClient.query(activeNodesQuery);
      const activeOwners = activeNodesResult.rows;

      // Update points for active owners
      const updatePointsQuery = `
        INSERT INTO owner_points (owner, points)
        VALUES ($1, $2::BIGINT)
        ON CONFLICT (owner)
        DO UPDATE SET points = owner_points.points + $2::BIGINT;
      `;

      for (const { owner, active_count } of activeOwners) {
        if (owner) {
          await dbClient.query(updatePointsQuery, [owner, active_count]);
          console.log(`Assigned ${active_count} points to owner: ${owner}`);
        } else {
          console.log(`Skipped assigning ${active_count} points due to null owner`);
        }
      }

      console.log(`Points assigned to ${activeOwners.length} active owners.`);
    } finally {
      dbClient.release();
    }
  } catch (err) {
    console.error('Error assigning points:', err);
  } finally {
    if (pool) {
      await pool.end();
    }
  }
}

assignPoints();