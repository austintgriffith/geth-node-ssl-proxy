const axios = require('axios');

async function getIpLocation(ipAddress) {
  try {
    // const response = await axios.get(`http://ip-api.com/json/${ipAddress}?fields=continent,country,countryCode,region,city,lat,lon`);
    const response = await axios.get(`https://pro.ip-api.com/json/${ipAddress}?fields=continent,country,countryCode,region,city,lat,lon&key=xCoYoyXtdmYbpvJ`);
    console.log('IP API response:', response.data);  // Add this line
    return response.data;
  } catch (error) {
    console.error(`Error fetching location for IP ${ipAddress}:`, error.message);
    return null;
  }
}

module.exports = { getIpLocation };