UBUNTU RPC (scaffold-rpc)

sudo add-apt-repository -y ppa:ethereum/ethereum

sudo apt-get update

sudo apt-get install ethereum

= created geth script =

git clone https://github.com/austintgriffith/geth-node-ssl-proxy

cd geth-node-ssl-proxy

sudo apt install nodejs npm

sudo npm i -g pm2

pm2 start index.js --name geth

pm2 startup
(and then run the command it comes back with)

= created proxy script =

sudo npm i yarn -g

yarn add https http-proxy express cors ssl-root-cas

= time for ssl = had to open port 80 but closed and then left 443 open

sudo apt  install certbot

= ec2 security group **open http for le script** and then keep only https open

pm2 start proxy.js

pm2 save

===----- update geth

sudo apt-get update

sudo apt-get install ethereum

sudo apt-get upgrade geth



====----- add prysm ( https://docs.prylabs.network/docs/install/install-with-script )

mkdir prysm && cd prysm
curl https://raw.githubusercontent.com/prysmaticlabs/prysm/master/prysm.sh --output prysm.sh && chmod +x prysm.sh

openssl rand -hex 32 | tr -d "\n" > "jwt.hex"

= added admin,web3 and the jwtsecret to the geth command (index.js)

= created beaconchain script to run prysm and fired it up with pm2

====----- upgrading prysm happens on the sh command BUT you need to update your db:

./prysm.sh validator db migrate down --datadir=/home/ubuntu/prysm/prysm_wallet/direct

