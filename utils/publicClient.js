const { createPublicClient, http } = require('viem');
const { mainnet } = require('viem/chains');
const { fallbackUrl } = require('../config.js');

const publicClient = createPublicClient({
  chain: mainnet,
  transport: http(fallbackUrl)
});

module.exports = publicClient;