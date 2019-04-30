// HEP Packet Generator for Devs

var HEPjs = require('hep-js');
var dgram = require('dgram');
const execSync = require('child_process').execSync;
const exec = require('child_process').exec;

var version = 'v0.1.4';
var debug = false;
var stats = {rcvd: 0, parsed: 0, hepsent: 0, err: 0, heperr: 0 }; 

/* UDP Socket Handler */

var getSocket = function (type) {
    if (undefined === socket) {
        socket = dgram.createSocket(type);
        socket.on('error', socketErrorHandler);
        /**
         * Handles socket's 'close' event,
         * recover socket in case of unplanned closing.
         */
        var socketCloseHandler = function () {
            if (socketUsers > 0) {
                socket = undefined;
                --socketUsers;
                getSocket(type);
            }
        };
        socket.on('close', socketCloseHandler);
    }
    return socket;
}

var socket = dgram.createSocket("udp4");
    socket = getSocket('udp4'); 

var countDown = function(){
	count--;
	if (count == 0) {
		if(socket) socket.close();
		console.log(stats);
		console.log('Done! Exiting...');
		process.exit(0);
	}	
}

var sendHEP3 = function(msg,rcinfo){
	if (rcinfo) {
		try {
			if (debug) console.log('Sending HEP3 Packet to '+_config_.HEP_SERVER+':'+_config_.HEP_PORT+'...');
			var hep_message = HEPjs.encapsulate(msg,rcinfo);
			stats.parsed++;
			if (hep_message) {
				socket.send(hep_message, 0, hep_message.length, _config_.HEP_PORT, _config_.HEP_SERVER, function(err) {
					stats.hepsent++;
					countDown();
				});
			} else { console.log('HEP Parsing error!'); stats.heperr++; }
		}
		catch (e) {
			console.log('HEP3 Error sending!');
			console.log(e);
			stats.heperr++;
		}
	}
}

var sendAPI = function(msg,rcinfo){
	/* 	PUSH non-HEP data to API using methods in rcinfo for Query parameters.	
		For an example API message format, see config/log.js
	*/
	const http = require('http')
	const options = {
	  hostname: rcinfo.hostname,
	  port: rcinfo.port,
	  path: rcinfo.path,
	  method: rcinfo.method,
	  headers: {
	    'Content-Type': 'application/json',
	    'Content-Length': JSON.stringify(msg).length
	  }
	}

	const req = http.request(options, (res) => {
	  console.log(`API statusCode: ${res.statusCode}`)
	  stats.hepsent++;
	  countDown();
	  res.on('data', (d) => {
	    process.stdout.write(d)
	  })
	})

	req.on('error', (error) => {
	  console.error(error)
	  stats.heperr++;
	})
	req.write(JSON.stringify(msg));
	req.end();
	
}

var routeOUT = function(msg,rcinfo){
  console.log('ROUTING',msg,rcinfo);
	if (rcinfo.type === "HEP"){
		sendHEP3(msg,rcinfo);
	} else if(rcinfo.type === "API") {		
		sendAPI(msg,rcinfo);
	} else {
		console.error('Unsupported Type!',rcinfo);	
	}
};

function sleep(ms) {
  var start = new Date().getTime(), expire = start + ms;
  while (new Date().getTime() < expire) { }
  return;
}

var count = 0;
var pause = 0;

const execHEP = function(messages) {
  count = messages.length;
  messages.forEach(function preHep(message) {
	  
	var rcinfo = message.rcinfo;
	var msg = message.payload;
	if (debug) console.log(msg);
	stats.rcvd++;

	if (message.sleep) { 
		console.log('sleeping '+message.sleep+' ms...');
		sleep( message.sleep );
	}

	var hrTime = process.hrtime();
	var datenow = new Date().getTime();
	rcinfo.time_sec = Math.floor( datenow / 1000);
	rcinfo.time_usec = datenow - (rcinfo.time_sec*1000);

	if (debug) console.log(rcinfo);
	if (message.pause && (message.pause > 10000 || message.pause < 0 )) message.pause = 100;
	if (message.pause && message.pause > 0) {
		pause += message.pause;
		setTimeout(function() {
		    // delayed ts
	            var datenow = new Date().getTime();
		    rcinfo.time_sec = Math.floor( datenow / 1000);
		    rcinfo.time_usec = datenow - (rcinfo.time_sec*1000);
		    routeOUT(msg,rcinfo);
		    process.stdout.write("rcvd: "+stats.rcvd+", parsed: "+stats.parsed+", hepsent: "+stats.hepsent+", err: "+stats.err+", heperr: "+stats.heperr+"\r");
		}, pause);
	} else {
		routeOUT(msg,rcinfo);
		process.stdout.write("rcvd: "+stats.rcvd+", parsed: "+stats.parsed+", hepsent: "+stats.hepsent+", err: "+stats.err+", heperr: "+stats.heperr+"\r");
	}
  });
}


if(process.argv.indexOf("-d") != -1){
    debug = true;
}

var _config_ = require("./config/default");

if(process.argv.indexOf("-c") != -1){
    _config_ = require(process.argv[process.argv.indexOf("-c") + 1]); 
	if(process.argv.indexOf("-s") != -1){
	    _config_.HEP_SERVER = process.argv[process.argv.indexOf("-s") + 1]; 
	}
	if(process.argv.indexOf("-p") != -1){
	    _config_.HEP_PORT = process.argv[process.argv.indexOf("-p") + 1]; 
	}
        execHEP(_config_.MESSAGES);
}

if(process.argv.indexOf("-P") != -1){


	const { spawn } = require('child_process');
	const top = spawn('nodejs', ['tools/convert.js', process.argv[process.argv.indexOf("-P") + 1]] );
	var message = '';

	top.stdout.on('data', (data) => {
	  message += data;
	});

	top.stderr.on('data', (data) => {
	  console.log('Error parsing input!');
	});

	top.on('close', (code) => {
	  _config_ = JSON.parse(message);
	  if(process.argv.indexOf("-s") != -1){
	    _config_.HEP_SERVER = process.argv[process.argv.indexOf("-s") + 1]; 
  	  }
	  if(process.argv.indexOf("-p") != -1){
	    _config_.HEP_PORT = process.argv[process.argv.indexOf("-p") + 1]; 
	  }
	  execHEP(_config_.MESSAGES);
	});

}


