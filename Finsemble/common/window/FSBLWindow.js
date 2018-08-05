var EventEmitter = require("events").EventEmitter;
var RouterClient = require("../../clients/routerClientInstance");
var Logger = require("../../clients/logger");

class FSBLWindow extends EventEmitter {

	constructor(params) {
		super();
		//because we were doing this[i]=params[i] in the constructor jscrambler was creating a reference to 'this' above _super_, causing everything to break and it made me cry.
		this.doConstruction(params);
	}

	doConstruction(params) {
		//TODO this is the same as wrap (eventually this should spawn)
		if ((!params.setWindowType && !params.windowType) || params.windowType === "OpenFinApplication") { //Default WindowType
			params.windowType = "OpenFinWindow";
		}
		if (params.windowType) { //We need to make a specific kind of Window
			params.setWindowType = params.windowType;
			delete params.windowType; //Prevent infinite loop
			var childClassObject = new FSBLWindow.types[params.setWindowType](params);
			//childClassObject.windowType = windowType;
			return childClassObject;
		} else { //We are a specfic kind of window
			if (params) {
				for (var i in params) {
					this[i] = params[i];
				}
			}
			if (!this.name) this.name = params.windowName;
			this.windowType = this.setWindowType;
			this.Group = require("./groupAPI");
		}
	}
	static registerType(name, type) {
		if (!FSBLWindow.types) {
			FSBLWindow.types = {};
		}
		FSBLWindow.types[name] = type;
	}

	static wrap(params) {
		if ((!params.setWindowType && !params.windowType) || params.windowType === "OpenFinApplication") { //Default WindowType
			params.windowType = "OpenFinWindow";
		}
		if (params.windowType) { //We need to make a specific kind of Window
			params.setWindowType = params.windowType;
			delete params.windowType; //Prevent infinite loop
			var childClassObject = new FSBLWindow.types[params.setWindowType](params);
			//childClassObject.windowType = windowType;
			return childClassObject;
		}
	}

	minimize(cb) {
		let err = "Minimize is Not Implemented";
		console.error(err);
		if (cb) cb(err);
	}

	maximize(cb) {
		let err = "Maximize is Not Implemented";
		console.error(err);
		if (cb) cb(err);
	}

	restore(cb) {
		let err = "Restore is Not Implemented";
		console.error(err);
		if (cb) cb(err);
	}

	focus(cb) {
		let err = "Focus is Not Implemented";
		console.error(err);
		if (cb) cb(err);
	}

	bringToFront(cb) {
		let err = "BringToFront is Not Implemented";
		console.error(err);
		if (cb) cb(err);
	}

	/**
	 * Invoked to indicate an operation (e.g. dragging out of tab region) has started. This signals the Docking service to start tracking the mouse location and invoking tiling behavior as needed.
	 * @param {object} params for future use
	 *
	 * @example
	 *	// dragging tab example using tracking and group
	 * 	FSBLWindow.startTabTileMonitoring();
	 *	// if dragging tab is in a group, then remove it given tracking results will decide what to do with the window
	 * 	FSBLWindow.Group.getGroupID(this.windowIdentifier, function (err, tileGroupId) {
	 * 		if (!err) { // if no error then must be in a tile group
	 *			self.Group.removeWindow(this.windowIdentifier);
	 *		}
	 *	});
	 */
	startTabTileMonitoring(params) {
		Logger.system.info("startTabTileMonitoring");
		RouterClient.transmit("TabTile.startTabTile", { params });
	}

	/**
	 * Invoked by client originating a dragStart that it has has ended.
	 * @param {object} params for future use
 	 * @param {function=} callback option callback that support overriding default behavior
	 *
	 * 	FSBLWindow.stopTabTileMonitoring(params, function(err, results, defaultTabTileAction) {
	 * 		// . . . custom code goes here . . .
	 *		defaultTabTileAction(results); // now take default action or call your own function instead
	 * 	});
	 *
	 */
	stopTabTileMonitoring(params, callback) {
		Logger.system.info("stopTabTileMonitoring", params);
		RouterClient.query("TabTile.stopTabTile", { params }, function (err, queryResponseMessage) {
			if (err) {
				Logger.system.warn("TabTile.stopTabTile: query failed", err);
			} else {
				Logger.system.debug("TabTile.stopTabTile results", queryResponseMessage.data);
			}
			var stopTabTileResults = queryResponseMessage.data;
			if (callback) {
				callback(err, stopTabTileResults, this.defaultStopTrackingAction);
			} else {
				this.defaultTabTileAction(stopTabTileResults);
			}
		});
	}

	/**
	 * Defines default TabTile action for stopTabTileMonitoring.  May be overriden by client -- see example in stopTabTileMonitoring
	 *
	 * @param {any} stopTabTileResults
	 * @memberof FSBLWindow
	 *
	 * @private
	 */
	defaultTabTileAction(stopTabTileResults) {
		switch (stopTabTileResults.stoppedLocation) {
			case "OutsideWindow":
				// move window to drop location (since for now assuming only single-tabbed windows)
				break;
			case "TabSection":
				// WindowStack.addWindowToStack(callback) // for when we get to tabbing
				break;
			case "InsideWindow":
				if (stopTabTileResults.tileGroupId) { // if dropped in an existing tile group (which might be the same it was dragging from)
					self.Group.addWindow(this.windowIdentifier, stopTabTileResults.tileGroupId, stopTabTileResults.dropCoordinates);
				} else { // if dropped in a seperate window outside a tile group
					self.Group.createGroup(function (newGroupId) {
						// add dragging window to new tile group, but specify the dropped on window as the starting window in the tile group
						self.Group.addWindow(this.windowIdentifier, newGroupId, stopTabTileResults.dropCoordinates, { startingWindowIdentifier: stopTabTileResults.droppedOnWindowIdentifier });
					});
				}
				break;
			default:
				Logger.system.error("stopTracking returned an unknown stoppedLocation result", stopTabTileResults);
		}
	}

	/**
	 * Cancels startTabTileMonitoring. Example use is a user "excapes" out of a drag operation.
	 *
	 * @param {object} params for future use
	 * @memberof FSBLWindow
	 */
	cancelTabTileMonitoring(params) {
		Logger.system.info("cancelTabTileMonitoring", params);
		RouterClient.transmit("TabTile.cancelTabTile", { params });
	}

}

FSBLWindow.WINDOWSTATE = {
	NORMAL: 0,
	MINIMIZED: 1,
	MAXIMIZED: 2
};

module.exports = FSBLWindow;