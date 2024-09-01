const { Pool } = require('pg');
const { SecretsManagerClient, GetSecretValueCommand } = require("@aws-sdk/client-secrets-manager");
require('dotenv').config();

async function assignPoints() {
  console.log("Assigning points to active nodes...");

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

    const dbClient = await pool.connect();
    try {
      // Get active nodes from the last 5 minutes
      const activeNodesQuery = `
        SELECT DISTINCT ip_address
        FROM node_status
        WHERE last_checkin > NOW() - INTERVAL '5 minutes';
      `;
      const activeNodesResult = await dbClient.query(activeNodesQuery);
      const activeIPs = activeNodesResult.rows.map(row => row.ip_address);

      // Update points for active IPs
      const updatePointsQuery = `
        INSERT INTO ip_points (ip_address, points)
        VALUES ($1, 1::BIGINT)
        ON CONFLICT (ip_address)
        DO UPDATE SET points = ip_points.points + 1::BIGINT;
      `;

      for (const ip of activeIPs) {
        await dbClient.query(updatePointsQuery, [ip]);
        console.log(`Assigned 1 point to IP: ${ip}`);
      }

      console.log(`Points assigned to ${activeIPs.length} active IPs.`);
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