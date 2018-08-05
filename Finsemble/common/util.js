/*!
* Copyright 2017 by ChartIQ, Inc.
* All rights reserved.
*/
/* global LauncherService */
var SystemSettings = require("../common/systemSettings");
var _Monitors = require("./MonitorsAndScaling");
var Monitors = new _Monitors();
var Logger = require("../clients/logger");
const uuidv1 = require("uuid/v1");

var allMonitors = [];
/*if (typeof fin !== "undefined") { //For Docking Tests -> removing this because Monitors are now handled bu the Monitors object. Docking tests will fail.
	fin.desktop.main(() => {
		fin.desktop.System.addEventListener("monitor-info-changed", function () {
			allMonitors = [];
			module.exports.getAllMonitors();
		});
	});
}*/

module.exports = {
	mockLogger: {
		isLogMessage: () => true,
		system: {
			info: console.info,
			debug: console.debug,
			log: console.log,
			warn: Logger.warn,
			verbose: console.log,
			error: Logger.error
		},
		start: Logger.start
	},

	Monitors: Monitors,

	/**
	 * Gets the openfin version in object form.
	 */
	getOpenfinVersion: function (cb) {
		return new Promise(function (resolve/*, reject*/) {
			fin.desktop.System.getVersion((ver) => {
				let verArr = ver.split(".").map(Number);
				let versionObject = {
					major: verArr[0],
					chromium: verArr[1],
					minor: verArr[2],
					patch: verArr[3]
				};
				console.log(versionObject);
				if (cb) {
					cb(versionObject);
				} else {
					resolve(versionObject);
				}
			});
		});
	},
	/**
	 * Given a function _that returns a value_, this method will return a thenable object.
	 * **NOTE** This will not work if your function doesn't return something.
	 *  <example>
	 *		function myFunc(){
				console.log('I promise that this is not a promise.');
			 }
		let myPromise = util.castToPromise(myFunc);
		myPromise().then(doSomethingElse);
		</example>

	 */
	castToPromise: function (f) {
		return function () {
			return new Promise((resolve, reject) => {
				//Calls f, checks to see if the returned object has a `then` method. if not, it will resolve the result from the intiial function.
				const result = f.apply(null, Array.from(arguments));
				try {
					return result.then(resolve, reject);
				} catch (e) {
					if (e instanceof TypeError) {
						resolve(result);
					} else {
						reject(e);
					}
				}
			});
		};
	},
	/**
	 * @introduction
	 * <h2>Finsemble Utility Functions</h2>
	 * @private
	 * @class Utils
	 */

	isPercentage: function (val) {
		if (typeof (val) !== "string") {
			return false;
		}
		return val.indexOf("%") !== -1;
	},


	/**
	 * Gets an array of monitor descriptors. Essentially rationalizing the results of OpenFin getMonitorInfo.
	 * into a single array with additional information added.
	 *
	 * whichMonitor is set to the secondary monitor number, or "primary" if the primary monitor.
	 * position is set to a zero index, where primary is the zero position, and each non-primary increments thereafter.
	 *
	 * Additionally, width and height are calculated and filled in for availableRect and monitorRect.
	 *
	 * @param {callback-array} cb Returns a list of monitor descriptors (optional or use promise)
	 */
	getAllMonitors: Monitors.getAllMonitors,


	/**
	 * Retrieves a monitor descriptor given an absolute X Y on the OpenFin virtual screen
	 * @param  {number} x The x position
	 * @param  {number} y The y position
	 * @param {callback-object}  cb Returns the monitor information from OpenFin.
	 * "isPrimary" is set to true if it's the primary monitor.
	 * null is returned if the x,y coordinates are beyond the bounds of the virtual screen.
	 */
	getMonitorFromOpenFinXY: Monitors.getMonitorFromScaledXY,

	/**
	 * Retrieves a monitor descriptor for a window. If the window straddles two monitors
	 * then the monitor from the top left is provided and "straddling" flag is set to true.
	 *
	 * @param  {LauncherClient~windowDescriptor}   windowDescriptor A windowDescriptor
	 * @param  {Function} cb               Returns a monitor descriptor (optional or use promise)
	 * @returns {Promise} A promise that resolves to a monitor descriptor
	 */
	getMonitorFromWindow: function (windowDescriptor, cb) {
		var x = Number.isFinite(windowDescriptor.x) ? windowDescriptor.x : windowDescriptor.defaultLeft;
		var y = Number.isFinite(windowDescriptor.y) ? windowDescriptor.y : windowDescriptor.defaultTop;
		var x2 = x + windowDescriptor.defaultWidth;
		var y2 = y + windowDescriptor.defaultHeight;
		return new Promise(function (resolve, reject) {

			// get monitor of top-left
			Monitors.getMonitorFromScaledXY(x, y, function (monitor) {
				if (!monitor) {
					console.log("getMonitorFromWindow - top-left is off screen, trying bottom right");
					// get monitor of bottom-right
					Monitors.getMonitorFromScaledXY(x2, y2, function (monitor) {
						if (!monitor) {
							console.log("getMonitorFromWindow - bottom-right is off screen, getting primary");
							// get primary monitor - add message to the monitor saying that this window isn't really on a monitor
							Monitors.getAllMonitors(function (monitors) {
								if (monitors[0]) {
									if (cb) { cb(monitors[0]); }
									resolve(monitors[0]);
								} else {
									reject(new Error("Cannot find monitor for window."));
									if (cb) { cb(null); }
								}
							});
							return;
						}
						monitor = module.exports.clone(monitor);
						var monitorRect = monitor.monitorRect;
						if (monitorRect.left < x || monitorRect.right < y) {
							monitor.straddling = true;
						}
						if (cb) { cb(monitor); }
						resolve(monitor);

					});
					return;
				}
				monitor = module.exports.clone(monitor);
				var monitorRect = monitor.monitorRect;
				if (monitorRect.right > x2 || monitorRect.bottom > y2) {
					monitor.straddling = true;
				}
				if (cb) { cb(monitor); }
				resolve(monitor);
			});
		});
	},

	/**
	 * Returns a finWindow or null if not found
	 * @param  {LauncherClient~windowIdentifier}   windowIdentifier A window identifier
	 * @param  {Function} cb               Optional callback containing finWindow or null if not found (or use Promise)
	 * @return {Promise}                    Promise that resulves to a finWindow or rejects if not found
	 */
	getFinWindow: function (windowIdentifier, cb) {
		return new Promise(function (resolve, reject) {
			// Default to current window
			var myWindow = fin.desktop.Window.getCurrent();

			// Get OpenFin options (windowDescriptor) for current window
			// we need this info even if we're going to reference a different window
			myWindow.getOptions(function (options) {
				// If windowName is provided, then find that window
				if (windowIdentifier && windowIdentifier.windowName) {
					// If we didn't get a uuid from the caller, then assume
					// it's the same window as current window
					if (!windowIdentifier.uuid) {
						windowIdentifier.uuid = options.uuid;
					}
					/**
					 * Try to wrap the window; if it exists, getInfo will get in
					 *  to the success function. If not, it'll go into the error callback.
					 */
					let remoteWindow = fin.desktop.Window.wrap(windowIdentifier.uuid, windowIdentifier.windowName);
					remoteWindow.getInfo(() => {
						if (cb) { cb(remoteWindow); }

						resolve(remoteWindow);
					}, function () {
						if (cb) { cb(null); }
						reject("Window " + windowIdentifier.windowName + " not found." + `UUID: ${windowIdentifier.uuid}`);
						console.debug("util.getFinWindow: Window " + windowIdentifier.windowName + " not found");
						return;
					});
				} else if (windowIdentifier && windowIdentifier.componentType) {
					if (typeof LauncherService !== "undefined") {
						let remoteWindow = LauncherService.componentFinder(windowIdentifier);
						if (remoteWindow) {
							resolve(remoteWindow);
							if (cb) { cb(remoteWindow); }
						} else {
							reject("util.getFinWindow: Component " + windowIdentifier.componentType + " not found.");
							if (cb) { cb(null); }
						}
					} else {
						//@TODO, get this through a remote call to Launcher service
						reject("getFinWindow by componentType is currently only operable within LaunchService");
						if (cb) { cb(null); }
					}
				} else {
					// return windowDescriptor for current window
					if (cb) { cb(myWindow); }
					resolve(myWindow);
				}
			});
		});
	},

	/**
	 * Retrieves a windowDescriptor given a windowIdentifier
	 * @param {LauncherClient~windowIdentifier} [windowIdentifier] The window to locate. If empty then the current window is returned.
	 * @callback {function} cb Function to retrieve result (optional or use Promise)
	 * @returns {Promise} A promise that resolves to a LauncherClient~windowDescriptor
	 */
	getWindowDescriptor: function (windowIdentifier, cb) {
		return new Promise(function (resolve, reject) {
			module.exports.getFinWindow(windowIdentifier).then(function (finWindow) {
				finWindow.getOptions(function (options) {
					if (cb) { cb(options); }
					resolve(options);
				});
			}).catch(function (errorMessage) {
				console.warn(errorMessage);
				if (cb) { cb(null); }
				reject(errorMessage);
			});
		});
	},

	findMonitor: function (monitors, field, value) {
		for (var i = 0; i < monitors.length; i++) {
			var monitor = monitors[i];
			if (monitor[field] === value) { return monitor; }
		}
		return null;
	},
	/**
	 * @param {number} commandMonitor
	 * @param {array} monitors
	 * @param {number} launchingMonitorPosition
	 * commandMonitor, monitors, launchingMonitorPosition
	 */
	getWhichMonitor: function (params, cb) {
		//First release of this method took 3 params.
		if (arguments.length > 2) {
			params = {
				commandMonitor: arguments[0],
				monitors: arguments[1],
				launchingMonitorPosition: arguments[2]
			};
			cb = null;
		}
		var monitor;
		var { commandMonitor, monitors, launchingMonitorPosition } = params;
		var isANumber = (commandMonitor && commandMonitor !== "") || commandMonitor === 0;
		if (commandMonitor === "primary") {
			monitor = module.exports.findMonitor(monitors, "whichMonitor", "primary");
		} else if (commandMonitor === "next") {
			let position = launchingMonitorPosition + 1;
			if (position >= monitors.length) {
				position = 0;
			}
			monitor = monitors[position];
		} else if (commandMonitor === "previous") {
			let position = launchingMonitorPosition - 1;
			if (position < 0) {
				position = monitors.length - 1;
			}
			monitor = monitors[position];
		} else if (commandMonitor === "mine") {
			var waiting = true;
			//assuming this is always used in the launcher
			var w = activeWindows.getWindow(params.windowIdentifier.windowName);
			w.getBounds((err, bounds) => {
				Monitors.getMonitorFromScaledXY(bounds.left, bounds.top, (monitor) => {
					cb(monitor);
				});
			});
		} else if (isANumber) {
			if (commandMonitor >= monitors.length) {
				commandMonitor = monitors.length - 1;
			}
			monitor = monitors[commandMonitor];
		} else if (launchingMonitorPosition) {
			monitor = monitors[launchingMonitorPosition];
		}

		if (!monitor) { // primary if no monitor found
			monitor = monitors[0];
		}

		if (!waiting) {
			if (cb) {
				cb(monitor);
			} else {
				//maintaining backwards compatibility
				return monitor;
			}
		}
	},

	/**
	 * Gets a monitorInfo based on a command. A command is the typical "monitor" param
	 * @param  {string} commandMonitor   Monitor command. See {@link LauncherClient#spawn}
	 * @param  {object} windowIdentifier The windowIdentifier of the calling function. Necessary to support "next","previous" an default.
	 * @param {function} [cb] Optional callback
	 * @returns {Promise} A promise that resolves to a monitorInfo
	 */
	getMonitorFromCommand: function (commandMonitor, windowIdentifier, cb) {
		return new Promise(function (resolve/*, reject*/) {
			module.exports.getMonitor(windowIdentifier, function (monitorInfo) {
				Monitors.getAllMonitors(function (monitors) {
					let params = {
						commandMonitor: commandMonitor,
						monitors: monitors,
						launchingMonitorPosition: monitorInfo.position
					};
					module.exports.getWhichMonitor(params, function (finalMonitorInfo) {
						if (cb) { cb(finalMonitorInfo); }
						resolve(finalMonitorInfo);
					});

				});
			});
		});
	},

	/**
	 * @private
	 * @param {LauncherClient~windowDescriptor} windowDescriptor
	 * @param {monitorDimensions} monitorDimensions
	 * @returns {boolean} Whether window is on the current monitor.
	 */
	windowOnMonitor: function (windowDescriptor, monitorDimensions) {
		//if right or left edge is within the window's bounds.
		if ((windowDescriptor.left >= monitorDimensions.left && windowDescriptor.left < monitorDimensions.right) ||
			(windowDescriptor.right <= monitorDimensions.right && windowDescriptor.right > monitorDimensions.left)) {
			return true;
		}
		return false;
	},
	/**
	 * Convenience function to get the monitor for the current window
	 * @param {LauncerClient~windowDescriptor} [windowIdentifier] The window to find the monitor for. Current window if empty.
	 * @param  {Function} cb Returns a monitor descriptor (optional or use Promise)
	 * @returns {Promise} A promise that resolves to a monitor descriptor
	 */
	getMonitorByDescriptor: function (windowDescriptor, cb) {
		return new Promise(function (resolve/*, reject*/) {
			module.exports.getMonitorFromWindow(windowDescriptor, function (monitor) {
				if (cb) { cb(monitor); }
				resolve(monitor);
			});
		});
	},
	/**
	 * Convenience function to get the monitor for the current window
	 * @param {LauncerClient~windowIdentifier} [windowIdentifier] The window to find the monitor for. Current window if empty.
	 * @param  {Function} cb Returns a monitor descriptor (optional or use Promise)
	 * @returns {Promise} A promise that resolves to a monitor descriptor
	 */
	getMonitor: function (windowIdentifier, cb) {
		return new Promise(function (resolve, reject) {
			module.exports.getWindowDescriptor(windowIdentifier, function (windowDescriptor) {
				if (!windowDescriptor) {
					reject("util.getMonitor: Can't locate windowDescriptor.");
				} else {
					module.exports.getMonitorFromWindow(windowDescriptor, function (monitor) {
						if (cb) { cb(monitor); }
						resolve(monitor);
					});
				}
			});
		});
	},
	/**
	 * Returns a windowIdentifier for the current window
	 * @param {LauncherClient~windowIdentifier} cb Callback function returns windowIdentifier for this window (optional or use Promise)
	 * @returns {Promise} A promise that resolves to a windowIdentifier
	 */
	// @TODO, [Terry] this should be eliminated in favor of calls to windowClient.getWindowIdentifier()
	getMyWindowIdentifier: function (cb) {
		var finWindow = fin.desktop.Window.getCurrent();
		return new Promise(function (resolve) {
			finWindow.getOptions((windowDescriptor) => {
				var componentType = null;

				// Figure out the component type from what was originally stored when we launched the window
				// options.customData is where our stuff is found
				var customData = windowDescriptor.customData;
				if (customData && customData.component) {
					componentType = customData.component.type;
				}
				var windowIdentifier = {
					windowName: finWindow.name,
					uuid: finWindow.uuid,
					componentType: componentType
				};

				if (cb) { cb(windowIdentifier); }
				resolve(windowIdentifier);
			});
		});
	},
	/**
	 *	@returns {string} Transforms an array of strings into a camelcased string.
	 * @memberof Utils
	 */
	camelCase: function () {
		var str = "";
		for (var i = 0; i < arguments.length; i++) {
			str += " " + arguments[i];
		}
		return str
			.replace(/\s(.)/g, function ($1) { return $1.toUpperCase(); })
			.replace(/\s/g, "")
			.replace(/^(.)/, function ($1) { return $1.toLowerCase(); });
	},

	/**
	 * Convenience method for cloning an object.
	 * @param  {any} from The thing you want to copy
	 * @param {any} to Where you want your copy to end up.
	 * @return {any} to Where you want your copy gwe end up.
	 */
	clone: function (from, to) {
		if (from === null || typeof from !== "object") { return from; }
		// if (from.constructor != Object && from.constructor != Array) return from;
		if (from.constructor == Date || from.constructor == RegExp || from.constructor == Function ||
			from.constructor == String || from.constructor == Number || from.constructor == Boolean) { return new from.constructor(from); }

		to = to || new from.constructor();

		for (var n in from) {
			to[n] = typeof to[n] === "undefined" ? module.exports.clone(from[n], null) : to[n];
		}

		return to;
	},

	getUniqueName: function (baseName) {
		if (!baseName) {
			baseName = "RouterClient";
		}
		var uuid = baseName + "-" + Math.floor(Math.random() * 100) + "-" + Math.floor(Math.random() * 10000);
		return uuid;
	},

	guuid: function () {
		return  uuidv1(); // return global uuid
	},

	injectJS(path, cb) {//Inject a script tag with the path given. Once the script is loaded, it executes the callback.
		var script = document.createElement("script");
		script.onload = cb;
		script.type = "text/javascript";
		script.async = true;
		script.src = path;
		var head = document.getElementsByTagName("head")[0];
		var firstScript = head.getElementsByTagName("script")[0];
		head.insertBefore(script, firstScript);
	},

	/**
	 * This will either open a component with the shared data or publish the shared data using the linker client if the window is linked
	 * @experimental
	 *
	 * @param {object} params
	 * @param {object} [params.data]
	 * @param {bool} [params.publishOnly] if the component is linked, this will only publish the data, not force open a window if it does not exist. If the component is not linked, this is ignored.
	 * @param {function} [params.multipleOpenerHandler] Optional. This function is called with on object that contains a map of componentTypes to the data types they can open. It must return a list of components to be opened. If no handler is provided, the first found component will be chosen. It is possible that the component opened may not handle all the data provided.
	 * @param {function} cb callback invoked with action taken.
	 *
	 * @since 1.5: multipleOpenerHandler and callback added
	 *
	 */
	openSharedData: function (params, cb) {
		var launcherClient = FSBL.Clients.LauncherClient;
		var linkerClient = FSBL.Clients.LinkerClient;
		//If no handler is specified to deal with multiple components, use the first found
		if (!params.multipleOpenerHandler) params.multipleOpenerHandler = function (componentsMappedToData) {
			// find the component that can open the most amount of data
			var maxDataTypesOpened = 0;
			var componentToOpen;
			for (var componentType of Object.keys(componentsMappedToData)) {
				if (componentsMappedToData[componentType].length > maxDataTypesOpened) {
					componentToOpen = componentType;
					maxDataTypesOpened = componentsMappedToData[componentType].length;
				}
			}
			return [componentToOpen];
		};

		var errors = [];
		var componentsMappedToData = {};

		// Loop through the data
		launcherClient.getComponentsThatCanReceiveDataTypes({ dataTypes: Object.keys(params.data) }, function (err, dataTypeComponentMap) {
			for (var dataType of Object.keys(dataTypeComponentMap)) {
				if (!dataTypeComponentMap[dataType].componentTypes.length) {
					var error = "No Components Available to Handle the type: " + dataType;
					errors.push(error);
					Logger.system.error(error);
				} else {
					for (var component of dataTypeComponentMap[dataType].componentTypes) {
						if (!componentsMappedToData[component]) { componentsMappedToData[component] = [dataType]; }
						else componentsMappedToData[component].push(dataType);
					}
				}
			}

			// What if multiple components need to be opened?
			var componentsToOpen = Object.keys(componentsMappedToData);
			if (componentsToOpen.length) {
				if (componentsToOpen.length > 1) {
					componentsToOpen = params.multipleOpenerHandler(componentsMappedToData);
				}
				var linkerChannels = Object.keys(linkerClient.channels);
				if (linkerChannels.length) { //if linked
					var linkedWindows = linkerClient.getLinkedComponents({ componentTypes: componentsToOpen, windowIdentifier: linkerClient.windowIdentifier() });
					// TODO: deal with the case if not all componentTypes that need to be opened are linked
					if (linkedWindows.length || params.publishOnly) { // If pubishOnly is true then just publish, not spawn
						linkerClient.publish({
							dataType: "Finsemble.DragAndDropClient",
							data: params.data
						});
						if (cb) cb(errors.length ? errors : null, "Data published");
					} else { // spawn
						for (let component of componentsToOpen) {
							launcherClient.spawn(component, {
								data: {
									sharedData: params.data,
									linker: {
										channels: linkerChannels
									}
								},
								addToWorkspace: true
							});
						}
						if (cb) cb(errors.length ? errors : null, "Linked Window(s) spawned with data");
					}
				} else {
					if (!params.publishOnly) {
						for (let component of componentsToOpen) {
							launcherClient.spawn(component, {
								data: {
									sharedData: params.data
								},
								addToWorkspace: true
							});
						}
						if (cb) cb(errors.length ? errors : null, "New Window(s) spawned with data");
					}
				}

			} else {
				if (cb) cb(errors.length ? errors : null, null);
			}
		});

	}
};
