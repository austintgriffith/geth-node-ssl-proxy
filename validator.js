const fs = require('fs')
const { exec } = require('child_process');

console.log("Starting up validator node...")
try{
  exec('./prysm.sh validator --suggested-fee-recipient=0x34aA3F359A9D614239015126635CE7732c18fDF3 --graffiti="🛠atg.eth🔥" --wallet-dir=atg --wallet-password-file=walletPassword.txt >> ./validator.log 2>&1', (err, stdout, stderr) => {
    console.log(`stdout: ${stdout}`);
    console.log(`stderr: ${stderr}`);
  })
}catch(e){
  console.log(e)
}
