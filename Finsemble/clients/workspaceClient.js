/*!
* Copyright 2017 by ChartIQ, Inc.
* All rights reserved.
*/

var BaseClient = require("./baseClient");
var Util = require("../common/util");
var Validate = require("../common/validate"); // Finsemble args validator

var Logger = require("./logger");

/**
 * @introduction
 * <h2>Workspace Client</h2>
 * ----------
 * The Workspace Client manages all calls to load, save, rename, and delete workspaces. For an overview, please read the [Workspace tutorial](tutorial-understandingWorkspaces.html).
 * 
 * @hideConstructor true
 * @constructor
 * @summary You don't need to ever invoke the constructor. This is done for you when WindowClient is added to the FSBL object.
 */
function WorkspaceClient(params) {
	Validate.args(params, "object=") && params && Validate.args2("params.onReady", params.onReady, "function=");
	/** @alias WorkspaceClient# */
	BaseClient.call(this, params);

	var self = this;

	/**
	* List of all workspaces within the application.
	*/
	this.workspaces = [];

	/**
	* Reference to the activeWorkspace object
	*/
	this.activeWorkspace = {};

	/**
	 * Adds window to active workspace.
	 * @private
	 * @param {object} params
	 * @param {string} params.name Window name
	 * @param {function} cb Callback
	 */
	this.addWindow = function (params, cb) {
		Validate.args(params, "object", cb, "function=") && params && Validate.args2("params.name", params.name, "string");
		cb = cb || function noop() { }; // cb is optional but not for underlying query
		this.routerClient.query("WorkspaceService.addWindow", params, (err, response) => {
			Logger.system.log(`WORKSPACE LIFECYCLE: Window added:WorkspaceClient.addWindow: Name (${params.name})`);
			cb(err, response);
		});
	};
	/**
	 * AutoArranges windows.
	 * @param {object} 	[params] Parameters
	 * @param {string} [params.monitor] Same options as {@link LauncherClient#showWindow}. Default is monitor of calling window.
	 * @param {function=} cb Callback
	 * @example
	 * FSBL.Clients.WorkspaceClient.autoArrange(function(err, response){
	 * 		//do something after the autoarrange, maybe make all of the windows flash or notify the user that their monitor is now tidy.
	 * });
	 */
	this.autoArrange = function (params, cb) {
		Validate.args(params, "object", cb, "function=");
		cb = cb || function noop() { }; // cb is optional but not for underlying query
		params = params ? params : {};
		FSBL.Clients.LauncherClient.getMonitorInfo({
			windowIdentifier: FSBL.Clients.LauncherClient.myWindowIdentifier
		}, function (err, dimensions) {
			params.monitorDimensions = dimensions.unclaimedRect;
			params.monitorDimensions.name = dimensions.name;
			self.routerClient.query("DockingService.autoArrange", params, cb);
		});
	};
	/**
	 * Minimizes all windows.
	 * @param {object} params
	 * @param {string} 	[params.monitor=all] Same options as {@link LauncherClient#showWindow} except that "all" will work for all monitors. Defaults to all.
	 * @param {function} [cb] Callback.
	 * @example
	 * FSBL.Clients.WorkspaceClient.bringWindowsToFront();
	 */
	this.minimizeAll = function (params, cb) {
		Validate.args(params, "object", cb, "function=");
		cb = cb || function noop() { }; // cb is optional but not for underlying query
		params = params ? params : { monitor: "all" };
		Util.getMyWindowIdentifier(function (myWindowIdentifier) {
			if (!params.windowIdentifier) {
				params.windowIdentifier = myWindowIdentifier;
			}
			self.routerClient.query("WorkspaceService.minimizeAll", params, cb);
		});
	};
	/**
	 * Brings all windows to the front.
	 * @param {object} params
	 * @param {string} 	[params.monitor] Same options as {@link LauncherClient#showWindow} except that "all" will work for all monitors. Defaults to the monitor for the current window.
	 * @param {function} [cb] Callback.
	 * @example
	 * FSBL.Clients.WorkspaceClient.bringWindowsToFront();
	 */
	this.bringWindowsToFront = function (params, cb) {
		Validate.args(params, "object", cb, "function=");
		cb = cb || function noop() { }; // cb is optional but not for underlying query
		params = params ? params : { monitor: "all" };
		Util.getMyWindowIdentifier(function (myWindowIdentifier) {
			if (!params.windowIdentifier) {
				params.windowIdentifier = myWindowIdentifier;
			}
			self.routerClient.query("WorkspaceService.bringWindowsToFront", params, cb);
		});
	};

	/**
	 * Gets the currently active workspace.
	 * @param {function} cb Callback
	 * @example <caption>This function is useful for setting the initial state of a menu or dialog. It is used in the toolbar component to set the initial state.</caption>
	 *
	FSBL.Clients.WorkspaceClient.getActiveWorkspace(function (err, response) {
		//setState is a React component method.
		self.setState({
			workspaces: response
		});
	});
	 */
	this.getActiveWorkspace = function (cb) {
		Validate.args(cb, "function");
		Logger.system.debug("workspaceClient getActiveWorkspace", this.activeWorkspace);

		cb(null, this.activeWorkspace);

	};

	/**
	 * Returns the list of saved workspaces.
	 * @param {function} cb Callback
	 * @example <caption>This function is useful for setting the initial state of a menu or dialog.</caption>
	 *
	FSBL.Clients.WorkspaceClient.getWorkspaces(function (err, response) {
		//setState is a React component method.
		self.setState({
			workspaces: response
		});
	});
	 */
	this.getWorkspaces = function (cb) {
		Validate.args(cb, "function");
		this.routerClient.query("WorkspaceService.getWorkspaces", null,
			function getWorkspacesCallback(err, response) {
				if (err) {
					return Logger.system.error("WorkspaceClient.getWorkspaces:", err);
				}
				if (response) {
					cb(err, response.data);
				} else {
					cb(err, null);
				}
			});
	};

	this.setWorkspaces = function (params, cb) {
		let { workspaces } = params;
		Validate.args(cb, "function");
		this.routerClient.query("WorkspaceService.setWorkspaces", workspaces,
			function setWorkspacesCallback(err, response) {
				if (err) {
					return Logger.system.error("set worspaces", err);
				}
				if (response) {
					cb(err, response.data);
				} else {
					cb(err, null);
				}
			});
	};
	/**
	 * Removes a workspace. Either the workspace object or its name must be provided.
	 * @param {object} params
	 * @param {Boolean}	[params.persist=false] Whether to persist the change.
	 * @param {Object} 	[params.workspace] Workspace
	 * @param {string} 	[params.name] Workspace Name
	 * @param {function=} cb Callback to fire after 'Finsemble.WorkspaceService.update' is transmitted.
	 * @example <caption>This function removes 'My Workspace' from the main menu and the default storage tied to the applicaton.</caption>
	 * FSBL.Clients.WorkspaceClient.remove({
		name: 'My Workspace',
		persist: true
	  }, function(err, response){
	 		//You typically won't do anything here. If you'd like to do something when a workspace change happens, we suggest listening on the `Finsemble.WorkspaceService.update` channel.
	  });
	 */
	this.remove = function (params, cb) {
		Validate.args(params, "object", cb, "function=") && !(params.name || params.workspace) && Validate.args2("params.name", params.name, "string");
		cb = cb || function noop() { }; // cb is optional but not for underlying query

		if (typeof (params.workspace !== undefined) && (params.workspace === self.activeWorkspace)) {
			cb("Error: Cannot remove active workspace " + self.activeWorkspace.name, null);
			Logger.system.error("APPLICATION LIFECYCLE:  Cannot remove active workspace : WorkspaceClient.remove:attempt to remove active workspace:" + self.activeWorkspace.name);
		} else if (typeof (params.name !== undefined) && (params.name === self.activeWorkspace.name)) {
			cb("Error: Cannot remove active workspace name " + self.activeWorkspace.name, null);
			Logger.system.error("APPLICATION LIFECYCLE:  Cannot remove active workspace: WorkspaceClient.remove:attempt to remove active workspace name:" + self.activeWorkspace.name);
		} else { // remove the inactive workspace
			var defaultParams = {
				persist: false,
				workspace: null,
				name: null
			};
			//sets defaults for undefined params.
			params.prototype = Object.create(defaultParams);
			this.routerClient.query("WorkspaceService.remove", params,
				function removeWorkspaceCallback(err, response) {
					if (err) {
						return Logger.system.error(err);
					}
					Logger.system.log(`APPLICATION LIFECYCLE: Workspace Removed:WorkspaceClient.remove:successfully removed ${params.name}`);
					if (response) {
						cb(err, "success");
					} else {
						cb(err, null);
					}
				});
		}
	};
	/**
	 * Removes window from active workspace.
	 * @param {object} params
	 * @param {string} params.name Window name
	 * @param {function=} [cb] Callback
	 * @example <caption>This method removes a window from a workspace. It is rarely called by the developer. It is called when a window that is using the window manager is closed. That way, the next time the app is loaded, that window is not spawned.</caption>
	 *FSBL.Clients.WorkspaceClient.removeWindow({name:windowName}, function(err, response){
		 //do something after removing the window.
	 });
	 */
	this.removeWindow = function (params, cb) {
		Validate.args(params, "object", cb, "function=") && Validate.args2("params.name", params.name, "string");
		cb = cb || function noop() { }; // cb is optional but not for underlying query
		this.routerClient.query("WorkspaceService.removeWindow", params,
			function removeWindowCallback(err, response) {
				if (err) {
					return Logger.system.error(err);
				}
				Logger.system.log(`WORKSPACE LIFECYCLE:WorkspaceClient.removeWindow:Window removed: Name (${params.name})`);
				if (response) {
					cb(err, response.data);
				} else {
					cb(err, null);
				}
			});
	};

	/**
	 * Renames the workspace with the provided name. Also removes all references in storage to the old workspace's name.
	 * @param {object} params
	 * @param {string} params.oldName Name of workspace to rename.
	 * @param {string} params.newName What to rename the workspace to.
	 * @param {boolean=} [params.removeOldWorkspace=true] Whether to remove references to old workspace after renaming.
	 * @param {boolean=} [params.overwriteExisting=false] Whether to overwrite an existing workspace.
	 * @param {function=} cb Callback
	 * @example <caption>This method is used to rename workspaces. It is used in the main Menu component.</caption>
	 * FSBL.Clients.WorkspaceClient.rename({
		oldName: 'My Workspace',
		newName: 'The best workspace',
		removeOldWorkspace: true,
	  }, function(err, response){
	 		//Do something.
	  });
	 */
	this.rename = function (params, cb) {
		Validate.args(params, "object", cb, "function=") && Validate.args2("params.oldName", params.oldName, "string", "params.newName", params.newName, "string");
		cb = cb || function noop() { }; // cb is optional but not for underlying query
		if (!params.overwriteExisting && this.workspaceIsAlreadySaved(params.newName)) {
			cb(new Error("WorkspaceAlreadySaved"), params);
			return;
		}
		this.routerClient.query("WorkspaceService.rename", params,
			function renameWorkspaceCallback(err, response) {
				if (err) {
					return Logger.system.error(err);
				}
				Logger.system.log(`APPLICAITON LIFECYCLE:WorkspaceClient.rename:Workspace Renamed: WorkspaceClient.rename:New Name(${params.newName}), Old Name(${params.oldName}`);
				if (response) {
					cb(err, response.data);
				} else {
					cb(err, null);
				}
			});
	};

	/**
	 * Makes a clone (i.e. copy) of the workspace.  The active workspace is not affected.
	 * @param {object} params
	 * @param {string} params.name Name of workspace to clone.
	 * @param {function} Callback cb(err,response) with response set to the name of the cloned workspace if no error
	 * @example <caption>This method is used to clone workspaces. </caption>
	 * FSBL.Clients.WorkspaceClient.clone({
		name: 'The best workspace'
	  }, function(err, response){
				//Do something.
	  });
	 */
	this.clone = function (params, cb) {
		Validate.args(params, "object", cb, "function=") && Validate.args2("params.name", params.name, "string");
		cb = cb || function noop() { }; // cb is optional but not for underlying query
		this.routerClient.query("WorkspaceService.clone", params,
			function cloneWorkspaceCallback(err, response) {
				if (err) {
					return Logger.system.error(err);
				}
				if (response) {
					cb(err, response.data.newWorkspaceName);
				} else {
					cb(err, null);
				}
			});
	};

	/**
	 * Saves the currently active workspace. It does not overwrite the saved instance of the workspace. It simply overwrites the <code>activeWorkspace</code> key in storage.
	 * @param {function} cb Callback
	 * @example <caption>This function persists the currently active workspace.</caption>
	 * FSBL.Clients.WorkspaceClient.save(function(err, response){
				//Do something.
	  });
	 */
	this.save = function (cb) {
		Validate.args(cb, "function=");
		cb = cb || function noop() { }; // cb is optional but not for underlying query
		this.routerClient.query("WorkspaceService.save", null, cb);
	};
	/**
	 * Helper that tells us whether a workspace is saved.
	 * @private
	 */
	this.workspaceIsAlreadySaved = function (workspaceName) {
		Validate.args(workspaceName, "string");
		for (var i = 0; i < self.workspaces.length; i++) {
			if (workspaceName === self.workspaces[i].name) {
				return true;
			}
		}
		return false;
	};
	/**
	 *
	 * Saves the currently active workspace with the provided name.
	 * @param {object} params
	 * @param {string} params.name new name to save workspace under.
	 * @param {string} [params.force=false] Whether to overwrite a workspace already saved with the provided name.
	 * @param {function} cb Callback
	 * @example <caption>This function persists the currently active workspace with the provided name.</caption>
	 * FSBL.Clients.WorkspaceClient.saveAs({
		name: 'My Workspace',
	  }, function(err, response){
				//Do something.
	  });
	 */
	this.saveAs = function (params, cb) {
		Validate.args(params, "object", cb, "function=") && Validate.args2("params.name", params.name, "string");
		cb = cb || function noop() { }; // cb is optional but not for underlying query

		if (!params.force && this.workspaceIsAlreadySaved(params.name)) {
			cb(new Error("WorkspaceAlreadySaved"), null);
			return;
		}
		this.routerClient.query("WorkspaceService.saveAs", params,
			function workspaceSaveAsCallback(err, response) {
				if (err) {
					return Logger.system.error("APPLICATION LIFECYCLE:Workspace Save As:WorkspaceClient.saveAs", err);
				}
				Logger.system.log(`APPLICATION LIFECYCLE:Workspace Saved As:WorkspaceClient.saveAs: Name:${params.name}`);
				if (response) {
					cb(err, response.data);
				} else {
					cb(err, null);
				}
			});
	};

	/**
	 * Switches to a workspace.
	 * @param {object} params
	 * @param {string} 	params.name Workspace Name
	 * @param {function} cb Callback
	 * @example <caption>This function loads the workspace 'My Workspace' from the storage tied to the application.</caption>
	 * FSBL.Clients.WorkspaceClient.switchTo({
		name: 'My Workspace',
	  }, function(err, response){
				//Do something.
	  });
	 */
	this.switchTo = function (params, cb) {
		Logger.system.log("APPLICATION LIFECYLE:Loading Workspace:WorkspaceClient.switchTo:" + params.name);
		Validate.args(params, "object", cb, "function") && Validate.args2("params.name", params.name, "string");
		// not the workspace will be undated in this client before the below query response is received (see 'Finsemble.orkspaceService.update' listener)
		this.routerClient.query("WorkspaceService.switchTo", params, function (err, response) {
			var res = null;
			if (err) {
				Logger.system.error("APPLICATION LIFECYLE:Loading Workspace:WorkspaceClient.switchTo:", err);
			} else {
				Logger.system.log("APPLICATION LIFECYLE:Loading Workspace:WorkspaceClient.switchTo:success" + params.name);
				self.activeWorkspace = response.data;
				res = self.activeWorkspace;
			}
			if (cb) {
				cb(err, res);
			}
		});
	};

	/**
	 * Checks to see if the workspace is dirty. If it's already dirty, the window doesn't need to compare its state to the saved state.
	 * @param {Function} Callback cb(err,response) with response set to true if dirty and false otherwise (when no error)
	 * @example <caption>This function will let you know if the activeWorkspace is dirty.</caption>
	 * FSBL.Clients.WorkspaceClient.isWorkspaceDirty(function(err, response){
				//Do something like prompt the user if they'd like to save the currently loaded workspace before switching.
	  });
	 */
	this.isWorkspaceDirty = function (cb) {
		Validate.args(cb, "function");
		cb(null, this.activeWorkspace.isDirty);
	};
	function escapeRegExp(str) {
		return str.replace(/[\-\[\]\/\{\}\(\)\*\+\?\.\\\^\$\|]/g, "\\$&");
	}
	/**
	 * If more than one copy of the workspaceName has been saved, this function returns the next number in the sequence. See the example section for more. This is an internal helper.
	 * @private
	 * @param {string} workspaceName
	 * @example
	 * workspaceList = "apple banna ketchup"
	 * getWorkspaceName("mayo") returns "mayo".
	 *
	 * workspaceList = "apple banna ketchup ketchup (1)"
	 * getWorkspaceName("ketchup") returns "ketchup (2)".
	 *
	 * workspaceList = "apple banna ketchup ketchup (1) ketchup (2) ketchup (7)";
	 * getWorkspaceName("ketchup") returns "ketchup (8)".
	 *
	 */
	this.getWorkspaceName = function (workspaceName) {
		var workspaces = FSBL.Clients.WorkspaceClient.workspaces;
		let workspaceNames = workspaces.map((workspace) => workspace.name);
		let escapedName = escapeRegExp(workspaceName);
		//match "name" or "name (143)" or "name (2)"

		//Number of modifiers already on the name.
		let existingModifiers = workspaceName.match(/\(\d+\)/g);
		let numModifiers = existingModifiers === null ? "{1}" : `{${existingModifiers.length++}}`;
		let matchString = `\\b(${escapedName})(\\s\\(\\d+\\)${numModifiers})?\\,`;
		let regex = new RegExp(matchString, "g");
		let matches = workspaceNames.sort().join(",").match(regex);

		if (matches && matches.length) {
			let lastMatch = matches.pop();
			//Find the last modifier at the end (NUMBER), and get rid of parens.
			let highestModifier = lastMatch.match(/\(\d+\)\,/g);
			// console.log(existingModifiers ? existingModifiers.length : 0, modifier ? modifier.length : 0);
			//If we're trying to create something stupid like "workspace (1) (1)", and workspace (1) (1) already exists, they'll spit out workspace (1) (1) (2).
			console.log("Existing modifiers", existingModifiers ? existingModifiers.length : 0, highestModifier ? highestModifier.length : 0, highestModifier, matches);
			if (existingModifiers && existingModifiers.length != highestModifier.length) {
				workspaceName = lastMatch.replace(",", "") + " (1)";
			} else {
				if (highestModifier && highestModifier.length) {
					highestModifier = highestModifier[highestModifier.length - 1];
					highestModifier = highestModifier.replace(/\D/g, "");
					highestModifier = parseInt(highestModifier);
					highestModifier++;
					workspaceName = lastMatch.replace(/\(\d+\)\,/g, `(${highestModifier})`);
				} else {
					highestModifier = 1;
					workspaceName += " (" + highestModifier + ")";
				}
			}
		}
		return workspaceName;
	};
	/**
	 * Creates a new workspace. After creation the new workspace becomes the active workspace.
	 * @param {String} workspaceName name for new workspace
	 * @param {Object=} params optional params
	 * @param {string} params.templateName name of template to use when creating workspace; if no template then empty workspace will be created
	 * @param {boolean} [params.switchAfterCreation = true] Whether to switch to the new workspace after creating it.
	 * @param {Function=} Callback cb(err,response) with response set to new workspace object if no error
	 * @example <caption>This function creates the workspace 'My Workspace'.</caption>
	 * FSBL.Clients.WorkspaceClient.createNewWorkspace(function(err, response){
	 *		if (!err) {}
	 *			//Do something like notify the user that the workspace has been created.
	 *		}
	 * });
	 */
	this.createNewWorkspace = function (workspaceName, params, cb) {
		if (arguments.length === 2) { // if no params then second argument must be the cb
			cb = params;
			params = {};
		}

		var templateName = null;
		if (params && params.templateName) {
			templateName = params.templateName;
		}
		Logger.system.log(`APPLICATION LIFECYCLE:Create New Workspace:Workspacelient.createNewWorkspace: Name (${workspaceName})`);

		Validate.args(workspaceName, "string", params, "object=", cb, "function=");

		cb = cb || Function.prototype; // default to no-op

		//makse sure we don't duplicate an existing workspace.
		workspaceName = this.getWorkspaceName(workspaceName);
		Validate.args(workspaceName, "string", params, "object=", cb, "function=");
		//Default behavior is to switch after creating workspace.
		if (params.switchAfterCreation !== false) {
			Logger.system.log(`APPLICATION LIFECYCLE:Create New Workspace:Workspacelient.createNewWorkspace: Name (${workspaceName})`);
			this.switchTo({ name: workspaceName, templateName }, cb);
		} else {
			let workspace = new WorkspaceDefinition(workspaceName);
			this.addWorkspaceDefinition({
				workspaceJSONDefinition: workspace
			}, cb);
		}
	};

	this.getGroupData = function (cb) {
		cb(this.activeWorkspace.groups);
	};

	this.saveGroupData = function (data) {
		this.routerClient.transmit("WorkspaceService.saveGroupData", {
			groupData: data
		});
	};

	/**
	 * Gets a workspace definition in JSON form.
	 *
	 * @param {object} params
	 * @param {string} params.workspaceName the workspace name
	 * @param {function} callback callback(error,workspaceDefinition)
	 */
	this.getWorkspaceDefinition = function (params, callback) {
		Logger.system.info("workspaceClient.getWorkspaceDefinition", params);
		Validate.args(params, "object", callback, "function") && Validate.args2("params.workspaceName", params.workspaceName, "string");
		var workspaceName = params.workspaceName;
		this.routerClient.query("WorkspaceService.getWorkspaceDefinition", { workspaceName }, function (err, response) {
			let workspaceDefinition = response.data;
			let exportFormat = {};
			exportFormat[workspaceName] = workspaceDefinition;
			callback(err, exportFormat);
		});
	};

	/**
	 * Adds a workspace definition to the list of available workspaces.
	 *
	 * @param {object} params
	 * @param {object} params.workspaceJSONDefinition JSON for workspace definition
	 * @param {function=} callback callback(err) where the operation was successful if !err; otherwise, err carries diagnostics
	 *
	 * @private
	 */
	this.addWorkspaceDefinition = function (params, callback) {
		Logger.system.info("workspaceClient.addWorkspaceDefinition", params);
		Validate.args(params, "object", callback, "function=") && Validate.args2("params.workspaceJSONDefinition", params.workspaceJSONDefinition, "object");
		var workspaceJSONDefinition = params.workspaceJSONDefinition;
		var error = null;
		var workspaceName = Object.keys(workspaceJSONDefinition)[0];
		let viableWorkspaceName = this.getWorkspaceName(workspaceName);
		//If we already have a workspace with this name, we append a number to the end of it, and save it that way. The user can easily rename via the UI if they don't like the name.
		if (workspaceName !== viableWorkspaceName) {
			Logger.system.debug("Workspace name already exists. New name: ", viableWorkspaceName);
			workspaceJSONDefinition[viableWorkspaceName] = workspaceJSONDefinition[workspaceName];
			delete workspaceJSONDefinition[workspaceName];
			//New name.
			workspaceName = viableWorkspaceName;
			workspaceJSONDefinition[workspaceName].name = workspaceName;
		}

		if (typeof workspaceJSONDefinition === "object") {
			if (workspaceName && workspaceJSONDefinition[workspaceName].workspaceDefinitionFlag) {
				this.routerClient.query("WorkspaceService.addWorkspaceDefinition", { workspaceJSONDefinition }, function (err) {
					error = err;
				});
			} else {
				error = "workspaceClient.addWorkspaceDefinition: not legal workspace JSON";
			}
		} else {
			error = "workspaceClient.addWorkspaceDefinition: not legal workspace JSON";
		}
		Logger.system.debug("workspaceClient.addWorkspaceDefinition result", error || "successful");
		callback && callback(error); // invoke callback if defined
	};

	// validates legal workspace definition
	function validWorkspaceDefinition(workspaceJSON) {
		var result = false;
		if (typeof workspaceJSON === "object") {
			var workspaceName = Object.keys(workspaceJSON)[0];
			if (workspaceName && workspaceJSON[workspaceName].workspaceDefinitionFlag) {
				result = true;
			} else {
				Logger.system.error("workspaceClient.workspaceClient.convertWorkspaceDefinitionToTemplate: not legal workspace JSON", workspaceJSON);
			}
		} else {
			Logger.system.error("workspaceClient.workspaceClient.convertWorkspaceDefinitionToTemplate: input is not a legal object", workspaceJSON);
		}
		return result;
	}

	// constructor for new template given a workspace definition to derive it from
	function WorkspaceTemplate(templateName, workspaceJSON) {
		var newTemplate = workspaceJSON;
		var workspaceName = Object.keys(workspaceJSON)[0];
		newTemplate = Util.clone(workspaceJSON);
		newTemplate[templateName] = newTemplate[workspaceName];
		newTemplate[templateName].templateDefinitionFlag = true;
		newTemplate[templateName].name = templateName; // name is also carried in object for use in service
		if (templateName !== workspaceName) { // if using same name then can't delete data associated with name
			delete newTemplate[workspaceName];
		}
		delete newTemplate[templateName].workspaceDefinitionFlag;
		return newTemplate;
	}
	//Constructor for a new workspace definition. Given a name, it returns an empty workspace. Given some JSON, it'll merge the windows property with the new workspace.
	function WorkspaceDefinition(workspaceName, workspaceJSON) {
		var newWorkspace = {
			[workspaceName]: {
				workspaceDefinitionFlag: true,
				windows: [],
				name: workspaceName
			}
		};
		if (workspaceJSON) {
			let workspaceName = Object.keys(workspaceJSON)[0];
			let clonedWorkspace = Util.clone(workspaceJSON);
			if (clonedWorkspace[workspaceName] && clonedWorkspace[workspaceName].windows) {
				clonedWorkspace[workspaceName].windows = clonedWorkspace[workspaceName].windows;
			}

		}
		return newWorkspace;
	}
	/**
	 * Convert a workspace JSON definition to a template JSON definition
	 * @param {object} params
 	 * @param {string} params.newTemplateName template name for the new converted definition
	 * @param {object} params.workspaceDefinition a workspace JSON definition return from getWorkspaceDefinition()
	 * @returns the new template definition. If null then an error occurred because workspaceDefinition wasn't a legal JSON definition for a workspace
	 */
	this.convertWorkspaceDefinitionToTemplate = function (params) {
		Logger.system.info("WorkspaceClient.convertWorkspaceDefinitionToTemplate", params);
		Validate.args(params, "object") && Validate.args2("params.newTemplateName", params.newTemplateName, "string",
			"params.workspaceDefinition", params.workspaceDefinition, "object");
		var templateJSON = null;
		if (validWorkspaceDefinition(params.workspaceDefinition)) {
			templateJSON = new WorkspaceTemplate(params.newTemplateName, params.workspaceDefinition);
		}
		return templateJSON;
	};

	/**
	 * Get a template definition in JSON format.
	 *
	 * @param {object} params
	 * @param {string} params.templateName name of template
	 * @param {function} callback
	 */
	this.getWorkspaceTemplateDefinition = function (params, callback) {
		Logger.system.info("workspaceClient.getWorkspaceTemplateDefinition", params);
		Validate.args(params, "object", callback, "function") && Validate.args2("params.newTemplateName", params.newTemplateName, "string");
		var templateName = params.templateName;
		this.routerClient.query("WorkspaceService.getWorkspaceTemplateDefinition", { templateName }, function (err, response) {
			Logger.system.debug("workspaceClient.getWorkspaceTemplateDefinition response", err, response.data);
			let workspaceTemplateDefinition = response.data;
			let exportFormat = {
				[templateName]: workspaceTemplateDefinition
			};
			callback(err, exportFormat);
		});
	};

	/**
	 * Adds a template definition.  This adds to the template choices available when creating a new workspace.  The definition will persistent until removed with removeWorkspaceTemplateDefinition().
	 *
	 * @param {object} params
	 * @param {object} params.workspaceTemplateDefinition JSON template definition typically from getWorkspaceTemplateDefinition() or convertWorkspaceDefinitionToTemplate()
	 * @param {boolean=} params.force if true an existing template with the same name will be overwritten
	 * @param {function=} callback
	 */
	this.addWorkspaceTemplateDefinition = function (params, callback) {
		Logger.system.info("workspaceClient.addWorkspaceTemplateDefinition", params);
		Validate.args(params, "object", callback, "function=") && Validate.args2("params.workspaceTemplateJSONDefinition", params.workspaceTemplateJSONDefinition, "object");
		var workspaceTemplateDefinition = params.workspaceTemplateDefinition;
		var error, result;

		if ("workspaceTemplates" in workspaceTemplateDefinition) { // if JSON object has wrapper used for config then remove it
			let workspaceTemplates = workspaceTemplateDefinition.workspaceTemplates;
			workspaceTemplateDefinition = workspaceTemplates;
			Logger.system.debug("workspaceClient.addWorkspaceTemplateDefinition modified workspaceTemplateDefinition", workspaceTemplateDefinition);
		}

		Logger.system.debug("workspaceClient.addWorkspaceTemplateDefinition workspaceTemplateDefinition", workspaceTemplateDefinition);

		if (typeof workspaceTemplateDefinition === "object") {
			var templateName = Object.keys(workspaceTemplateDefinition)[0];
			Logger.system.debug("workspaceClient.addWorkspaceTemplateDefinition templateName", templateName);
			if (templateName && workspaceTemplateDefinition[templateName].templateDefinitionFlag) {
				this.routerClient.query("WorkspaceService.addWorkspaceTemplateDefinition", { workspaceTemplateDefinition, params }, function (err, response) {
					result = response.data;
				});
			} else {
				error = "workspaceClient.addWorkspaceTemplateDefinition: illegal template JSON";
			}
		} else {
			error = "workspaceClient.addWorkspaceTemplateDefinition: input is not a legal object";
		}
		Logger.system.debug("workspaceClient.addWorkspaceTemplateDefinition result", error, result);
		callback && callback(error, result); // invoke callback if defined
	};

	/**
	 * Removes template definition (keep in mind if the template is defined in config then it will automatically be recreated on each startup)
	 *
	 * @param {object} params
	 * @param {string} params.workspaceTemplateName
	 * @param {function=} callback callback(err) is invoked on completion. If !err then the operation was successful; otherwise, err carries diagnostics
	 */
	this.removeWorkspaceTemplateDefinition = function (params, callback) {
		Logger.system.info("workspaceClient.removeWorkspaceTemplateDefinition", workspaceTemplateName);
		Validate.args(params, "object", callback, "function=") && Validate.args2("params.workspaceTemplateName", params.workspaceTemplateName, "string");
		var workspaceTemplateName = params.workspaceTemplateName;
		this.routerClient.query("WorkspaceService.removeWorkspaceTemplateDefinition", { workspaceTemplateName }, function (err) {
			callback && callback(err); // invoke callback if defined
		});
	};

	/**
	 * Saves one mor more template defintions in a selected file. Note the end user is prompted to identify file location during this save operation.  The file can optionally be imported during config initialization (see importConfig) although this requires administration support on the configuration/server side. The file can also be read using readWorkspaceTemplateFromConfigFile();
	 *
	 * @param {object} params
	 * @param {object} params.workspaceTemplateDefinition legal template definition returned by either getWorkspaceTemplateDefinition() or convertWorkspaceDefinitionToTemplate()
	 */
	this.saveWorkspaceTemplateToConfigFile = function (params) {
		Logger.system.info("workspaceClient.saveWorkspaceTemplateToConfigFile", params);
		Validate.args(params, "object") && Validate.args2("params.workspaceTemplateDefinition", params.workspaceTemplateDefinition, "object");
		var workspaceTemplateDefinition = params.workspaceTemplateDefinition;
		if (typeof workspaceTemplateDefinition === "object") {
			var templateName = Object.keys(workspaceTemplateDefinition)[0];
			if (templateName && workspaceTemplateDefinition[templateName].templateDefinitionFlag) { // confirm the object is a template definition
				var exportConfig = { workspaceTemplates: workspaceTemplateDefinition };
				FSBL.ConfigUtils.promptAndSaveJSONToLocalFile("workspaceConfig-" + templateName, exportConfig);
			} else {
				Logger.system.error("workspaceClient.saveWorkspaceTemplateToConfigFile. Input is not a legal template");
			}
		} else {
			Logger.system.error("workspaceClient.saveWorkspaceTemplateToConfigFile: Input is not a legal object");
		}
	};

	/**
	 * Gets all workspace template definitions from workspace service.
	 *
	* @param {function} callback callback(templateDefinitions) where templateDefinitions is an object containing all known template definitions; each property in templateDefinitions is a template
	 */
	this.getTemplates = function (callback) {
		Logger.system.info("workspaceClient.getTemplates");
		Validate.args(callback, "function");
		this.routerClient.query("WorkspaceService.getTemplates", {}, function (err, response) {
			let templateDefinitions = {};
			if (!err) {
				templateDefinitions = response.data;
			}
			Logger.system.debug("workspaceClient.getTemplates response", err, templateDefinitions);
			callback(templateDefinitions);
		});
	};

	/**
	 * Initializes listeners and sets default data on the WorkspaceClient object.
	 * @private
	 */
	this.start = function (cb) {
		/**
		 * Initializes the workspace's state.
		 */

		this.routerClient.subscribe("Finsemble.WorkspaceService.update", function (err, response) {
			Logger.system.debug("workspaceClient init subscribe response", err, response);
			if (response.data && response.data.activeWorkspace) {
				self.workspaceIsDirty = response.data.activeWorkspace.isDirty;
				self.workspaces = response.data.workspaces;
				self.activeWorkspace = response.data.activeWorkspace;
			}

			self.getActiveWorkspace(function (err, response) {
				self.activeWorkspace = response;
				self.getWorkspaces(function (err2, response2) {
					self.workspaces = response2;
					if (cb) {
						cb();
					}
				});
			});

		});
	};

	return this;
}

var workspaceClient = new WorkspaceClient({
	startupDependencies: {
		services: ["workspaceService"],
		clients: []
	},
	onReady: function (cb) {
		workspaceClient.start(() => {
			FSBL.Clients.LauncherClient.onReady(cb);
		});
	},
	name: "workspaceClient"
});

module.exports = workspaceClient;