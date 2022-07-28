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

= created proxy script =

sudo npm i yarn -g

yarn add https http-proxy express cors ssl-root-cas

= time for ssl = had to open port 80 but closed and then left 443 open

sudo apt  install certbot

= ec2 security group **open http for le script** and then keep only https open

pm2 start proxy.js

pm2 save
