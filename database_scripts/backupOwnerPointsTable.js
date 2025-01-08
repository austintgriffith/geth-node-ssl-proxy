const { getDbPool } = require('../utils/dbUtils');
const fs = require('fs');
require('dotenv').config();

async function backupOwnerPointsTable() {
  console.log("Backing up owner_points table...");

  let pool;
  try {
    pool = await getDbPool();
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
