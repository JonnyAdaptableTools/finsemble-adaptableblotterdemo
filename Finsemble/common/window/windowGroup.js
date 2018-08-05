const Logger = require("../../clients/logger");
const RouterClient = require("../../clients/routerClientInstance");
var FSBLWindow = require("./FSBLWindow");
const groupStates = {
	NORMAL: 0,
	MINIMIZING: 1,
	MINIMIZED: 2,
	RESTORING: 3
};
const async = require("async");
class WindowGroup {
	constructor(params) {
		this.name = params.name;
		this.groupState = groupStates.NORMAL;
		this.isAlwaysOnTop = false;
		if (params.windows) {
			this.windows = params.windows;
		} else {
			this.windows = {};
		}
	}

	destroy() {
		delete this.windows;
		delete this.name;
	}

	setWindows(windows) {
		this.windows = windows;
	}

	getWindows() {
		return this.windows;
	}

	addWindow(win) {
		this.windows[win.name] = win;
		if (this.isMovable) win.alwaysOnTop(this.isAlwaysOnTop);
	}

	/**
	 *
	 * @param {*} arr either a window name or window identifier or a list of window names or identifiers
	 */
	removeWindows(arr) {
		var windowName;
		if (!Array.isArray(arr)) {
			arr = [arr];
		}
		var self = this;
		arr.forEach(function (win) {
			if (typeof win === "string" || win instanceof String) {
				windowName = win;
			} else {
				windowName = win.windowName || win.name;
			}
			if (this.windows[windowName]) {
				delete self.windows[windowName];
			} else {
				return;
			}
		}, this);
	}

	/**
	 *
	 * @param {*} win either a window name or window identifier
	 */
	getWindow(win) {
		if (typeof win === "string" || win instanceof String) { //we have a window name
			return this.windows[win];
		} else { // we have an identifier
			if (win && (win.windowName || win.name)) {
				return this.windows[win.windowName || win.name];
			} else {
				return null;
			}
		}
	}

	getWindowNames() {
		let names = [];
		for (let name in this.windows) {
			names.push(name);
		}
		return names;
	}

	addWindows(arr) {
		if (!Array.isArray(arr)) {
			arr = [arr];
		}
		var self = this;
		arr.forEach(function (win) {
			self.windows[win.name] = win;
			if (this.isMovable && win.win.alwaysOnTop) win.win.alwaysOnTop(this.isAlwaysOnTop);
		}, this);
	}

	getWindowArray() {
		let arr = [];
		for (let windowName in this.windows) {
			arr.push(this.windows[windowName]);
		}
		return arr;
	}

	minimizeAll() {
		if (this.groupState == groupStates.RESTORING) {
			this.interruptRestore = true;
			this.groupState = groupStates.NORMAL;
		}
		if (this.groupState !== groupStates.NORMAL) return;
		this.groupState = groupStates.MINIMIZING;
		for (let windowName in this.windows) {
			let win = this.windows[windowName];
			if (win.windowState != FSBLWindow.WINDOWSTATE.MINIMIZED) win.minimize();
		}
		this.groupState = groupStates.MINIMIZED;
	}

	minimize(params) {
		if (!params) { return this.minimizeAll(); }
		let { windowList, componentType } = params;
		if (componentType) windowList = this.findAllByComponentType(componentType);

		for (let w of windowList) {
			let win;
			if (!(typeof w === "string" || w instanceof String)) {
				win = this.getWindow(w.windowName || w.name);
			} else {
				win = this.getWindow(w);
			}
			if (win && win.windowState != FSBLWindow.WINDOWSTATE.MINIMIZED) {
				win.minimize();
			}
		}
	}

	restoreAll(cb = Function.prototype) {
		if (this.groupState !== groupStates.MINIMIZED) return cb();
		var self = this;
		this.groupState = groupStates.RESTORING;
		function restoreWindow(windowName, done) {
			if (self.interruptRestore) return done("restore interrupted");
			let win = self.windows[windowName];
			if (win.restore) {
				if (win.windowState != FSBLWindow.WINDOWSTATE.NORMAL) self.windows[windowName].restore(done);
				else done();
			} else {
				Logger.system.error(windowName + " does not implment restore");
				done();
			}
		}
		async.forEach(Object.keys(this.windows), restoreWindow, function (err, data) {
			if (!err) {
				self.groupState = groupStates.NORMAL;
			} else {
				self.interruptRestore = false;
			}
			cb(err, data);
		});
	}
	//takes an array of window names.
	restore(params, cb) {
		let { windowList } = params;
		var self = this;
		function restoreWindow(windowName, done) {
			let win = self.windows[windowName];
			if (win.restore) {
				if (win.windowState != FSBLWindow.WINDOWSTATE.NORMAL) self.windows[windowName].restore(done);
				else done();
			} else {
				Logger.system.error(windowName + " does not implment restore");
				done();
			}
		}
		async.forEach(windowList, restoreWindow, cb);
	}

	// Bring all windoes to top. Also sets the state of the group to always on top and new windows added to the group inherit the state of thw window
	allAlwaysOnTop(alwaysOnTop) {
		this.isAlwaysOnTop = alwaysOnTop;
		this.alwaysOnTop({ windowList: Object.keys(this.windows), restoreWindows: true, alwaysOnTop: alwaysOnTop });
	}

	// Set specific windows to top. Generally should call allAlwaysOnTop
	alwaysOnTop(params) {
		if (!params || (params && Object.keys(params).length === 0)) {
			params = { windowList: Object.keys(this.windows), restoreWindows: true };
		}
		let { windowList, componentType } = params;
		if (windowList && typeof windowList[0] !== "string") {
			windowList = windowList.map(win => win.windowName);
		}
		if (componentType) windowList = this.findAllByComponentType(componentType);
		var self = this;
		if (!windowList) windowList = Object.keys(this.windows);
		for (let w in windowList) {
			let win;
			if (Array.isArray(windowList)) w = windowList[w];

			if (!(typeof w === "string" || w instanceof String)) {
				win = self.getWindow(w.windowName || w.name);
			} else {
				win = self.getWindow(w);
			}
			if (win) {
				win.alwaysOnTop(params.alwaysOnTop);
			}
		}
	}


	bringAllToFront() {
		this.bringToFront({ windowList: Object.keys(this.windows), restoreWindows: true });
	}

	bringToFront(params) {
		if (!params || (params && Object.keys(params).length === 0)) {
			params = { windowList: Object.keys(this.windows), restoreWindows: true };
		}
		let { windowList, componentType } = params;
		if (windowList && typeof windowList[0] !== "string") {
			windowList = windowList.map(win => win.windowName);
		}
		if (componentType) windowList = this.findAllByComponentType(componentType);
		var self = this;
		if (!windowList) windowList = Object.keys(this.windows);
		function doBTF() {
			for (let w in windowList) {
				let win;
				if (Array.isArray(windowList)) w = windowList[w];

				if (!(typeof w === "string" || w instanceof String)) {
					win = self.getWindow(w.windowName || w.name);
				} else {
					win = self.getWindow(w);
				}
				if (win) {
					win.bringToFront();
				}
			}
		}

		if (params.restoreWindows) {
			this.restore({ windowList }, doBTF);
		} else {
			doBTF();
		}


	}

	hyperFocus(params) {
		let windowList = params.windowList;
		// If we got a list of identifiers, convert to names
		for (let w in windowList) {
			let win = windowList[w];
			if (!(typeof win === "string" || win instanceof String)) {
				windowList[w] = win.windowName || win.name;
			}
		}

		for (let windowName in this.windows) {
			if (!windowList.includes(windowName)) {
				this.windows[windowName].minimize();
			} else {
				this.windows[windowName].restore(() => {
					this.windows[windowName].bringToFront();
				});
			}
		}
	}

	findAllByComponentType(componentType) {
		var windowList = [];
		for (let windowName in this.windows) {
			var descriptor = this.windows[windowName].windowDescriptor;
			if (componentType === (descriptor.component ? descriptor.component.type : descriptor.customData.component.type)) { //TODO - figure out why this is different in some cases
				windowList.push(this.windows[windowName]);
			}
		}
		return windowList;
	}


}

module.exports = WindowGroup;