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
      }
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
    const dbConfig = await getDbConfig();
    pool = new Pool(dbConfig);
  }
  return pool;
}

module.exports = {
  getDbPool
};