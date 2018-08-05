/*!
* Copyright 2017 by ChartIQ, Inc.
* All rights reserved.
*/

// This routerTransport module is shared between router clients and the router service.  It supports
// the addition of new transports without any change to the router code. Each transport is
// point-to-point between a router client and the router service (i.e. hub and spoke).  Each router
// client can use a different transport (i.e. the router service connects to them all).

"use strict";

var ConfigUtils = require("../common/configUtil");
var Logger = require("../clients/logger");
var WebSocketClient = require("socket.io-client");

/**
 * @introduction
 * <h2>Router Transport</h2>
 * **Service-Level Module**.  Manages and contains the point-to-point transports (i.e., Layer 2) supported by Finsemble.
 * Each transport communicates between a Finsemble services or component (i.e. a router client on one end) and the Finsemble router service (another router client on the other end).
 *
 * Integration into routerService.js is automatic on startup.
 *
 * Developer Notes on Adding New Transport:
 * 1) Create new transport constructor.
 * 2) Call RouterTransport.addTransport() to make the transport constructor (see the bottom of this file)
 *
 * Each transport constructor must be implemented with the following interface:
 *
 *	ExampleTransportConstructor(params, parentMessageHandler, source, destination) where
 *
 * 			params is a passed in object including data that may (or may not) be needed for implementing the transport
 * 					params.FinsembleUUID: globally unique identifier for Finsemble (one per host machine)
 *					params.applicationRoot:  value of manifest.finsemble.applicationRoot,
 *					params.routerDomainRoot: value of manifest.finsemble.moduleRoot,
 *					params.sameDomainTransport: transport to use for same domain clients
 *					params.crossDomainTransport: transport to use for cross domain clients
 *					params.transportSettings: transport settings from finsemble.router.transportSettings if defined, otherwise an empty object
 *
 * 			parentMessageHandler(incomingTransportInfo, routerMessage) where
 * 					incomingTransportInfo is a transport-specific object containing essential information to route back to the same client.
 * 						The same object will be returned on a send() so the transport can use to send the message to that client.
 * 						It's up to the developer to decide what to put in the incomingTransportInfo object. The RouterService never
 * 						directly uses the object, except to do a property-based comparison for equality (so equality must be based on the top-level properties within the object.)
 * 					routerMessage is an object containing a single router message. The transport generally does not need to know the contents --
 * 						it only sends and receives these messages. However, the router's header (routerMessage.header) is available to the transport if needed.
 *
 * 			source is either the source's client name or "RouterService" (when the RouterService is the source)
 *
 * 			destination is either the destination's client name or "RouterService" (when the RouterService is the desgination)
 *
 * 			callback(this) returns the constructor.  Normally a constructor is not asyncronous, but support in case the constructed transport requires async initialization.
 *
 * The transport constructor must implement two functions.
 * 		1) send(transport, routerMessage) -- transport object contains destination transport info; routerMessage is the message to send
 * 		2) identifier() -- returns transport's name
 *
 * These functions along with the parentMessageHandler callback all that's needed to interface with the higher-level router (either a client or router service):
 *
 * The three transports implemented at the bottom of this file can serve as examples.
 *
 * @namespace RouterTransport
 */
var RouterTransport = {

	activeTransports: {},

	/**
	 * Adds a new type of router transport to pass message between RouterClient and RouterService.
	 *
	 * @param {string} transportName identifies the new transport
	 * @param {object} transportConstructor returns an instance of the new transport
	 */
	addTransport: function (transportName, transportConstructor) {
		this.activeTransports[transportName] = transportConstructor;
		Logger.system.log(`RouterTransport ${transportName} added to activeTransports`);
	},

	/**
	 * Gets array of active transports.  What is active depends both on config and what is supported by the environment. Typically, if OF IAB is defined then the IAB transport is added to active list.  Likewise, if SharedWorker defined, then SharedWork transport added to the active list.  Special transports that don't have backwards compatability (e.g. FinsembleTransport) are only added if specified in the config.
	 *
	 * @param {string} params transport paramters
	 *
	 * @returns array of active transport names
	 */
	getActiveTransports: function (params) {
		var transportNames = [];

		// convenience funciton to add transport to active list only if it's not already in the list
		function addToActive(transportName) {
			if (transportNames.indexOf(transportName) === -1) { // if not already in the list, then add it
				transportNames.push(transportName);
			}
		}

		// if OpenFin IAB available, then add IAB to active list
		if (fin && fin.desktop && fin.desktop.InterApplicationBus) addToActive("OpenFinBus");

		// if shared worker available, then add shared-worker transport to active list
		if (SharedWorker) addToActive("SharedWorker");

		// add whatever the sameDomainTrasnport is to the active list
		addToActive(params.sameDomainTransport);

		// add whatever the crossDomainTrasnport is to the active list
		addToActive(params.crossDomainTransport);

		Logger.system.log("getActiveTransports", transportNames);
		return transportNames;
	},

	/**
	 * Get default transport for event router&mdash;this is the most reliable transport across all contexts.
	 *
 	 * @param {object} params parameters for transport
	 * @param {any} incomingMessageHandler
	 * @param {any} source
	 * @param {any} destination
	 * @returns the transport object
	 */
	getDefaultTransport: function (params, incomingMessageHandler, source, destination) {
		return RouterTransport.getTransport(params, "OpenFinBus", incomingMessageHandler, source, destination);
	},

	/**
	 * Get best client transport based on the run-time context. Will only return cross-domain transport if current context is inter-domain.
	 *
 	 * @param {object} params parameters for transport
	 * @param {any} incomingMessageHandler
	 * @param {any} source
	 * @param {any} destination
	 * @returns the transport object
	 */
	getRecommendedTransport: function (params, incomingMessageHandler, source, destination) {

		// returns true if this window's location is in another domain
		function crossDomain() {
			var parser = document.createElement("a");
			parser.href = params.routerDomainRoot;

			var isSameHost = (window.location.hostname === parser.hostname);

			var isSameProtocol = (window.location.protocol === parser.protocol);

			var wport = (window.location.port === undefined) ? window.location.port : 80;
			var pport = (parser.port === undefined) ? parser.port : 80;
			var isSamePort = (wport === pport);

			var isCrossDomain = !(isSameHost && isSamePort && isSameProtocol);
			Logger.system.debug("Transport crossDomain=" + isCrossDomain + " (" + isSameHost + ":" + isSameProtocol + ":" + isSamePort + ")");
			return isCrossDomain;
		}

		// returns name of the best transport for communicating with router service
		function recommendedTransportName() {
			var sameDomainTransport = params.sameDomainTransport;
			var crossDomainTransport = params.crossDomainTransport;

			var selectedTransport = sameDomainTransport;
			if (crossDomain()) {
				selectedTransport = crossDomainTransport;
			}

			Logger.system.log(`Transport Info: Selected=${selectedTransport} SameDomainDefault=${sameDomainTransport} CrossDomainDefault=${crossDomainTransport}`);
			console.log(`Transport Info: Selected=${selectedTransport} SameDomainDefault=${sameDomainTransport} CrossDomainDefault=${crossDomainTransport}`);

			return selectedTransport;
		}

		var transportName = recommendedTransportName();
		return RouterTransport.getTransport(params, transportName, incomingMessageHandler, source, destination);
	},

	/**
	 * Get a specific transport by name. The transport must be in list of the active transports (i.e. previously added).
	 *
 	 * @param {object} params parameters for transport
	 * @param {any} transportName
	 * @param {any} incomingMessageHandler
	 * @param {any} source
	 * @param {any} destination
	 * @returns the transport object
	 */
	getTransport: function (params, transportName, incomingMessageHandler, source, destination) {
		var self = this;
		return new Promise(function (resolve, reject) {
			var transportConstructor = self.activeTransports[transportName];
			if (transportConstructor) {
				new transportConstructor(params, incomingMessageHandler, source, destination, function (newTransport) {
					resolve(newTransport);
				});
			} else {
				reject("unknown router transport name: " + transportName);
			}
		});
	}
};

//////////////////////////////////////////////////////////////
// Below all transports are defined then added to active list
//////////////////////////////////////////////////////////////

var RouterTransportImplementation = {}; // a convenience namespace for router-transport implementations

/*
 * Implements the SharedWorker Transport.
 *
 * Required Functions (used by transport clients):
 * 		send(routerMessage) -- transports the event
 * 		identifier() -- returns transport name/identifier
 *
 * @param {object} params various parms to support transports
 * @param {any} parentMessageHandler callback for incoming event
 * @param {any} source either the client name or "RouterService"
 * @param {any} destination either the client name or "RouterService" (unused in SharedWorker)
 */
RouterTransportImplementation.SharedWorkerTransport = function (params, parentMessageHandler, source, destination, callback) {
	var routerThread;
	var self = this;


	// receives incoming shared-worker messages then passes on to parent with correct "wrapper"
	function sharedWorkerMessageHandler(swMessage) {
		var port = swMessage.data[0];
		var routerMessage = swMessage.data[1];
		var incomingTransportInfo = { "transportID": self.identifier(), "port": port };
		Logger.system.verbose("SharedWorkerTransport Incoming Transport", incomingTransportInfo, "Message", routerMessage);
		parentMessageHandler(incomingTransportInfo, routerMessage);
	}

	//required function for parent (i.e. routeClient or routeService)
	this.send = function (transport, routerMessage) {
		// handle optional transport parm
		if (arguments.length === 1) {  // clients use just one parm -- routerMessage
			routerMessage = arguments[0];
			transport = null;
		} else { // router services uses both parameters
			transport = arguments[0];
			routerMessage = arguments[1];
		}
		Logger.system.verbose("SharedWorkerTransport Outgoing Transport", routerMessage);

		try {
			routerThread.port.postMessage([transport, routerMessage]);
		}
		catch (e) {
			Logger.system.error("SharedWorkerTransport: post message failed: " + JSON.stringify(e), "Probable cause is sending illegal data type (e.g. function).");
		}
	};

	//required function for parent (i.e. routeClient or routeService)
	this.identifier = function () {
		return "SharedWorker";
	};

	var workerPath = (params.transportSettings.SharedWorker && params.transportSettings.SharedWorker.workerPath) ?
		params.transportSettings.SharedWorker.workerPath : params.routerDomainRoot + "/common/routerSharedWorker.js";

	Logger.system.log(`SharedWorker Transport Initializing for ${source} using ${workerPath}`);
	console.log(`SharedWorker Transport Initializing for ${source} using ${workerPath}`);

	routerThread = new SharedWorker(workerPath, { name: "Finsemble", credentials: "included" });
	routerThread.port.onmessage = sharedWorkerMessageHandler;
	routerThread.onerror = function (e) {
		Logger.system.error("SharedWorkerTransport Transport Error" + JSON.stringify(e));
	};
	routerThread.port.start();

	if (source === "RouterService") {  // send first message though shared worker to identify router service
		routerThread.port.postMessage({ data: "connect", source: "RouterService" });
	}

	callback(this);
};

/*
 * Implements the OpenFin Bus Transport.
 *
 * Required Functions (used by transport clients):
 * 		send(transport, routerMessage) -- transport object contains destination transport info; routerMessage is the message to send
 * 		identifier() -- returns transport's name
 *
 * @param {object} params unused in OpenFin transport
 * @param {any} parentMessageHandler callback for incoming event
 * @param {any} source either the client name or "RouterService"
 * @param {any} destination either the client name or "RouterService"
 */
RouterTransportImplementation.OpenFinTransport = function (params, parentMessageHandler, source, destination, callback) {
	var uuid = fin.desktop.Application.getCurrent().uuid;
	var self = this;

	// receives incoming OpenFin bus messages then passes on to parent with correct "wrapper"
	function openFinMessageHandler(routerMessage, senderUuid) {
		var incomingTransportInfo = { "transportID": self.identifier(), "senderUuid": senderUuid, "name": routerMessage.header.origin };
		Logger.system.verbose("OpenFinTransport Incoming Transport", incomingTransportInfo, "Message", routerMessage);
		parentMessageHandler(incomingTransportInfo, routerMessage);
	}

	function subscribeFailure(reason) {
		Logger.system.error("OpenFinBus Subscribe Failure: " + reason);
	}

	//required function for the parent (i.e. routeClient or routeService)
	this.send = function (transport, routerMessage) {
		var destTopic;

		// handle optional transport parm
		if (arguments.length === 1) { // client use just one parameter - routerMessage
			destTopic = destination;
			routerMessage = arguments[0];
		} else { // router service uses both parameters
			destTopic = transport.name;
			routerMessage = arguments[1];
		}

		Logger.system.verbose("OpenFinTransport Outgoing Transport", uuid, destTopic, "Message", routerMessage);
		fin.desktop.InterApplicationBus.publish(destTopic, routerMessage,
			function () { }, function (err) { });
	};

	//required function for the parent (i.e. routeClient or routeService)
	this.identifier = function () {
		return "OpenFinBus";
	};

	Logger.system.log(`OpenFinBus Transport Initializing for ${source}`);
	console.log(`OpenFinBus Transport Initializing for ${source}`);
	fin.desktop.InterApplicationBus.subscribe("*", source, openFinMessageHandler, null, subscribeFailure);

	callback(this);
};

/*
 * Implements the FinsembleTransport (alternative to IAB without iFrame problems with supporting server commonly running on local server).
 *
 * Required Functions (used by transport clients):
 * 		send(event) -- transports the event
 * 		identifier() -- returns transport name/identifier
 *
 * @param {object} params various parms to support transports
 * @param {any} parentMessageHandler callback for incoming event
 * @param {any} source either the client name or "RouterService"
 * @param {any} destination either the client name or "RouterService" (unused in FinsembleTransport)
 */
RouterTransportImplementation.FinsembleTransport = function (params, parentMessageHandler, source, destination, callback) {
	var serverAddress = ConfigUtils.getDefault(params, "params.transportSettings.FinsembleTransport.serverAddress", "wss://localhost.chartiq.com:3376");
	const SOCKET_SERVER_ADDRESS = serverAddress + "/router"; // "router" is the socket namespace used on server

	var self = this;

	// receives incoming messages then passes on to parent (what's passed to parent should be same routerMessage received in send()
	function finsembleMessageHandler(routerMessage) {
		var incomingTransportInfo = { "transportID": self.identifier(), "client": routerMessage.clientMessage.header.origin };
		Logger.system.verbose("FinsembleTransport Incoming Transport", incomingTransportInfo, "Message", routerMessage);
		parentMessageHandler(incomingTransportInfo, routerMessage.clientMessage);
	}

	// Both sending and receiving is based on the following routing functionality located in a local node server (the below is a copy of the node server code)
	// 		// destination is RouterClient (message.client)
	//  	client.on('ROUTER_CLIENT', function(message) {
	// 			routerServer.emit(message.client, message);
	// 		});
	// 		// destination is RouterService
	// 		client.on('ROUTER_SERVICE', function(message) {
	// 			routerServer.emit('ROUTER_SERVICE_IN', message);
	// 		});

	//required function for the parent (i.e. routeClient or routeService)
	this.send = function (transport, routerMessage) {
		var dest;
		var newMessage;

		// decide how to route the message based on whether client or routerservice is sending
		if (arguments.length === 1) { // clients use just one parameter, so send client message to RouterService
			dest = "ROUTER_SERVICE";
			routerMessage = arguments[0];
			newMessage = { clientMessage: routerMessage };  // no client property needed to route on server since always going to router service

		} else { // router service uses both parameters, so send router-service mssage to a client
			dest = "ROUTER_CLIENT";
			routerMessage = arguments[1];
			newMessage = { client: transport.client, clientMessage: routerMessage }; // client property used to router on server
		}

		Logger.system.verbose("FinsembleTransport Outgoing Transport", dest, "NewMessage", newMessage);
		routerServerSocket.emit(dest, newMessage);
	};

	//required function for the parent (i.e. routeClient or routeService)
	this.identifier = function () {
		return "FinsembleTransport";
	};

	Logger.system.log(`FinsembleTransport Transport Initializing for ${source} using ${SOCKET_SERVER_ADDRESS}`);
	console.log(`FinsembleTransport Transport Initializing for ${source} using ${SOCKET_SERVER_ADDRESS}`);

	function connectTimeoutHandler() {
		Logger.system.error(`FinsembleTransport Connection Timeout for ${source}`);
		callback(self);
	}

	// set up for receiving incoming messages
	var routerServerSocket;
	if ((SOCKET_SERVER_ADDRESS.indexOf("ws:") !== -1) || (SOCKET_SERVER_ADDRESS.indexOf("wss:") !== -1)) {
		routerServerSocket = WebSocketClient.connect(SOCKET_SERVER_ADDRESS, { transports: ["websocket"], upgrade: false }); // if websocket address then use ws transport
	} else {
		routerServerSocket = WebSocketClient.connect(SOCKET_SERVER_ADDRESS, {}); // if not ws then http
	}
	var connectTimer = setTimeout(connectTimeoutHandler, 3000); // cleared in setServiceOnline

	routerServerSocket.on("connect", function () {
		clearTimeout(connectTimer);
		Logger.system.log("FinsembleTransport Connected to Server");
		console.log("FinsembleTransport Connected to Server");
		if (source === "RouterService") {
			// if this transport is for router service, use hardcoded socket address ("ROUTER_SERVICE_IN")
			routerServerSocket.on("ROUTER_SERVICE_IN", function (data) {
				finsembleMessageHandler(data);
			});
		} else {
			// for all other clients, the source == client name, so each socket address is based on client name
			routerServerSocket.on(source, function (data) {
				finsembleMessageHandler(data);
			});
		}
		callback(self);
	});

};

/*
 * Implements the FinsembleCloudTransport (a version of FinsembleTransport with server commonly running on remote server).
 *
 * Required Functions (used by transport clients):
 * 		send(event) -- transports the event
 * 		identifier() -- returns transport name/identifier
 *
 * @param {object} params various parms to support transports
 * @param {any} parentMessageHandler callback for incoming event
 * @param {any} source either the client name or "RouterService"
 * @param {any} destination either the client name or "RouterService" (unused in FinsembleCloudTransport)
 */
RouterTransportImplementation.FinsembleCloudTransport = function (params, parentMessageHandler, source, destination, callback) {
	var serverAddress;
	var defaultAddress = ConfigUtils.getDefault(params, "params.transportSettings.FinsembleCloudTransport.serverAddress", params.applicationRoot);
	var FinsembleUUID = params.FinsembleUUID;

	if (defaultAddress.substr(defaultAddress.length - 1) === "/") {
		serverAddress = defaultAddress.substring(0,defaultAddress.length - 1); // truncate and trailing slash because it causes problem with socket.io namespace
	} else {
		serverAddress = defaultAddress;
	}

	const SOCKET_SERVER_ADDRESS = serverAddress + "/router"; // "router" is the socket namespace used on server

	var self = this;

	// receives incoming messages then passes on to parent (what's passed to parent should be same routerMessage received in send()
	function finsembleMessageHandler(routerMessage) {
		var incomingTransportInfo = { "transportID": self.identifier(), "client": routerMessage.clientMessage.header.origin };
		Logger.system.verbose("FinsembleCloudTransport Incoming Transport", incomingTransportInfo, "Message", routerMessage);
		parentMessageHandler(incomingTransportInfo, routerMessage.clientMessage);
	}

	//required function for the parent (i.e. routeClient or routeService)
	this.send = function (transport, routerMessage) {
		var dest;
		var newMessage;

		// decide how to route the message based on whether client or routerservice is sending
		if (arguments.length === 1) { // clients use just one parameter, so send client message to RouterService
			dest = "ROUTER_SERVICE";
			routerMessage = arguments[0];
			newMessage = { FinsembleUUID, clientMessage: routerMessage };  // no client property needed to route on server since always going to router service

		} else { // router service uses both parameters, so send router-service mssage to a client
			dest = "ROUTER_CLIENT";
			routerMessage = arguments[1];
			newMessage = { FinsembleUUID, client: transport.client, clientMessage: routerMessage }; // client property used to router on server
		}

		Logger.system.verbose("FinsembleCloudTransport Outgoing Transport", dest, "NewMessage", newMessage);
		routerServerSocket.emit(dest, newMessage);
	};

	//required function for the parent (i.e. routeClient or routeService)
	this.identifier = function () {
		return "FinsembleCloudTransport";
	};

	Logger.system.log(`FinsembleCloudTransport Transport Initializing for ${source} using ${SOCKET_SERVER_ADDRESS}`);
	console.log(`FinsembleCloudTransport Transport Initializing for ${source} using ${SOCKET_SERVER_ADDRESS}`);

	function connectTimeoutHandler() {
		Logger.system.error(`FinsembleCloudTransport Connection Timeout for ${source}`);
		callback(self);
	}

	// set up for receiving incoming messages
	var routerServerSocket;
	if (SOCKET_SERVER_ADDRESS.indexOf("ws:") !== -1) {
		routerServerSocket = WebSocketClient.connect(SOCKET_SERVER_ADDRESS, { transports: ["websocket"], upgrade: false }); // if websocket address then use ws transport
	} else {
		routerServerSocket = WebSocketClient.connect(SOCKET_SERVER_ADDRESS, {}); // if not ws then http
	}
	var connectTimer = setTimeout(connectTimeoutHandler, 3000); // cleared in setServiceOnline

	routerServerSocket.on("connect", function () {
		clearTimeout(connectTimer);
		Logger.system.log("FinsembleCloudTransport Connected to Server", FinsembleUUID);
		console.log("FinsembleCloudTransport Connected to Server");
		if (source === "RouterService") {
			// if this transport is for router service, use hardcoded socket address ("ROUTER_SERVICE_IN") along with FinsembleUUID
			Logger.system.debug("Setting Up Socket Connection", "ROUTER_SERVICE_IN" + FinsembleUUID);
			console.log("Setting Up Socket Connection", "ROUTER_SERVICE_IN" + FinsembleUUID);
			routerServerSocket.on("ROUTER_SERVICE_IN" + FinsembleUUID, function (data) {
				finsembleMessageHandler(data);
			});
		} else {
			// for all other clients, the source == client name, so each socket address is based on client name along with FinsembleUUID
			Logger.system.debug("Setting Up Socket Connection", source + FinsembleUUID);
			console.log("SETTING UP Socket CONNECTION", source + FinsembleUUID);
			routerServerSocket.on(source + FinsembleUUID, function (data) {
				finsembleMessageHandler(data);
			});
		}
		callback(self);
	});

};

// add the transports to the available/active list
RouterTransport.addTransport("SharedWorker", RouterTransportImplementation.SharedWorkerTransport);
RouterTransport.addTransport("OpenFinBus", RouterTransportImplementation.OpenFinTransport);
RouterTransport.addTransport("FinsembleTransport", RouterTransportImplementation.FinsembleTransport);

module.exports = RouterTransport;
