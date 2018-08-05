

const BOUNDS_CHANGING = "disabled-frame-bounds-changing";
const BOUNDS_CHANGED = "disabled-frame-bounds-changed";
var clone = require("lodash.clonedeep");
var Logger = require("../../clients/logger");
var routerClient = require("../../clients/routerClientInstance");
var FSBLWindow = require("./FSBLWindow");

var mouseLocation = {
	x: 0,
	y: 0
};

/**
 * NativeWindow
 */
class NativeWindow extends FSBLWindow {
	/**
	 * @param {*} params
	 * @param {string} [params.uuid]
	 * @param {object} [params.location]
	 * @param {string} [params.launchedByApp]
	 *
	 */
	constructor(params) {
		if (!params.windowType) {
			if (params.params) {
				params = Object.assign(params, params.params);
			}
			params.windowType = null;
		}
		super(params);
		Logger.system.log("registered");
		console.log("external params", params);
		this.addEventListener = this.addListener;
		this.removeEventListener = this.removeListener;
		this.windowState = FSBLWindow.WINDOWSTATE.NORMAL;
		this.isMaximized = false;
		this.key = params.uuid;
		this.saveOnBoundsChanged = this.launchedByApp;
		this.movements = [];
		this.lastLocation = this.location;
		this.events = {};
		this.lastMinimized = 0;
		this.lastRestored = 0;

		this.addListeners();

	}
	addListeners() {
		var self = this;
		/*self.addEventListener(BOUNDS_CHANGED, function () {
			console.log("bounds changed....");
		});*/

		routerClient.addListener(this.key + ".move", function (err, message) {
			//debugger;
			Logger.system.verbose("got move ", self, message);
			self.key = message.data.uuid;
			//window.Logger.system.log("update location", message);
			// Logger.system.log("message", message);
			mouseLocation = {
				x: Number(message.data.mouseLocation.x),
				y: Number(message.data.mouseLocation.y)
			};
			if (err) {
				return Logger.system.error(err);
			}
			if (!message.data.location) { return; }
			var templocation = message.data.location;
			templocation.name = self.name;

			self.emit(BOUNDS_CHANGING, templocation);
		});

		routerClient.addListener(this.key + ".focused", function (err, message) {
			if (self.windowState == FSBLWindow.WINDOWSTATE.MINIMIZED) return; // Focus events are delayed and can happen after minimize. So ignore them if window is minimized.
			self.emit("focused", { name: self.name });
		});

		routerClient.addListener(this.key + ".minimized", function (err, message) {
			if (self.windowState != FSBLWindow.WINDOWSTATE.MINIMIZED) {
				self.lastMinimized = Date.now();
				self.emit("minimized", { name: self.name });
				self.windowState = FSBLWindow.WINDOWSTATE.MINIMIZED;
			}
		});

		routerClient.addListener(this.key + ".maximized", function (err, message) {
			if (self.windowState != FSBLWindow.WINDOWSTATE.MAXIMIZED) {
				self.emit("maximized", { name: self.name });
				self.windowState = FSBLWindow.WINDOWSTATE.MAXIMIZED;
			}
		});

		routerClient.addListener(this.key + ".restored", function (err, message) {
			if (self.windowState != FSBLWindow.WINDOWSTATE.NORMAL) {
				self.emit("restored", { name: self.name });
				self.windowState = FSBLWindow.WINDOWSTATE.NORMAL;
			}
		});

		routerClient.addListener(this.key + ".endMovement", function (err, message) {
			if (err) {
				return Logger.system.error(err);
			}
			// Logger.system.log("end sent");
			if (!message.data.location) { return; }

			location.name = self.name;
			self.emit(BOUNDS_CHANGED, location);
		});
	}

	// Logger.system.log("window",self);
	setBounds(params, cb) {
		var self = this;
		Logger.system.verbose("send move ", self);
		var newLocation = {
			left: Number(params.left),
			top: Number(params.top),
			width: Number(params.width),
			height: Number(params.height),
			right: Number(params.left) + Number(params.width),
			bottom: Number(params.top) + Number(params.height)
		};
		this.lastLocation = newLocation;
		this.location = newLocation;
		routerClient.transmit("Assimilation.moveWindow", { name: this.name, key: self.key, location: newLocation });

		if (cb) {
			cb();
		}

	}
	hide(cb) {
		routerClient.transmit("Assimilation.hideWindow", { name: this.name, key: this.key, location: this.location });
		if (cb) cb();
	}

	minimize(cb) {
		if (Date.now() - this.lastRestored < 50) return;
		routerClient.transmit("Assimilation.minimizeWindow", { name: this.name, key: this.key, location: this.location });
		if (cb) cb();
	}

	close(params, cb = Function.prototype) {
		if (typeof params === "function") {
			cb = params;
			params = {};
		}
		if (!params) params = {};
		routerClient.query("Assimilation.closeWindow." + this.name, { name: this.name, key: this.key, location: this.location }, params, cb);
	}

	show(cb) {
		routerClient.transmit("Assimilation.showWindow", { name: this.name, key: this.key, location: this.location });
		if (cb) cb();
	}
	restore(cb) {
		if (Date.now() - this.lastMinimized < 50) return;
		routerClient.transmit("Assimilation.restoreWindow", { name: this.name, key: this.key, location: this.location });
		if (cb) cb();
	}

	bringToFront(cb) {
		routerClient.transmit("Assimilation.bringToFront", { name: this.name });
		if (cb) cb();
	}

	setOpacity(opacity, cb) {
		// window.Logger.system.log("setOpacity wrapper", location);
		this.opacity = opacity;
		//routerClient.transmit("Assimilation.setOpacity",{key:key,opacity:opacity});
		if (cb) cb();
	}

	alwaysOnTop(isAlwaysOnTop, cb) {
		if (this.alwaysOnTop == isAlwaysOnTop) return;
		// window.Logger.system.log("setOpacity wrapper", location);
		this.alwaysOnTop = isAlwaysOnTop;
		routerClient.transmit("Assimilation.alwaysOnTop", { key: this.key, alwaysOnTop: isAlwaysOnTop });
		if (cb) cb();
	}

	disableFrame(cb) {
		this.frame = false;//paint
		if (cb) cb();
	}

	getMousePosition(cb) {
		cb(null, mouseLocation);
	}

	endMove() {
		routerClient.transmit("Assimilation.saveWindow", { key: this.key, location: this.location });
	}


	getBounds(cb) {
		this.location.width = this.location.right - this.location.left;
		this.location.height = this.location.bottom - this.location.top;
		cb(null, this.location);
	}

	updateOptions(options, cb) {
		if (cb) cb("Not Implemented", null);
	}

}

module.exports = NativeWindow;