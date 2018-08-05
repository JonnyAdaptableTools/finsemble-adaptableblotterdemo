/*!
* Copyright 2017 by ChartIQ, Inc.
* All rights reserved.
*/
var RouterClient = require("./routerClientInstance");
var Validate = require("../common/validate"); // Finsemble args validator
var Logger = require("./logger");
var FinsembleWindow = require("../common/window/FinsembleWindow");

/**
 * @introduction
 * <h2>Base Client</h2>
 * The Base Client is inherited by every client to provide common functionality to the clients. Clients communicate their status to each other through the Router and receive service status from the service manager. Once all dependecies are met, either client or service, the client's `onReady` method is fired.
 * @constructor
 * @param {Object} params
 * @param {Function} params.onReady - A function to be called after the client has initialized.
 * @param {String} params.name - The name of the client
 * @shouldBePublished false
 @example
	var BaseClient = require("./baseClient");
	var NewClient = function (params) {
		BaseClient.call(this, params);
		var self = this;

		return this;
	};

	var clientInstance = new NewClient({
		onReady: function (cb) {
			Logger.system.log("NewClient Online");
			cb();
		},
		name:"NewClient"
	});
	clientInstance.requiredServices = [REPLACE_THIS_ARRAY_WITH_DEPENENCIES];
	clientInstance.initialize();
	module.exports = clientInstance;
 */
const FSBLDependencyManager = require("../common/dependencyManager");
var BaseClient = function (params) {
	Validate.args(params, "object=");
	var self = this;
	var status = "offline";
	var onReady;
	this.startupTime = 0;
	if (params) {
		if (params.onReady) {
			onReady = params.onReady;
		}
		this.name = params.name;
	}
	this.initialized = false;
	this.startupDependencies = params.startupDependencies || {
		services: [],
		clients: []
	};
	/**
	 * Reference to the RouterClient
	 *  @type {Object}
	 */
	this.routerClient = RouterClient;

	/**
	 * Gets the current openfin window - stays here for backward compatiblity
	 * @type {object}
	 */
	this.finWindow = null;

	/**
	 * Gets the current window
	 * @type {object}
	 */
	this.finsembleWindow = null;

	/**
	 * Gets the cusrrent window name
	 *  @type {string}
	 */
	this.windowName = "";//The current window

	/**
	 * Services the are required to be online before the service can come online
	 *  @type {array}
	 */
	this.requiredServices = [];
	/**
	 * Clients the are required to be online before the service can come online
	 *  @type {array}
	 */
	this.requiredClients = [];

	/**
	 * Queue of functions to process once the client goes online.
	 */
	this.clientReadyQueue = [];

	/**
	 * Iterates through the clientReadyQueue, invoking each call to `.ready`.
	 */
	this.processClientReadyQueue = function () {
		for (var i = 0; i < this.clientReadyQueue.length; i++) {
			let callback = this.clientReadyQueue[i];
			if (typeof callback === "function") {
				callback();
			}
		}
		this.clientReadyQueue = [];
	};

	/**
	 * Method for adding callbacks to each client.
	 */
	this.onReady = function (cb) {
		this.clientReadyQueue.push(cb);
		if (status === "online") {
			this.processClientReadyQueue();
		}
	};
	//Check to see if the client can come online. We check this against the required services and clients
	this.setClientOnline = function () {
		var self = this;
		status = "online";
		let onReadyMessage = `StARTUP:CLIENT ONLINE:${self.finWindow.name}:${self.name}`;
		self.startupTime = performance.now() - self.startupTime;
		if (onReady) {
			onReady(function () {
				Logger.system.debug(onReadyMessage);
				self.processClientReadyQueue();
				FSBLDependencyManager.setClientOnline(self.name);
			});
		} else {
			Logger.system.debug(onReadyMessage);
			self.processClientReadyQueue();
			FSBLDependencyManager.setClientOnline(self.name);
		}
	};


	/**
	* Starts the process of checking services and any other function required before the client can come online
	*/
	this.initialize = function (cb = Function.prototype) {
		if (self.initialized) { return; }
		self.initialized = true;
		self.setClientOnline = self.setClientOnline.bind(self);
		self.startupTime = performance.now();
		self.routerClient.onReady(function () {
			// TODO, [terry] allow the finsembleWindow to be passed in, so we can support proxying windowClient in RPC
			self.finWindow = fin.desktop.Window.getCurrent();
			self.windowName = self.finWindow.name;
			self.finsembleWindow = FinsembleWindow.wrap({
				finWindow: self.finWindow,
				name: self.finWindow.name
			});
			Logger.system.debug("Baseclient Init Router Ready", self.name);
			FSBLDependencyManager.startup.waitFor({
				services: self.startupDependencies.services || [],
				clients: self.startupDependencies.clients || []
			}, () => {
				cb();
				self.setClientOnline();
			});
		});
	};

	this.onClose = function () { };

};

module.exports = BaseClient;
