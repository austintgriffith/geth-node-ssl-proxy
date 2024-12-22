#/bin/bash
sudo certbot certonly --standalone -d rpc.buidlguidl.com --config-dir ~/.certbot/config --logs-dir ~/.certbot/logs --work-dir ~/.certbot/work

#if you run it without the dirs, it will be in /etc/letsencrypt/live/rpc.eth.build

sudo cp -f ~/.certbot/config/live/rpc.buidlguidl.com/privkey.pem server.key;sudo chmod 0777 server.key
sudo cp -f ~/.certbot/config/live/rpc.buidlguidl.com/fullchain.pem server.cert;sudo chmod 0777 server.cert
