/*!
* Copyright 2017 by ChartIQ, Inc.
* All rights reserved.
*/

var Logger = require("../clients/logger");
var ConfigUtil = require("../common/configUtil");

"use strict";

/**
 * @hideConstructor true
 * @constructor
 */
var UserNotification = function () {
	var alertOnceSinceStartUp = {};
	var alertCurrentCount = {};
	var defaultTemplateURL = null;

	/**
	 * Gets the default template URL from the manifest at finsemble->notificationURL. If that doesn't exist then it falls back to the system template location.
	 * @private
	 */
	this.getDefaultTemplateURL = function (cb) {
		if (defaultTemplateURL) {
			setTimeout(function () {
				cb(defaultTemplateURL);
			}, 0);
		} else {
			FSBL.Clients.ConfigClient.get({ field: "finsemble" }, function (err, finConfig) {
				defaultTemplateURL = ConfigUtil.getDefault(finConfig, "finsemble.notificationURL", finConfig.moduleRoot + "/components/system/notification/notification.html");
				cb(defaultTemplateURL);
			});
		}	
	};


	/**
	 * Conditionally alerts the end user using a desktop notification.
	 *
	 * @param {string} topic specifies a category for the notification. Topic is currently unused, but in the future it will be used to filter notifications (e.g. applying regEx's defined in config to determine which notifications are displayed). Any topic string can be specified; however "system" is the recommended topic for system notifications applicable both to end uses and to developers. "dev" is the recommended topic for notifications applicable only during development (e.g. a notification that config.json has an illegal value).
	 * @param {string} frequency Either "ALWAYS", "ONCE-SINCE-STARTUP", or "MAX-COUNT" to determine if alert should be displayed. Note, the frequencies are based on the number of notifications emitted from a window (as opposed to system wide.)
	 * @param {string} identifier uniquely identifies this specific notification message. Used when "frequency" is set to "ONCE-SINCE-STARTUP" or "MAX-COUNT"
	 * @param {any} message message to display in the notification. Typically a string. Finsemble's built in templating accepts and object. See src-built-in/components/notification/notification.html.
	 * @param {object=} params
	 * @param {number} params.maxCount specifies the max number of notifications to display for specified identifier when frequency="MAX-COUNT" (default is 1)
	 * @param {number} params.duration time in milliseconds before auto-dismissing the notification (defaults to 24 hours)
	 * @param {number} params.url url for notification HTML. If not provided then the system default will be used. This url should be coded as required for OpenFin notifications (see OpenFin Documentation). Defaults to Finsemble's built-in version at "/finsemble/components/system/notification/notification.html".
	 * 
	 * @example
	 *		UserNotification.alert("system", "ONCE-SINCE-STARTUP", "MANIFEST-Error", message);
	*		UserNotification.alert("dev", "ALWAYS", "Config-Error", message, { url: notificationURL, duration: 1000 * 5 });
	*		UserNotification.alert("dev", "MAX-COUNT", "Transport-Failure", message, { url: notificationURL, maxCount: 2 });
	*/

	this.alert = function (topic, frequency, identifier, message, params) {
		var self = this;
		// If the url for the template is passed in then don't bother fetching the config
		if (params && params.url) {
			this.alertInternal(topic, frequency, identifier, message, params, params.url);
		} else {
			// If no url, then we need to get the template from config
			this.getDefaultTemplateURL(function (url) {
				self.alertInternal(topic, frequency, identifier, message, params, url);
			});
		}
	};

	/**
	 * @private
	 */
	this.alertInternal = function (topic, frequency, identifier, message, params, url) {
		params = params || {};
		var alertUser = false;
		var key = "UserNotification.alert." + identifier;
		var duration = params.duration || 1000 * 60 * 60 * 24;

		switch (frequency) {
			case "ONCE-SINCE-STARTUP":
				if (key in alertOnceSinceStartUp) {
					alertUser = false;
				} else { // if no key then must be first time
					alertUser = true;
					alertOnceSinceStartUp[key] = true;
				}
				break;
			case "MAX-COUNT":
				let currentCount = 0;
				let maxCount = params.maxCount || 1;
				if (key in alertCurrentCount) {
					currentCount = alertCurrentCount[key];
				}
				alertCurrentCount[key] = ++currentCount; // increment and store
				if (currentCount <= maxCount) {
					alertUser = true;
				}
				break;
			default: // default to "ALWAYS"
				alertUser = true;
		}

		Logger.log("UserNotification.alert", topic, alertUser, frequency, identifier, message, params);
		console.log("UserNotification.alert", topic, alertUser, frequency, identifier, message, params);

		if (alertUser) {
			var notifyObject = {
				url: url,
				message: message,
				timeout: duration
			};
			new fin.desktop.Notification(notifyObject);
		}
	};
};

module.exports = new UserNotification();