/*!
* Copyright 2017 by ChartIQ, Inc.
* All rights reserved.
*/

"use strict";
var RouterClient = require("../../clients/routerClientInstance");
var Logger = require("../../clients/logger");

/*
Tiling Use Cases:
1) Drag a tab into window content within the same tile group.
2) Drag a tab into window content within a different tile group.
3) Drag tab into a seperate window's content
4) Drag tab into a native window's content
5) Dragging tab into a tile-group than isn’s tilable.  For example, can’t add window to a tile group that would cause a window to resize under its minimum size is legal.
6) Dragging a single-tab window into its own content area is illegal (i.e. can’t tile a window with itself).

High-Level Use Cases
A) From Tab Region: drag existing component using tab to new destination
7) From App Menu: as multiple new components are created automatically group by type (into tile group or tab group)
8) From App Menu: drag new component out of menu and drop to new destination on desktop, tab region, or inside window

NOTE: GROUPAPI CODE IS CURRENTLY UNTESTED. ALSO ROUTER INTERFACES (I.E. CHANNEL NAMES) NEEDS TO ALIGN WITH EXISTING DOCKING-SERVICE CODE
*/
class GroupAPI {

	constructor(params) {
		this.params = params;
	}

/**
 * Creates a group, returning its groupID in the callback
 *
 * @param {object} params for future use
 * @param {function} callback function(error, groupId)
 * @memberof GroupAPI
 */
	createGroup(params, callback) {
		Logger.system.info("Docking.Group.createGroup");
		RouterClient.query("Docking.Group.createGroup", {}, function (err, queryResponseMessage) {
			if (err) {
				Logger.system.warn("Docking.Group.createGroup: query failed", err);
			} else {
				Logger.system.debug("Docking.Group.createGroup new groupId", queryResponseMessage.data);
			}
			callback(err, queryResponseMessage.data);
		});
	}

/**
 * Returns through callback the groupId for a given window; error if windowIdentifier is not in a group
 *
 * @param {string} windowIdentifier
 * @param {object} params for future use
 * @param {function} callback function(error, groupId)
 * @memberof GroupAPI
 */
	getGroupID(windowIdentifier, params, callback) {
		Logger.system.info("Docking.Group.getGroupID", windowIdentifier);
		RouterClient.query("Docking.Group.getGroupID", { windowIdentifier }, function (err, queryResponseMessage) {
			if (err) {
				Logger.system.warn("Docking.Group.getGroupID: query failed", err);
			} else {
				Logger.system.debug("Docking.Group.getGroupID tileGroupId", queryResponseMessage.data);
			}
			callback(err, queryResponseMessage.data);
		});
	}

/**
 * Returns through callback a group definition for a given groupIdentifier
 *
 * @param {string} groupIdentifier
 * @param {object} params for future use
 * @param {function} callback function(err, group)
 * @memberof GroupAPI
 */
	getGroup(groupIdentifier, params, callback) {
		Logger.system.info("Docking.Group.getGroupContent", windowIdentifier);
		RouterClient.query("Docking.Group.getGroupContent", { windowIdentifier }, function (err, queryResponseMessage) {
			if (err) {
				Logger.system.warn("Docking.Group.getGroupContent: query failed", err);
			} else {
				Logger.system.debug("Docking.Group.getGroupContent contents", queryResponseMessage.data);
			}
			callback(err, queryResponseMessage.data);
		});
	}

/**
 * Add window to specified group.
 *
 * @param {string} windowIdentifier
 * @param {string} groupIdentifier
 * @param {object} params for future use
 * @param {function=} callback function(err)
 * @memberof GroupAPI
 */
	addWindow(windowIdentifier, groupIdentifier, params, callback) {
		Logger.system.info("Docking.Group.addWindow", windowIdentifier);
		RouterClient.query("Docking.Group.addWindow", { windowIdentifier, groupIdentifier }, function (err, queryResponseMessage) {
			if (err) {
				Logger.system.warn("Docking.Group.addWindow: query failed", err);
			} else {
				Logger.system.debug("Docking.Group.addWindow complete");
			}
			if (callback) callback(err); // optional callback
		});
	}
/**
 * Remove window from specified group.
 *
 * @param {string} windowIdentifier
 * @param {string} groupIdentifier
 * @param {object} params
 * @param {function=} callback function(err)
 * @memberof GroupAPI
 */
	removeWindow(windowIdentifier, groupIdentifier, params, callback) {
		Logger.system.info("Docking.Group.decoupleWindow", windowIdentifier);
		RouterClient.query("Docking.Group.decoupleWindow", { windowIdentifier, groupIdentifier }, function (err, queryResponseMessage) {
			if (err) {
				Logger.system.warn("Docking.Group.decoupleWindow: query failed", err);
			} else {
				Logger.system.debug("Docking.Group.decoupleWindow complete");
			}
			if (callback) callback(err); // optional callback
		});
	}
}

module.exports = new GroupAPI();

