const { getDbPool } = require('./dbUtils');
const { getIpLocation } = require('./getIpLocation');

async function handleWebSocketCheckin(ws, message) {
  const checkinData = JSON.parse(message);
  const logMessages = [];

  logMessages.push(`WebSocket CHECKIN`);
  logMessages.push(`Check-in data: ${JSON.stringify(checkinData)}`);

  getDbPool().then(async (pool) => {
    const client = await pool.connect();
    try {
      const {
        id,
        node_version,
        execution_client,
        consensus_client,
        cpu_usage,
        memory_usage,
        storage_usage,
        block_number,
        block_hash,
        execution_peers,
        consensus_peers,
        git_branch,
        last_commit,
        commit_hash,
        enode,
        peerid,
        consensus_tcp_port,
        consensus_udp_port,
        enr,
        socket_id,
        owner
      } = checkinData;

      // Parse numeric values
      const parsedCpuUsage = parseFloat(cpu_usage) || null;
      const parsedMemoryUsage = parseFloat(memory_usage) || null;
      const parsedStorageUsage = parseFloat(storage_usage) || null;
      const parsedBlockNumber = block_number ? BigInt(block_number) : null;
      const parsedExecutionPeers = parseInt(execution_peers) || null;
      const parsedConsensusPeers = parseInt(consensus_peers) || null;
      const parsedConsensusTcpPort = parseInt(consensus_tcp_port) || null;
      const parsedConsensusUdpPort = parseInt(consensus_udp_port) || null;

      const decodedPeerID = peerid ? decodeURIComponent(peerid) : null;
      const decodedENR = enr ? decodeURIComponent(enr) : null;

      // Get the client's IP address from the WebSocket connection
      const ip_address = ws._socket.remoteAddress.replace(/^::ffff:/, '');
      const currentEpoch = Math.floor(Date.now() / 1000);

      // Query existing record
      const existingRecordQuery = `
        SELECT ip_loc_lookup_epoch, country, country_code, region, city, lat, lon, continent
        FROM node_status
        WHERE id = $1
      `;
      const existingRecord = await client.query(existingRecordQuery, [id]);
      
      // console.log('Existing record:', existingRecord.rows[0]);

      let locationData = null;
      let shouldUpdateLocation = false;

      if (existingRecord.rows.length > 0) {
        const lastLookupEpoch = existingRecord.rows[0].ip_loc_lookup_epoch;
        if (!lastLookupEpoch || (currentEpoch - lastLookupEpoch > 86400)) {
          shouldUpdateLocation = true;
        }
      } else {
        shouldUpdateLocation = true;
      }

      // console.log('Should update location:', shouldUpdateLocation);

      if (shouldUpdateLocation) {
        locationData = await getIpLocation(ip_address);
        console.log('New location data:', locationData);
        logMessages.push(`Updated location data for IP: ${ip_address}`);
      } else {
        logMessages.push(`Using existing location data for IP: ${ip_address}`);
      }

      // Prepare location-related parameters
      const locationParams = shouldUpdateLocation && locationData ? [
        locationData.country,
        locationData.countryCode,
        locationData.region,
        locationData.city,
        locationData.lat,
        locationData.lon,
        currentEpoch,
        locationData.continent
      ] : [
        existingRecord.rows[0].country,
        existingRecord.rows[0].country_code,
        existingRecord.rows[0].region,
        existingRecord.rows[0].city,
        existingRecord.rows[0].lat,
        existingRecord.rows[0].lon,
        existingRecord.rows[0].ip_loc_lookup_epoch,
        existingRecord.rows[0].continent
      ];

      // console.log('Location params:', locationParams);

      // Modify the upsert query to ensure continent is treated as text
      const upsertQuery = `
        INSERT INTO node_status (
          id, node_version, execution_client, consensus_client, 
          cpu_usage, memory_usage, storage_usage, block_number, block_hash, last_checkin, ip_address, execution_peers, consensus_peers,
          git_branch, last_commit, commit_hash, enode, peerid, consensus_tcp_port, consensus_udp_port, enr, socket_id, owner,
          country, country_code, region, city, lat, lon, ip_loc_lookup_epoch, continent
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, CURRENT_TIMESTAMP, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30)
        ON CONFLICT (id) DO UPDATE SET
          node_version = EXCLUDED.node_version,
          execution_client = EXCLUDED.execution_client,
          consensus_client = EXCLUDED.consensus_client,
          cpu_usage = EXCLUDED.cpu_usage,
          memory_usage = EXCLUDED.memory_usage,
          storage_usage = EXCLUDED.storage_usage,
          block_number = EXCLUDED.block_number,
          block_hash = EXCLUDED.block_hash,
          last_checkin = CURRENT_TIMESTAMP,
          ip_address = EXCLUDED.ip_address,
          execution_peers = EXCLUDED.execution_peers,
          consensus_peers = EXCLUDED.consensus_peers,
          git_branch = EXCLUDED.git_branch,
          last_commit = EXCLUDED.last_commit,
          commit_hash = EXCLUDED.commit_hash,
          enode = EXCLUDED.enode,
          peerid = EXCLUDED.peerid,
          consensus_tcp_port = EXCLUDED.consensus_tcp_port,
          consensus_udp_port = EXCLUDED.consensus_udp_port,
          enr = EXCLUDED.enr,
          socket_id = EXCLUDED.socket_id,
          owner = EXCLUDED.owner,
          country = COALESCE(EXCLUDED.country, node_status.country),
          country_code = COALESCE(EXCLUDED.country_code, node_status.country_code),
          region = COALESCE(EXCLUDED.region, node_status.region),
          city = COALESCE(EXCLUDED.city, node_status.city),
          lat = COALESCE(EXCLUDED.lat, node_status.lat),
          lon = COALESCE(EXCLUDED.lon, node_status.lon),
          ip_loc_lookup_epoch = COALESCE(EXCLUDED.ip_loc_lookup_epoch, node_status.ip_loc_lookup_epoch),
          continent = COALESCE(EXCLUDED.continent, node_status.continent)
      `;

      const queryParams = [
        id, node_version, execution_client, consensus_client,
        parsedCpuUsage, parsedMemoryUsage, parsedStorageUsage, parsedBlockNumber, block_hash, ip_address, parsedExecutionPeers, parsedConsensusPeers,
        git_branch, last_commit, commit_hash, enode, decodedPeerID, parsedConsensusTcpPort, parsedConsensusUdpPort, decodedENR, socket_id, owner,
        locationParams[0], // country
        locationParams[1], // country_code
        locationParams[2], // region
        locationParams[3], // city
        locationParams[4], // lat
        locationParams[5], // lon
        locationParams[6], // ip_loc_lookup_epoch
        locationParams[7]  // continent
      ];

      const result = await client.query(upsertQuery, queryParams);
      logMessages.push(`Rows affected: ${result.rowCount}`);

      if (shouldUpdateLocation && locationData) {
        logMessages.push(`Country: ${locationData.country}, Region: ${locationData.region}, City: ${locationData.city}, Continent: ${locationData.continent}`);
        logMessages.push(`IP location lookup epoch: ${currentEpoch}`);
      }
    } catch (err) {
      console.error('Error in WebSocket checkin:', err);
      logMessages.push('Error updating node status:', err.message);
      ws.send(JSON.stringify({ error: "An error occurred during check-in", messages: logMessages }));
    } finally {
      client.release();
    }
  }).catch(err => {
    console.error('Error getting DB pool:', err);
    ws.send(JSON.stringify({ error: "Database connection error" }));
  });
}

module.exports = { handleWebSocketCheckin };