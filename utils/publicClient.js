const { createPublicClient, http } = require('viem');
const { mainnet } = require('viem/chains');
const { localProviderUrl } = require('../config.js');

const publicClient = createPublicClient({
  chain: mainnet,
  transport: http(localProviderUrl)
});

module.exports = publicClient;