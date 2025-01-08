const { Pool } = require('pg');
const { SecretsManagerClient, GetSecretValueCommand } = require("@aws-sdk/client-secrets-manager");
const { dbHost } = require('../config');
const fs = require('fs');
require('dotenv').config();

async function backupOwnerPointsTable() {
  console.log("Backing up owner_points table...");

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
      const result = await client.query('SELECT owner, points::bigint FROM owner_points ORDER BY points DESC');
      
      const timestamp = new Date().toUTCString();
      let newBackupContent = `Owner Points Table Backup - ${timestamp}\n`;
      newBackupContent += "===============================================\n\n";
      newBackupContent += "Owner".padEnd(50) + "Points\n";
      newBackupContent += "=".repeat(60) + "\n";

      result.rows.forEach(row => {
        newBackupContent += `${row.owner.padEnd(50)}${row.points}\n`;
      });

      newBackupContent += "\n\n\n\n";  // Add some space between backups

      // Read existing content (if any)
      let existingContent = '';
      if (fs.existsSync('ownerPointsTableBackup.txt')) {
        existingContent = fs.readFileSync('ownerPointsTableBackup.txt', 'utf8');
      }

      // Combine new content with existing content
      const updatedContent = newBackupContent + existingContent;

      // Write the combined content back to the file
      fs.writeFileSync('ownerPointsTableBackup.txt', updatedContent);

      console.log("Backup appended to ownerPointsTableBackup.txt");
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('Error backing up owner_points table:', err);
  } finally {
    if (pool) {
      await pool.end();
    }
  }
}

backupOwnerPointsTable();
