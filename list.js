const { SecretsManagerClient, GetSecretValueCommand } = require("@aws-sdk/client-secrets-manager");
const { Pool } = require('pg');
require('dotenv').config();

async function initializeDbConnection() {
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

    return new Pool(dbConfig);
  } catch (error) {
    console.error("Error initializing database connection:", error);
    throw error;
  }
}

async function listTables() {
  console.log("Listing database tables...");

  let pool;
  try {
    pool = await initializeDbConnection();

    const query = `
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      ORDER BY table_name;
    `;

    const result = await pool.query(query);
    const tables = result.rows.map(row => row.table_name);

    console.log("Database Tables:");
    tables.forEach((table, index) => {
      console.log(`${index + 1}. ${table}`);
    });
  } catch (err) {
    console.error('Error listing database tables:', err);
  } finally {
    if (pool) {
      await pool.end();
    }
  }
}

listTables();