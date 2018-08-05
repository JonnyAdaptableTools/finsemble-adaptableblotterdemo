/*!
* Copyright 2017 by ChartIQ, Inc.
* All rights reserved.
*/
"use strict";
var async = require("async");
var LauncherClient = require("./launcherClient");
var WindowClient = require("./windowClient");
var StoreClient = require("./distributedStoreClient");
var Utils = require("../common/util");
var Validate = require("../common/validate");
var BaseClient = require("./baseClient");
var FinsembleWindow = require("../common/window/FinsembleWindow");
var Logger = require("./logger");
WindowClient.initialize();
LauncherClient.initialize();
StoreClient.initialize();

/**
 *
 * @introduction
 * <h2>Dialog Manager Client</h2>
 *
 * The Dialog Manager Client simplifies interacting with dialog windows by spawning them and getting data back from them. 
 * In this context, a dialog window is simply a child window spawned to interact with the user, such as a confirmation dialog. 
 * Functions are provided here for both the parent-window side and the dialog/child-window side.
 *
 *`FSBL.Clients.DialogManager` is always pre-initialized with one instance of the Dialog Manager in the Finsemble Library (making it essentially, a singleton when referenced in the same window). This means component developers directly access the Dialog Manager without using the constructor (e.g., `FSBL.Clients.DialogManager.spawnDialog(...);`). **The constructor is not exposed to components.**
 *
 * @param {object=} params optional parameters
 * @param {function=} params.onReady callback function indicating when client is ready
 * @param {string=} params.name client name for diagnostics/logging
 * @constructor
 * @hideConstructor true
 */
var DialogManagerClient = function (params) {
	Validate.args(params, "object=") && params && Validate.args2("params.onReady", params.onReady, "function=");

	BaseClient.call(this, params);
	var self = this;
	/////////////////////////////////////////////
	// Public Functions -- Dialog Parent Side
	/////////////////////////////////////////////

	/**
	 * Spawns a Dialog window.
	 *
	 * parameters pass here in `inputParams` can be retrieved in the dialog window by calling [getParametersFromInDialog]{@link DialogManagerClient#getParametersFromInDialog}.
	 *
	 * @param {object} launchParams Parameters. Same as {@link LauncherClient#spawn} with the following exceptions.
	 * @param {string} launchParams.url URL of dialog to launch
	 * @param {string} [launchParams.name] - The name of the dialog
	 * @param {any} launchParams.x - Same as {@link LauncherClient#spawn} except defaults to "center".
	 * @param {any} launchParams.y - Same as {@link LauncherClient#spawn} except defaults to "center".
	 * @param {any} inputParams Object or any data type needed by your dialog.
	 * @param {function} dialogResponseCallback called when response received back from dialog window (typically on dialog completion). `responseParameters` is defined by the dialog.
	 * @param {function} [cb] Returns response from {@link LauncherClient#spawn}
	 *
	 * @example
	 * FSBL.Clients.DialogManager.spawnDialog(
	 * 	{
	 * 		name: "dialogTemplate",
	 * 		height:300,
	 * 		width:400,
	 * 		url:"http://localhost/components/system/dialogs/dialog1.html"
	 * 	},
	 * 	{
	 * 		someData: 12345
	 * 	},
	 * 		function (error, responseParameters) {
	 *			if (!error) {
	 * 				console.log(">>>> spawnDialog response: " + JSON.stringify(responseParameters));
	 *			}
	 * 	});
	 * @todo allow dialogs to be permanent components instead of ad-hoc.
	 * @todo support paramter to make the dialog modal
	 */

	this.spawnDialog = function (launchParams, inputParams, dialogResponseCallback, cb) {
		Validate.args(launchParams, "object", inputParams, "object", dialogResponseCallback, "function");
		let self = this;
		let responseChannel = Utils.getUniqueName("DialogChannel");

		launchParams.data = { inputParams, responseChannel: responseChannel };

		// Dialogs default to center
		if (!params.left && params.left !== 0 && !params.right && params.right !== 0) {
			params.left = "center";
		}
		if (!params.top && params.top !== 0 && !params.bottom && params.bottom !== 0) {
			params.top = "center";
		}
		self.routerClient.addListener(responseChannel, function cb(err, response) {
			dialogResponseCallback(err, response.data);
			self.routerClient.removeListener(responseChannel, cb);
		});
		LauncherClient.spawn("dialogTemplate", launchParams, function (err, response) {
			if (err) {
				Logger.system.error("ERROR", err);
				dialogResponseCallback(err, response);
			}
			if (cb) { cb(err, response); }
		});
	};

	/**
	 * Cancels an active dialog prematurely (normally a dialog will terminate on completion, returning a response).
	 * @private
	 * @param {any} dialogID identifies dialog to be terminated
	 *
	 * @todo implement when launcher supports kill function. [terry] use windowIdentifier returned from spawn() to kill.
	 */
	//this.killSpawnedDialog = function (dialogID) { };

	/////////////////////////////////////////////
	// Public Functions -- Dialog Client Side
	/////////////////////////////////////////////

	/**
	 * Called within dialog window to get the parameters passed in spawnDialog's "inputParams"
	 *
	 * @param {any} dialogID identifies dialog to be terminated
	 *
	 * @return {object} inputParams parameters pass to dialog
	 * @example
	 * var dialogData = FSBL.Clients.DialogManager.getParametersFromInDialog();
	 */
	this.getParametersFromInDialog = function () {
		var inputParams = WindowClient.getSpawnData().inputParams;
		Logger.system.debug("DialogManagerClient:getParametersFromInDialog: " + JSON.stringify(inputParams));
		return inputParams;
	};

	/**
	 * Called within dialog window to pass back dialog response and terminal window. This results in the [spawnDialog]{@link DialogManagerClient#spawnDialog} callback function (i.e. `dialogResponseCallback`) being invoked with `responseParameters` passed in.
	 *
	 * @param {any} responseParameters parameters returned to parent (i.e. window that spawned the dialog)
	 *
	 * @example
	 * FSBL.Clients.DialogManager.respondAndExitFromInDialog({ choice: response });
	 */
	this.respondAndExitFromInDialog = function (responseParameters) {
		Validate.args(responseParameters, "any");
		Logger.system.debug("DialogManagerClient:respondAndExitFromInDialog: " + JSON.stringify(responseParameters));
		var responseChannel = WindowClient.getSpawnData().responseChannel;
		this.routerClient.transmit(responseChannel, responseParameters);
		// FSBL.Clients.WindowClient.close();
	};

	this.getAvailableDialog = function (type, cb) {
		this.DialogStore.getValue("dialogs.available", (err, availableDialogs) => {
			for (let dialogName in availableDialogs) {
				let dialog = availableDialogs[dialogName];
				if (dialog.componentType === type) {
					return cb(dialog);
				}
			}
			cb(null);
		});
	};
	this.generateDialogReadyChannel = function (identifier) {
		let concat = identifier.windowName + identifier.uuid;
		return `Dialog.${concat}.ready`;
	};

	this.showDialog = function () {
		let listenerChannel = self.generateDialogReadyChannel(LauncherClient.myWindowIdentifier);
		//tells the dialog manager in the opening window that the dialog is ready to be shown.
		self.routerClient.transmit(listenerChannel, {
			userInputTimeout: typeof self.userInputTimeout === "undefined" ? 10000 : self.userInputTimeout
		});
	};

	this.sendQueryToDialog = function (identifier, options, onUserInput) {
		function warn(timeout) {
			console.warn(`No response from dialog ${identifier.windowName} after ${timeout / 1000} seconds. Check to make sure your dialog is sending back data.`);
		}

		this.moveDialogFromAvailableToOpened(identifier);
		let concat = identifier.windowName + identifier.uuid;
		let queryChannel = `Dialog.${concat}.Show`;
		let listenerChannel = this.generateDialogReadyChannel(identifier);
		let warning;
		function onDialogReady(err, response) {
			warning = setTimeout(warn.bind(null, response.data.userInputTimeout), response.data.userInputTimeout);
			Logger.perf.info("DialogManagerClient:sendQueryToDialog:Dialog: ShowWindow Start");
			LauncherClient.showWindow(identifier, {
				monitor: options.monitor || "mine",
				left: "center",
				top: "center"
			}, function (err, response) {
				response.finWindow.focus();
				Logger.perf.info("DialogManagerClient:sendQueryToDialog:ShowWindow finish");
			});
			self.routerClient.removeListener(listenerChannel, onDialogReady);
		}
		this.routerClient.addListener(listenerChannel, onDialogReady);
		Logger.perf.info("DialogManagerClient:sendQueryToDialog ShowWindow Query begin.");
		this.routerClient.query(queryChannel, options, function (err, response) {
			clearTimeout(warning);
			self.moveDialogFromOpenedToAvailable(identifier);
			onUserInput(err, response.data);
		});
	};

	this.moveDialogFromOpenedToAvailable = function (identifier) {
		this.DialogStore.getValue("dialogs", (err, dialogs) => {
			let openedDialogs = dialogs.opened;
			let availableDialogs = dialogs.available;

			delete openedDialogs[identifier.windowName];
			availableDialogs[identifier.windowName] = identifier;

			this.DialogStore.setValue({ field: "dialogs.opened", value: openedDialogs });
			this.DialogStore.setValue({ field: "dialogs.available", value: availableDialogs });
		});
	};

	this.moveDialogFromAvailableToOpened = function (identifier) {
		this.DialogStore.getValue("dialogs", (err, dialogs) => {
			let availableDialogs = dialogs.available;
			let openedDialogs = dialogs.opened;

			//@todo, what about when the dialog isn't available...
			delete availableDialogs[identifier.windowName];
			openedDialogs[identifier.windowName] = identifier;

			this.DialogStore.setValue({ field: "dialogs.available", value: availableDialogs });
			this.DialogStore.setValue({ field: "dialogs.opened", value: openedDialogs });
		});
	};
	this.registerModal = function () {
		fin.desktop.System.getMonitorInfo((info) => {
			let bounds = info.virtualScreen;
			//let { top, left, right, bottom } = info.virtualScreen;
			bounds.width = bounds.right - bounds.left;
			bounds.height = bounds.bottom - bounds.top;
			self.finsembleWindow.setBounds(bounds);
		});
		this.DialogStore.setValue({ field: "modalIdentifier", value: LauncherClient.myWindowIdentifier });
	};

	this.showModal = function (cb) {
		self.DialogStore.getValue("modalIdentifier", function (err, identifier) {
			let modal = FinsembleWindow.wrap({ uuid: identifier.uuid, name: identifier.windowName });
			modal.updateOptions({
				opacity: 0.4
			}, function () {
				modal.show(function () {
					modal.bringToFront(function () {
						self.finsembleWindow.focus(function () {
							self.finsembleWindow.bringToFront();
							if (cb) {
								cb();
							}
						});
					});
				});
			});
		});
	};

	this.open = function (type, options, onUserInput) {
		//show, spawnif there are no available dialogs of that type..
		let self = this;
		this.getAvailableDialog(type, (dialogIdentifier) => {
			if (dialogIdentifier) {
				//send open message
				this.sendQueryToDialog(dialogIdentifier, options, onUserInput);
			} else {
				//spawn, then send open message.
				LauncherClient.spawn(type, {
					options: {
						customData: {
							"foreign": {
								"clients": {
									"dialogManager": {
										"isDialog": true
									}
								}
							}
						}
					}
				}, function (err, response) {
					self.open(type, options, onUserInput);
				});
			}
		});
	};

	this.DialogStore = null;
	this.isDialog = false;
	this.isModal = false;
	//used by dialogs, set in `registerWithStore`.
	this.RESPONDER_CHANNEL = null;
	this.openerMessage = null;
	//invoked by component.
	//says to the opener, 'hey i'm ready, show me.'
	this.registerDialogCallback = function (callback) {
		this.routerClient.addResponder(this.RESPONDER_CHANNEL, (err, message) => {
			this.openerMessage = message;
			callback(err, message);
		});
	};
	this.hideModal = function () {
		self.DialogStore.getValue("modalIdentifier", function (err, identifier) {
			let modal = FinsembleWindow.wrap({ uuid: identifier.uuid, name: identifier.windowName });
			modal.hide();
		});
	};

	this.respondToOpener = function (data) {
		Logger.system.info("DialogManagerClient:RespondToOpener:", data);
		this.openerMessage.sendQueryResponse(null, data);
		if (data.hideModalOnClose !== false) {
			this.hideModal();
		}
		this.finsembleWindow.hide();
		this.openerMessage = null;
	};


	this.registerWithStore = function (callback) {
		if (this.isDialog) {
			let identifier = LauncherClient.myWindowIdentifier;
			this.RESPONDER_CHANNEL = `Dialog.${identifier.windowName + identifier.uuid}.Show`;
			this.DialogStore.setValue({ field: `dialogs.available.${identifier.windowName}`, value: identifier }, callback);
		} else {
			callback();
		}
	};

	this.checkIfWindowIsDialog = function (cb) {
		let err = null;
		try {
			this.isDialog = WindowClient.options.customData.foreign.clients.dialogManager.isDialog;
		} catch (e) {
			err = e;
		}
		if (cb) {
			cb(err);
		}
	};

	this.createStore = function (callback) {
		let self = this;
		let defaults = {
			dialogs: {
				opened: {},
				available: {}
			}
		};
		StoreClient.createStore({ store: "DialogStore", values: defaults, global: true }, function (err, store) {
			self.DialogStore = store;
			callback();
		});
	};
};

// instance of dialogManagerClient that is exported by this module
var dialogManagerClient = new DialogManagerClient({
	startupDependencies: {
		services: ["launcherService"],
		clients: ["distributedStoreClient", "windowClient"]
	},
	onReady: function (cb) {
		dialogManagerClient.checkIfWindowIsDialog(),
		async.series([
			dialogManagerClient.createStore.bind(dialogManagerClient),
			dialogManagerClient.registerWithStore.bind(dialogManagerClient),
			(done) => { LauncherClient.onReady(done); },
			(done) => { WindowClient.onReady(done); },
		], cb);
	},
	//THis name doesn't have Client in it because it isn't referenced as dialogmanagerClient....
	name: "dialogManager"
});

module.exports = dialogManagerClient;

