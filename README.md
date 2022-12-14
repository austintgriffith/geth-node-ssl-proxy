UBUNTU RPC (scaffold-rpc)

sudo add-apt-repository -y ppa:ethereum/ethereum

sudo apt-get update

sudo apt-get upgrade -y

// current node version

curl -fsSL https://deb.nodesource.com/setup_current.x | sudo -E bash -

// or LTS node verion

curl -fsSL https://deb.nodesource.com/setup_lts.x | sudo -E bash -

sudo apt install -y nodejs 

sudo npm i -g pm2

sudo npm i yarn -g

sudo apt  install -y certbot

sudo apt-get install -y ethereum

= created geth script =

git clone https://github.com/austintgriffith/geth-node-ssl-proxy

cd geth-node-ssl-proxy

== before you start geth you need the prysm dir in place with the jwt...

====----- add prysm ( https://docs.prylabs.network/docs/install/install-with-script )

mkdir prysm && cd prysm

curl https://raw.githubusercontent.com/prysmaticlabs/prysm/master/prysm.sh --output prysm.sh && chmod +x prysm.sh

openssl rand -hex 32 | tr -d "\n" > "jwt.hex"

manually run prysm to crush the dialog: 

./prysm.sh beacon-chain

type "accept"

cp ../beaconchain.js .

pm2 start beaconchain.js

tail -f ~/geth-node-ssl-proxy/prysm/beaconchain.log

cd ..

====-----  start geth

pm2 start index.js --name geth

tail -f ~/geth-node-ssl-proxy/geth.log

pm2 startup
(and then run the command it comes back with)

= created proxy script =

yarn add https http-proxy express cors ssl-root-cas

= time for ssl = had to open port 80 but closed and then left 443 open

= ec2 security group **open http for le script** and then keep only https open

pm2 start proxy.js

pm2 save

===----- update geth

sudo apt-get update

sudo apt-get install ethereum

sudo apt-get upgrade geth

= added admin,web3 and the jwtsecret to the geth command (index.js)

= created beaconchain script to run prysm and fired it up with pm2

====----- upgrading prysm happens on the sh command BUT you need to update your db:

./prysm.sh validator db migrate down --datadir=/home/ubuntu/prysm/prysm_wallet/direct

====----- Installing nethermind

// https://docs.nethermind.io/nethermind/ethereum-client/running-nethermind/running-the-client




