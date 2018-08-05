/*!
* Copyright 2017 by ChartIQ, Inc.
* All rights reserved.
*/
var Logger = require("./logger");
var Validate = require("../common/validate"); // Finsemble args validator
var BaseClient = require("./baseClient");
var linkerClient = require("./linkerClient");
var launcherClient = require("./launcherClient");
var windowClient = require("./windowClient");
var distributedStoreClient = require("./distributedStoreClient");
var async = require("async");
const DRAG_START_CHANNEL = "DragAndDropClient.dragStart";
const DRAG_END_CHANNEL = "DragAndDropClient.dragEnd";
const SHARE_HIGHLIGHT_OPACITY = 1;
const SHARE_METHOD = {
	DROP: "drop",
	SPAWN: "spawn",
	LINKER: "linker"
};

/**
 *
 * @introduction
 * <h2>Drag and Drop Client</h2>
 *
 * The Drag and Drop Client acts as an API to share data between components via a user action i.e., drag and drop. 
 * As an example, consider a user wanting to share a chart inside a chat&mdash;they can do so using the Drag and Drop service. 
 * 
 *
 * A component that shares data needs to publish the data types it can share by calling setEmitters. 
 * The `Window Manager` automatically adds a draggable share icon to any component that calls setEmitters. 
 * Similarly, a component that can receive data needs to publish that using addReceivers. 
 * Since it is possible to have multiple components on a page receiving the data, you can add multiple receivers for the same dataType.
 *
 * The Drag and Drop Client overlays a scrim on all windows once the user starts dragging a sharable item. The scrim displays which windows can and cannot receive that data. 
 * However, this doesn't always work well, especially with complex third party components. You may need to add your own drop zone to the component and use `FSBL.DragAndDropClient.drop` as the handler.
 *
 * The Drag and Drop Client can also make use of the Linker Client to share data between linked windows. See [DragAndDropClient.html#drop](DragAndDropClient.html#openSharedData).
 * 
 * Here is a [tutorial on using the Drag and Drop Client](tutorial-sharingData.html).
 *
 * @hideConstructor true
 * @constructor
 */
class DragAndDropClient extends BaseClient {
	constructor(params) {
		super(params);
		Validate.args(params, "object=") && params && Validate.args2("params.onReady", params.onReady, "function=");
		this.emitters = {};
		this.receivers = {};
		this.receiveResponder = false;
		this.linkerListener = false;

		/**
		 * Default: true
		 *
		 * Set this to false to disable handling of linked data
		 */
		this.openLinkerDataByDefault = true;

		/**
		 * This constant object contains all the share methods. You can use it in a receive handler to handle different share methods. Current share methods are
		 *	* SHARE_METHOD.DROP
		 *	* SHARE_METHOD.SPAWN
		 *	* SHARE_METHOD.LINKER
		 *
		 * @example
		 * // Ignore data unless it was dropped
		 * function shareHandler(err, response) {
		 *	if(response.shareMethod != FSBL.Clients.DragAndDropClient.SHARE_METHOD.DROP) {
		 *		return;
		 * 	}
		 *	// Handle dropped data below:
		 * }
		 */
		this.SHARE_METHOD = SHARE_METHOD;

		this.bindAllFunctions();
	}

	/* private */
	bindAllFunctions() {
		let self = this;
		for (let name of Object.getOwnPropertyNames(Object.getPrototypeOf(self))) {
			let method = self[name];
			// skip constructor
			if (!(method instanceof Function) || method === DragAndDropClient) continue;
			self[name] = self[name].bind(self);
		}

	}

	/**
	 * setEmitters sets all the data that can be shared by the component. There can only be one emitter for each data type.
	 *
	 * @param {object} params.emitters This is a list of objects which contain a dataType and a function to get the data.
	 * @example
	 * DragAndDropClient.setEmitters({
	 * 	emitters: [
	 * 		{
	 * 			type: "symbol",
	 * 			data: getSymbol
	 * 		},
	 * 		{
	 * 			type: "chartiq.chart",
	 * 			data: getChart
	 *		}
	* 	]
	* })
	*/
	setEmitters(params) {
		if (!Array.isArray(params.emitters)) { return; }
		let self = this;

		params.emitters.forEach(function (emitter) {
			//TODO validate
			self.emitters[emitter.type] = emitter;
		});

		//Object.assign(this.emitters, params.emitters);
		this.routerClient.publish(this.windowName + "Finsemble.Sharer", {
			emitterEnabled: Object.keys(self.emitters).length ? true : false,
			receiverEnabled: Object.keys(self.receivers).length ? true : false,
		});
		if (!this.receiveResponder) {
			this.routerClient.addResponder(this.windowName + ".Share", function (err, response) {
				self.emit.call(self, err, response);
			});
			this.receiveResponder = true;
		}
	}

	/**
	 * addReceivers adds receivers for the data that can be received by the component. There can be any number of receiver for each data type. You can also use regular expressions to specify the data that can be received.
	 *
	 * @param {object} params.receivers This is a list of objects, each containing a type and a handler function to call with the data once received. The receiver can take a regular expression as its type to provide the ability to receive multiple data types. Each type can have multiple handlers so you can use the same type multiple times in your call.
	 *
	 * @example
	 * DragAndDropClient.addReceivers({
	 * 	receivers: [
	 * 		{
	 * 			type: "symbol",
	 * 		 	handler: changeSymbol
	 * 		}, {
	 * 			type: "chartiq.chart",
	 * 			handler: openChart
	 * 		}
	 * 	])
	 * DragAndDropClient.addReceivers({
	 * 	receivers: [
	 *		{
	 * 			type: &#47;.*&#47;,
	 *	 		handler: getEverythingAComponentCanEmit
	 * 		}
	 * 	])
	 */

	addReceivers(params) {
		if (!Array.isArray(params.receivers)) { return; }
		let self = this;

		params.receivers.forEach(function (receiver) {
			//TODO validate
			var type = receiver.type.toString(); // in case this is a regex
			// Each data type can have multiple receivers
			if (!self.receivers[type]) { self.receivers[type] = [receiver]; }
			else { self.receivers[type].push(receiver); } //TODO check dupes??
		});

		// Send info to windowTitle about receivers
		this.routerClient.publish(this.windowName + "Finsemble.Sharer", {
			emitterEnabled: Object.keys(self.emitters).length ? true : false,
			receiverEnabled: Object.keys(self.receivers).length ? true : false,
		});

		// Deal with data received if the window is spawned with data. Component state prevents handling the data multiple times
		var spawnData = windowClient.getSpawnData();
		console.log("spawnData", spawnData);
		if (spawnData && spawnData.sharedData) {
			windowClient.getComponentState({ field: "Finsemble.DealtWithSpawnSharedData" }, function (err, data) {
				if (!data) {
					windowClient.setComponentState({ field: "Finsemble.DealtWithSpawnSharedData", value: "done" }, function () {
						self.handleSharedData(spawnData.sharedData, SHARE_METHOD.SPAWN);
					});
				}
			});
		}

		// Setup linker for listening to shared data.
		if (!this.linkerListener && this.openLinkerDataByDefault) {
			linkerClient.subscribe("Finsemble.DragAndDropClient", function (data, responseDetail) {
				if (!responseDetail.originatedHere()) {
					Object.keys(data).forEach(function (dataType) {
						if (self.canReceiveData(dataType)) {
							var dataToHandle = {};
							dataToHandle[dataType] = data[dataType];
							self.handleSharedData(dataToHandle, SHARE_METHOD.LINKER);
						}
					});

				}
			});
			this.linkerListener = true;
		}
	}

	/**
	 * updateReceivers updates the handlers for the data that can be received by the component.
	 *
	 * @param {object} params.receivers This is a list of objects, each containing a type, the existing handler (oldHandler) and a handler function to replace the old handler with.
	 * @private
	 * @example
	 * DragAndDropClient.updateReceivers({
	 * 	receivers: [
	 * 		{
	 * 			type: "symbol",
	 *			oldHandler: updateSymbol,
	 * 		 	handler: changeSymbol
	 * 		}, {
	 * 			type: "chartiq.chart",
	 *			oldHandler: openChart_old,
	 * 			handler: openChart_new
	 * 		}
	 * 	])
	 * DragAndDropClient.updateReceivers({
	 * 	receivers: [
	 *		{
	 * 			type: /.*&#47;,
	 *	 		oldHandler: getEverythingAComponentCanEmit,
	 *			handler: doSomethingWithAllThisData
	 * 		}
	 * 	])
	 */
	updateReceivers(params) {
		if (!Array.isArray(params.receivers)) { return; }
		let self = this;

		params.receivers.forEach(function (receiver) {
			//TODO validate
			var type = receiver.type.toString();
			if (!self.receivers[type]) { self.receivers[type] = []; }
			var receivers = self.receivers[type];

			for (var i = 0; i < receivers.length; i++) {
				if (receivers[i].handler === receiver.oldHandler) {
					receivers[i].handler = receiver.handler;
				}
			}

			self.receivers[type].push(receiver.handler);
		});

		if (!self.linkerListener) {
			linkerClient.subscribe("Finsemble.DragAndDropClient", function (data, responseDetail) {
				if (!responseDetail.originatedHere()) { self.handleSharedData(data, SHARE_METHOD.LINKER); }
			});
			self.linkerListener = true;
		}

		//TODO - should you add if handler does no exist?
		//Object.assign(self.receivers, params.receivers);
		//self.routerClient.publish(self.windowName + 'Finsemble.Sharer', { receiverEnabled: true });
	}

	/**
	 * removeReceivers removes the handlers for the data that can be received by the component.
	 *
	 * @param {object} params.receivers This is a list of objects, each containing a type and the handler that needs to be removed.
	 * @private
	 * @example
	 * DragAndDropClient.removeReceivers({
	 * 	receivers: [
	 * 		{
	 * 			type: "symbol",
	 * 		 	handler: changeSymbol
	 * 		}, {
	 * 			type: "chartiq.chart",
	 * 			handler: openChart
	 * 		}
	 * 	])
	 * DragAndDropClient.removeReceivers({
	 * 	receivers: [
	 *		{
	 * 			type: /.*&#47;,
	 *	 		oldHandler: getEverythingAComponentCanEmit
	 * 		}
	 * 	])
	 */
	removeReceivers(params) {
		if (!Array.isArray(params.receivers)) { return; }
		let self = this;

		params.receivers.forEach(function (receiver) {
			//TODO validate
			var type = receiver.type.toString();
			if (!self.receivers[type]) { return; }
			var receivers = self.receivers[type];

			for (var i = 0; i < receivers.length; i++) {
				if (receivers[i].handler === receiver.handler) {
					receivers.splice(i, 1);
					break;
				}
			}
		});

		// TODO - remove drop zone if no receivers
		//Object.assign(self.receivers, params.receivers);
		//self.routerClient.publish(self.windowName + 'Finsemble.Sharer', { receiverEnabled: true });
	}

	/**
	 * This is a drag event handler for an element that can be dragged to share data. Our sample Window Title component uses this internally when the share icon is dragged. This can be attached to any element that needs to be draggable. The data from all emitters that match receivers in the drop component is automatically shared.
	 *
	 * @param {event} event
	 *
	 */
	dragStart(event) {
		this.routerClient.transmit(DRAG_START_CHANNEL, Object.keys(this.emitters));
		var data = {
			FSBL: true,
			window: this.windowName,
			emitters: Object.keys(this.emitters)
		};
		Logger.system.info("DragAndDropClient:dragStart:Drag Data:", data);
		event.dataTransfer.setData("text/plain", JSON.stringify(data));
	}

	/**
	 * This is a drag event handler to enable dragging specific data that is not tied to an emitter. For example, an item in a list.
	 *
	 * @param {event} event
	 * @param {any} data
	 *
	 * @example
	 * element.addEventListener('dragstart', fuction(event) {
	 * 		var data = {
	 * 			'rsrchx.report': {
	 *				url: event.target.href,
	 *			}
	 * 		};
	 * 		FSBL.Clients.DragAndDropClient.dragStartWithData(event, data);
	 * })
	 *
	 */
	dragStartWithData(event, data) {
		this.routerClient.transmit(DRAG_START_CHANNEL, Object.keys(data));
		var dragdata = {
			FSBL: true,
			containsData: true,
			window: this.windowName,
			data: data
		};
		Logger.system.info("DragAndDropClient:dragStart:Drag Data:", dragdata);
		event.dataTransfer.setData("text/plain", JSON.stringify(dragdata));
	}

	handleSharedData(sharedData, shareMethod) {
		let self = this;
		Object.keys(self.receivers).forEach(function (key) {
			var receiver = self.receivers[key];
			var data = {};
			Logger.system.info("DragAndDropClient:handleSharedData:Receiver:", key);
			Object.keys(sharedData).forEach(function (value) {
				Logger.system.info("DragAndDropClient:handleSharedData:Data value:", value);
				if (receiver[0].type instanceof RegExp) {
					if (value.match(receiver.type)) {
						data[value] = sharedData[value];
					}
				} else if (receiver[0].type == value) {
					data[value] = sharedData[value];
				}
			});
			if (Object.keys(data).length) {
				receiver.forEach(function (r) { // Each receiver can have multiple entries
					r.handler(null, { data: data, shareMethod: shareMethod });
				});
			}
		});

	}

	/**
	 * This is a drop event handler that can be attached to any element that you want to be a drop zone for the Drag and Drop Client. It automatically requests data for all the data elements that are common between the receiver and the emitter.
	 *
	 * @param {event} event
	 */
	drop(event) {
		let self = this;
		if (!event.dataTransfer) { event.dataTransfer = event.originalEvent.dataTransfer; } // deal with jQuery events not having dataTransfer
		var data = event.dataTransfer.getData("text/plain");
		Logger.system.info("DragAndDropClient:drop:data", data);
		if (data) {
			try {
				data = JSON.parse(data);
			} catch (e) {
				return;
			}
			if (data.FSBL) {
				event.preventDefault();
				event.stopPropagation();
				if (data.containsData) { //the data is embedded into the request
					self.handleSharedData(data.data, SHARE_METHOD.DROP);
				} else {
					var sourceWindow = data.window;
					var availableEmitters = data.emitters;

					var commonData = [];
					//var receiverKeys = Object.keys(self.receivers);
					for (var i = 0; i < availableEmitters.length; i++) {
						//var addToCommon = false;
						var emitter = availableEmitters[i];
						if (self.canReceiveData(emitter)) {
							commonData.push(emitter);
						}
					}
					console.log("Common Data", commonData);
					self.routerClient.query(sourceWindow + ".Share", commonData, function (err, response) {
						self.handleSharedData(response.data, SHARE_METHOD.DROP);
					});
				}
			}
		}
	}

	/**
	 *
	 * @param {object} params This is a list of strands whose data is required
	 * @param {function} cb This is the function to call with the data
	 * @private
	 */
	emit(error, params) {
		let values = {};
		var self = this;

		//TODO aync functions and test this stuff
		async.each(params.data, function (index, cb) {
			let item = self.emitters[index];
			if (item.data && typeof item.data === "function") {
				/*item(function (err, data) {
					if (err) {
						cb(err);
					} else {
						values[index] = data;
						cb();
					}
				})*/
				values[index] = item.data();
				cb();
			} else {
				values[index] = item.data;
				cb();
			}

		}, function () {
			params.sendQueryResponse(null, values);
		});
	}

	/**
	 * This gets a list of components that can receive a specific type. It looks in the config for each componentType for an advertiseReceivers property.
	 *
	 * @example
	 * "Advanced Chart": {
	 *		...
	 * 		"component": {
	 * 			"advertiseReceivers": ["chartiq.chart", "symbol"]
	 * 		},
	 *		...
	 *
	 *
	 * @param {object} params
	 * @param {string} [params.type]
	 * @param {Function=} cb callback to be invoked with the list of component types
	 * @private
	 *
	 * @example
	 * DragAndDropClient.getComponentsThatCanReceiveType ({ type: "chartiq.chart"}, callback)
	 *
	 */
	getComponentsThatCanReceiveType(dataType, cb) {
		Logger.system.warn("DragAndDropClient.getComponentsThatCanReceiveType has been deprecated. Use LauncherClient.getComponentsThatCanReceiveDataTypes instead.");
		launcherClient.getComponentsThatCanReceiveDataTypes({ dataTypes: [dataType] }, function (err, response) {
			cb(err, (response && response[dataType]) ? response[dataType].componentTypes : []);
		});
	}

	/**
	 * This will either open a component with the shared data or publish the shared data using the Linker Client if the window is linked.
	 * @experimental
	 *
	 * @param {object} params
	 * @param {object} [params.data]
	 * @param {bool} [params.publishOnly] If the component is linked, this will only publish the data, not force open a window if it does not exist. If the component is not linked, this is ignored.
	 * @param {function} [params.multipleOpenerHandler] Optional. This function is called with on object that contains a map of componentTypes to the data types they can open. It must return a list of components to be opened. If no handler is provided, the first found component will be chosen. It is possible that the component opened may not handle all the data provided.
	 * @param {function} cb Callback invoked with action taken.
	 *
	 * @since 1.5: multipleOpenerHandler and callback added
	 *
	 */
	openSharedData(params, cb) {
		FSBL.Utils.openSharedData(params, cb);
	}

	/**
	 * @private
	 */
	addWindowHighlight(canReceiveData) {
		let self = this;
		let scrim = document.createElement("div");
		scrim.id = "fsbl-share-scrim";
		scrim.className = "fsbl-share-scrim";
		let icon = document.createElement("i");
		if (canReceiveData) {
			icon.className = "ff-share yes";
			// use capture to make sure this happens
			document.addEventListener("dragover", self.dragover);
			document.addEventListener("drop", self.drop);
		} else {
			icon.className = "ff-delete-circle no";
		}
		scrim.appendChild(icon);
		document.body.appendChild(scrim);


		this.finsembleWindow.updateOptions({
			opacity: SHARE_HIGHLIGHT_OPACITY
		});
	}

	/**
	 * @private
	 */
	removeWindowHighlight() {
		let self = this;
		var scrim = document.getElementById("fsbl-share-scrim");
		if (scrim) { scrim.parentNode.removeChild(scrim); }
		document.removeEventListener("dragover", self.dragover);
		document.removeEventListener("drop", self.drop);
		this.finsembleWindow.updateOptions({
			opacity: 1
		});
	}

	/**
	 * @private
	 */
	canReceiveData(dataTypeArray, receiverKeys) {
		if (!Array.isArray(dataTypeArray)) {
			dataTypeArray = [dataTypeArray];
		}
		let self = this;

		let local = false;

		if (!receiverKeys) {
			receiverKeys = Object.keys(self.receivers);
			local = true;
		}

		for (var i = 0; i < dataTypeArray.length; i++) {
			var emitter = dataTypeArray[i];
			for (var j = 0; j < receiverKeys.length; j++) {
				if (!local) { // this is if a string of data types is provided - used in getComponentsThatCanReceiveType
					if (emitter === receiverKeys[j]) {
						return true;
					}
					continue;
				}
				var receiver = self.receivers[receiverKeys[j]];
				if (!receiver.length) { continue; }
				else { receiver = receiver[0]; }
				if (receiver.type instanceof RegExp) { // Is it a regex?
					if (emitter.match(receiver.type)) {
						return true;
					}
				} else {
					if (emitter === receiver.type) {
						return true;
					}
				}
			}
		}
		return false;
	}

	/**
	 * @private
	 */
	dragover(e) {
		e.preventDefault();
		return false;
	}

	/**
	 * @private
	 */
	addListeners(cb) {
		let self = this;
		window.addEventListener("dragend", function () {
			self.routerClient.transmit(DRAG_END_CHANNEL, {});
		});

		this.routerClient.addListener(DRAG_START_CHANNEL, function (err, message) {
			let dataBeingShared = message.data;
			if (!self.canReceiveData(dataBeingShared) || message.originatedHere()) {
				self.addWindowHighlight(false);
			} else {
				self.addWindowHighlight(true);
			}
		});

		this.routerClient.addListener(DRAG_END_CHANNEL, function () {
			self.removeWindowHighlight();
		});

		cb();

		// Just added the store for now. TODO: Idea is to augment the getWindowsThatCanReceiveData with receivers added after the fact which are not in config -> advertiseReceivers
		distributedStoreClient.createStore({ store: "Finsemble-Share", global: true }, function (err, store) {
			self.store = store;
		});
	}
}

var dragAndDropClient = new DragAndDropClient({
	startupDependencies: {
		clients: ["windowClient", "distributedStoreClient"]
	},
	onReady: function (cb = Function.prototype) {
		async.parallel([
			(done) => { dragAndDropClient.addListeners(done); },
			(done) => { linkerClient.onReady(done); },
			(done) => { launcherClient.onReady(done); },
		], cb);
	},
	name: "dragAndDropClient"
});

module.exports = dragAndDropClient;