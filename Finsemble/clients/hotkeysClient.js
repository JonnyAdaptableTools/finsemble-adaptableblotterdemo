/*!
* Copyright 2017 by ChartIQ, Inc.
* All rights reserved.
*/

/*
Overview of how this works:
-hotkeys are added/removed via methods, passing an array of strings representing keys pressed, a handler method, and (optionally) a callback

-When adding a hotkey, a node js event emitter is created on the client side to trigger the hotkey handler, and a router message is sent to the service to register the key combination with the windowname on the client side. Multiple hotkeys may be created for the same key combination, so long as they have different handler functions.

-When the service detects that all of the keys in the hotkey combination are pressed, it sends a message on the "HotkeyTriggered" channel (the method for this is "ListenForHotkeys") which contains the list of all windows registered with that hotkey combination. The client then reads the list of windows, and checks if it's one of those windows. If it is, it fires off the node js event emitter that was registered for that hotkey.

-Removing a hotkey clears the corresponding event emitter, and also sends a router message to the service to remove its windowid from the array of windows registered for the hotkey combination - if the window is registered with that hotkey combination multiple times, it will only remove one, allowing other hotkeys on the same window with the same key combination to still be registered.

*/
var BaseClient = require("./baseClient");
var util = require("../common/util");
var Validate = require("../common/validate");
var Logger = require("./logger");
var asciiToKey = {
	65: "a", 66: "b", 67: "c", 68: "d", 69: "e", 70: "f", 71: "g", 72: "h", 73: "i", 74: "j", 75: "k", 76: "l",
	77: "m", 78: "n", 79: "o", 80: "p", 81: "q", 82: "r", 83: "s", 84: "t", 85: "u", 86: "v", 87: "w", 88: "x",
	89: "y", 90: "z", 48: "0", 49: "1", 50: "2", 51: "3", 52: "4", 53: "5", 54: "6", 55: "7", 56: "8", 57: "9",
	97: "a", 98: "b", 99: "c", 100: "d", 101: "e", 102: "f", 103: "g", 104: "h", 105: "i", 106: "j", 107: "k", 108: "l", 109: "m",
	110: "n", 111: "o", 112: "p", 113: "q", 114: "r", 115: "s", 116: "t", 117: "u", 118: "v", 119: "w", 120: "x", 121: "y", 122: "z",
	8: "backspace", 9: "tab", 13: "enter", 27: "escape", 32: "spacebar", 127: "delete", 59: ";", 61: "=", 45: "-", 47: "/", 96: "`",
	91: "[", 92: "\\", 93: "]", 39: "'", 44: ",", 46: "."
};

const keyMap = require("../common/keyMaps.json").dictionary;

var EventEmitter = require("events").EventEmitter;
var eventEmitter = new EventEmitter();
/**
 * Translates an array representing a key combination, each element of which represents a key, using keyDict, an object containing key-value pairs where the untranslated key representations are the keys, and the translated versions ready to be used by the service are the values.
 *
 * If you'd like to create a keymap for translation, look at the values of the keymaps included in the common folder.
 * @param {object} params
 * @param {object} params.keys array representing untranslated key representations
 * @param {object} keyDict
 */
function translateKeys(params, keyDict = keyMap) {
	var translatedKeys = [];
	params.keys.forEach((key) => {
		if (!(typeof key === "string")) {
			return Logger.system.error("FSBL.Clients.HotkeyClient - one of the keys passed into a function was not a string: ", key);
		}
		key = key.toLowerCase();
		let mappedKey = keyDict[key];
		if (mappedKey) {
			translatedKeys.push(mappedKey);
		} else {
			return Logger.system.error(`FSBL.Clients.HotkeyClient - At least one of the key codes does not map to a supported key - registering hotkey unsuccessful. Unsupported keys: ${key}`);
		}
	});
	return translatedKeys;
}

class HotkeyClient extends BaseClient {
	/**
	 * @introduction
	 *
	 * <h2> Hotkey Client</h2>
	 *
	 * This module contains the Hotkey Client, used for registering hotkey combinations and their respective handler functions with Finsemble.
	 *
	 * The client can handle two types of hotkeys: **local hotkeys**, for which the handlers will only fire when the window which defined the hotkey is in focus, and **global hotkeys**, which will fire regardless of what window is in focus.
	 * 
	 * For more information, see the [Hotkey tutorial](tutorial-Hotkeys.html).
	 *
	 *
	 *
	 * @constructor
	 * @hideConstructor true
	 * @publishedName HotkeyClient
	 * @param {*} params
	 */

	constructor(params) {
		super(params);
		this.keyMap = keyMap;
		this.listenForHotkeys = this.listenForHotkeys.bind(this);
		this.routerClient.onReady(this.listenForHotkeys);
		//Local hotkeys need to only fire if the window is focused. The object below is a map of handlers passed in by the user.
		//The keys are the handler, and the value is the wrapped method that checks for focus.
		this.localListeners = {};
	}

	/**
	 *Adds a local hotkey, firing only when the window calling the method is in focus. If you execute this function more than once for the same key combination, both hotkeys will coexist, and would need to be remove separately.
	 * @param {Array} [keyArr] Array of strings representing hotkey key combination. We're not very picky about exactly what strings you use - for example "control", "ctrl" and "CTRL" all work for the control key.
	 * @param {function} [handler] Function to be executed when the hotkey combination is pressed. It is recommended that you define a variable to represent the handler function, as the same function must be passed in order to remove the hotkey.
	 * @param {function} [cb] Callback to be called after local hotkey is added.
	 * @example
	 * var myFunction = function () {...}
	 * FSBL.Clients.HotkeyClient.addLocalHotkey(["ctrl","shift","s"],myFunction,cb)
	 */
	addLocalHotkey(keyArr, handler, cb) {
		Logger.system.info("HotkeyClient.addLocalHotkey");
		Logger.system.debug("HotkeyClient.addLocalHotkey, keyArr: ", keyArr);
		let keyString = translateKeys({ keys: keyArr }).sort().toString();
		//We create a new function that checks focus before invoking the method.
		//If assimilation wasn't on, we'd want to use window.addEventListener('keydown');
		let wrap = () => {
			if (document.hasFocus()) {
				handler();
			}
		};
		//Keep a reference to the handler so when the dev wants to remove it, we can.
		if (!this.localListeners[keyString]) {
			this.localListeners[keyString] = {};
		}
		this.localListeners[keyString][handler] = wrap;
		eventEmitter.addListener(keyString, wrap);
		this.routerClient.query("hotkeyService.registerGlobalHotkey", { "keys": keyString, windowName: this.windowName }, cb);
	}

	/**
	 *Removes a local hotkey.
	 * @param {Array} [keyArr] Array of strings representing hotkey key combination. We're not very picky about exactly what strings you use - for example "control", "ctrl" and "CTRL" all work for the control key.
	 * @param {function} [handler] Handler registered for the hotkey to be removed.
	 * @param {function} [cb] Callback to be called after local hotkey is removed.
	 * @example
	 *
	 * FSBL.Clients.HotkeyClient.removeLocalHotkey(["ctrl","shift","s"],myFunction,cb)
	 */
	removeLocalHotkey(keyArr, handler, cb) {
		Logger.system.info("HotkeyClient.removeLocalHotkey");
		Logger.system.debug("HotkeyClient.removeLocalHotkey, keyArr: ", keyArr);
		let keyString = translateKeys({ keys: keyArr }).sort().toString();
		let wrap = this.localListeners[keyString][handler];
		eventEmitter.removeListener(keyString, wrap);
		this.routerClient.query("hotkeyService.unregisterGlobalHotkey", { "keys": keyString, windowName: this.windowName }, cb); //TODO: query
	}

	/**
	 *Adds a global hotkey, firing regardless of what window is in focus. If you execute this function more than once for the same key combination, both hotkeys will coexist, and would need to be remove separately.
	 * @param {Array} [keyArr] Array of strings representing hotkey key combination. We're not very picky about exactly what strings you use - for example "control", "ctrl" and "CTRL" all work for the control key.
	 * @param {function} [handler] Function to be executed when the hotkey combination is pressed. It is recommended that you define a variable to represent the handler function, as the same function must be passed in order to remove the hotkey.
	 * @param {function} [cb] Callback to be called after local hotkey is added.
	 * @example
	 * var myFunction = function () {...}
	 * FSBL.Clients.HotkeyClient.addGlobalHotkey(["ctrl","shift","s"],myFunction,cb)
	 */
	addGlobalHotkey(keyArr, handler, cb) {
		Logger.system.info("HotkeyClient.addGlobalHotkey");
		Logger.system.debug("HotkeyClient.addGlobalHotkey, keyArr: ", keyArr);
		let keyString = translateKeys({ keys: keyArr }).sort().toString();
		eventEmitter.addListener(keyString, handler);
		this.routerClient.query("hotkeyService.registerGlobalHotkey", { "keys": keyString, windowName: this.windowName }, cb);
	}

	/**
	 *Removes a global hotkey.
	 * @param {Array} [keyArr] Array of strings representing hotkey key combination. We're not very picky about exactly what strings you use - for example "control", "ctrl" and "CTRL" all work for the control key.
	 * @param {function} [handler] Handler registered for the hotkey to be removed.
	 * @param {function} [cb] Callback to be called after local hotkey is removed.
	 * @example
	 *
	 * FSBL.Clients.HotkeyClient.removeGlobalHotkey(["ctrl","shift","s"],myFunction,cb)
	 */
	removeGlobalHotkey(keyArr, handler, cb) {
		Logger.system.info("HotkeyClient.removeGlobalHotkey");
		Logger.system.debug("HotkeyClient.removeGlobalHotkey, keyArr: ", keyArr);
		let keyString = translateKeys({ keys: keyArr }).sort().toString();
		eventEmitter.removeListener(keyString, handler);
		this.routerClient.query("hotkeyService.unregisterGlobalHotkey", { "keys": keyString, windowName: this.windowName }, cb); //TODO: query
	}

	/**
	 * Not yet implemented - will return an object that contains all registered Hotkeys
	 */
	/* getHotkeys() { //TODO: MAKE WORK
		Logger.system.info("HotkeyClient.getHotkeys");
		this.routerClient.transmit("hotkeyService.getRegisteredHotkeys", { request: true });
	} */

	/**
	 *Handler for "hotkey triggered" messages from the service, called upon client initialization.
	 */
	listenForHotkeys() { //TODO: unexpose
		var self = this;
		this.routerClient.addListener("HotkeyTriggered", function (error, response) {
			if (error) {
				console.error("Hotkey Channel Error: " + JSON.stringify(error));
			} else {
				if (response.data.windows.includes(self.windowName)) { //if this is one of the windows that the service means to trigger here
					eventEmitter.emit(response.data.keys);
				}
			}
		});
	}

	/**
	 * Unregisters all hotkeys, both locally and service-side.
	 * @param {function} cb Optional callback function
	 *
	 */
	removeAllHotkeys(cb) {
		eventEmitter.removeAllListeners();
		this.routerClient.query("hotkeyService.removeAllHotkeysForWindow", { windowName: this.windowName }, cb);
	}

	/**
	 * Automatically unregisters all hotkeys when the window containing the client closes
	 * @param {function} cb
	 */
	onClose(cb) {
		this.removeAllHotkeys(cb);
	}
}

var hotkeyClient = new HotkeyClient({
	startupDependencies: {
		services: ["hotkeyService"]
	},
	onReady: function (cb) {
		if (cb) {
			cb();
		}
	},
	name: "hotkeyClient"
});

module.exports = hotkeyClient;