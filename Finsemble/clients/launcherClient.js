/*!
* Copyright 2017 by ChartIQ, Inc.
* All rights reserved.
*/
var BaseClient = require("./baseClient");
var WindowClient = require("./windowClient");
var util = require("../common/util");
var Validate = require("../common/validate"); // Finsemble args validator

var Logger = require("./logger");

/**
 * An object that includes all the potential identifications for a window.
 * For instance, one can try and obtain a reference for a window if some of these values are known.
 *
 * @typedef LauncherClient~windowIdentifier
 * @property {string} [windowName] The name of the physical OpenFin window, or a reference to a native window that was launched with Assimilation service
 * @property {string} [uuid] Optional uuid of a particular OpenFin application process
 * @property {string} [componentType] The type of component
 * @property {number} [monitor] The number of the monitor. Potentially used to disambiguate multiple components with the same name (for searches only)
 */

/**
 * Finsemble windowDescriptor.
 * This is a superset of the [Openfin windowOptions object](http://cdn.openfin.co/jsdocs/stable/tutorial-windowOptions.html).
 * In addition to the values provided by OpenFin, the windowDescriptor includes the following values.
 *
 * @typedef LauncherClient~windowDescriptor
 * @type {object}
 * @property {string} [url] url to load (if HTML5 component).
 * @property {string} [native] The name of the native app (if a native component launched by Assimilation service).
 * @property {string} name The name of the window (sometimes randomly assigned).
 * @property {string} componentType The type of component (from components.json).
 */

/**
 *
 * A convenient assembly of native JavaScript window, OpenFin window and windowDescriptor.
 *
 * @typedef LauncherClient~rawWindowResult
 * @type {object}
 * @property {LauncherClient~windowDescriptor} windowDescriptor The window descriptor.
 * @property {Fin.Desktop.Window} finWindow The OpenFin window.
 * @property {Window} browserWindow The native JavaScript window.
 *
 */

// A map of related menus that is kept by handleToggle.
var okayToOpenMenu = {};

/**
 *
 * @introduction
 * <h2>Launcher Client</h2>
 * The Launcher Client handles spawning windows. It also maintains the list of spawnable components.
 * 
 *
 *
 * @hideConstructor true
 * @constructor
 */
class LauncherClient extends BaseClient {
	constructor(params) {
		super(params);
		Validate.args(params, "object=") && params && Validate.args2("params.onReady", params.onReady, "function=");
		this.windowClient = params.clients.windowClient;
	}

	/** @alias LauncherClient# */
	//var self = this;
	//BaseClient.call(this, params);

	/**
	 * Get a list of registered components (those that were entered into *components.json*).
	 *
	 * @param {Function} cb Callback returns an object map of components. Each component object
	 * contains the default config for that component.
	 */
	getComponentList(cb) {
		Validate.args(cb, "function");
		this.routerClient.query("Launcher.componentList", {}, function (err, response) {
			if (cb) {
				cb(err, response.data);
			}
		});
	}

	/**
	 * Get the component config (i.e. from components.json) for a specific component.
	 *
	 * @param {String} componentType The type of the component.
	 * @param {Function} cb Callback returns the default config (windowDescriptor) for the requested componentType.
	 *
	 */
	getComponentDefaultConfig(componentType, cb) {
		Validate.args(cb, "function");
		this.routerClient.query("Launcher.componentList", {}, function (err, response) {
			if (cb) {
				cb(err, response.data[componentType]);
			}
		});
	}

	/**
	 * Gets monitorInfo (dimensions and position) for a given windowIdentifier or for a specific monitor.
	 * If neither the identifier or monitor are provided then the monitorInfo for the current window is returned.
	 *
	 *
	 * The information returned contains a supplemented OpenFin monitor descriptor which contains:
	 *
	 * **monitorRect** - The full dimensions for the monitor from OpenFin.
	 *
	 * **availableRect** - The dimensions for the available space on the monitor (less windows toolbars).
	 *
	 * **unclaimedRect** - The dimensions for available monitor space less any space claimed by components (such as the application Toolbar).
	 *
	 * Each of these is supplemented with the following additional members:
	 *
	 * **width** - The width as calculated (right - left).
	 *
	 * **height** - The height as calculated (bottom - top).
	 *
	 * **position** - The position of the monitor, numerically from zero to X. Primary monitor is zero.
	 *
	 * **whichMonitor** - Contains the string "primary" if it is the primary monitor.
	 *
	 * @param  {object} [params]               Parameters
	 * @param  {LauncherClient~windowIdentifier} [params.windowIdentifier] The windowIdentifier to get the monitorInfo. If undefined, then the current window.
	 * @param  {any} [params.monitor] If passed then a specific monitor is identified. Valid values are the same as for {@link LauncherClient#spawn}.
	 * @param  {Function} cb               Returns a monitorInfo object containing the monitorRect, availableRect and unclaimedRect.
	 */
	getMonitorInfo(params, cb) {
		var self = this;
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
	}

	/**
	 * Gets monitorInfo (dimensions and position) for all monitors. Returns an array of monitorInfo objects. See {@link LauncherClient#getMonitorInfo} for the format of a monitorInfo object.
	 * 
	 * 
	 *
	 * @param  {Function} cb               Returns an array of monitorInfo objects.
	 */
	getMonitorInfoAll(cb) {
		this.routerClient.query("Launcher.getMonitorInfoAll", {}, function (err, response) {
			if (cb) {
				cb(err, response.data);
			}
		});
	}



	/**
	 * A convenience method for dealing with a common use-case, which is toggling the appearance and disappearance of a child window when a button is pressed, aka drop down menus. Simply call this method from the click handler for your element. Your child window will need to close itself on blur events.
	 * @param {HTMLElement|selector} element The DOM element, or selector, clicked by the end user
	 * @param {windowIdentifier} windowIdentifier Identifies the child window
	 * @param {object} params Parameters to be passed to {@link LauncherClient#showWindow} if the child window is allowed to open
	 */
	toggleWindowOnClick(element, windowIdentifier, params) {
		var self = this;
		var key = windowIdentifier.windowName + ":" + windowIdentifier.uuid;
		if (!windowIdentifier.windowName) key = windowIdentifier.componentType;
		//If the element was clicked while the menu was open then return right away. The menu window will receive a blur event and close. This method is dependent on the fact that blur events are processed before click events. This is the case by default with OpenFin, but if this turns out to be a problem then put this call inside of a setTimeout().
		if (okayToOpenMenu[key] === false) {
			okayToOpenMenu[key] = true;
			return;
		}
		var onDisplayed = function (showError, showResponse) {
			if (!showResponse) return;
			let finWindow = showResponse.finWindow;
			var onBlur = function (err, blurResponse) {
				okayToOpenMenu[key] = true;
				self.windowClient.isMouseOverDOMElement(element, function (mouseIsOverElement) {
					okayToOpenMenu[key] = !mouseIsOverElement;
				});
				finWindow.removeEventListener("blurred", onBlur);
			};
			finWindow.addEventListener("blurred", onBlur);
		};
		this.showWindow(windowIdentifier, params, onDisplayed);
	}

	/**
	 * Displays a window and relocates/resizes it according to the values contained in params.
	 *
	 * @param  {LauncherClient~windowIdentifier}   windowIdentifier A windowIdentifier.
	 * @param  {object}   params           Parameters. These are the same as {@link LauncherClient#spawn} with the folowing exceptions:
	 * @param {any} [params.monitor] Same as spawn() except that null or undefined means the window should not be moved to a different monitor.
	 * @param {any} [params.left] Same as spawn() except that null or undefined means the window should not be moved from current horizontal location.
	 * @param {any} [params.top] Same as spawn() except that null or undefined means the window should not be moved from current vertical location.
	 * @param {boolean} [params.spawnIfNotFound=false] If true, then spawns a new window if the requested one cannot be found.
	 * *Note, only works if the windowIdentifier contains a componentType.*
	 * @param {boolean} [params.slave] Cannot be set for an existing window. Will only go into effect if the window is spawned.
	 * (In other words, only use this in conjunction with spawnIfNotFound).
	 * @param {Function} cb Callback to be invoked after function is completed. Callback contains an object with the following information:
	 * **windowIdentifier** - The {@link LauncherClient~windowIdentifier} for the new window.
	 * **windowDescriptor** - The {@link LauncherClient~windowDescriptor} of the new window.
	 * **finWindow** - An OpenFin window referencing the new window.
	 */
	showWindow(windowIdentifier, params, cb) {
		Validate.args(windowIdentifier, "object", params, "object=", cb, "function=");
		var self = this;
		if (!params) { params = {}; }
		params = util.clone(params);
		if (!params.staggerPixels && params.staggerPixels !== 0) {
			params.staggerPixels = 100;
		}
		params.windowIdentifier = windowIdentifier;

		util.getMyWindowIdentifier(function (myWindowIdentifier) {
			if (!params.relativeWindow) {
				params.relativeWindow = myWindowIdentifier;
			}
			self.routerClient.query("Launcher.showWindow", params, function (err, response) {
				if (err) {
					return cb ? cb(err) : null;

				}
				var newWindowIdentifier = response.data.windowIdentifier;
				response.data.finWindow = fin.desktop.Window.wrap(newWindowIdentifier.uuid, newWindowIdentifier.windowName); //TODO: replace with FinsembleWindow - see also finishSpawn.
				cb ? cb(err, response.data) : null;

			});
		});
	}

	/**
	 * Asks the Launcher service to spawn a new component. Any parameter below can also be specified in config/components.json, which will
	 * then operate as the default for that value.
	 * 
	 * The launcher parameters mimic CSS window positioning.
	 * For instance, to set a full size window use `left=0`,`top=0`,`right=0`,`bottom=0`.
	 * This is functionally equivalent to: left=0,top=0,width="100%",height="100%"
	 *
	 * @param {String} component - Type of the component to launch. If null or undefined, then params.url will be used instead.
	 *
	 * @param {object} params
	 * @param {any} [params.monitor="mine"] Which monitor to place the new window.
	 * **"mine"** - Place the window on the same monitor as the calling window.
	 * A numeric value of monitor (where primary is zero).
	 * **"primary"**,**"next"** and **"previous"** indicate a specific monitor.
	 * **"all"** - Put a copy of the component on all monitors
	 *
	 * @param {string} [params.position=unclaimed] Defines a "viewport" for the spawn, with one of the following values:
	 *
	 * **"unclaimed"** (the default) Positioned based on the monitor space excluding space "claimed" by other components (such as toolbars).
	 * For instance, `top:0` will place the new component directly below the toolbar.
	 *
	 * **"available"** Positioned according to the coordinates available on the monitor itself, less space claimed by the operating system (such as the windows toolbar).
	 * For instance, `bottom:0` will place the new component with its bottom flush against the windows toolbar.
	 *
	 * **"monitor"** Positioned according to the absolute size of the monitor.
	 * For instance, `top:0` will place the component overlapping the toolbar.
	 *
	 * **"relative"** Positioned relative to the relativeWindow.
	 * For instance, `left:0;top:0` will joing the top left corner of the new component with the top left corner of the relative window.
	 *
	 * **"virtual"** Positoned against coordinates on the virtual screen.
	 * The virtual screen is the full viewing area of all monitors combined into a single theoretical monitor.
	 * @param {boolean} [params.dockOnSpawn=false] If true, will automatically dock the window with the "relative" window (dock to the parent window unless specified in params.relativeWindow).
	 * @param {any} [params.left] A pixel value representing the distance from the left edge of the viewport as defined by "position".
	 * A percentage value may also be used, representing the percentage distance from the left edge of the viewport relative to the viewport's width.
	 *
	 * **"adjacent"** will snap to the right edge of the spawning or relative window.
	 *
	 * **"center"** will center the window
	 *
	 * If neither left nor right are provided, then the default will be to stagger the window based on the last spawned window.
	 * *Note - the staggering algorithm has a timing element that is optimized based on user testing.*
	 *
	 * @param {any} [params.top] Same as left except related to the top of the viewport.
	 * @param {any} [params.right] Same as left except releated to the right of the viewport.
	 * @param {any} [params.bottom] Same as left except related to the bottom of the viewport.
	 *
	 * @param {any} [params.height] A pixel or percentage value.
	 * @param {any} [params.width] A pixel value or percentage value.
	 * @param {boolean} [params.forceOntoMonitor] If true will attempt to make the window no have parts outside the monitor boundary.
	 *
	 * @param {boolean} [params.ephemeral=false] Indicates that this window is ephemeral.
	 * An ephemeral window is a dialog, menu or other window that is temporarily displayed but usually hidden.
	 * Ephemeral windows automatically have the following OpenFin settings assigned: resizable: false, showTaskbarIcon: false, alwaysOnTop: true.
	 * *Note, use `options:{autoShow: false}` to prevent an ephemeral widow from showing automatically.*
	 *
	 * @param {number} [params.staggerPixels=100] Number of pixels to stagger (default when neither left, right, top or bottom are set).

	 * @param {boolean} [params.claimMonitorSpace] For use with permanent toolbars.
	 * The available space for other components will be reduced by the amount of space covered by the newly spawned component.
	 * This will be reflected in the `unclaimedRect` member from API calls that return monitorInfo. Users will be prevented
	 * from moving windows to a position that covers the claimed space. See `position: 'unclaimed'`.

	 * @param {LauncherClient~windowIdentifier} [params.relativeWindow=current window] The window to use when calculating any relative launches.
	 * If not set then the window from which spawn() was called.

	 * @param {boolean} [params.slave] If true then the new window will act as a slave to the relativeWindow (or the launching window if relativeWindow is not specified).
	 * Slave windows will automatically close when their parent windows close.

	 * @param {string} [params.url] Optional url to launch. Overrides what is passed in "component".

	 * @param {string} [params.native] @deprecated Please use windowType instead. Optional native application to launch with Assimilation service. Overrides what is passed in "component".

	 * @param {string} [params.windowType=openfin] Optional. Describes which type of component to spawn.
	 * 
	 * **openfin** - A normal OpenFin HTML window.
	 * 
	 * **assimilation** - A window that is managed by the Finsemble assimilation process (usually a native window without source code access). Requires "path" to be specified.
	 * 
	 * **native** - A native window that has implemented finsemble.dll. Requires "path" to be specified. [For more information](tutorial-RPCService.html).
	 * 
	 * **application** - A standalone application. This launch a component in its own browser process (splintered, giving it dedicated CPU and memory).
	 * This can also point to a standalone OpenFin application (such as from a third party). [For more information on integrating Openfin apps](tutorial-IntegratingAnOpenfinApplication.html).
	 *
	 * @param {string} [params.alias] Used when windowType is "native" or "assimilation". Specifies the alias of an OpenFin bundled asset.
	 * 
	 * @param {string} [params.path] Used when windowType is "native" or "assimilation". Specifies the path to the application. The path can be:
	 * The name of an exe that is on the system path (i.e. notepad.exe).
	 * The full path to an executable on the user's machine (i.e. C:\Program Files\app.exe)
	 * A system installed uri (i.e. myuri://myapp).
	 * 
	 * When windowType is "native" then additional arguments will be automatically appended to the path or the uri. These arguments can be captured by the native application
	 * in order to tie it to Finsemble's window tracking. When building an application with finsemble.dll, this is handled automatically. Those arguments are:
	 * 
	 * **uuid** - A generated UUID that uniquely identifies this window.
	 * 
	 * **left** - The x coordinate of the new window
	 * 
	 * **top** - The y coordinate of the new window
	 * 
	 * **width** - The width of the new window
	 * 
	 * **height** - The height of the new window
	 * 
	 * **openfinVersion** - The openfin version that Finsemble runs (necessary for native windows to connection on the OpenFin IAB)
	 * 
	 * **openfinSocketPort** - The openfin socket used for the IAB (necessary for Java windows that wish to use the OpenFin IAB)
	 * 
	 * **finsembleWindowName** - The name of the window in the Finsemble config
	 * 
	 * **componentType** - The component type in the Finsemble config
	 * 
	 * A common troublesome problem is when a native application needs to be launched from an intermediary application (such as a launcher or batch script). That intermediary
	 * application can pass these parameters which will allow the final application to connect back to Finsemble.
	 * 
	 * @param {string} [params.arguments] Used when windowType is "native" or "assimilation". Specifies the arguments to be sent to the application. This is used in conjunction with path. Arguments should be separated by spaces.
	 * Note that when params.argumentsAsQueryString is true, arguments should be a single string in uri format (i.e. a=1&b=2)
	 * 
	 * @param {boolean} [params.argumentsAsQueryString] For native applications launched by URI, the automatic arguments assigned by path are converted into a query string.
	 * 
	 * @param {string} [params.name] Optional window name. If not provided, then a random name will be assigned to the newly created OpenFin window.

	 * @param {string} [params.groupName] Optional group name. Adds windows to a group (unrelated to docking or linking) that is used for window management functions. If the group does not exist it will be created.

	 * @param {any} [params.data] Optional data to pass to the opening window.
	 * If set, then the spawned window can use {@link WindowClient#getSpawnData} to retrieve the data.

	 * @param {LauncherClient~windowDescriptor} [params.options] Properties to merge with the default windowDescriptor.
	 * Any value set here will be sent directly to the OpenFin window, and will override the effect of relevant parameters to spawn().
	 * See {@link http://cdn.openfin.co/jsdocs/stable/fin.desktop.Window.html#~options} for the full set and defaults, with the following exception:
	 * @param {boolean} [params.options.frame=false] By default, all Finsemble windows are frameless

	 * @param {boolean} [params.addToWorkspace=false] Whether to add the new component to the workspace.
	 * Even when true, the window will still not be added to the workspace if addToWorkspace==false in components.json config for the component type.

	 * @param {Function=} cb Callback to be invoked after function is completed. Callback contains an object with the following information:
	 * windowIdentifier - The {@LauncherClient~windowIdentifier} for the new component.
	 * windowDescriptor - The {@LauncherClient~windowDescriptor} for the new window.
	 * finWindow - An OpenFin window object that contains the spawned component.
	 * 
	 * @since 2.4.1 Added params.windowType (deprecated params.native), params.path, params.alias, params.argumentsAsQueryString - These are all for launching native apps.
	 *
	 */
	spawn(component, params, cb) {
		var self = this;

		Validate.args(component, "string", params, "object=", cb, "function=");
		if (!params) { params = {}; }
		params = util.clone(params);
		params.component = component;
		if (!params.options) {
			params.options = {};
		}
		if (!params.options.customData) {
			params.options.customData = {};
		}
		if (!params.staggerPixels && params.staggerPixels !== 0) {
			params.staggerPixels = 50;
		}
		Logger.system.debug(`Calling Spawn for componentType:${component}`);
		util.getMyWindowIdentifier(function (windowIdentifier) {
			params.launchingWindow = windowIdentifier;
			self.callSpawn(params, cb);
		});
	}

	/**
	 * Returns an object that provides raw access to a remote window.
	 * It returns an object that contains references to the Finsemble windowDescriptor, to
	 * the OpenFin window, and to the native JavaScript (browser) window.
	 *
	 * *This will only work for windows that are launched using the Finsemble Launcher API.*
	 *
	 * As in any browser, you will not be able to manipulate a window that has been launched
	 * cross domain or in a separate physical OpenFin application (separate process). Caution
	 * should be taken to prevent a window from being closed by the user if you plan on
	 * referencing it directly. Due to these inherent limitations we strongly advise against a
	 * paradigm of directly manipulating remote windows through JavaScript. Instead leverage the
	 * RouterClient to communicate between windows and to use an event based paradigm!
	 *
	 * @param  {object} params Parameters
	 * @param {string} params.windowName The name of the window to access.
	 * @return {LauncherClient~rawWindowResult} An object containing windowDescriptor, finWindow, and browserWindow. Or null if window isn't found.
	 * @deprecated Finsemble now uses a splintering agent which disconnects windows from the main launcher.
	 * It becomes impossible to access raw windows. See LauncherClient.getActiveDescriptors() and Util.getFinWindow()
	 */
	getRawWindow(params) {
		var launcher = window.opener;
		if (launcher.name !== "launcherService") {
			Logger.system.warn("LauncherClient.getNativeWindow: window not opened by Launcher Service");
		}
		return launcher.activeWindows.getWindow(params.windowName);
	}

	/**
	 * @private
	 */
	callSpawn(params, cb) {
		var self = this;
		Logger.perf.debug("CallSpawn", "start", "from spawn to callback");
		self.routerClient.query("Launcher.spawn", params, function (err, response) {
			var result = response.data;
			if (err) {
				invokeSpawnCallback(err, result);
				return Logger.system.error(err);
			}

			// Add a wrapped finWindow to the response (this can only be done client side)
			if (result.windowDescriptor.native) return invokeSpawnCallback(err, result);/// This is way too slow for native windows so we just let this pass through and assume the window is ready.
			var newWindowIdentifier = result.windowIdentifier;
			result.finWindow = fin.desktop.Window.wrap(newWindowIdentifier.uuid, newWindowIdentifier.windowName); //TODO - replace with FinsembleWindow

			let componentOnlineChannel = "Finsemble." + result.windowIdentifier.windowName + ".componentReady";
			let subscriberID = self.routerClient.subscribe(componentOnlineChannel, componentOnlineCallback);

			function componentOnlineCallback(err, response) {
				if (err) return Logger.system.error(err);
				//Ignore the initial "uninitialized" state message delivered by subscribe (a second message will contain the actual data)
				if (response && Object.keys(response.data).length === 0) return;
				if (params.position === "relative" && (params.groupOnSpawn || params.dockOnSpawn)) {
					let windows = [result.windowIdentifier.windowName, fin.desktop.Window.getCurrent().name]; //TODO - replace with FinsembleWindow
					self.routerClient.query("DockingService.groupWindows", {
						windows: windows,
						isMovable: true
					}, function (error, response) {
						Logger.perf.debug("CallSpawn", "stop");
						invokeSpawnCallback(err, result);
					});
				} else {
					Logger.perf.debug("CallSpawn", "stop");
					invokeSpawnCallback(err, result);
				}
				self.routerClient.unsubscribe(subscriberID);
			}
		});

		function invokeSpawnCallback(error, data) {
			if (cb) {
				cb(error, data);
			}
		}
	}

	/**
	 * Convenience function to get a monitor descriptor for a given windowIdentifier, or for the
	 * current window.
	 *
	 * @param {LauncherClient~windowIdentifier} [windowIdentifier] The window to find the monitor for. Current window if undefined.
	 * @param  {Function} cb Returns a monitor descriptor (optional or use returned Promise)
	 * @returns {Promise} A promise that resolves to a monitor descriptor
	 * @private
	 * @TODO this probably is unnecessary since a client can include util and a developer should be using this.getMonitorInfo which has full support for searching by component. Did Ryan need this?
	 */
	getMonitor(windowIdentifier, cb) {
		return util.getMonitor(windowIdentifier, cb);
	}

	/**
	 * Returns a {@link LauncherClient~windowIdentifier} for the current window
	 *
	 * @param {LauncherClient~windowIdentifier} cb Callback function returns windowIdentifier for this window (optional or use the returned Promise)
	 * @returns {Promise} A promise that resolves to a windowIdentifier
	 */
	// @TODO, [Terry] calls to launcherClient.myWindowIdentifier or launcherClient.getMyWindowIdentifier()
	// should be replaced with windowClient.getWindowIdentifier()
	getMyWindowIdentifier(cb) {
		return util.getMyWindowIdentifier(cb);
	}

	/**
	* Gets the {@link LauncherClient~windowDescriptor} for all open windows.
	*
	* *Note: This returns descriptors even if the window is not part of the workspace*.
	*
	* @param {function} cb Callback returns an array of windowDescriptors
	*
	*/
	getActiveDescriptors(cb) {
		Validate.args(cb, "function");
		this.routerClient.query("Launcher.getActiveDescriptors", {}, function (err, response) {
			if (err) {
				return Logger.system.error(err);
			}
			if (cb && response) {
				cb(err, response.data);
			}
		});
	}

	/**
	 * Adds a custom component. Private for now.
	 * @private
	 */
	addUserDefinedComponent(params, cb) {
		this.routerClient.query("Launcher.userDefinedComponentUpdate", {
			type: "add",
			name: params.name,
			url: params.url
		}, function (err, response) {
			if (cb) {
				cb(err, response.data);
			}
		});
	}

	/**
	 * Adds a custom component. Private for now.
	 * @private
	 */
	removeUserDefinedComponent(params, cb) {
		this.routerClient.query("Launcher.userDefinedComponentUpdate", {
			type: "remove",
			name: params.name,
			url: params.url
		}, function (err, response) {
			if (cb) {
				cb(err, response.data);
			}
		});
	}

	/**
	 * Gets components that can receive specfic data types. Returns an object containing a of ComponentTypes mapped to a list of dataTypes they can receive. This is based on the "advertiseReceivers" property in a component's config.
	 * @param params
	 * @param {Array} [params.dataTypes] An array of data types. Looks for components that can receive those data types
	 *
	 * @since 2.0
	 *
	 * @example
	 * LauncherClient.getComponentsThatCanReceiveDataTypes({ dataTypes: ['chartiq.chart', 'salesforce.contact']}, function(err, response) {
	 * 	//Response contains: {'chartiq.chart': ['Advanced Chart'], 'salesforce.contact': ['Salesforce Contact']}
	 * })
	 *
	 */
	getComponentsThatCanReceiveDataTypes(params, cb) {
		Validate.args(cb, "function");
		if (params.dataTypes && !Array.isArray(params.dataTypes)) { params.dataTypes = [params.dataTypes]; }
		Validate.args(params.dataTypes, "array");
		this.routerClient.query("LauncherService.getComponentsThatCanReceiveDataTypes", params, function (err, response) {
			if (cb) cb(err, response.data);
		});
	}

	/**@private
	 * Brings a windows to front. If no windowList, groupName or componentType is specified, brings all windows to front.
	 * @param params
	 * @param {Array} [params.windowList] Optional. An array of window names or window identifiers. Not to be used with componentType.
	 * @param {string} [params.groupName] Optional. The name of a window group to bring to front.
	 * @param {string} [params.componentType] Optional. The componentType to bring to front. Not to be used with windowList.
	 *
	 * @since TBD
	 *
	 * @example
	 * LauncherClient.bringWindowsToFront({ windowList: ['AdvancedChart-123-123', 'Symphony-Chat-234-234']}, function(err, response) {
	 *
	 * })
	 *
	 */
	bringWindowsToFront(params = {}, cb) {
		if (params.windowList && !Array.isArray(params.windowList)) {
			params.windowList = [params.windowList];
		}
		if (params.groupName) {
			Validate.args(params.groupName, "string");
		}
		if (params.componentType) {
			Validate.args(params.componentType, "string");
		}

		this.routerClient.transmit("LauncherService.bringWindowsToFront", params);
		if (cb) {
			cb();
		}
	}

	/**@private
	 * Minimizes all but a specific list or group of windows. Either groupName or windowList must be specified.
	 * @param params
	 * @param {Array} [params.windowList] Optional. An array of window names or window identifiers. Not to be used with componentType.
	 * @param {string} [params.groupName] Optional. The name of a window group to hyperFocus.
	 * @param {string} [params.componentType] Optional. The Component Type to hyperFocus. Not to be used with windowList.
	 *
	 * @since TBD
	 *
	 * @example
	 * LauncherClient.hyperFocus({ windowList: ['AdvancedChart-123-123', 'Symphony-Chat-234-234']}, function(err, response) {
	 *
	 * })
	 *
	 */
	hyperFocus(params, cb) {
		if (params.windowList && !Array.isArray(params.windowList)) {
			params.windowList = [params.windowList];
		}
		if (!params.windowList && !params.groupName && !params.componentType) {
			params.windowList = [this.myWindowIdentifier];
		}
		if (params.groupName) {
			Validate.args(params.groupName, "string");
		}
		if (params.componentType) {
			Validate.args(params.componentType, "string");
		}

		this.routerClient.transmit("LauncherService.hyperFocus", params);
		if (cb) {
			cb();
		}
	}

	/**@private
	 * Minimize windows. If no windowList or groupName is specified, all windows will be minimized.
	 * @param {*} params
	 * @param {Array} [params.windowList] Optional. An array of window names or window identifiers. Not to be used with componentType.
	 * @param {string} [params.groupName] Optional. The name of a window group to minimize.
	 * @param {string} [params.componentType] Optional. The component type of windows to Minimize. Not to be used with windowList.
	 *
	 * @since TBD
	 */
	minimizeWindows(params, cb) {
		if (params.windowList && !Array.isArray(params.windowList)) {
			params.windowList = [params.windowList];
		}
		if (params.groupName) {
			Validate.args(params.groupName, "string");
		}
		if (params.componentType) {
			Validate.args(params.componentType, "string");
		}
		this.routerClient.transmit("LauncherService.minimizeWindows", params);
		if (cb) {
			cb();
		}
	}

	/**@private
	 * Create Window group
	 * @param {*} params
	 * @param {string} [params.groupName] The name of the window group to create
	 * @param {Array} [params.windowList] An array of window names or window identifiers to add to the group. Optional.
	 * @param {function} cb callback to be called upon group creation
	 *
	 * @since TBD
	 */
	createWindowGroup(params, cb) {
		if (params.windowList && !Array.isArray(params.windowList)) {
			params.windowList = [params.windowList];
			delete params.groupName;
		}
		if (!params.groupName) {
			if (cb) {
				cb("Invalid Parameters");
			}
			return;
		}
		Validate.args(params.groupName, "string");

		this.routerClient.query("LauncherService.createWindowGroup", params, function (err, response) {
			if (cb) {
				cb(err, response);
			}
		});
	}

	/**@private
	 * Add Windows to group
	 * @param {*} params
	 * @param {string} [params.groupName] The name of the window group
	 * @param {Array} [params.windowList] An array of window names or window identifiers to add to the group.
	 * @param {function} cb callback to be called upon group creation
	 *
	 * @since TBD
	 */
	addWindowsToGroup(params, cb) {
		if (!params.groupName || !params.windowList) {
			if (cb) {
				cb("Invalid Parameters");
			}
			return;
		}
		if (params.windowList && !Array.isArray(params.windowList)) {
			params.windowList = [params.windowList];
		}

		Validate.args(params.groupName, "string");
		this.routerClient.query("LauncherService.addWindowsToGroup", params, function (err, response) {
			if (cb) {
				cb(err, response);
			}
		});
	}

	/**@private
	 * Remove Windows from group
	 * @param {*} params
	 * @param {string} [params.groupName] The name of the window group
	 * @param {Array} [params.windowList] An array of window names or window identifiers to remove from the group.
	 * @param {function} cb callback to be called upon group creation
	 *
	 * @since TBD
	 */
	removeWindowsFromGroup(params, cb) {
		if (!params.groupName || !params.windowList) {
			if (cb) {
				cb("Invalid Parameters");
			}
			return;
		}
		if (params.windowList && !Array.isArray(params.windowList)) {
			params.windowList = [params.windowList];
		}
		this.routerClient.query("LauncherService.removeWindowsFromGroup", params, function (err, response) {
			if (cb) {
				cb(err, response);
			}
		});
	}

	/**@private
	 * Get Window Groups that a window belongs to. If no windowIdentifier is specified, gets  the groups of the current window.
	 * @param {*} params
	 * @param {LauncherClient~windowIdentifier} [params.windowIdentifier] Optional. If not specified uses current window
	 * @param {*} cb callback with a list of groups
	 *
	 * @since TBD
	 */
	getGroupsForWindow(params, cb) {
		if (typeof params === "function") {
			cb = params;
			params = null;
		}
		if (!params || !params.windowIdentifier) {
			this.windowClient.getComponentState({ field: "finsemble:windowGroups" }, function (err, groups) {
				cb(err, groups);
			});
			return;
		}
		this.routerClient.query("LauncherService.getGroupsForWindow", params, function (err, response) {
			if (cb) {
				cb(err, response.data);
			}
		});
	}

	/**
	 *
	 * @param {*} params
	 * @param {LauncherClient~windowIdentifier} [params.windowIdentifier] Optional. Current window is assumed if not specified.
	 * @param {Array} [params.groupNames] List of groupnames to add window to. Groups will be created if they do not exist.
	 * @param {*} cb
	 */
	addToGroups(params, cb) {
		Validate.args(params.groupNames, "array");
		if (!params.windowIdentifier) {
			params.windowIdentifier = this.myWindowIdentifier;
		}
		this.routerClient.query("LauncherService.addWindowToGroups", params, cb);
	}

	start(cb) {
		var self = this;
		// Get Group Updates (only if we are not in a service)
		if (typeof FSBL != "undefined") {
			// Get Groups from Component State on Load
			function subscribeToGroupUpdates() {
				self.routerClient.subscribe("Finsemble.LauncherService.updateGroups." + self.windowName, function (err, response) {
					console.log("Arguments for launcher updateGroups", arguments);
					self.windowClient.setComponentState({ field: "finsemble:windowGroups", value: response.data });
				});
			}
			FSBL.addEventListener("onReady", function () {
				self.windowClient.getComponentState({ field: "finsemble:windowGroups" }, function (err, groups) {
					console.log("groups from storage", groups);
					if (!err && groups) {
						return self.addToGroups({
							groupNames: groups
						}, subscribeToGroupUpdates);
					}
					subscribeToGroupUpdates();
				});
			});
		}

		setInterval(function () {
			self.routerClient.transmit("Finsemble.heartbeat", { type: "component", windowName: self.windowName, componentType: "finsemble" });
		}, 1000);

		// @TODO, [Terry] remove in favor of calls to windowClient.getMyIdentifier()
		this.getMyWindowIdentifier((identifier) => {
			self.myWindowIdentifier = identifier;
			if (cb) {
				cb();
			}
		});		
	}
}

function constructInstance(params) {
	params = params ? params : {};
	if (!params.windowClient) params.windowClient = WindowClient;
	return new LauncherClient({
		clients: params,
		startupDependencies: {
			services: ["launcherService"]
		},
		onReady: function (cb) {
			Logger.system.debug("launcherClient ready");
			Logger.perf.log("LauncherClientReadyTime", "stop");
			launcherClient.start(cb);
		},
		name: "launcherClient"
	});
}

var launcherClient = constructInstance();
launcherClient.constructInstance = constructInstance;

module.exports = launcherClient;