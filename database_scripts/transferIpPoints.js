const { Pool } = require('pg');
const { SecretsManagerClient, GetSecretValueCommand } = require("@aws-sdk/client-secrets-manager");
require('dotenv').config();
const readline = require('readline');

async function transferIpPointsForUser(OWNER, POINTS_TO_ADD) {
  console.log(`Preparing to add ${POINTS_TO_ADD} points to ${OWNER}...`);

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  const confirmation = await new Promise(resolve => {
    rl.question(`Are you sure you want to add ${POINTS_TO_ADD} points to ${OWNER}? (yes/no): `, answer => {
      resolve(answer.toLowerCase());
      rl.close();
    });
  });

  if (confirmation !== 'yes') {
    console.log('Operation cancelled.');
    return;
  }

  console.log("Proceeding with point addition...");

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

    const updatePointsQuery = `
      INSERT INTO owner_points (owner, points)
      VALUES ($1, $2)
      ON CONFLICT (owner)
      DO UPDATE SET points = owner_points.points + $2;
    `;

    try {
      const dbClient = await pool.connect();
      try {
        const result = await dbClient.query(updatePointsQuery, [OWNER, POINTS_TO_ADD]);
        console.log(`Successfully added ${POINTS_TO_ADD} points to ${OWNER}`);
        console.log(`Rows affected: ${result.rowCount}`);
      } finally {
        dbClient.release();
      }
    } catch (err) {
      console.error(`Error updating points for ${OWNER}:`, err);
    } finally {
      await pool.end();
    }
  } catch (err) {
    console.error('Error connecting to the database:', err);
  }
}

// transferIpPointsForUser('', 0);
