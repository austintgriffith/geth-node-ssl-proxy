const https = require('https')
var httpProxy = require('http-proxy');
const express = require('express')
const fs = require('fs')
var cors = require('cors')
var app = express()
const ethers = require('ethers')
https.globalAgent.options.ca = require('ssl-root-cas').create();
process.env['NODE_TLS_REJECT_UNAUTHORIZED'] = 0



const localProviderUrl = 'http://localhost:48545'

app.use(cors())

var proxy = httpProxy.createProxyServer();

var last = ""

var memcache = {}
/*
setInterval(()=>{
  console.log("--------------------=============------------------")
  var sortable = [];
  for (var item in memcache) {
      sortable.push([item, memcache[item]]);
  }
  sortable.sort(function(a, b) {
      return a[1] - b[1];
  });
  console.log(sortable)
  console.log("--------------------=============------------------")
},60000)
*/
app.post('/', (req, res) => {

  //console.log(req)
  if(req.headers&&req.headers.referer&&req.headers.referer)
  {
    if(last==req.connection.remoteAddress){
      //process.stdout.write(".");
      //process.stdout.write("-")

    }else{
      last=req.connection.remoteAddress
      if(!memcache[req.headers.referer]){
        memcache[req.headers.referer] = 1
        process.stdout.write("NEW SITE "+req.headers.referer+" --> "+req.connection.remoteAddress)
        process.stdout.write("🪐 "+req.connection.remoteAddress)
      }else{
        memcache[req.headers.referer]++;
      }

    }


  }
  //if(req.headers&&req.headers.referer&&req.headers.referer.indexOf("sandbox.eth.build")>=0){
    proxy.web(req, res, {
        //target: 'http://10.0.0.237:8545'
        //target: localProviderUrl
        changeOrigin: true,
        target: "https://rpc2.scaffoldeth.io:48544"
        //target: 'http://10.0.0.188:8545'
      });
    //  console.log("post served!",)
  //}else{
  //  console.log("ignored?")
  //}
})

app.get('/', (req, res) => {
  //if(req.headers&&req.headers.referer&&req.headers.referer.indexOf("sandbox.eth.build")>=0){
    proxy.web(req, res, {
      //target: 'http://10.0.0.237:8545'
      //target: localProviderUrl
      changeOrigin: true,
      target: "https://rpc2.scaffoldeth.io:48544"
      //target: 'http://10.0.0.188:8545'
    });
    console.log("geth ssl served!")
  //}else{
  //  console.log("ignored?")
  //}
})

app.get('/letathousandscaffoldethsbloom', (req, res) => {
  //if(req.headers&&req.headers.referer&&req.headers.referer.indexOf("sandbox.eth.build")>=0){
    var sortable = [];
    for (var item in memcache) {
        sortable.push([item, memcache[item]]);
    }
    sortable.sort(function(a, b) {
        return b[1] - a[1];
    });
    let finalBody = ""
    for(let s in sortable){
      console.log(sortable[s])
      finalBody+="<div style='padding:10px;font-size:18px'> <a href='"+sortable[s][0]+"'>"+sortable[s][0]+"</a>("+sortable[s][1]+")</div>"
    }
    //JSON.stringify(sortable)
    res.send("<html><body><div style='padding:20px;font-size:18px'><H1>RPC TRAFFIC</H1></div><pre>"+finalBody+"</pre></body></html>")
})




app.get('/sync', (req, res) => {
  //if(req.headers&&req.headers.referer&&req.headers.referer.indexOf("sandbox.eth.build")>=0){
  console.log(" 🏷 sync ")

  let localProvider = new ethers.providers.JsonRpcProvider(localProviderUrl)


  localProvider.send("eth_syncing").then( (a,b)=>{
    console.log("DONE",a,b,a.currentBlock)
    if(a==="false"){
      let currentBlock = ethers.BigNumber.from(""+a.currentBlock)
      console.log("currentBlock", currentBlock)
      res.send("<html><body><div style='padding:20px;font-size:18px'><H1>SYNCING</H1></div><pre>"+JSON.stringify(a)+"</pre><div>currentBlock</div><b>"+currentBlock.toNumber()+"</b></body></html>")
    }else{
      res.send("<html><body><div style='padding:20px;font-size:18px'><H1 style=\"color:green;\">IN SYNC!</H1></div><pre></pre></body></html>")
    }

  }, (a,b)=>{
    console.log("REJECT",a,b)
    res.send("<html><body><div style='padding:20px;font-size:18px'><H1>SYNC REJECT</H1></div><pre></pre></body></html>")
  } )

  //JSON.stringify(sortable)

})


app.get('/block', (req, res) => {
  //if(req.headers&&req.headers.referer&&req.headers.referer.indexOf("sandbox.eth.build")>=0){
  console.log(" 🛰 block ")

  let localProvider = new ethers.providers.JsonRpcProvider(localProviderUrl)

  localProvider.getBlockNumber().then( (a,b)=>{
    console.log("DONE",a,b)
    res.send("<html><body><div style='padding:20px;font-size:18px'><H1>BLOCK</H1></div><pre>"+a+"</pre></body></html>")
  }, (a,b)=>{
    console.log("REJECT",a,b)
    res.send("<html><body><div style='padding:20px;font-size:18px'><H1>BLOCK REJECT</H1></div><pre>"+a+"</pre></body></html>")
  } )

  //JSON.stringify(sortable)

})

https.createServer({
  key: fs.readFileSync('server.key'),
  cert: fs.readFileSync('server.cert')
}, app).listen(48544, () => {
  console.log('Listening 48544...')
})
