const { Pool } = require('pg');
const { SecretsManagerClient, GetSecretValueCommand } = require("@aws-sdk/client-secrets-manager");
require('dotenv').config();
const readline = require('readline');

async function createRequestHostTable() {
  console.log("Preparing to create/reset request_host table...");

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  const confirmation = await new Promise(resolve => {
    rl.question('Are you sure you want to create/reset the request_host table? (yes/no): ', answer => {
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

    const dropTableQuery = `
      DROP TABLE IF EXISTS request_host;
    `;

    const createTableQuery = `
      CREATE TABLE request_host (
        host VARCHAR(255) PRIMARY KEY,
        n_requests INTEGER DEFAULT 0
      );
    `;

    try {
      const dbClient = await pool.connect();
      try {
        // Drop the existing table
        await dbClient.query(dropTableQuery);
        console.log("Existing request_host table dropped (if it existed)");

        // Create the new table
        await dbClient.query(createTableQuery);
        console.log("request_host table created successfully with host and n_requests columns");
      } finally {
        dbClient.release();
      }
    } catch (err) {
      console.error('Error recreating request_host table:', err);
    } finally {
      await pool.end();
    }
  } catch (err) {
    console.error('Error creating request_host table:', err);
  }
}

createRequestHostTable();

