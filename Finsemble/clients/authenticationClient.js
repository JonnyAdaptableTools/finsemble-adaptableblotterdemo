/*!
* Copyright 2017 by ChartIQ, Inc.
* All rights reserved.
*/

"use strict";
var Validate = require("../common/validate"); // Finsemble args validator
var BaseClient = require("./baseClient");

var Logger = require("./logger");

Logger.system.log("Starting AuthenticationClient");

/**
 * @introduction
 * <h2>Authentication Client</h2>
 *
 * The Authentication Client supports three distinct areas of functionality:
 *
 * 1) The client API provides hooks for plugging in a custom sign-on component at the beginning of Finsemble start-up (before application-level components are started).
 * See the <a href=tutorial-enablingAuthentication.html>Authentication tutorial</a> for an overview of using these hooks.
 *
 * 2) The client API provides hooks for running authentication processes dynamically via "authentication profiles."
 *
 * 3) The client API provides automatic login capabilities for Finsemble components (password auto-fill).
 *
 * @hideConstructor true
 * @constructor
 */
var AuthenticationClient = function (params) {
	BaseClient.call(this, params);

	/**
	 * During Finsemble's start-up process, this function must be invoked before Finsemble will start the application.
	 * Once invoked, the authenticated user name and authorization credentials are received by the Authentication Service and published on the "AuthenticationService.authorization" channel.
	 * Any component can revieve the credentials by subscribing to that channel or by calling {@link AuthenticationClient#getCurrentCredentials}.
	 *
	 * Note that all calls to Storage Client are keyed to the authenticated *user*. See {@link StorageClient#setUser}.
	 * If authentication is not enabled, then "defaultUser" is used instead.
	 *
	 * @param {string} user the name of the authenticated user
	 * @param {object} credentials the authorization credentials (or token) for the current user, as specified by the application's authentication component.
	 * @example
	 *
	 * FSBL.Clients.AuthenticationClient.publishAuthorization(username, credentials);
	 */
	this.publishAuthorization = function (user, credentials) {
		let authMessage = "AUTHORIZATION: Publishing Authorization for " + user;
		Logger.system.debug(authMessage);
		console.debug(authMessage + ".", "credentials: " + JSON.stringify(credentials));
		Validate.args(user, "string", credentials, "object");
		this.routerClient.transmit("AuthenticationService.authorization", { user: user, credentials: credentials });
	};


	/**
	 * Returns the current global credentials (as published through {@link AuthenticationClient#publishAuthorization}) or null if no credentials are set yet.
	 * @param {function} cb A function that returns the current credentials. Will return null/undefined if no credentials have yet been established.
	 * @since TBD
	 */
	this.getCurrentCredentials = function (cb) {
		this.routerClient.query("authentication.currentCredentials", null, function (err, response) {
			var credentials = err ? null : response.data;
			cb(err, credentials);
		});
	};

	/**
	 * ALPHA Automatic SignOn Function. Not used by components signing on, but only by "system dialog" component that prompts the user for signon data. This command will send the user-input sign-on data back to the Authentication Service.
	 *
	 * @param {any} signOnData
	 */
	this.transmitSignOnToAuthService = function (signOnData) {
		Validate.args(signOnData, "object");
		let signOnMessage = "AUTHORIZATION: Transmitting Signon To AuthService";
		Logger.system.debug(signOnMessage);
		console.debug(signOnMessage, signOnData);
		this.routerClient.transmit("authentication.dialogSignOnToAuthService", signOnData);
	};

	/**
	 * ALPHA Automatic SignOn Function. Returns the signon data after either prompting user or getting a cached version.
	 *
	 * @param {string} signOnKey component-defined unique identifier string representing the sign-on data (the same string must be used for each unique signon).
	 * @param {object} params object { icon, prompt, force, userMsg }.  `icon` is a URL to icon to displace in sign-on dialog. `prompt` is a string to display in signon dialog. `force` indicates if sign-on dialog should be used even if accepted sign-on data is available in the encrypted store. `userMsg` is an optional message to be displayed for the user in the sign-on dialog.
	 * @param {function} cb callback function (err,response) with the response being an object: { signOnKey, username, password, validationRequired }
	 */
	this.appSignOn = function (signOnKey, params, cb) {
		let signOnMessage = `AUTHORIZATION: Signing on to app ${signOnKey}`;
		Logger.system.debug(signOnMessage);
		Validate.args(signOnKey, "string", params, "object", cb, "function");
		this.routerClient.query("authentication.appSignOn", { signOnKey, params }, { timeout: -1 }, function (err, response) {
			if (cb) {
				cb(err, response.data);
			}
		});
	};

	/**
	 * ALPHA Automatic SignOn Function. Rejects previous sign-on data and restarts sign on. Returns the sign-on data after either prompting user or getting a cached version. Should only be called when `validationRequired` is `true` in sign-on response.
	 *
	 * @param {any} signOnKey
	 * @param {object} params object { userMsg } where `userMsg` is an option message to be displayed for user in sign`on dialog
	 * @param {any} cb
	 */
	this.appRejectAndRetrySignOn = function (signOnKey, params, cb) {
		Logger.system.warn("AUTHORIZATION: appRejectAndRetrySignOn", signOnKey);
		Validate.args(signOnKey, "string", params, "object", cb, "function");
		this.routerClient.query("authentication.appRejectAndRetrySignOn", { signOnKey, params }, { timeout: -1 }, function (err, response) {
			if (cb) {
				cb(err, response.data);
			}
		});
	};

	/**
	 * ALPHA Automatic SignOn Function. Accepts the data returned by `appSignOn`, causing the data to be saved for future use. Should only be called when `validationRequired` is `true` in sign-on response.
	 *
	 * @param {any} signOnKey
	 */
	this.appAcceptSignOn = function (signOnKey) {
		Logger.system.info("AUTHORIZATION: Accepted application signon.", signOnKey);
		Validate.args(signOnKey, "string");
		this.routerClient.transmit("authentication.appAcceptSignOn", { signOnKey });
	};

	/**
	 * ALPHA Automatic SignOn Function. Rejects the data returned by previous sign on. Should only be called when validationRequired is true in sign-on response.
	 *
	 * @param {any} signOnKey
	 */
	this.appRejectSignOn = function (signOnKey) {
		Logger.system.error("AUTHORIZATION: Rejected application signon.", signOnKey);
		Validate.args(signOnKey, "string");
		this.routerClient.transmit("authentication.appRejectSignOn", { signOnKey });
	};

	/**
	 * Completes an OAuth2 authentication that was begun with {@link AuthenticationClient#beginAuthentication}.
	 * This function is called when an OAuth2 response is completed.
	 * You should call this function from within the page that you specified in "redirect_uri" in your Authentication Profile config.
	 * See the authentication tutorial for more information on configuring OAuth.
	 *
	 * @param {object} [params] Optionally pass the OAuth2 query string parameters from your response page. Set to null and the query string will automatically be parsed based on the OAuth2 specification.
	 * @param {function} cb Returns the result (err, data). data will contain the results of the authentication process, such as the access_token and other values provided by your Identify Provider.
	 * @since TBD
	 */
	this.completeOAUTH = function (err, params, cb) {
		Logger.system.log("completeOAUTH", params);
		Validate.args(params, "object=");
		var self = this;
		// Get parameters from the query string by default
		if (!params) {
			params = {};
			var queryString = new URLSearchParams(window.location.search);
			// Convert URLSearchParams into POJO
			for (let pair of queryString.entries()) {
				params[pair[0]] = pair[1];
			}
		}

		function sendToAuthService() {
			self.routerClient.query("authentication.completeOAUTH", { err, params }, function (err, response) {
				var data;
				if (response.data) data = response.data;
				cb(err, data);
			});
		}

		// Normally, we should have the "state" back by now, but sometimes oauth can get stuck in limbo, for instance
		// if the identity provider's redirect page doesn't return properly. In this case, we revert to looking
		// for our original "state" in the window's options (customData) where we had previously stashed it away for
		// just such a circumstance.
		if (params.state) {
			sendToAuthService();
		} else {
			this.finsembleWindow.getOptions((err, opts) => {
				params.state = opts.customData.OAuthState;
				sendToAuthService();
			});
		}
	};

	/**
	 * Starts an authentication process. The callback will be triggered when the authentication is totally complete.
	 * Use this method if you have a component that needs to complete an authentication process, such as OAuth2.
	 *
	 * You must set up an "authentication profile" in your Finsemble config. Reference the name of that profile
	 * in params.profile. See the Authentication Tutorial for information on configuration authentication profiles.
	 *
	 * @param {object} params
	 * @param {string} params.profile The name of the authentication profile from the authentication config section. See "startup" for instance.
	 * @param {object} [params.spawnParams] Optionally specify parameters to send to spawn, for when spawning an authentication window.
	 * @param {function} cb Returns an object containing the authentication response, i.e., OAuth credentials, etc
	 * @since TBD
	 */
	this.beginAuthentication = function (params, cb) {
		this.routerClient.query("authentication.beginAuthentication", params, function (err, response) {
			cb(err, response.data);
		});
	};
};

var authenticationClient = new AuthenticationClient({
	onReady: function (cb) {
		Logger.system.log("authenticationClient online");
		if (cb) {
			cb();
		}
	},
	name: "authenticationClient"
});
module.exports = authenticationClient;