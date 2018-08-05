/*!
* Copyright 2017 by ChartIQ, Inc.
* All rights reserved.
*/

"use strict";

const LOCAL_ONLY_DEFAULT = false; // if true all logging will default to local console; will be overwritten by LoggerService's registration response
const ALWAY_ADD_STACKTRACE = false; // if true always add stacktrace data to all log messages (e.g. debug and verbose, not just errors, warning)

// capture everything at startup; will be filtered later as needed when LoggerService's registration response provides settings; overhead here is not too high
var DEFAULT_LOG_SETTING = { Error: true, Warn: true, Info: true, Log: true, Debug: true, Verbose: true, LocalOnly: LOCAL_ONLY_DEFAULT }; // if true captured for logger
var CONSOLE_DEFAULT_LOG_SETTING = { Error: true, Warn: true, Info: true, Log: true, Debug: true }; // if true then goes to console and captured for logger
const MAX_LOG_MESSAGE_SIZE = 10000;
const OVER_LOG_SIZE_LIMIT_MESSAGE = `Log argument greater than ${MAX_LOG_MESSAGE_SIZE / 1000}KB. Check local Console to see output of the object.`;
const MAX_QUEUE_SIZE = 10 * 1000; // maximum logger queue size; plenty of space although shouldn't need much since continuely sending to logger if working correctly;
const throttle = require("lodash.throttle");
var RouterClient; // wait till start to fill in
/**
 * @introduction
 *
 * <h2>Logger Client</h2>
 *
 * The Logger Client supports very efficent and configurable run-time logging to the <a href=tutorial-CentralLogger.html>Central Logger</a>. 
 * Logging has a small performance overhead, so developers can liberally instrument their code with log messages for debugging and diagnostics. 
 * By default, only error and warning messages are captured by the Logger, with the other message types (e.g., log, info, debug) disabled. 
 * Which message types are enabled or disabled is fully controlled from the <a href=tutorial-CentralLogger.html>Central Logger</a>&mdash;this means developers can fully instrument their code once and dynamically enable and disable logging later, as needed, for debugging or field support.
 *
 * The Finsemble team uses the Central Logger to <a href=tutorial-capturingLogData.html>capture log message for field support</a>. 
 * Finsemble customers, building their own Finsemble applications, have the option to do the same.
 *
 * **Note:** The Logger Client **wraps** all console logging (e.g., `console.error`, `console.log`) so these message can also be captured and viewed in the Central Logger, but console logging is never disabled locally. For better performance, we recommend most of your code's instrumentation be based on the Logger Client (e.g., `FSBL.Clients.Logger.debug(...)` instead of the `console.debug(...)`).
 *
 * Using the Logger is similar to using the browser's console for logging (e.g., `console.error` or `console.log`), although the Logger Client is accessed through the FSBL object as shown in the examples below.
 *
 *```javascript
 * 			FSBL.Clients.Logger.error("an error message", anErrorOject);
 * 			FSBL.Clients.Logger.warn("a warning message", object1, object2, object3);
 * 			FSBL.Clients.Logger.log("logging message");
 * 			FSBL.Clients.Logger.info("logging message");
 * 			FSBL.Clients.Logger.log("log message");
 * 			FSBL.Clients.Logger.debug("debug message");
 *```
 * The Logger Client also supports system logging (e.g., `Logger.system.log`) for Finsemble's internal logging. All Finsemble client APIs are in the process of being instrumented to log their entry-point calls and parameters, as shown below.
 * 
 *```javascript
 * 			Logger.system.info("RouterClient.transmit", "TO CHANNEL", toChannel, "EVENT", event);
 *```
 * Developers can view all system logging in the Central Logger, although only `Logger.system.info` messages (recording API interactions) are intended for use outside the Finsemble development team.
 *
 *<strong>Note:</strong> Any service can also use the Logger by directing requiring the client. The Logger can immediately be used, but log message will not be transmitted to the Central Logger until `Logger.start()` is invoked (as shown below).
 *```javascript
 *
 * 			var Logger = require("../../clients/logger");
 * 			Logger.log("Service Ready");
 * 			Logger.start();
 *```
 * @hideConstructor true
 * @shouldBePublished true
 * @constructor
 */
var Logger = function () {
	var self = this;
	var isRegistering = false; // if registering start
	var isRegistered = false; // if registering complete
	var loggerConsole = self;
	var updatedLogState;
	var calibratedTimeStampOffset = 0;
	var newCalibratedTimeStampOffset;
	var filteredMessagesCounter = 0;
	this.startupTime = 0;
	var loggerQueue = [];
	var warningIssued = false; // used to limit warning messages
	if (typeof window === "undefined") return;
	var loggerClientName = fin.desktop.Window.getCurrent().name.replace(/\./, "-");
	if (window.top !== window) { // amend name if iFrame
		loggerClientName += ".Frame";
	}
	var clientChannel = "finsemble.logger.client." + loggerClientName;

	//const CATEGORIES = ["console", "dev", "system", "perf"];

	var initialLogState = {}; // will be updated on registration with Central Logger, but capture everything until then
	initialLogState.console = CONSOLE_DEFAULT_LOG_SETTING;
	initialLogState.dev = DEFAULT_LOG_SETTING;
	initialLogState.system = DEFAULT_LOG_SETTING;
	initialLogState.perf = DEFAULT_LOG_SETTING;

	var currentLogState = initialLogState;
	function LoggerMessage(category, type, data) {
		this.category = category;
		this.logClientName = loggerClientName;
		this.logType = type;
		this.logData = data;
		this.logTimestamp = window.performance.timing.navigationStart + window.performance.now() + calibratedTimeStampOffset;
	}

	function addToQueue(message) {
		if (loggerQueue.length < MAX_QUEUE_SIZE) {
			loggerQueue.push(message);
		} else {
			if (!warningIssued) {
				console.warn("Logging Queue Overflowed!", loggerQueue.length);
				warningIssued = true;
			}
		}
	}

	// if log state changes then update queue based on that data (e.g. if no longer logging debug messages, then remove them from the queue)
	function updateQueueBasedOnState(calibrateTimeFlag) {
		loggerConsole.system.debug("Logger updateQueueBasedOnState", calibrateTimeFlag, calibratedTimeStampOffset, "QUEUE LENGTH", loggerQueue.length, currentLogState);
		var newQueue = [];
		for (var i = 0, length = loggerQueue.length; i < length; i++) {
			if (currentLogState[loggerQueue[i].category][loggerQueue[i].logType] && !currentLogState[loggerQueue[i].category].LocalOnly) {
				if (calibrateTimeFlag) {
					loggerQueue[i].logTimestamp += calibratedTimeStampOffset; // if flag set then timestamp hasn't been adjusted yet by calibrated offset time
				}
				newQueue.push(loggerQueue[i]);
			} else { // only now know LocalOnly for messages, so print those queued out otherwise they will be lost
				if (currentLogState[loggerQueue[i].category][loggerQueue[i].logType] && currentLogState[loggerQueue[i].category].LocalOnly) {
					let msg = loggerQueue[i];
					console.log(msg.category, msg.logType, msg.logTimestamp - window.performance.timing.navigationStart, msg.logData, "(Previously queued!)");
				}
			}
		}
		loggerQueue = newQueue;
	}

	this.setClientName = function (name) {
		loggerClientName = name;
	};

	this.getClientName = function (name) {
		return loggerClientName;
	};

	this.clearMessageList = function () {
		loggerQueue = [];
	};

	function setLogState(state, calibrateTimeFlag) {
		currentLogState = state;
		updateQueueBasedOnState(calibrateTimeFlag);
	}

	function traceString() {
		function getPosition(string, subString, index) {
			return string.split(subString, index).join(subString).length;
		}

		function getErrorObject() {
			try { throw Error(""); } catch (err) { return err; }
		}
		var stack = getErrorObject().stack;
		var position = getPosition(stack, "\n", 4);
		var tString = stack.substring(position); // strip off irrelevant part of stack
		var final = "Log Stack: \n" + tString.substr(1); // insert description
		return final;
	}

	// save original console functions since going to wrap/redefine each
	var orignalConsoleError = console.error;
	var orignalConsoleWarn = console.warn;
	var orignalConsoleInfo = console.info;
	var orignalConsoleLog = console.log;
	var orignalConsoleDebug = console.debug;

	function getRoughSizeOfObject(object) {
		var objectList = [];
		var stack = [object];
		var bytes = 0;
		//prevent infinite recursion
		var attempts = 0;
		while (stack.length && attempts < 1000) {
			attempts++;
			var value = stack.pop();

			if (typeof value === "boolean") {
				bytes += 4;
			}
			else if (typeof value === "string") {
				bytes += value.length * 2;
			}
			else if (typeof value === "number") {
				bytes += 8;
			}
			else if
			(
				typeof value === "object"
				&& objectList.indexOf(value) === -1
			) {
				objectList.push(value);

				for (var i in value) {
					stack.push(value[i]);
				}
			}
		}
		return bytes;
	}

	// filter out message containing certain substrings;
	function filterMessage(message) {
		var result = (message.logData.indexOf("heartbeat") !== -1);
		return result;
	}

	function formatAndQueueMessage(category, type, args) {
		var message;
		let CHECK_OBJECT_SIZE = true;
		if (args[0] === "forceObjectsToLogger") {
			CHECK_OBJECT_SIZE = false;
			args.splice(0, 1);
		}
		//Kicks out overly-large objects to prevent the loggerService from jamming up.
		args = args.map((object) => {
			if (CHECK_OBJECT_SIZE) {
				let bytes = getRoughSizeOfObject(object);
				if (bytes > MAX_LOG_MESSAGE_SIZE) {
					outputToConsole(orignalConsoleInfo, ["Message too large to send to the logger.", args]);
					return OVER_LOG_SIZE_LIMIT_MESSAGE;
				}
			}
			return object;
		});

		try {
			message = new LoggerMessage(category, type, JSON.stringify(args));
		} catch (err) {
			args.splice(0, args.length); // clear but don't redefine since must return updated value
			args.push(traceString());
			message = new LoggerMessage(category, type, "*** Logging Error: " + JSON.stringify(args));
		}

		if (!filterMessage(message)) {
			addToQueue(message);
		} else {
			if (++filteredMessagesCounter <= 5) {
				let filterMsg = `"Filtered Logger Message (${filteredMessagesCounter} of first 5 shown)`;
				outputToConsole(orignalConsoleInfo, [filterMsg, message]); // put out a few filtered messages then stop so won't clutter console
			}
		}

		if (isRegistered) {
			transmitAndClearQueue();
		}
	}

	let transmitAndClearQueue = function () {
		if (loggerQueue.length > 0) {
			RouterClient.transmit("logger.service.logMessages", loggerQueue);
			loggerConsole.clearMessageList();
		}
	};

	if (loggerClientName === "routerService") {
		transmitAndClearQueue = throttle(transmitAndClearQueue, 100, { leading: false }); // HERE is the interval for transmitting queued messages to the logger service
	} else {
		transmitAndClearQueue = throttle(transmitAndClearQueue, 250, { leading: false }); // HERE is the interval for transmitting queued messages to the logger service
	}
	//Helper to flatten the array of arguments passed in, so we can log the full message locally.
	function flatten(arr) {
		return arr.reduce(function (flat, toFlatten) {
			return flat.concat(Array.isArray(toFlatten) ? flatten(toFlatten) : toFlatten);
		}, []);
	}
	function outputToConsole(consoleType, args) {
		try {
			consoleType.apply(console, flatten(args));
		} catch (err) {
			args = [];
			args.push(traceString());
			message = new LoggerMessage(category, type, "*** Console Logging Error: " + JSON.stringify(args));
		}
	}


	/**
	 * Log a dev error message.
	 *
	 * @param {...*} messageParm message parameter of any type that can be stringified (e.g. string, object)
	 *
	 * @example
	 *
	 * FSBL.Clients.Logger.error("some message", parm1, parm2);
	 */
	this.error = function () {
		var args = Array.prototype.slice.call(arguments); // make a real array so can manipulate
		args.push(traceString());
		if (currentLogState.dev.Error && !currentLogState.dev.LocalOnly) {
			formatAndQueueMessage("dev", "Error", args);
		}

		args.unshift("dev error (" + window.performance.now() + "):");
		outputToConsole(orignalConsoleError, args);
	};

	/**
	 * Log a dev warning message.
	 *
	 * @param {...*} messageParm message parameter of any type that can be stringified (e.g. string, object)
	 *
	 * @example
	 *
	 * FSBL.Clients.Logger.warn("some message", parm1, parm2);
	 */
	this.warn = function () {
		if (currentLogState.dev.Warn) {
			var args = Array.prototype.slice.call(arguments); // make a real array so can manipulate
			args.push(traceString());
			if (currentLogState.dev.Warn && !currentLogState.dev.LocalOnly) {
				formatAndQueueMessage("dev", "Warn", args);
			}
			if (currentLogState.dev.Warn && currentLogState.dev.LocalOnly) {
				args.unshift("dev warn (" + window.performance.now() + "):");
				outputToConsole(orignalConsoleWarn, args);
			}
		}
	};

	/**
	 * Log a dev info message.
	 *
	 * @param {...*} messageParm message parameter of any type that can be stringified (e.g. string, object)
	 *
	 * @example
	 *
	 * FSBL.Clients.Logger.info("some message", parm1, parm2);
	 */
	this.info = function () {
		if (currentLogState.dev.Info) {
			var args = Array.prototype.slice.call(arguments); // make a real array so can manipulate
			if (ALWAY_ADD_STACKTRACE) {
				args.push(traceString());
			}
			if (currentLogState.dev.Info && !currentLogState.dev.LocalOnly) {
				formatAndQueueMessage("dev", "Info", args);
			}
			if (currentLogState.dev.Info && currentLogState.dev.LocalOnly) {
				args.unshift("dev info (" + window.performance.now() + "):");
				outputToConsole(orignalConsoleInfo, args);
			}
		}
	};

	/**
	 * Log a dev log message.
	 *
	 * @param {...*} messageParm message parameter of any type that can be stringified (e.g. string, object)
	 *
	 * @example
	 *
	 * FSBL.Clients.Logger.log("some message", parm1, parm2);
	 */
	this.log = function () {
		if (currentLogState.dev.Log) {
			var args = Array.prototype.slice.call(arguments); // make a real array so can manipulate
			if (ALWAY_ADD_STACKTRACE) {
				args.push(traceString());
			}
			if (currentLogState.dev.Log && !currentLogState.dev.LocalOnly) {
				formatAndQueueMessage("dev", "Log", args);
			}
			if (currentLogState.dev.Log && currentLogState.dev.LocalOnly) {
				args.unshift("dev log (" + window.performance.now() + "):");
				outputToConsole(orignalConsoleLog, args);
			}
		}
	};

	/**
	 * Log a dev debug message.
	 *
	 * @param {...*} messageParm message parameter of any type that can be stringified (e.g. string, object)
	 *
	 * @example
	 *
	 * FSBL.Clients.Logger.debug("some message", parm1, parm2);
	 */
	this.debug = function () {
		if (currentLogState.dev.Debug) {
			var args = Array.prototype.slice.call(arguments); // make a real array so can manipulate
			if (ALWAY_ADD_STACKTRACE) {
				args.push(traceString());
			}
			if (currentLogState.dev.Debug && !currentLogState.dev.LocalOnly) {
				formatAndQueueMessage("dev", "Debug", args);
			}
			if (currentLogState.dev.Debug && currentLogState.dev.LocalOnly) {
				args.unshift("dev debug (" + window.performance.now() + "):");
				outputToConsole(orignalConsoleDebug, args);
			}
		}
	};

	/**
	 * Log a dev verbose message (an extra level of verbose-debug output)
	 *
	 * @param {...*} messageParm message parameter of any type that can be stringified (e.g. string, object)
	 *
	 * @example
	 *
	 * FSBL.Clients.Logger.verbose("some message", parm1, parm2);
	 */
	this.verbose = function () {
		if (currentLogState.dev.Verbose) {
			var args = Array.prototype.slice.call(arguments); // make a real array so can manipulate
			if (ALWAY_ADD_STACKTRACE) {
				args.push(traceString());
			}
			if (currentLogState.dev.Verbose && !currentLogState.dev.LocalOnly) {
				formatAndQueueMessage("dev", "Verbose", args);
			}
			if (currentLogState.dev.Verbose && currentLogState.dev.LocalOnly) {
				args.unshift("dev verbose (" + window.performance.now() + "):");
				outputToConsole(orignalConsoleDebug, args);
			}
		}
	};

	// system mode functions
	this.system = {};
	this.system.error = function () {
		var args = Array.prototype.slice.call(arguments); // make a real array so can manipulate
		args.push(traceString());

		if (currentLogState.system.Error && !currentLogState.system.LocalOnly) {
			formatAndQueueMessage("system", "Error", args);
		}

		args.unshift("system error (" + window.performance.now() + "):");
		outputToConsole(orignalConsoleError, args);
	};

	this.system.warn = function () {
		if (currentLogState.system.Warn) {
			var args = Array.prototype.slice.call(arguments); // make a real array so can manipulate
			args.push(traceString());
			if (currentLogState.system.Warn && !currentLogState.system.LocalOnly) {
				formatAndQueueMessage("system", "Warn", args);
			}
			if (currentLogState.system.Warn && currentLogState.system.LocalOnly) {
				args.unshift("system warn (" + window.performance.now() + "):");
				outputToConsole(orignalConsoleWarn, args);
			}
		}
	};

	this.system.info = function () {
		if (currentLogState.system.Info) {
			var args = Array.prototype.slice.call(arguments); // make a real array so can manipulate
			if (ALWAY_ADD_STACKTRACE) {
				args.push(traceString());
			}
			if (currentLogState.system.Info && !currentLogState.system.LocalOnly) {
				formatAndQueueMessage("system", "Info", args);
			}
			if (currentLogState.system.Info && currentLogState.system.LocalOnly) {
				args.unshift("system info (" + window.performance.now() + "):");
				outputToConsole(orignalConsoleInfo, args);
			}
		}
	};

	this.system.log = function () {
		if (currentLogState.system.Log) {
			var args = Array.prototype.slice.call(arguments); // make a real array so can manipulate
			if (ALWAY_ADD_STACKTRACE) {
				args.push(traceString());
			}
			if (currentLogState.system.Log && !currentLogState.system.LocalOnly) {
				formatAndQueueMessage("system", "Log", args);
			}
			if (currentLogState.system.Log && currentLogState.system.LocalOnly) {
				args.unshift("system log (" + window.performance.now() + "):");
				outputToConsole(orignalConsoleLog, args);
			}
		}
	};

	this.system.debug = function () {
		if (currentLogState.system.Debug) {
			var args = Array.prototype.slice.call(arguments); // make a real array so can manipulate
			if (ALWAY_ADD_STACKTRACE) {
				args.push(traceString());
			}
			if (currentLogState.system.Debug && !currentLogState.system.LocalOnly) {
				formatAndQueueMessage("system", "Debug", args);
			}
			if (currentLogState.system.Debug && currentLogState.system.LocalOnly) {
				args.unshift("system debug (" + window.performance.now() + "):");
				outputToConsole(orignalConsoleDebug, args);
			}
		}
	};

	this.system.verbose = function () {
		if (currentLogState.system.Verbose) {
			var args = Array.prototype.slice.call(arguments); // make a real array so can manipulate
			if (ALWAY_ADD_STACKTRACE) {
				args.push(traceString());
			}
			if (currentLogState.system.Verbose && !currentLogState.system.LocalOnly) {
				formatAndQueueMessage("system", "Verbose", args);
			}
			if (currentLogState.system.Verbose && currentLogState.system.LocalOnly) {
				var args = Array.prototype.slice.call(arguments); // make a real array so can manipulate
				args.unshift("system log (" + window.performance.now() + "):");
				outputToConsole(orignalConsoleDebug, args);
			}
		}
	};

	// performance mode functions
	this.perf = {};
	this.perf.error = function () {
		var args = Array.prototype.slice.call(arguments); // make a real array so can manipulate
		args.push(traceString());
		if (currentLogState.perf.Error && !currentLogState.perf.LocalOnly) {
			formatAndQueueMessage("perf", "Error", args);
		}

		args.unshift("perf error (" + window.performance.now() + "):");
		outputToConsole(orignalConsoleError, args);
	};

	this.perf.warn = function () {
		if (currentLogState.perf.Warn) {
			var args = Array.prototype.slice.call(arguments); // make a real array so can manipulate
			args.push(traceString());
			if (currentLogState.perf.Warn && !currentLogState.perf.LocalOnly) {
				formatAndQueueMessage("perf", "Warn", args);
			}
			if (currentLogState.perf.Warn && currentLogState.perf.LocalOnly) {
				args.unshift("perf warn (" + window.performance.now() + "):");
				outputToConsole(orignalConsoleWarn, args);
			}
		}
	};

	this.perf.info = function () {
		if (currentLogState.perf.Info) {
			var args = Array.prototype.slice.call(arguments); // make a real array so can manipulate
			if (ALWAY_ADD_STACKTRACE) {
				args.push(traceString());
			}
			if (currentLogState.perf.Info && !currentLogState.perf.LocalOnly) {
				formatAndQueueMessage("perf", "Info", args);
			}
			if (currentLogState.perf.Info && currentLogState.perf.LocalOnly) {
				args.unshift("perf info (" + window.performance.now() + "):");
				outputToConsole(orignalConsoleInfo, args);
			}
		}
	};

	this.perf.log = function () {
		if (currentLogState.perf.Log) {
			var args = Array.prototype.slice.call(arguments); // make a real array so can manipulate
			if (ALWAY_ADD_STACKTRACE) {
				args.push(traceString());
			}
			if (currentLogState.perf.Log && !currentLogState.perf.LocalOnly) {
				formatAndQueueMessage("perf", "Log", args);
			}
			if (currentLogState.perf.Log && currentLogState.perf.LocalOnly) {
				args.unshift("perf log (" + window.performance.now() + "):");
				outputToConsole(orignalConsoleLog, args);
			}
		}
	};

	this.perf.debug = function () {
		if (currentLogState.perf.Debug) {
			var args = Array.prototype.slice.call(arguments); // make a real array so can manipulate
			if (ALWAY_ADD_STACKTRACE) {
				args.push(traceString());
			}
			if (currentLogState.perf.Debug && !currentLogState.perf.LocalOnly) {
				formatAndQueueMessage("perf", "Debug", args);
			}
			if (currentLogState.perf.Debug && currentLogState.perf.LocalOnly) {
				args.unshift("perf debug (" + window.performance.now() + "):");
				outputToConsole(orignalConsoleDebug, args);
			}
		}
	};

	this.perf.verbose = function () {
		if (currentLogState.perf.Verbose) {
			var args = Array.prototype.slice.call(arguments); // make a real array so can manipulate
			if (ALWAY_ADD_STACKTRACE) {
				args.push(traceString());
			}
			if (currentLogState.perf.Verbose && !currentLogState.perf.LocalOnly) {
				formatAndQueueMessage("perf", "Verbose", args);
			}
			if (currentLogState.perf.Verbose && currentLogState.perf.LocalOnly) {
				args.unshift("perf verbose (" + window.performance.now() + "):");
				outputToConsole(orignalConsoleDebug, args);
			}
		}
	};

	function registerClient() {
		loggerConsole.system.debug("logger.service.registering", loggerClientName);
		if (!LOCAL_ONLY_DEFAULT) {
			RouterClient.query("logger.service.register", {
				clientName: loggerClientName,
				clientChannel,
				uuid: fin.desktop.Window.getCurrent().uuid,
				windowName: fin.desktop.Window.getCurrent().name
			}, function (error, queryMessage) {
				if (error) { // for some very early clients the logger may not be ready yet, so retry after a small wait
					setTimeout(registerClient, 750);
				} else {
					isRegistered = true;
					loggerConsole.system.debug("logger.service.registered");
					updatedLogState = queryMessage.data;
					if (loggerClientName !== "routerService") {
						calibratedTimeStampOffset = newCalibratedTimeStampOffset; // from now the real offset time will be used for all timestamps
						setLogState(updatedLogState, true); // true indicates must adjust already queued timestamps by the new offset time
					} else { // router services doesn't need to calibrate time since it is the reference time
						setLogState(updatedLogState, false);
					}
					formatAndQueueMessage("system", "Info", ["Logger Registered"]);
					transmitAndClearQueue();
				}
			});
		}

		RouterClient.addListener(clientChannel, function (error, message) {
			loggerConsole.system.debug("logger.client.setLogState", message.data);
			updatedLogState = message.data;
			setLogState(updatedLogState, false);
		});
	}

	function unregisterClient() {
		loggerConsole.system.debug("logger.service.unregister", loggerClientName);
		transmitAndClearQueue(); // send any message currently in the log queue
		RouterClient.query("logger.service.unregister", { clientName: loggerClientName }, function () { });
	}

	function registerOnceWhenStarted() {
		if (!isRegistering) {
			self.startupTime = performance.now() - self.startupTime;
			registerClient();
			window.addEventListener("beforeunload", unregisterClient);
			isRegistering = true;
		}
	}

	this.isLogMessage = function (channel) {
		return (channel === "logger.service.logMessages");
	};
	this.status = "offline";
	this.start = function () {
		this.startupTime = performance.now();
		var self = this;
		RouterClient = require("./routerClientInstance");
		let onlineSubscription, allActiveSubscription;
		//Wait for the service before coming online. can't use the dependency manager, because it uses the router, which uses the logger.
		function comeOnline() {
			self.status = "online";
			loggerConsole.system.debug("Logger onReady", loggerClientName);
			// timer calibration must be done so the messages will be correctly sorted in the central logger;
			// this is necessary because there is timer driff between windows --- this appears to be a Chromium
			// bug we have to work around it.  The timeOffset value adjusts the time using the routerService's
			// time as a central reference point.
			RouterClient.calibrateTimeWithRouterService(function (timeOffset) {
				newCalibratedTimeStampOffset = timeOffset;
				registerOnceWhenStarted();
			});
		}
		RouterClient.onReady(() => {
			onlineSubscription = RouterClient.subscribe("Finsemble.serviceOnline", function (err, event) {
				if (self.status == "online") {
					RouterClient.unsubscribe(onlineSubscription);
				} else if (event && event.data === "loggerService") {
					comeOnline();
					RouterClient.unsubscribe(onlineSubscription);
				}
			});
			allActiveSubscription = RouterClient.subscribe("Finsemble.ServiceManager.getActiveServices", function (err, event) {
				if (self.status == "online") {
					RouterClient.unsubscribe(allActiveSubscription);
				} else if (event && event.data.includes("loggerService")) {
					comeOnline();
					RouterClient.unsubscribe(allActiveSubscription);
				}
			});
		});
	};
};

var logger = new Logger();

module.exports = logger;
