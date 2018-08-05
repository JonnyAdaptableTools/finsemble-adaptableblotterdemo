/*!
* Copyright 2017 by ChartIQ, Inc.
* All rights reserved.
*/


var Logger = require("./logger");

Logger.system.log("Starting searchClient");

/**
 *
 */
var BaseClient = require("./baseClient");

/**
 *
 * @introduction
 * <h2>Search Client</h2>
 * The Search Client allows for any window launched by Finsemble to act as a search provider or query against the registered providers.
 * @hideConstructor true
 * @constructor
 */
var SearchClient = function (params) {
	var self = this;
	BaseClient.call(this, params);
	var searchId;
	var resultsCallback;
	var providers = {};
	var resultProviders = {};
	var searchResultsList = [];
	var isSearching = false;// We use this so we don't create multiple responders for every window that searches.
	//Also, we if a window doesn't have any search functionality then we don't need extra listeners

	/**
	 * Register a provider with the search service.
	 * @param {Object} params - Params object
	 * @param {String} params.name - The name of the provider
	 * @param {Function} params.searchCallback - A function called when a search is initialized.
	 * @param {Function} [params.itemActionCallback] - A function that is called when an item action is fired
	 * @param {Function} [params.providerActionCallback] - A function that is called when a provider action is fired
	 * @param {String} [params.providerActionTitle] - The title of the provider action
	 * @param {function} callback - callback to be invoked when the provider is registered.
	 * @example
	 * FSBL.Clients.SearchClient.register({
			name: "MyProvider",
			searchCallback: searchApplications,
			itemActionCallback: itemActionCallback,
			providerActionTitle: providerActionTitle,
			providerActionCallback:providerActionCallback, (err, response) => {
	 * 		//provider has been registered
	 * });
	 */
	this.register = function (params, cb) {
		if (!params.name) return cb("no provider name provided");
		if (!params.searchCallback) return cb("no provider callback provided");
		self.routerClient.query("Search.register", {
			name: params.name,
			channel: self.finWindow.name + "." + params.name,
			providerActionTitle: params.providerActionTitle,
			providerActionCallback: params.providerActionCallback ? true : false
		}, function (err, response) {
			if (err) return cb ? cb(err) : console.error(err);
			var provider = self.finWindow.name + "." + params.name;
			providers[params.name] = params.name;
			//This is where we receive  our search requests.
			self.routerClient.addResponder("Search.Provider." + provider, function (err, message) {//create a query responder
				if (err) return console.error(err);
				if (!message) return;
				params.searchCallback(message.data, function (err, res) { message.sendQueryResponse(err, res); });
			});
			//This is where we receive calls for a result item action event
			self.routerClient.addResponder("Search.Provider.ItemAction." + provider, function (err, message) {//create a query responder
				if (err) return console.error(err);
				if (!message) return;
				if (params.itemActionCallback) params.itemActionCallback(message.data, message.header.origin, function (err, res) { message.sendQueryResponse(err, res); });
			});
			//This is where we receive calls for a provider level event
			if (params.providerActionCallback) {
				self.routerClient.addResponder("Search.Provider.Action." + provider, function (err, message) {//create a query responder
					if (err) return console.error(err);
					if (!message) return;
					if (params.providerActionCallback) params.providerActionCallback(message.header.origin, function (err, res) { message.sendQueryResponse(err, res); });
				});
			}
			return cb ? cb(null, response.data) : null;
		});
	};
	/**
			 * Remove a provider. This can only be done from the window that create the provider.
			 * @param {Object} params -
			 * @param {string} params.name - The provider name
			 * @example
			 * FSBL.Clients.SearchClient.unRegister({name:"MyProvider"},function(){
			 * });
			 *
			 */

	this.unRegister = function (params, cb) {
		if (!params.name) return cb("Provider name was not provided");
		var provider = self.finWindow.name + "." + params.name;
		self.routerClient.query("Search.unRegister", { channel: provider }, function () {
			self.routerClient.removeResponder("Search.Provider." + provider);
			self.routerClient.removeResponder("Search.Provider.ItemAction." + provider);
			self.routerClient.removeResponder("Search.Provider.Action." + provider);
			delete providers[params.name];
			return cb ? cb() : null;
		});


	};
	/**
		 * This initiates a search.
		 * @param {Object} params - Params object
		 * @param {String} params.text - The name of the provider
		 * @param {function} cb - callback to called as search results for each provider are returned. Results are combined as they come in.
		 * So, every response will have the complete list of results that have been returned. Example: You have two proviers; provider one retunrs results first, you'll have an array with just the that providers data. Once Provider
		 * two returns you'll have results for proiver one and provider two.
		 * @example
		 * FSBL.Clients.SearchClient.search({
				text: "Chart",
				(err, response) => {
		 * 		//Search results will be returned here
		 * });
		 */
	this.search = function (params, cb) {
		if (!isSearching) {
			self.routerClient.addPubSubResponder("Search." + self.finWindow.name);
			self.routerClient.subscribe("Search." + self.finWindow.name, handleResults);
			isSearching = true;
		}
		searchResultsList = [];
		params.windowName = self.finWindow.name;

		self.routerClient.query("Search.search", params, function (err, response) {
			if (err) return cb(err);
			resultsCallback = cb;
			searchId = response.data.searchId;
		});
	};
	/**
	 * Call this when you want to trigger an action associated to a returned item. There can be multiple actions associated with a result item and only one should be fired at a time.
	 * @param {SearchResultItem} item - This is the search result item
	 * @param {Action} action - This is the action that you would like to fire.
	 * @example
	 * FSBL.Clients.SearchClient.invokeItemAction(resultItem,action);
	 *
	 */
	this.invokeItemAction = function (item, action) {
		self.routerClient.query("Search.Provider.ItemAction." + item.provider, { item: item, action: action });
	};
	/**
	 * Call this when you want to trigger an action associated to a provider. This may not exist on the provider
	 * @param {Provider} provider - This is the search result item
	 * @example
	 * FSBL.Clients.SearchClient.invokeProviderAction(provider);
	 *
	 */
	this.invokeProviderAction = function (provider) {
		self.routerClient.query("Search.Provider.Action." + provider.channel, {});
	};
	//This handles our results when we get them back from a provider
	function handleResults(err, message) {
		if (message.data.searchId != searchId) return;
		resultProviders[message.data.provider.channel] = message.data;
		searchResultsList.push(message.data);
		resultsCallback(null, searchResultsList);
	}
};

var searchClient = new SearchClient({
	startupDependencies: {
		services: ["searchService"]
	},
	onReady: function (cb) {
		if (cb) {
			cb();
		}
	},
	name: "searchClient"
});
module.exports = searchClient;


