/*!
* Copyright 2017 by ChartIQ, Inc.
* All rights reserved.
*/
var Validate = require("../common/validate"); // Finsemble args validator
var BaseClient = require("./baseClient");
var WindowClient = require("./windowClient");
var LauncherClient = require("./launcherClient");
var DistributedStoreClient = require("./distributedStoreClient");

var Logger = require("./logger");
Logger.system.log("Starting LinkerClient");
var sysinfo = Logger.system.info;
var sysdebug = Logger.system.debug;
const async = require("async");

/**
 *
 * @introduction
 * <h2>Linker Client</h2>
 * <h3>Public API for the Linker Service</h3>
 * <p>
 * The Linker API provides a mechanism for synchronizing components on a piece of data. For instance, a user might want to link multiple components by stock symbol. 
 * Using the Linker API, a developer could enable their component to participate in this synchronization. 
 * The developer would use {@link LinkerClient#subscribe} to receive synchronization events, and they would use {@link LinkerClient#publish} to send them. 
 * The Linker API is inherently similar to the [Router Client's](RouterClientConstructor.html) pub/sub mechanism. The primary difference is that the Linker API is designed for end-user interaction. 
 * By exposing the Linker API, developers allow **end users** to create and destroy linkages at run-time.
 * </p>
 *
 * <p>
 * In order for components to be linked, they must understand the data format that will be passed between them (the "context"), and agree on a label that identifies that format (the "dataType"). 
 * For instance, components might choose to publish and subscribe to a dataType called `"symbol"`. 
 * They would then also need to agree that a `"symbol"` looks like, for instance, `{symbol:"IBM"}`. 
 * The Linker API doesn't proscribe any specific format for context or set of labels (some would call this a "taxonomy"). 
 * See OpenFin's FDC3 project for an emerging industry standard taxonomy.
 * </p>
 *
 * <p>
 * End users create linkages by assigning components to "channels." Our default implementation represents channels by color. 
 * When a component is assigned to the purple channel, publish and subscribe messages are only received by other components assigned to that channel. 
 * If you're using Finsemble's built-in Linker component, you won't have to code this. The Linker component does the work of assigning and unassigning its associated component to the selected channel. 
 * However, the Linker API exposes functionality so that you can manage channels programatically if you choose. 
 * You could use these functions to build your own Linker component using a different paradigm, or intelligently link components based on your own business logic. 
 * **Note:** it is not necessary to stick to a color convention. Channels are simple strings and so can be anything.
 * </p>
 *
 * <p>
 * Behind the scenes, the Linker Service coordinates Linker activity between components. It keeps track of the available channels and channel assignments. 
 * It uses a dedicated store ({@link DistributedStoreClient}) to maintain this information and also persists the information to workspaces ({@link WorkspaceClient}).
 * </p>
 *
 * <p>
 * See more on using the Linker API at our <a href="tutorial-linkingComponents.html">Linking tutorial</a>.
 * </p>
 * @hideConstructor true
 *
 * @constructor
 */

// @todo, take a documentation pass. Update Linker tutorial. Point to Linker Component docs. Default config.
// @todo, move linker config from finsemble to finsemble-seed and finsemble-sales-demo

var LinkerClient = function (params) {
	Validate.args(params, "object=") && params && Validate.args2("params.onReady", params.onReady, "function=");
	BaseClient.call(this, params);
	this.launcherClient = params.clients.launcherClient;
	this.windowClient = params.clients.windowClient;
	this.distributedStoreClient = params.clients.distributedStoreClient;

	this.stateChangeListeners = [];

	// Linker Data
	this.allChannels = [];
	this.channels = [];
	this.clients = {};

	var channelListenerList = []; // Used to keep track of each router listener that is enabled
	var dataListenerList = {};
	var self = this;

	/**
	 * @private
	 */
	this.makeKey = function (windowIdentifier) {
		return (windowIdentifier.windowName + "::" + windowIdentifier.uuid).replace(".", "_");
	};

	/**
	 * A convenience function to send data to a callback and also return it
	 * @private
	 * @example
	 * return asyncIt(cb, data)
	 */
	var asyncIt = function (data, cb) {
		if (cb) cb(null, data);
		return data;
	};
	/**
	 * Create a new Linker channel. This channel will be available *globally*.
	 * @param {object} params
	 * @param {string} name - Name of the channel
	 * @param {string} [color] - Required for use with Finsemble's built in Linker component
	 * @param {string} [border] - Required for use with Finsemble's built in Linker component
	 * @param {function} [cb] - Optional callback to retrieve returned results asynchyronously
	 * @return {array} Returns an array of all available channels
	 * @private
	 * @since TBD deprecated createGroup
	 * @example
	 * LinkerClient.createChannel({name: "red", color: "#ff0000", border: "#ffffff"}, callback)
	 */
	this.createChannel = function (params, cb) {
		sysinfo("LinkerClient.createChannel", "PARAMS", params);
		Validate.args(params, "object");

		if (!params.name) {
			sysdebug("LinkerClient.createChannel: Name is required");
			return asyncIt(self.allChannels, cb);
		}

		if (self.getChannel(params.name)) {
			sysdebug("LinkerClient.createChannel: Channel " + params.name + " Already Exists");
			return asyncIt(self.allChannels, cb);
		}

		self.allChannels.push(params);
		self.allGroups = self.allChannels; // backward compatiblity
		self.linkerStore.setValue({ field: "params", value: self.allChannels });

		return asyncIt(self.allChannels, cb);
	};

	/**
	 * Remove a Linker channel. It will be removed globally. Any component that is currently assigned to this channel will be unassigned.
	 *
	 * @param {string} name - The name of the channel to remove
	 * @param {function} [cb] - Optional callback to retrieve returned results asynchyronously
	 * @returns {array} Returns an array of available channels
	 * @since TBD deprecated deleteGroup
	 * @private
	 *
	 * @example
	 * LinkerClient.removeChannel("purple")
	 *
	 */
	this.removeChannel = function (name, cb) {
		sysinfo("LinkerClient.removeChannel", "NAME", name);
		Validate.args(name, "string");
		if (!self.getChannel(name)) {
			sysdebug("Channel " + name + "does not exist", null);
			return asyncIt(self.allChannels, cb);
		}

		let channels = self.allChannels;
		for (var i = 0; i < channels.length; i++) {
			if (name === channels[i].name) {
				channels.splice(i, 1);
				break;
			}
		}

		self.linkerStore.setValue({ field: "channels", value: self.allChannels });

		// TODO: Verify that this even works
		let clients = self.clients;
		for (var c in clients) {
			var client = clients[c];
			for (var channel in client.channels) {
				if (name === channel) {
					delete client[channel];
					break;
				}
			}
		}

		self.linkerStore.setValue({ field: "clients", value: self.clients });

		return asyncIt(self.allChannels, cb);
	};

	/**
	 * Convenience function to update the client information in the store.
	 * @private
	 */
	this.updateClientInStore = function (key) {
		self.linkerStore.setValue({ field: "clients." + key, value: self.clients[key] });
	};
	/**
	 * Add a component to a Linker channel programatically. Components will begin receiving any new contexts published to this channel but will *not* receive the currently established context.
	 *
	 * @param {string|array} channel - The name of the channel to link our component to, or an array of names.
	 * @param {windowIdentifier} [windowIdentifier] -  Window Identifier for the component (optional). Current window if left null.
	 * @param {function} [cb] - Optional callback to retrieve returned results asynchyronously
	 * @return {LinkerClient~state} The new state: linked channels, all channels
	 * @since 2.3 deprecated addToGroup
	 * @example
	 *
	 * LinkerClient.linkToChannel("purple", null); // Link current window to channel "purple"
	 * LinkerClient.linkToChannel("purple", windowIdentifier); // Link the requested window to channel "purple"
	 *
	 */
	this.linkToChannel = function (channel, windowIdentifier, cb) {
		sysinfo("LinkerClient.linkToChannel", "CHANNEL", channel, "COMPONENT", windowIdentifier);
		Validate.args(channel, "string", windowIdentifier);
		if (!windowIdentifier) windowIdentifier = this.windowClient.getWindowIdentifier();

		var key = self.makeKey(windowIdentifier);

		if (!self.clients[key]) {
			self.clients[key] = {
				client: windowIdentifier,
				channels: {}
			};
		}

		if (Array.isArray(channel)) {
			for (let i = 0; i < channel.length; i++) {
				self.clients[key].channels[channel[i]] = true;
			}
		} else {
			self.clients[key].channels[channel] = true;
		}

		self.updateClientInStore(key);

		return asyncIt(self.getState(windowIdentifier), cb);
	};

	/**
	 * Unlinks a component from a Linker channel.
	 *
	 * @param {string|array} channel - Channel to remove, or an array of channels. If null, then all channels will be removed.
	 * @param {windowIdentifier} [windowIdentifier] -  Window Identifier for the client (optional). Current window if left null.
	 * @param {function} [cb] - Optional callback to retrieve returned results asynchyronously
	 * @return {LinkerClient~state} Returns the new state: linked channels, all channels
	 * @since 2.3 deprecated removeFromGroup
	 * @example
	 *
	 * LinkerClient.unlinkFromChannel("purple", null); // Unlink the current window from channel "purple"
	 * LinkerClient.unlinkFromChannel("purple", windowIdentifier) // Unlink the requested window form channel "purple"
	 *
	 */
	this.unlinkFromChannel = function (channel, windowIdentifier, cb) {
		sysinfo("LinkerClient.unlinkFromChannel", "CHANNEL", channel, "WINDOW IDENTIFIER", windowIdentifier);
		Validate.args(channel, "string", windowIdentifier);
		if (!windowIdentifier) windowIdentifier = this.windowClient.getWindowIdentifier();

		var key = self.makeKey(windowIdentifier);
		var componentEntry = self.clients[key];

		if (!componentEntry || !componentEntry.channels[channel]) {
			let component = self.linkerStorage.clients[key];
			sysdebug("Component was not in specified channel " + channel, component, component.channels[channel]);
			return asyncIt(self.getState(windowIdentifier), cb);
		}
		if (Array.isArray(channel)) {
			// Delete an array of channels
			for (let i = 0; i < channel.length; i++) {
				delete componentEntry.channels[channel[i]];
			}
		} else if (!channel) {
			// Delete all channels
			for (let name in componentEntry.channels) {
				delete componentEntry.channels[name];
			}
		} else {
			// Delete a specific channel
			delete componentEntry.channels[channel];
		}
		self.updateClientInStore(key);

		return asyncIt(self.getState(windowIdentifier), cb);
	};

	/**
	 * Returns all available Linker channels
	 * @param {function} [cb] - Optional callback to retrieve returned results asynchyronously
	 * @return {array} An array of all channels. Each array item is {name:channelName} plus any other optional fields such as color.
	 * @since 2.3 deprecated getAllGroups
	 * @example
	 * LinkerClient.getAllChannels()
	 */
	this.getAllChannels = function (cb) {
		sysinfo("LinkerClient.getAllChannels");
		return asyncIt(self.allChannels, cb);
	};

	/**
	 * Retrieve all channels linked to the requested component. Also returns all available channels.
	 * @param {windowIdentifier} [windowIdentifier] Which component, or null for the current window.
	 * @param {function} [cb] - Optional callback to retrieve returned results asynchyronously
	 * @return {LinkerClient~state} The current state: linked channels, all channels
	 * @since 2.3 deprecated getGroups, no longer supports a callback
	 * @example
	 * var state=LinkerClient.getState(windowIdentifier)
	 */
	this.getState = function (windowIdentifier, cb) {
		sysinfo("LinkerClient.getState", "WINDOW IDENTIFIER", windowIdentifier);
		var state = {
			channels: [],
			allChannels: self.allChannels
		};
		if (!windowIdentifier) windowIdentifier = this.windowClient.getWindowIdentifier();
		if (!Object.keys(self.clients).length) {
			return asyncIt(state, cb);
		}
		var key = self.makeKey(windowIdentifier);
		var componentEntry = self.clients[key];
		if (!componentEntry) {
			return asyncIt(state, cb);
		}

		// Create an array of channel descriptors, one for each linked channel
		// Convert {"purple": true, "green":true} to [{"name":"purple"},{"name":"green"}]
		state.channels = self.allChannels.filter(function (value) {
			return componentEntry.channels && componentEntry.channels[value.name] === true;
		});

		// Cleanup code in case of an oops. If we're accessing this component, it must be alive. Make sure the store reflects this.
		if (!componentEntry.active) {
			componentEntry.active = true;
			self.linkerStore.setValue({ field: "clients." + key, value: componentEntry });
		}

		return asyncIt(state, cb);
	};

	/**
	* Remove all listeners for the specified dataType.
	* @param {String}  dataType - The data type be subscribed to
	* @param {function} [cb] - Optional callback to retrieve returned results asynchyronously (empty object)
	*
	* @example
	* LinkerClient.unsubscribe("symbol");
	*/
	this.unsubscribe = function (dataType, cb) {
		sysinfo("LinkerClient.unsubscribe", "DATA TYPE", dataType);
		Validate.args(dataType, "string");
		delete dataListenerList[dataType];
		return asyncIt({}, cb);
	};

	/**
	* Publish a piece of data. The data will be published to *all channels* that the component is linked to. Foreign components that are linked to those channels will receive the data if they have subscribed to this dataType. They can then use that data to synchronize their internal state. See {@link LinkerClient#subscribe}.
	* @param {Object}  params
	* @param {String}  params.dataType - The data type being sent
	* @param {any}  params.data - the data ("context") being transmitted
   * @param {Array} [params.channels] - Optionally specify which channels to publish this piece of data. This overrides the default which is to publish to all linked channels.
	* @param {function} [cb] - Optional callback to make the function asynchronous (no data or errors are returned)
	* @example
	* LinkerClient.publish({dataType:"symbol",data:"AAPL"})
	*/
	this.publish = function (params, cb) {
		sysinfo("LinkerClient.publish", "PARAMS", params);
		Validate.args(params.dataType, "string", params.data, "any");
		let channels = Object.keys(self.channels);
		if (params.channels) channels = params.channels;
		for (var i = 0; i < channels.length; i++) {
			var channel = channels[i];
			//@todo [Terry] why are we transmitting two messages here?
			this.routerClient.transmit(channel + "." + params.dataType, { type: params.dataType, data: params.data });
			this.routerClient.transmit(channel, { type: params.dataType, data: params.data });
		}
		return asyncIt({}, cb);
	};

	/**
	* Registers a client for a specific data type that is sent to a channel.
	* @param {String} dataType
	* @param {function} [cb] -  A function to be called once the linker receives the specific data.
	* @example
	* LinkerClient.subscribe("symbol", function(data){
		console.log("New symbol received from a remote component " + data);
	  });
	*/
	this.subscribe = function (dataType, cb) {
		sysinfo("LinkerClient.subscribe", "DATA TYPE", dataType);
		Validate.args(dataType, "string", cb, "function");
		if (dataListenerList[dataType]) {
			return dataListenerList[dataType].push(cb);
		}
		dataListenerList[dataType] = [cb];
	};

	/**
	 * Retrieves an array of all components with links that match the given parameters. If no parameters are specified, all windows with established links will be returned.
	 *
	 * @param {object} params Optional
	 * @param {array} params.channels Restrict to these channels.
	 * @param {array} params.componentTypes Restrict to these componentTypes
	 * @param {windowIdentifier} params.windowIdentifier Restrict to this component
	 * @param {function} [cb] - Optional callback to retrieve returned results asynchyronously
	 * @returns {array} An array of linked components, their windows, and their linked channels
	 *
	 * @since 1.5
	 * @since 2.3 deprecated getLinkedWindows
	 * @example Get all components linked to a given component
	 * LinkerClient.getLinkedComponents({windowIdentifier: wi});
	 *
	 * @example Get all components linked to channel "purple"
	 * LinkerClient.getLinkedComponents({channels: ['purple']});
	 * // Response format: [{windowName: 'Window Name', componentType: 'Component Type', uuid: 'uuid', channels: ['purple'] }, ..]
	 *
	 */
	this.getLinkedComponents = function (params, cb) {
		sysinfo("LinkerClient.getLinkedComponents", "PARAMS", params);
		var linkedWindows = [];

		// Fix params
		if (!params) { params = {}; }
		if (params.channels && !Array.isArray(params.channels)) {
			Validate.args(params.channels, "string");
			params.channels = [params.channels];
		}
		if (params.componentTypes && !Array.isArray(params.componentTypes)) {
			Validate.args(params.componentTypes, "string");
			params.componentTypes = [params.componentTypes];
		}
		if (params.componentTypes) { Validate.args(params.componentTypes, "array"); }

		// If we have a client
		if (params.windowIdentifier) {
			var key = self.makeKey(params.windowIdentifier);
			var myChannels = Object.keys(self.clients[key].channels);

			if (!params.channels) {
				// If no channels are specified, use the window identifier's channels
				params.channels = myChannels;
			} else {
				// Otherwise use an intersection of params.channels and the component's channels
				params.channels = params.channels.filter(o => myChannels.includes(o));
			}
		}

		// if no channels, assume all channels
		if (!params.channels) params.channels = self.getAllChannels().map(o => o.name);

		// Get all active
		for (let c in self.clients) {
			var component = self.clients[c];
			if (!component.channels) { // frame fix
				component = component[Object.keys(component)[0]];
			}
			var clientMatchesChannels = Object.keys(component.channels).filter(o => params.channels.includes(o)).length;
			var clientMatchesComponentTypes = true;
			if (params.componentTypes) clientMatchesComponentTypes = params.componentTypes.includes(component.client.componentType);

			if (component.active && clientMatchesChannels && clientMatchesComponentTypes) {
				linkedWindows.push({
					windowName: component.client.windowName,
					componentType: component.client.componentType,
					uuid: component.client.uuid,
					channels: Object.keys(component.channels)
				});
			}
		}

		return asyncIt(linkedWindows, cb);
	};

	//Need to do this better. Get newest items so we don't create it every time
	//This looks to see if there is a listener for a specific data type
	function handleListeners(err, data) {
		var listeners = dataListenerList[data.data.type];
		if (listeners && listeners.length > 0) {
			for (var i = 0; i < listeners.length; i++) {
				listeners[i](data.data.data, { data: data.data.data, header: data.header, originatedHere: data.originatedHere });
			}
		}
	}

	//add new listeners for channels when channels are updated
	function updateListeners() {
		// Remove listeners
		for (let i = channelListenerList.length - 1; i >= 0; i--) {
			let channel = channelListenerList[i];
			let channels = Object.keys(self.channels);
			if (!channels.filter(function (g) { return g == channel; }).length) {
				self.routerClient.removeListener(channel, handleListeners);
				channelListenerList.splice(i, 1);
			}
		}

		// Setup new listeners if needed
		var channels = Object.keys(self.channels);
		for (let i = 0; i < channels.length; i++) {
			let channel = channels[i];
			if (!channelListenerList.includes(channel)) {
				self.routerClient.addListener(channel, handleListeners);
				channelListenerList.push(channel);
			}
		}

		// Send state update to any registered external listeners
		var state = self.getState();
		for (let i = 0; i < self.stateChangeListeners.length; i++) {
			self.stateChangeListeners[i](null, state);
		}
	}

	/**
	 * Use this method to register a callback which will be called whenever the state of the Linker changes. This will be called whenever a user links or unlinks your component to a channel.
	 * @param {function} cb {null, LinkerClient~state}
	 * @example
	 * FSBL.Clients.LinkerClient.onStateChange(function(err, response){
	 *    if(response.channels){
	 * 		console.log("Printout of channel status ", response.channels);
	 * 	}
	 * });
	 */
	this.onStateChange = function (cb) {
		self.stateChangeListeners.push(cb);
	};

	/**
	 * Persists the current linker state. When the window is restored, that state will be available and restored (in initialize).
	 * @private
	 * @param {object} state The state enabled for this Linker instance
	 */
	this.persistState = function (state) {
		if (this.dontPersistYet) return; // We don't want to update the permanent state if changes are the result of initialization. That would create a lot of unnecessary traffic.
		window.console.log("Updating state");
		this.windowClient.setComponentState({
			field: "Finsemble_Linker",
			value: state
		});
	};

	// load all linkages and register listeners for updated data.
	/**
	 * @private
	 */
	this.start = function (cb) {
		this.dontPersistYet = true;
		sysdebug("LinkerClient Loading Channels");
		var wi = self.windowClient.getWindowIdentifier();
		var key = self.makeKey(wi);
		// Connect to the global linker store. This is shared by all instances.
		self.distributedStoreClient.getStore({ store: "Finsemble_Linker", global: true }, function (err, linkerStore) {
			self.linkerStore = linkerStore;
			// Get all the available channels for Linkers
			linkerStore.getValues(["channels"], function (err, values) {
				if (values && values["channels"]) {
					self.allChannels = values["channels"];
					self.allGroups = self.allChannels; // backward compatiblity
				}
				// Now get the linker state (which channels are enabled) for this instance. The windowClient will have retrieved this from Storage.
				// Use this to initialize our channel state.
				self.windowClient.getComponentState({ field: "Finsemble_Linker" }, function (err, linkerData) {
					self.clients[key] = {
						client: wi,
						active: true,
						channels: {}
					};
					if (linkerData) {
						self.channels = linkerData;
						self.clients[key].channels = linkerData;
					}
					// Feed back to the distributed store the state that we got out of storage.
					self.updateClientInStore(key);

					// If we've just been spawned, then check to see if we were passed any overrides
					var spawnData = self.windowClient.getSpawnData();
					if (spawnData && spawnData.linker) {
						let existingLinks = spawnData.linker.channels;
						if (spawnData.linker.groups) existingLinks = spawnData.linker.groups; // backward compatibility
						self.linkToChannel(existingLinks, wi);
					} else {
						updateListeners();
					}
					cb();
				});
			});

			linkerStore.addListener({ field: "clients." + key }, function (err, response) {
				sysdebug("My Channels Updated");
				updateListeners();
				if (response.groups) self.channels = response.groups; // backward compatibility
				if (response.channels) self.channels = response.channels;
				self.persistState(self.channels);
				self.dontPersistYet = false; // This will catch the very first initialization
			});

			linkerStore.addListener({}, function (err, response) {
				var values = response.value.values;
				self.allChannels = values.channels;
				if (values.groups) self.allChannels = values.groups; // backward compatiblity
				self.allGroups = self.allChannels; // backward compatiblity
				self.clients = values.clients;
				if (values.clients[key]) self.channels = values.clients[key].channels;
				if (values.clients[key] && values.clients[key].groups) self.channels = values.clients[key].groups; // backward compatibility
			});
		});
	};

	/**
	 * @private
	 */
	this.onClose = function () {
		var wi = this.windowClient.getWindowIdentifier();
		var key = self.makeKey(wi);
		if (self.clients[key]) {
			self.clients[key].active = false;
			self.updateClientInStore(key);
		}
	};

	/**
	 * Minize all windows except those on specified channel
	 * @param {string} channel
	 * @private 
	 */
	this.hyperFocus = function (channel) {
		//var windowNames = this.getLinkedComponents({ channels: channel }).map(c => c.windowName);
		this.launcherClient.hyperFocus({ windowList: this.getLinkedComponents({ channels: channel }) });
	};

	/**
	 * Bring all windows in specified channel to the front
	 * @param {params} object
	 * @param {params.channel} channel to btf.
	 * @param {params.restoreWindows} whether to restore windows that are minimized prior to calling bring to front.
	 * @private 
	 */
	this.bringAllToFront = function (params) {
		let { channel, restoreWindows } = params;
		//var windowNames = this.getLinkedComponents({ channels: channel }).map(c => c.windowName);
		this.launcherClient.bringWindowsToFront({ restoreWindows: restoreWindows, windowList: this.getLinkedComponents({ channels: channel }) });
	};

	/*
	 * Start backward compatibility
	 * @private
	 */
	this.groups = this.channels;
	this.allGroups = this.allChannels;

	this.createGroup = function (group, cb) {
		return this.createChannel(group, cb);
	};
	this.deleteGroup = function (groupName, cb) {
		return this.removeChannel(groupName, cb);
	};
	this.addToGroup = function (groupName, client, cb) {
		var state = this.linkToChannel(groupName, client);
		if (cb) cb(null, state);
		return state;
	};
	this.removeFromGroup = function (groupName, client, cb) {
		var state = this.unlinkFromChannel(groupName, client);
		if (cb) cb(null, state);
		return state;
	};
	/*this.allGroups = {
		map: function (cb) {
			return self.getAllChannels().map(cb);
		}
	};*/
	this.getAllGroups = function (cb) {
		var channels = this.getAllChannels();
		if (cb) cb(channels);
		return channels;
	};
	this.getGroups = function (client, cb) {
		var state = this.getState(client);
		state.groups = state.channels;
		return asyncIt(state, cb);
	};
	this.unSubscribe = function (dataType) {
		this.unsubscribe(dataType);
	};
	this.getLinkedWindows = function (params, cb) {
		params.groups = params.channels;
		params.windowIdentifier = params.client;
		return this.getLinkedComponents(params, cb);
	};
	this.windowIdentifier = function (params, cb) {
		return asyncIt(this.windowClient.getWindowIdentifier(), cb);
	};

	this.onLinksUpdate = {
		push: function (cb) {
			self.stateChangeListeners.push(function (err, response) {
				if (response) {
					response.groups = response.channels;
				}
				cb(err, { groups: response });
			});
		}
	};
	var linkerWindow = null;
	var loading = false;
	this.openLinkerWindow = function (cb) {
		Validate.args(cb, "function");
		if (loading) { return; } // If in process of loading then return. This prevents double clicks on the icon.

		function showLinkerWindowInner() {
			self.routerClient.query("Finsemble.LinkerWindow.Show", {
				groups: self.getGroups().groups,
				windowIdentifier: self.windowClient.getWindowIdentifier(),
				windowBounds: self.windowClient.getWindowBounds()
			}, function () { });
		}
		if (linkerWindow) {
			linkerWindow.isShowing(function (showing) {
				if (showing) {
					linkerWindow.hide();
				} else {
					showLinkerWindowInner();
				}
			});
			return;
		}
		showLinkerWindowInner();
	};

	/**
	 * End backward compatibility
	 */

	return this;
};

/**
 * Constructs an instance of a LinkerClient. Normally there is only one instance per window, so
 * you need only require it in. But from that instance you can create more instances by
 * calling the constructInstance member function `newLinker=linkerClient.constructInstance()`.
 * 
 * @param {object} params client instances for this client to depend on.
 * If client instances are not passed in, then the default is to use the instance
 * that is attached to this component window (the global instance) 
 */
function constructInstance(params) {
	params = params ? params : {};
	// If a client isn't passed in then use the global
	if (!params.windowClient) params.windowClient = WindowClient;
	if (!params.launcherClient) params.launcherClient = LauncherClient;
	if (!params.distributedStoreClient) params.distributedStoreClient = DistributedStoreClient;

	return new LinkerClient({
		clients: params,
		startupDependencies: {
			services: ["linkerService"],
			clients: ["windowClient", "distributedStoreClient"]
		},
		onReady: function (cb) {
			sysdebug("Linker onReady");
			async.parallel([
				(done) => { linkerClient.start(done); },
				(done) => { params.launcherClient.onReady(done); }
			], cb);
		},
		name: "linkerClient"
	});
}

// Construct the global instance, and then create a member `constructInstance` that can be used to clone more instances.
var linkerClient = constructInstance();
linkerClient.constructInstance = constructInstance;

module.exports = linkerClient;

/**
 * Window Identifier - You can get the window Identifier of a Window by calling FSBL.Utils.getMyWindowIdentifier
 * @typedef {Object} windowIdentifier
 * @property {string} windowName
 * @property {string} uuid
 * @property {string} componentType
 */

/**
 * Callback that returns a list of channels in the responseMessage
* @callback LinkerClient~channelsCB
* @param {Object} err Error message, or null if no error
* @param {Array} channels List of channels
*/

/**
 * Callback that returns a new {@link LinkerClient~state}
* @callback LinkerClient~stateCB
* @param {Object} err Error message, or null if no error
* @param {Array} channels List of all channels linked to the requested component
* @param {Array} allChannels List of all available channels
*/

/**
 * A list of enabled channels and a list of all channels
* @callback LinkerClient~state
* @param {Array} channels List of all channels linked to the requested component
* @param {Array} allChannels List of all available channels
*/