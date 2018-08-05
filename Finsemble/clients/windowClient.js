/*!
* Copyright 2017 by ChartIQ, Inc.
* All rights reserved.
*/
var StorageClient = require("./storageClient");
var WorkspaceClient = require("./workspaceClient");
var util = require("../common/util");
var System = require("../common/system");
var BaseClient = require("./baseClient");
var Logger = require("./logger");
var Validate = require("../common/validate"); // Finsemble args validator
var deepEqual = require("lodash.isequal");
const async = require("async");
//var finWindow;
var finsembleWindow;
window.deepEqual = deepEqual;
/**
 *
 * Helper to see if element has a class.
 * @param {HTMLElement} el
 * @param {String} className
 * @private
 * @return {HTMLElement}
 */
function hasClass(el, className) {
	if (el.classList) {
		return el.classList.contains(className);
	} else {
		return !!el.className.match(new RegExp("(\\s|^)" + className + "(\\s|$)"));
	}
}

/**
 * Adds a class to an HTML element
 * @param {HTMLElement} el
 * @param {String} className
 * @private
 */
function addClass(el, className) {
	if (el.classList) {
		el.classList.add(className);
	} else if (!hasClass(el, className)) {
		el.className += " " + className;
	}
}

/**
 *
 * Removes class from HTML element
 * @param {HTMLElement} el
 * @param {String} className
 * @private
 */
function removeClass(el, className) {
	if (el.classList) {
		el.classList.remove(className);
	} else if (hasClass(el, className)) {
		var reg = new RegExp("(\\s|^)" + className + "(\\s|$)");
		el.className = el.className.replace(reg, " ");
	}
}

/**
 *
 *@introduction
  <h2>Window Client</h2>
  ----------
 * The Window Client is primarily responsible for managing the `windowState` (the window's bounds) and `componentState` (data inside of your component). 
 * It also injects the **window title bar** control, which contains controls for minimizing, maximizing, closing, and restoring your window. 
 * The reference below is provided in case you'd like to manually trigger events.
 *
 * This is the Window Client API reference. 
 * If you're looking for information about the window title bar, please see the [Presentation Component tutorial](tutorial-understandingUIComponents.html#window-title-bar) for more information.
 *
 * @hideConstructor true
 * @param {object} params
 * @constructor
 * @returns {WindowClient}
 */
function WindowClient(params) {
	Validate.args(params, "object=") && params && Validate.args2("params.onReady", params.onReady, "function=");

	const WORKSPACE_CACHE_TOPIC = "finsemble.workspace.cache"; // window data stored in this topic for access by workspace service


	/** @alias WindowClient# */
	BaseClient.call(this, params);

	var self = this;
	//We store the options that the window is created with in this property.
	/**
	* A copy of the `finWindow`'s options value. This is where we store information like monitorDimensions, initialization information, and any other data that needs to be passed from the parent application into the created window.
	* @type WindowClient
	*/
	this.options = {};
	//The hash we use to save data with.
	this.windowHash = "";
	//Window's title.
	this.title = null;
	//This is the bottom edge of the toolbar. The window's position will be offset by this much.
	//@todo move this value to a config.
	this.toolbarBottom = 40;
	//default value. The window assigns the containers it cares about before starting.
	this.containers = [];
	//window state for restoration purposes.
	this.componentState = {};
	//This can be either normal, minimized, or maximized.
	this.windowState = "normal";
	// This gets set to true if the window has a header
	this.hasHeader = false;
	/**
	 * This function is fired every time the window's bounds change. It saves the window's position.
	 * @param {object} bounds
	 * @private
	 */
	var onWindowRestored = function () {
		self.updateHeaderState("Maximize", { hide: false });
	};
	var onWindowMaximized = function () {
		self.updateHeaderState("Maximize", { hide: true });
	};
	var onWindowBlurred = function () {
		if (self.hasHeader) {
			self.setActive(false);
		}
	};
	var onWindowFocused = function () {
		if (self.hasHeader) {
			self.setActive(true);
		}
	};
	var onMinimizedRestored = function () {
		self.routerClient.transmit("DockingService.windowRestored", finsembleWindow.name);
		finsembleWindow.removeEventListener("restored", onMinimizedRestored);
	};
	var onWindowMinimized = function () {
		self.routerClient.query("DockingService.windowMinimized", finsembleWindow.name, Function.prototype);
		finsembleWindow.addEventListener("restored", onMinimizedRestored);
	};
	/**
	 * Closes Window.
	 * @param {boolean} removeFromWorkspace whether to remove the window from the workspace.
	 * Defaults are to remove the window from the workspace if the user presses the X button, but not if the window is closed via an app-level request (e.g., we need to switch workspaces, so all windows need to close).
	 * @example
	 *	//Close window and remove from workspace (e.g., user closes the window).
	 *	FSBL.Clients.WindowClient.close(true);
	 *	//Close window and keep in workspace (e.g., application requests that all windows close themselves).
	 *	FSBL.Clients.WindowClient.close(false);
	 */
	var onClose = function (params, cb) {
		if (!params) { params = { removeFromWorkspace: true, closeWindow: true }; }
		let { removeFromWorkspace, closeWindow } = params;
		if (typeof (params) === "boolean") {
			removeFromWorkspace = params;
		}
		if (typeof (closeWindow) === "undefined") {
			closeWindow = true;
		}

		if (!finsembleWindow) finsembleWindow = self.finsembleWindow;
		//if (!finWindow) finWindow = fin.desktop.Window.getCurrent(); //TODO: check if we already have this.finsembleWindow?? why are we checking here? why is this not a class method?
		//hide window, then do cleanup. This makes close feel more responsive.
		finsembleWindow.hide();
		let bounds = {
			left: self.options.defaultLeft,
			width: self.options.defaultWidth,
			height: self.options.defaultHeight,
			top: self.options.defaultTop
		};
		self.saveWindowBounds(bounds, false);
		Validate.args(removeFromWorkspace, "boolean");
		Logger.system.log("WINDOW LIFECYCLE:onClose Invoked");
		self.removeFinWindowEventListeners();
		if (removeFromWorkspace === true) {
			WorkspaceClient.removeWindow({
				name: finsembleWindow.name
			}, function (err, response) {
				if (cb) {
					cb();
				}
				if (closeWindow) {
					self.deregisterWithDockingManager(removeFromWorkspace);
					self.routerClient.disconnectAll();
					finsembleWindow.close(true, function (err) {
						if (err) {
							console.log("finsembleWindow.close err", err);
						} else {
							console.log("finsembleWindow.close success");
						}
					});
				}
			});
		} else {
			if (cb) {
				cb();
			}
			//on shutdown, we don't close the window -- finsemble handles that, not the windowClient. TODO - this looks like a dupe.
			if (closeWindow) {
				self.deregisterWithDockingManager(removeFromWorkspace);
				self.routerClient.disconnectAll();
				finsembleWindow.close(true, function (err) {
					if (err) {
						console.log("finsembleWindow.close err", err);
					} else {
						console.log("finsembleWindow.close success");
					}
				});
			}
		}
	};
	//This is here so that the method can be accessed publicly.
	this.close = onClose;
	/**
	 * @private
	 * @returns {windowHash}
	 */
	this.getWindowHash = function () {
		return self.windowHash;
	};

	/**
	 * Retrieves the window's title.
	 * @returns {String} title
	 * @example
	 * var windowTitle = FSBL.Clients.WindowClient.getWindowTitle();
	 */
	this.getWindowTitle = function () {
		return this.title;
	};

	/**
	 * This function retrieves the dimensions of the monitor that the window is on. It's currently used in the {@link launcherClient}.
	 * @param {function} callback
	 * @private
	 * @todo  this is bad. The monitor can change if the window is moved. Use util monitor functions instead. Instead, use the util style getMyMonitor, and keep monitor dimensions up to date statically at FSBL level with a listener on launcher (unclaimedRect).
	 */
	this.retrieveMonitorDimensions = function (callback) {
		util.getMonitor(null, function (monitorInfo) {
			self.options.monitorDimensions = monitorInfo.monitorRect;
			if (callback) { callback(); }
		});
	};
	/**
	 * Listens for changes in the hash and persists the change to the url property, and then saves it.
	 * @private
	 */
	this.listenForHashChanges = function () {
		//There's no pushState event in the browser. This is a monkey patched solution that allows us to catch hash changes. onhashchange doesn't fire when a site is loaded with a hash (e.g., salesforce).
		(function (history) {
			var pushState = history.pushState;
			history.pushState = function (state) {
				if (typeof history.onpushstate === "function") {
					history.onpushstate({ state: state });
				}
				pushState.apply(history, arguments);
				self.options.url = window.top.location.toString();
				StorageClient.save({ topic: WORKSPACE_CACHE_TOPIC, key: self.windowHash, value: self.options });
				return;
			};
		})(window.history);

		window.addEventListener("hashchange", () => {
			self.options.url = window.top.location.toString();
			StorageClient.save({ topic: WORKSPACE_CACHE_TOPIC, key: self.windowHash, value: self.options });
		});
	};

	/**
	 * Gets the options from the window on startup and caches them on the object.
	 * @private
	 * @param {function} callback
	 */
	this.getInitialOptions = function (callback) {
		finsembleWindow.getOptions(function (err, options) {
			if (options.customData && options.customData.manifest) {
				//should not persist the manifest.
				delete options.customData.manifest;
			}
			Logger.system.verbose("WindowClient:getting options", options);
			self.options = Object.assign(self.options, options);
			callback();
		});
	};
	/**
	 * Gets the bounds for the window on startup and saves them to the workspace.
	 * @private
	 * @param {function} callback
	 */
	this.cacheInitialBounds = function (callback) {
		self.cacheBounds((bounds) => {
			try {
				if (!self.options.customData.foreign.components["Window Manager"].persistWindowState) {
					return callback();
				}
				self.options.url = window.top.location.toString();
				self.saveWindowBounds(bounds, false);
			} catch (e) {
				Logger.system.warn("customData.foreign,components[\"Window Manager\" is undefined");
			}
			callback();
		});
	};
	/**
	 * Sets initial state for the window. This data is modified on subsequent saves.
	 * @param {function} callback
	 * @private
	 */
	this.setinitialWindowBounds = function (callback) {
		Logger.system.warn("`FSBL.Clients.WindowClient.setInitialWindowBounds is deprecated and will be removed in a future version of finsemble. Use 'getInitialOptions' and 'cacheInitialBounds' instead.");
		async.parallel([
			self.getInitialOptions.bind(self),
			self.cacheInitialBounds.bind(self)
		], callback);
	};

	/**
	 * Returns windowBounds as of the last save.
	 * @returns {object}
	 * @private
	 */
	this.getWindowBounds = function () {
		return {
			top: self.options.defaultTop,
			left: self.options.defaultLeft,
			width: self.options.defaultWidth,
			height: self.options.defaultHeight
		};
	};

	/**
	 *
	 * Saves the window's state. Rarely called manually, as it's called every time your window moves.
	 * @param {Object} bounds optional param.
	 * @example <caption>The code below is the bulk of our listener for the <code>bounds-changed</code> event from the openFin window. Every time the <code>bounds-changed</code> event is fired (when the window is resized or moved), we save the window's state. The first few lines just prevent the window from being dropped behind the toolbar.</caption>
	 *finWindow.addEventListener('disabled-frame-bounds-changed', function (bounds) {
	 * 	if (bounds.top < 45) {
	 *		finWindow.moveTo(bounds.left, 45);
	 *		return;
	 *	}
	 *	self.saveWindowBounds(bounds);
	 *});
	 */
	this.saveWindowBounds = function (bounds, setActiveWorkspaceDirty) {
		Logger.system.debug("WINDOW LIFECYCLE:SavingBounds:", bounds, "setActiveWOrkspaceDirty", setActiveWorkspaceDirty);
		if (typeof setActiveWorkspaceDirty === "undefined") {
			setActiveWorkspaceDirty = false;
		}
		Validate.args(bounds, "object") && Validate.args2("bounds.top", bounds.top, "number");
		if (!bounds) {
			return;
		}
		// openfin looks at defaultTop, terry looks at top. for some reason, when the app started fresh, the window's position was being overwritten. We also were saving the position on `defaultTop`/`defaultLeft`, and the launcherService wasn't looking for that. We may be able to get rid of the first assignment on the left, but I want terry to fully look at this.
		self.options.defaultTop = self.options.top = Math.round(bounds.top);
		self.options.defaultLeft = self.options.left = Math.round(bounds.left);
		self.options.defaultWidth = self.options.width = Math.round(bounds.width);
		self.options.defaultHeight = self.options.height = Math.round(bounds.height);
		try {
			if (!self.options.customData.foreign.components["Window Manager"].persistWindowState) {
				return;
			}
		} catch (e) {
			//prop doesn't exist.
			return;
		}

		StorageClient.save({ topic: WORKSPACE_CACHE_TOPIC, key: self.windowHash, value: self.options });
		if (setActiveWorkspaceDirty) {
			Logger.system.log("APPLICATION LIFECYCLE: Setting Active Workspace Dirty: Window Moved");
			self.dirtyTheWorkspace();
		}
	};

	/**
	 * This event is fired when a window is resized or moved.
	 * @private
	 */
	this.listenForBoundsChanged = function () {
		window.addEventListener("beforeunload", () => {
			if (self.options.customData &&
				self.options.customData.foreign &&
				self.options.customData.foreign.services &&
				self.options.customData.foreign.services.launcherService &&
				self.options.customData.foreign.services.launcherService.inject) {
				self.routerClient.transmit("Launcher.windowReloading", {
					uuid: this.options.uuid,
					name: this.options.name,
					url: window.location.toString()
				});
			}
		});
	};

	/**
	 * Minmizes window.
	 * @param {function} [cb] Optional callback
	 * @example
	 * FSBL.Clients.WindowClient.minimize();
	 */
	this.minimize = function (cb) {
		this.cacheBounds(function () {
			finsembleWindow.minimize(function (err) {
				if (!err) {
					self.windowState = "minimized";
				} else {
					Logger.system.error("WindowClient:minimize", err);
				}
				if (cb) {
					cb(err);
				}

			});
		});
	};

	/**
	 * Sets whether window is always on top.
	 * @param {function} [cb] Optional callback
	 * @example
	 * FSBL.Clients.WindowClient.setAlwaysOnTop(true);
	 */
	this.setAlwaysOnTop = function (alwaysOnTop, cb) {
		finsembleWindow.updateOptions({ alwaysOnTop: alwaysOnTop }, () => {
			self.options.alwaysOnTop = alwaysOnTop;
			if (cb) cb();
		});
	};

	/**
	 * Minmizes window along with all windows docked to it.
	 * @param {function} [cb] Optional callback
	 * @example
	 * FSBL.Clients.WindowClient.minimizeWithDockedWindows();
	 * @private
	 */
	this.minimizeWithDockedWindows = this.minimize;

	/**
	 * Restores window from a maximized state.
	 * @param {function} [cb] Optional callback
	 * @example
	 * FSBL.Clients.WindowClient.restore();
	 */
	this.restore = function (cb) {
		finsembleWindow.getState((err, windowState) => {

			if (windowState === "minimized") {
				finsembleWindow.restore(function (err) {
					if (!err) {
						self.windowState = "normal";
					} else {
						Logger.system.error("WindowClient:restore", err);
					}
					if (cb) {
						cb(err);
					}

				});
			} else {
				self.options.defaultLeft = self.options.cachedLeft;
				self.options.defaultTop = self.options.cachedTop;
				self.options.defaultWidth = self.options.cachedWidth;
				self.options.defaultHeight = self.options.cachedHeight;
				self.routerClient.query("DockingService.restoreFromMaximize", {
					name: finsembleWindow.name
				}, function (err, response) {
					if (cb) {
						cb(err);
					}
				});
			}
		});
	};

	this.cacheBounds = function (cb) {
		this.getBounds((err, bounds) => {
			this.options.cachedLeft = this.options.defaultLeft = bounds.left;
			this.options.cachedTop = this.options.defaultTop = bounds.top;
			this.options.cachedWidth = this.options.defaultWidth = bounds.width;
			this.options.cachedHeight = this.options.defaultHeight = bounds.height;
			if (cb) {
				cb(bounds);
			}
		});
	};

	/**
	 * Maximizes the window. Also takes into account the application toolbar.
	 * @param {function} cb Optional callback
	 * @todo, when fixed components are a thing, make sure that maximize doesn't sit on top of them either.
	 * @example
	 * FSBL.Clients.WindowClient.maximize();
	 */
	this.maximize = function (cb) {
		var self = this;
		this.cacheBounds(function () {
			self.routerClient.query("DockingService.maximizeWindow",
				{
					name: finsembleWindow.name,
					windowIdentifier: finsembleWindow.windowIdentifier
				}, function (err, response) {
					self.options.defaultLeft = response.data.left;
					self.options.defaultTop = response.data.top;
					self.options.defaultWidth = response.data.width;
					self.options.defaultHeight = response.data.height;

					self.windowState = "maximized";
					if (cb) {
						return cb(err);
					}
				});
		});
	};
	/**
	 * FinWindow destructor (more or less). Removes all of the listeners that we added when the window was created.
	 */
	this.removeFinWindowEventListeners = function () {
		finsembleWindow.removeEventListener("maximized", onWindowMaximized);
		finsembleWindow.removeEventListener("restored", onWindowRestored);
		finsembleWindow.removeEventListener("blurred", onWindowBlurred);
		finsembleWindow.removeEventListener("focused", onWindowFocused);
		finsembleWindow.removeEventListener("close-requested", onClose);
		finsembleWindow.removeEventListener("minimized", onWindowMinimized);
	};


	/**
	 * This function injects the header bar into all frameless windows that request it. This should only be used if you've decided not to use the provided <code>WindowClient.start()</code> method.
	 *
	 * **NOTE:** If you are using the finsemble windowTitleBar component, you do not need to call this function.
	 * @private
	 */
	this.injectDOM = function (headerHeight) {
		//for the aesthetics.

		if (document.getElementById("FSBLHeader")) { return; }
		var template = document.createElement("div");
		template.innerHTML = "<div id=\"FSBLHeader\"" + (headerHeight ? " style=height:" + headerHeight : "") + "></div>";
		document.body.insertBefore(template.firstChild, document.body.firstChild);
	};

	/**
	 * Injects the windowTitleBar into the window.
	 * @param {function} cb Callback function
	 * @return {object} Reference to a RouterClient.query
	 * @private
	 */
	this.injectFSBL = function (params, cb) {
		//This flag is set by the launcher service. It tells us if FSBL was injected
		return self.routerClient.query("Launcher.getWindowTitleBar", { config: self.options, titleComponent: params.component }, function (err, response) {//Should probably switch this to a launcher client calls
			if (params.bodyMarginTop == "auto") {
				function setHeaderHeight() {
					let header = document.getElementsByClassName("fsbl-header")[0];
					if (!header) { //wait for header to be rendered
						return setTimeout(setHeaderHeight, 100);
					}
					let headerHeight = window.getComputedStyle(header, null).getPropertyValue("height");
					document.body.style.marginTop = headerHeight;
					if (params.bumpElements && params.bumpElements.bumpBy === "auto") {
						params.bumpElements.bumpBy = headerHeight;
						self.bumpFixedElements(params.bumpElements);
					}
				}
				setHeaderHeight();

			}
			if (cb) {
				cb(err, response);
			}
		});
	};

	/**
	 * Given a field, this function retrieves app state. If no params are given you get the full state
	 * @param {object} params
	 * @param {string} params.field field
	 *  @param {array} params.fields fields
	 * @param {function} cb Callback
	 * @example <caption>The example below shows how we retrieve data to restore the layout in our charts.</caption>
	 * FSBL.Clients.WindowClient.getComponentState({
	 *	 field: 'myChartLayout',
	 *}, function (err, state) {
	 *	if (state === null) {
	 *		return;
	 *	}
	 *	importLayout(state);
	 *});
	 * FSBL.Clients.WindowClient.getComponentState({
	 *	 fields: ['myChartLayout', 'chartType'],
	 *}, function (err, state) {
	 *	if (state === null) {
	 *		return;
	 *	}
	 * 	var chartType = state['chartType'];
	 *  var myChartLayout = state['myChartLayout'];
	 *});
	 **/
	this.getComponentState = function (params, cb) {

		if (!params) { params = {}; }
		if (params.fields && !Array.isArray(params.fields)) { params.fields = [params.fields]; }
		Validate.args(params, "object", cb, "function");
		//if (!finWindow) { finWindow = fin.desktop.Window.getCurrent(); } //TODO: why are we checking here??
		params.windowName = finsembleWindow.name;

		var hash = self.getContainerHash(params.windowName);

		StorageClient.get({ topic: WORKSPACE_CACHE_TOPIC, key: hash }, function (err, response) {
			var data = response;
			if (response && params.field) {
				self.componentState = data || {};
				cb(err, data[params.field]);
			} else if (params.fields) {
				var respObject = {};
				for (var i = 0; i < params.fields.length; i++) {
					if (data[params.fields[i]]) {
						respObject[params.fields[i]] = data[params.fields[i]];
					}
				}
				return cb(null, respObject);

			} else if (response) {
				return cb(null, data);
			} else {
				Logger.system.info("WindowClient:getComponentState:error, response, params", err, response, params);
				cb("Not found", response);
			}
		});
	};

	/**
	 * Checks to see if this save makes the workspace 'dirty'. We use this when deciding whether to prompt the user to save their workspace.
	 * @param {object} params
	 * @param {string} params.field field
	 * @param {string} params.windowName windowName
	 * @param {function} cb Callback
	 * @private
	 */
	this.compareSavedState = function (params) {
		// if (!WorkspaceClient || WorkspaceClient.activeWorkspace.isDirty) { return; }
		var hash = util.camelCase(WorkspaceClient.activeWorkspace.name, finsembleWindow.name, params.windowName);
		StorageClient.get({ topic: WORKSPACE_CACHE_TOPIC, key: hash }, function (err, response) {
			Logger.system.debug("comparing saved state response:", response, "params:", params);

			/**
			 * We clone the value below because:
			 *
			 * let's say that the user passes this in:
			 * {value: undefined,
			 * anotherValue: true}.
			 *
			 * When that is persisted to localStorage, it'll come back as {anotherValue: true}. Those two values are different. So we stringify the value coming in to compare it to what was saved.
			 */
			let cleanValue = JSON.parse(JSON.stringify(params.value));
			if (!response || !deepEqual(response[params.field], cleanValue)) {
				Logger.system.debug("APPLICATION LIFECYCLE:  Setting Active Workspace Dirty: Saved state does not match current component state");
				self.dirtyTheWorkspace();
			}
		});
	};

	/**
	 * Given a field, this function sets and persists app state.
	 * @param {object} params
	 * @param {string} [params.field] field
	 * @param {array} [params.fields] fields
	 * @param {function=} cb Callback
	 * @example <caption>The example below shows how we save our chart layout when it changes.</caption>
	 * var s = stx.exportLayout(true);
	 * //saving layout'
	 * FSBL.Clients.WindowClient.setComponentState({ field: 'myChartLayout', value: s });
	 * FSBL.Clients.WindowClient.setComponentState({ fields: [{field:'myChartLayout', value: s }, {field:'chartType', value: 'mountain'}]);
	 **/
	this.setComponentState = function (params, cb) {
		Validate.args(params, "object", cb, "function=") && Validate.args2("params.field", params.field, "string");
		params.windowName = finsembleWindow.name;
		var hash = self.getContainerHash(params.windowName);
		let fields = params.fields;

		if (params.field) {
			fields = [{
				field: params.field,
				value: params.value
			}];
		}
		for (let i = 0; i < fields.length; i++) {
			let field = fields[i];
			if (!field.field || !field.value) { continue; }
			self.componentState[field.field] = field.value;
		}
		self.compareSavedState(params);
		Logger.system.debug("COMPONENT LIFECYCLE:SAVING STATE:", self.componentState);
		StorageClient.save({ topic: WORKSPACE_CACHE_TOPIC, key: hash, value: self.componentState }, function (err, response) {
			if (cb) { cb(err, response); }
		});
	};
	/**
	 * Gets containerHash given a containerId.
	 * @param {string} windowName The name of the window
	 * @returns {string} Hash for the window
	 * @private
	 */
	this.getContainerHash = function (windowName) {
		return util.camelCase(self.windowHash, windowName);
	};
	this.formGroup = function () {
		self.routerClient.transmit("DockingService.formGroup", {
			windowName: finsembleWindow.name
		});
		this.dirtyTheWorkspace();
	};
	this.dirtyTheWorkspace = function () {
		if (WorkspaceClient && !WorkspaceClient.activeWorkspace.isDirty) {
			this.routerClient.transmit("WorkspaceService.setActiveWorkspaceDirty", null, null);
		}
	};
	/**
	 * This function is critical if you want docking and snapping to work. It transmits a message to the LauncherService, which registers it as a dockable window.
	 *
	 * **NOTE:** If you are using the finsemble windowTitleBar component, you do not need to call this function.
	 * @param {object} params Parameters
	 * @example
	 * FSBL.Clients.WindowClient.registerWithDockingManager();
	 * @private
	 */
	this.registerWithDockingManager = function (params, cb) {
		var windowName = finsembleWindow.name;
		var uuid = finsembleWindow.uuid;
		self.routerClient.query("DockingService.registerWindow", {
			name: windowName,
			uuid: uuid,
			options: params || {},
			windowType: "OpenFinWindow"
		}, function () {
			Logger.system.debug("WINDOW LIFECYCLE: Docking Registration complete.");
			if (cb) {
				cb();
			}
		});
		self.routerClient.addListener("DockingService." + windowName, function (err, response) {
			if (response.data.command === "saveWindowLocation") {
				self.saveWindowBounds(response.data.bounds, true);
			} else if (response.data.command === "updateWindowLocation") {
				self.options.defaultLeft = response.data.bounds.left;
				self.options.defaultTop = response.data.bounds.top;
				self.options.defaultWidth = response.data.bounds.width;
				self.options.defaultHeight = response.data.bounds.height;
			}
		});
	};

	/**
	 * This function is critical if you don't want to keep references of windows in the LauncherService after they close. It simply notifies the LauncherService that the window is no longer dockable. It's invoked when the window is closed.
	 * **NOTE:** If you are using the finsemble windowTitleBar component, you do not need to call this function.
	 * @param {boolean} removeFromWorkspace true to remove from workspace
	 * @example
	 * FSBL.Clients.WindowClient.deregisterWithDockingManager();
	 * @private
	 */
	this.deregisterWithDockingManager = function (removeFromWorkspace) {
		var windowName = finsembleWindow.name;
		this.routerClient.transmit("DockingService.deregisterWindow", {
			name: windowName,
			userInitiated: removeFromWorkspace
		});
	};

	/**
	 * @private
	 */
	this.enableHotkeys = function () {
		this.enableDevToolsHotkey();
		this.enableReloadHotkey();
	};

	/**
	 * Helper function to display devtools if you disable context-menus on your chromium windows. You must call this function if you want the hotkey to work.
	 * @private
	 */
	this.enableReloadHotkey = function () {
		window.addEventListener("keydown", function (e) {
			if (e.keyCode === 82 && e.altKey && e.ctrlKey) {
				fin.desktop.System.clearCache({
					cache: true,
					cookies: false,
					localStorage: false,
					appcache: true,
					userData: false
				});
				window.location.reload();
			}
		});
	};

	/**
	 * Helper function to display devtools if you disable context-menus on your chromium windows. You must call this function if you want the hotkey to work.
	 * @private
	 */
	this.enableDevToolsHotkey = function () {
		window.addEventListener("keydown", function (e) {
			if (e.keyCode === 68 && e.altKey && e.ctrlKey) {
				var application = fin.desktop.Application.getCurrent();
				application.getManifest(function (manifest) {
					var uuid = manifest.startup_app.uuid;
					var windowName = finsembleWindow.name;
					fin.desktop.System.showDeveloperTools(uuid, windowName);
				}, function (err) {
					Logger.system.error("devtools", err);
				});
			}
		});
	};

	/*
	 * Bumps top-level containers down below the windowTitleBar.
	 * @private
	 */
	this.bumpFixedElements = function (params) {
		if (!params || !(params.absolute || params.fixed)) {
			return;
		}
		var elems = document.body.getElementsByTagName("*");
		var len = elems.length;

		for (var i = 0; i < len; i++) {
			if (elems[i].id === "FSBLHeader" || elems[i].classList.contains("fsbl-header")) { continue; }
			var style = window.getComputedStyle(elems[i], null),
				possibleZeros = ["0", "0px", 0];

			var topStyle = style.getPropertyValue("top");

			//only target top-level fixed/absolutely positioned containers.
			if (params.absolute && elems[i].parentNode === document.body && style.getPropertyValue("position") == "absolute") {
				if (params.absolute == "all") {
					elems[i].style.top = "calc(" + topStyle + " + " + params.bumpBy + ")";
				} else if (params.absolute == "0Positioned" && possibleZeros.includes(topStyle)) {
					elems[i].style.top = params.bumpBy;
				}
			} else if (params.fixed && style.getPropertyValue("position") == "fixed") {
				if (params.fixed == "all") {
					elems[i].style.top = "calc(" + topStyle + " + " + params.bumpBy + ")";
				} else if (params.fixed == "0Positioned" && possibleZeros.includes(topStyle)) {
					elems[i].style.top = params.bumpBy;
				}
			}
		}
	};

	/*
	 * Forces window to sit on top of other windows.
	 * @example
	 * FSBL.Clients.WindowClient.bringWindowToFront();
	 */
	this.bringWindowToFront = function () {
		finsembleWindow.isShowing(function (err, isShowing) {
			if (isShowing) {
				finsembleWindow.bringToFront({ forceFocus: true },
					function (err) {
						if (err) {
							Logger.system.error("WindowClient.bringWindowToFront: failure:" + err);
						} else {
							Logger.system.info("WindowClient.bringWindowToFront: success");
						}
					});
			}
		});
	};

	/**
	 * The Finsemble Window Title Bar is injected if FSBLHeader: true or FSBLHeader is an object with the same items as the properties of params below as this function is in the component's config. If you want to inject the Finsemble header later, you can do so by calling this function
	 * @param {object} 	params
	 * @param {string} params.component Component to inject. Default is "windowTitleBar"
	 * @param {object} params.bumpElements
	 * @param {string} params.bumpElements.fixed Either false, "all" or "0Positioned". If all, all fixed elements are moved. 0Positioned only moves elements that have top 0. Default is all.
	 * @param {string} params.bumpElements.absolute Either false, "all" or "0Positioned". If all, all fixed elements are moved. 0Positioned only moves elements that have top 0. Only applies to children of the body. Default is all.
	 * @param {string} params.bumpElements.bumpBy Since version 2.3.2, default is "auto". "auto" only works if bodyMarginTop is also "auto". Default is "32px" in previous versions.
	 * @param {string} params.bodyMarginTop Sets the body margin. Default is "auto" since version 2.3.2. Default is "30px" in prior versions
	 * @param {string} params.forceHeaderHeight Sets a height to the main FSBLHeader div.
	 */
	this.injectHeader = function (params, cb) {
		if (self.hasHeader) return;
		self.hasHeader = true;

		var defaultParams = {
			component: "windowTitleBar",
			bumpElements: {
				fixed: "all",
				absolute: "all",
				bumpBy: "auto"
			},
			bodyMarginTop: "auto",
			forceHeaderHeight: false
		};
		if (!params || params === true) {
			params = defaultParams;
		} else {
			params = Object.assign(defaultParams, params);
		}

		self.injectDOM(params.forceHeaderHeight);
		if (params.bumpElements && params.bumpElements.bumpBy !== "auto") {
			this.bumpFixedElements(params.bumpElements);
		}
		if (params.bodyMarginTop && params.bodyMarginTop !== "auto") {
			document.body.style.marginTop = params.bodyMarginTop;
		}

		async.parallel([
			(done) => { self.registerWithDockingManager({}, done); },
			(done) => { self.injectFSBL(params, done); }
		],
			cb);
	};

	/**
	 * This function is invoked inside of {@link WindowClient#start|WindowClient.start()}. It adds listeners for 'close' (when the workspace is switched), 'bringToFront', 'restore', and 'move' (used in AutoArrange).
	 *
	 * **NOTE:** If you are using the finsemble windowTitleBar component, you do not need to call this function.
	 * @example
	 * FSBL.Clients.WorkspaceClient.addWorkspaceListeners();
	 * @private
	 */
	this.addWorkspaceListeners = function () {

		// pubsub ensures close command can't be loss in a race condition (e.g. if close is issued while the destinateion window was reloading)
		self.routerClient.subscribe("WorkspaceService." + finsembleWindow.name, function (err, response) {
			if (response.data.state === "start") {
				// do nothing since normal startup
			} else if (response.data.state === "close") {
				// since going to close, reset this pubsub state back to default state (otherwise would keep closing);
				// note may not see local log of this outgoing publish because window is closing (but publish will go out before close)
				self.routerClient.publish("WorkspaceService." + finsembleWindow.name, { "state": "start" });

				onClose({
					removeFromWorkspace: false
				});
			} else {
				Logger.system.warn("incoming notify has unknown state", finsembleWindow.name, response.data);
			}
		});

		self.routerClient.addListener("WorkspaceService." + finsembleWindow.name, function (err, response) {
			switch (response.data.command) {
				case "bringToFront":
					self.bringWindowToFront();
					break;
				case "restore":
					self.restore();
					break;
				case "move":
					finsembleWindow.animate({
						transition: {
							position: {
								left: response.data.left,
								top: response.data.top,
								duration: 250
							}
						}, options:
							{}
					},
					function (err) {
						if (err) {
							Logger.system.error("WindowClient:WorkspaceService: Animate failed: " + err);
						} else {
							self.routerClient.transmit("DockingService.updateWindowPositions", {});
							Logger.system.debug("WindowClient:WorkspaceService successfully moved window.");
							self.getBounds((err, bounds) => {
								self.saveWindowBounds(bounds, true);
							});
						}
					});
					break;
			}
		});
	};

	this.injectStylesheetOverride = function () {
		var node = document.createElement("style");
		node.type = "text/css";
		node.appendChild(document.createTextNode(self.options.customData.cssOverride));
		document.body.appendChild(node);
	};
	/**
	 * If we spawned this openfin app from our parent application, we listen on that application for certain events that might fire _if_ our parent goes down. If the parent goes down, we want to kill its children as well.
	 * @private
	 */
	this.checkIfChildApp = function () {
		if (self.options &&
			self.options.customData &&
			self.options.customData.parentUUID &&
			self.options.customData.parentUUID !== fin.desktop.Application.getCurrent().uuid) {
			let parent = fin.desktop.Application.wrap(self.options.customData.parentUUID);
			parent.addEventListener("crashed", onClose.bind(null, false));
			parent.addEventListener("initialized", onClose.bind(null, false));
			parent.addEventListener("out-of-memory", onClose.bind(null, false));
		}
	};
	/**
	 * Adds listeners to handle hash changes and finWindow listeners.
	 * @private
	 * @param {function} cb
	 */
	this.addListeners = function (cb = Function.prototype) {
		var self = this;

		self.listenForHashChanges();

		//FinsembleWindow listenrs
		finsembleWindow.addEventListener("close-requested", onClose);
		finsembleWindow.addEventListener("maximized", onWindowMaximized);
		finsembleWindow.addEventListener("minimized", onWindowMinimized);
		finsembleWindow.addEventListener("restored", onWindowRestored);
		// On Blur remove the border from window
		finsembleWindow.addEventListener("blurred", onWindowBlurred);
		// On focus add a border to the window
		finsembleWindow.addEventListener("focused", onWindowFocused);
		if (typeof FSBL !== "undefined") {
			FSBL.onShutdown(function () {
				Logger.system.info("WINDOW LIFECYCLE:SHUTDOWN: FSBL.onShutdown start");
				return new Promise(function (resolve) {
					Logger.system.debug("FSBL.onShutdown");
					onClose({
						removeFromWorkspace: false,
						closeWindow: false
					}, resolve);
				});
			});
		}

		cb();
	};


	/**
	 * Sends a command to the header. Commands affect the header state,
	 * so that the UI reflects what is going on in the component window.
	 * @param {string} command The state object to set
	 * @param {object} state The new state (merged with existing)
	 */
	this.updateHeaderState = function (command, state) {
		if (!this.commandChannel) {
			return;
		}
		this.commandChannel(command, state);
	};

	/**
	 * Establishes a command channel with a header. The WindowClient can
	 * update header state via this channel.
	 * @param {function} commandChannel A function callback that receives commands
	 */
	this.headerCommandChannel = function (commandChannel) {
		this.commandChannel = commandChannel;
	};

	/**
	 * Ejects the window from the docking group
	 */
	this.ejectFromGroup = function () {
		var windowName = this.getCurrentWindow().name;
		FSBL.Clients.RouterClient.query("DockingService.leaveGroup", {
			name: windowName
		});
		this.dirtyTheWorkspace();
	};

	/**
	 * This function does two things:
	 *
	 * 1. It sets the window's title in the windowTitleBar component, and
	 * 2. It sets the title in the DOM.
	 *
	 * This is useful if you like to keep the window's title in sync with a piece of data (e.g., a Symbol);
	 * @param {String} title Window title.
	 * @todo Allow HTML or classes to be injected into the title.
	 * @example <caption>The code shows how you would change your window title.</caption>
	 *  FSBL.Clients.WindowClient.setWindowTitle("My Component's New Title");
	 */
	this.setWindowTitle = function (title) {
		Validate.args(title, "string");
		this.title = title;
		//document.title = title;  // casuses flickering in chromium 53
		self.updateHeaderState("Main", { windowTitle: title });
	};
	/**
	 * Retrieves data that was set with {@link LauncherClient#spawn}.
	 * @return {object} The data or empty object if no data was set. *Note, this will never return null or undefined.*
	 */
	this.getSpawnData = function () {
		if (!this.options.customData) { return {}; }
		var spawnData = this.options.customData.spawnData;
		if (typeof spawnData === "undefined") { return {}; }
		return spawnData;
	};

	/**
	 * Returns a reference to the current window for the *component*. For most
	 * components this will just return the finWindow, but for a compound component
	 * it will return a CompoundWindow.
	 * @returns {finWindow}
	 */
	this.getCurrentWindow = function () { //TODO - return finsembleWindow
		return fin.desktop.Window.getCurrent();
	};

	/**
		 * For the DOM element that has been passed in, this function returns a bounding box that is relative
		 * to the OpenFin virtual monitor space. That is, it returns the position of the DOM element on the desktop.
		 * @param {HTMLElement|string} element A selector or HTMLElement
		 * @private
		 * @todo convert to use monitor util function
		 */
	this.getDesktopBoundingBox = function (element) {
		var el = element;
		if (typeof (element) === "string") {
			el = document.querySelector(element);
		}
		let box = el.getBoundingClientRect();
		let boundingBox = {
			top: this.options.defaultTop - box.top,
			left: this.options.defaultLeft + box.left,
			width: box.width,
			height: box.height
		};

		boundingBox.right = boundingBox.left + boundingBox.width;
		boundingBox.bottom = boundingBox.top + boundingBox.height;

		return boundingBox;
	};

	this.isPointInBox = function (point, box) {
		if (!box.bottom) box.bottom = box.top + box.height;
		if (!box.right) box.right = box.left + box.width;
		return (point.x > box.left && point.x < box.right && point.y < box.bottom && point.y > box.top);
	};

	/**
	 * Returns (via callback) true if the mouse is currently located (hovering) over the requested element.
	 * @param {HTMLElement|string} element The element, or a selector, to check
	 * @param {function} cb A function that returns a boolean
	 * @private
	 * @todo move to WindowClient
	 */
	this.isMouseOverDOMElement = function (element, cb) {
		var boundingBox = this.getDesktopBoundingBox(element);
		System.getMousePosition((err, position) => {
			cb(this.isPointInBox(position, boundingBox));
		});
	};

	/**
	 * Returns a window identifier for the current component.
	 * @returns {windowIdentifier}
	 */
	this.getWindowIdentifier = function () {
		var componentType = null;
		if (this.options.customData && this.options.customData.component)
			componentType = this.options.customData.component.type;
		return {
			windowName: this.options.name,
			uuid: this.options.uuid,
			componentType: componentType
		};
	};

	/**
	 * Highlights the window as active by creating a border around the window.
	 *
	 * @param {boolean} active  Set to false to turn off activity
	 */
	this.setActive = function (active) {
		if (active) {
			addClass(document.documentElement, "desktop-active");
		} else {
			removeClass(document.documentElement, "desktop-active");
		}
	};
	this.getBounds = function (cb) {
		fin.desktop.Window.getCurrent().getBounds(function (bounds) {
			cb(null, bounds);
		});
	};

	
	/* Stuff for tiling and tabbing */
	/**
	 *
	 * @param {*} params - params.windowIdentifier is required.
	 * @param {*} cb
	 */
	this.startTilingOrTabbing = function (params, cb) {
		FSBL.Clients.RouterClient.transmit("DockingService.startTilingOrTabbing", params);
	};

	/**
	 *
	 * @param {*} params - params.windowIdentifier is required.
	 * @param {*} cb
	 */
	this.cancelTilingOrTabbing = function (params, cb) {
		FSBL.Clients.RouterClient.transmit("DockingService.cancelTilingOrTabbing", params);
	};

	/**
	 *
	 * @param {*} params - params.windowIdentifier is required.
	 * @param {*} cb
	 */
	this.stopTilingOrTabbing = function (params = {}, cb) {
		let windowPosition = {
			left: self.options.left,
			top: self.options.top,
			height: self.options.height,
			width: self.options.width,
			right: self.options.right,
			bottom: self.options.bottom,
		};
		if (!params.mousePosition) {
			return System.getMousePosition((err, position) => {
				params.mousePosition = position;
				if (!params.allowDropOnSelf && self.isPointInBox(position, windowPosition)) {
					return FSBL.Clients.RouterClient.transmit("DockingService.cancelTilingOrTabbing", params);
				}
				FSBL.Clients.RouterClient.transmit("DockingService.stopTilingOrTabbing", params);
			});
		} else {
			if (!params.allowDropOnSelf && self.isPointInBox(params.mousePosition, windowPosition)) {
				return FSBL.Clients.RouterClient.transmit("DockingService.cancelTilingOrTabbing", params);
			}
			FSBL.Clients.RouterClient.transmit("DockingService.stopTilingOrTabbing", params);
		}
	};

	/* End stuff for tiling and tabbing */

	/**
	 * Private copy of getMonitorInfo from LauncherClient. We have to include it here to avoid a circular reference between LauncherClient and WindowClient.
	 * @private
	 */
	this.getMonitorInfo = function (params, cb) {
		util.getMyWindowIdentifier(function (myWindowIdentifier) {
			if (!params.windowIdentifier) {
				params.windowIdentifier = myWindowIdentifier;
			}
			self.routerClient.query("Launcher.getMonitorInfo", params, function (err, response) {
				if (cb) {
					cb(err, response.data);
				}
			});
		});
	};
	/**
	 * Automatically resizes the height of the window to fit the full DOM.
	 * @param {object} 	params
	 * @param {object} params.padding
	 * @param {number} params.padding.height
	 * @param {number} params.padding.width
	 * @param {function} [cb] Optional callback when complete
	 */
	this.fitToDOM = function (params, cb) {
		var children = document.body.children;
		var element = document.getElementsByTagName("body")[0],
			style = window.getComputedStyle(element),
			marginTop = style.getPropertyValue("margin-top"),
			marginBottom = style.getPropertyValue("margin-bottom");
		var margin = parseInt(marginTop, 10) + parseInt(marginBottom, 10);
		if (isNaN(margin)) margin = 0;
		var newHeight = margin;
		var newWidth = this.options.width;
		for (var i = 0; i < children.length; i++) {
			var child = children[i];

			newHeight += child.offsetHeight + margin;
			//elmMargin = parseInt(child.style.marginTop, 10) + parseInt(child.style.marginBottom, 10);
		}

		if (typeof (params) === "function") {
			cb = params;
			params = null;
		}
		if (params && params.padding) {
			if (params.padding.height) {
				newHeight += params.padding.height;
			}
			if (params.padding.width) {
				newWidth += params.padding.width;
			}
		}

		if (params && params.maxHeight && newHeight > params.maxHeight) {
			newHeight = params.maxHeight;
		}
		Logger.system.debug("WindowClient.FitToDOM:newHeight", newHeight, params);

		//@todo, do this statically
		this.getMonitorInfo({}, function (err, monitorInfo) {
			//Logger.system.log("updates111 in here");
			let fixBounds = true;
			if (newHeight >= monitorInfo.unclaimedRect.height) {
				newHeight = monitorInfo.unclaimedRect.height;
				fixBounds = true;
			}
			if (newWidth >= monitorInfo.unclaimedRect.width) {
				newWidth = monitorInfo.unclaimedRect.width;
				fixBounds = true;
			}

			if (fixBounds) {
				//bounds.x and bounds.y are null on mac. Not sure if they're set on windows, but this manifested itself with an error on macs that didn't resize.
				Logger.system.debug("WindowClient.FitToDOM:fixBounds", newHeight, newWidth);

				finsembleWindow.finWindow.resizeTo(
					newWidth,
					newHeight,
					"top-left",
					function () {
						finsembleWindow.getBounds(function (err, bounds) {
							if (cb) {
								cb();
							}
						});
					}, function (err) {
						Logger.system.error("Error in finsembleWindow.resizeTo", err);
					});
			} else if (cb) {
				setTimeout(cb, 0);
			}
		});
	};
	/**
	 * Kicks off all of the necessary methods for the app. It
	 * 1. Injects the header bar into the window.
	 * 2. Sets up listeners to handle close and move requests from the appplication.
	 * 3. Adds a listener that saves the window's state every time it's moved or resized.
	 * @param {object} callback
	 * See the [windowTitleBar tutorial]{@tutorial windowTitleBarComponent} for more information.
	 * @private
	 */
	this.start = function (callback = Function.prototype) {
		Validate.args(callback, "function");
		var customData = null,
			isCompoundWindow = false,
			shouldInjectHeader = false,
			shouldInjectCSS = false;

		finsembleWindow = self.finsembleWindow;
		self.windowHash = util.camelCase("activeWorkspace", finsembleWindow.name);
		self.addListeners();
		self.retrieveMonitorDimensions();
		//where we store componentState for the window.
		self.componentState = {};

		self.getInitialOptions(() => {
			//The functions above are necessary to finish initializing the windowClient. The functions below are independent of one another.
			customData = self.options.customData;
			if (customData) {
				isCompoundWindow = typeof customData.window === "undefined" ? false : customData.window.compound;
				if (customData.cssOverride) {
					Logger.system.debug("Window has cssOverride. See local window to inspect object");
					console.debug(customData.cssOverride);
					shouldInjectCSS = true;
				}

				shouldInjectHeader = customData.foreign && !isCompoundWindow && customData.foreign.components["Window Manager"].FSBLHeader;
			}

			async.parallel([
				function cacheInitialBounds(done) {
					self.cacheInitialBounds(done);
				},
				function addWorkspaceAndBoundsListeners(done) {
					if (!isCompoundWindow) {
						self.addWorkspaceListeners();
						self.listenForBoundsChanged();
					}
					done();
				},
				function injectCSS(done) {
					if (shouldInjectCSS) {
						self.injectStylesheetOverride();
					}
					done();
				},
				function injectHeader(done) {
					if (shouldInjectHeader) {
						self.injectHeader(customData.foreign.components["Window Manager"].FSBLHeader, done);
					} else {
						done();
					}
				}
			], callback);
		});
	};
	return self;
}

var windowClient = new WindowClient({
	startupDependencies: {
		requiredServices: ["storageService"]
	},
	onReady: function (cb) {
		windowClient.start(() => {
			cb();
		});
	},
	name: "windowClient"
});

//windowClient.initialize();

module.exports = windowClient;