///home/ec2-user/go-ethereum/build/bin/geth  --rpcport 48545 --allow-insecure-unlock --cache=4096 --maxpeers=50 --rpc --rpcaddr "0.0.0.0" --rpccorsdomain "*" --rpcapi="db,eth,net,web3,personal,admin,debug,miner,txpool" >> /home/ec2-user/geth.log 2>&1 &
const fs = require('fs')
const { exec } = require('child_process');

console.log("Starting up prysm beaconchain node...")
try{

  exec('prysm/prysm.sh beacon-chain --execution-endpoint=http://localhost:8551 --jwt-secret=/home/ubuntu/geth-node-ssl-proxy/prysm/jwt.hex >> ./beaconchain.log 2>&1', (err, stdout, stderr) => {
    console.log(`stdout: ${stdout}`);
    console.log(`stderr: ${stderr}`);
  })
}catch(e){
  console.log(e)
}
