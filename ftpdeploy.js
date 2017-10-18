"use strict";

var FtpDeploy = require('ftp-deploy');
var ftpDeploy = new FtpDeploy();
var ftpDeploy2 = new FtpDeploy();

const arg = (argList => {
    let arg = {}, a, opt, thisOpt, curOpt;
    for (a = 0; a < argList.length; a++) {
        thisOpt = argList[a].trim();
        opt = thisOpt.replace(/^\-+/, '');
        if (opt === thisOpt) {
            // argument value
            if (curOpt) arg[curOpt] = opt;
            curOpt = null;
        }
        else {
            // argument name
            curOpt = opt;
            arg[curOpt] = true;
        }
    }
    return arg;
})(process.argv);

/** Configuration **/
var user = arg.user;
var password = arg.password;

var config = {
    username: user,
    password: password, // optional, prompted if none given
    host: "adaptableblotter.com",
    port: 21,
    localRoot: __dirname + "/dist",
    remoteRoot: "/finsembledemo/dist",
    include: [],
    exclude: []
}

var config2 = {
    username: user,
    password: password, // optional, prompted if none given
    host: "adaptableblotter.com",
    port: 21,
    localRoot: __dirname + "/node_modules/@chartiq",
    remoteRoot: "/finsembledemo/node_modules/@chartiq",
    include: [],
    exclude: []
}

console.log("deploying: " + config.localRoot);
console.log("FTP USER: " + config.username);

ftpDeploy.deploy(config, function (err) {
    if (err) {
        console.log(err);
        console.log("Trying dist deployment again");
        ftpDeploy.deploy(config, function (err) {
            if (err) {
                console.log(err);
                process.exit(1);
            }
            else { console.log('dist Deployment finished'); }
        });
    }
    else { console.log('dist Deployment finished'); }
    ftpDeploy2.deploy(config2, function (err) {
        if (err) {
            console.log(err);
            console.log("Trying finsemble deployment again");
            ftpDeploy.deploy(config2, function (err) {
                if (err) {
                    console.log(err);
                    process.exit(1);
                }
                else { console.log('finsemble Deployment finished'); }
            });
        }
        else { console.log('finsemble Deployment finished'); }
    });
});

ftpDeploy.on('uploaded', function (data) {
    console.log("Total dist Files: " + data.totalFileCount + ", Transfered: " + data.transferredFileCount + ", File uploaded: " + data.filename);         // same data as uploading event
});

ftpDeploy.on('upload-error', function (data) {
	console.log(data.err); // data will also include filename, relativePath, and other goodies
});

ftpDeploy.on('error', function (data) {
	console.log(data.err); // data will also include filename, relativePath, and other goodies
});

ftpDeploy2.on('uploaded', function (data) {
    console.log("Total finsemble Files: " + data.totalFileCount + ", Transfered: " + data.transferredFileCount + ", File uploaded: " + data.filename);         // same data as uploading event
});

ftpDeploy2.on('upload-error', function (data) {
	console.log(data.err); // data will also include filename, relativePath, and other goodies
});

ftpDeploy2.on('error', function (data) {
	console.log(data.err); // data will also include filename, relativePath, and other goodies
});