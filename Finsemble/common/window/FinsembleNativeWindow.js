

const BOUNDS_CHANGING = "disabled-frame-bounds-changing";
const BOUNDS_CHANGED = "disabled-frame-bounds-changed";
var routerClient = require("../../clients/routerClientInstance");
var Logger = require("../../clients/logger");
var System = require("../../common/system");
var FSBLWindow = require("./FSBLWindow");

/**
 * This is a Finsemble Aware Native Window. It uses the Finsemble Bridge and communicates using the Openfin IAB with the actual window
 */
class FinsembleNativeWindow extends FSBLWindow {
	/**
	 * @param {*} params
	 *
	 */
	constructor(params) {
		super(params);
		if (!this.callbackChannel) this.callbackChannel = this.name + "-channel";
		this.addEventListener = this.addListener;
		this.removeEventListener = this.removeListener;
		this.windowState = FSBLWindow.WINDOWSTATE.NORMAL;
		this.resizing = false;
		this.bindAllFunctions();
		this.addListeners();
	}

	/* private */
	bindAllFunctions() {
		let self = this;
		for (let name of Object.getOwnPropertyNames(Object.getPrototypeOf(self))) {
			let method = self[name];
			// skip constructor
			if (!(method instanceof Function) || method === FinsembleNativeWindow) continue;
			self[name] = self[name].bind(self);
		}

	}

	moved(err, message) {
		Logger.system.info("got move ", this.name, message);
		if (err) {
			return Logger.system.error(err);
		}
		if (!message.data.location) { return; }
		this.location = message.data.location;
		message.data.location.name = this.name;
		message.data.location.changeType = 0;
		this.emit(BOUNDS_CHANGING, message.data.location);
	}

	nativeEndMove(err, message) {
		Logger.system.info("got end move ", this.name, message);
		if (err) {
			return Logger.system.error(err);
		}
		// Logger.system.log("end sent");
		if (!message || !message.data.location) { return; }
		this.location = message.data.location;
		message.data.location.name = this.name;
		if (this.resizing) this.setBounds(message.data.location); // For some reason the window snaps back to original size, this prevents that.
		this.resizing = false;
		//this.emit(BOUNDS_CHANGING, message.data.location);
		this.emit(BOUNDS_CHANGED, message.data.location);
	}

	resized(err, message) {
		this.resizing = true;
		Logger.system.info("got resize ", this.name, message);
		if (err) {
			return Logger.system.error(err);
		}
		if (!message.data.location) { return; }
		this.location = message.data.location;
		message.data.location.name = this.name;
		message.data.location.changeType = 1;
		this.emit(BOUNDS_CHANGING, message.data.location);
	}

	locationChanged(err, message) {
		if (err) {
			return Logger.system.error(err);
		}
		// Logger.system.log("end sent");
		if (!message.data.location) { return; }
		this.location = message.data.location;
	}

	focused(err) {
		if (err) {
			return Logger.system.error(err);
		}
		this.emit("focused", {
			name: this.name,
			topic: "window",
			type: "focused"
		});
	}

	minimized() {
		if (this.windowState != FSBLWindow.WINDOWSTATE.MINIMIZED) {
			this.emit("minimized", {
				name: this.name,
				topic: "window",
				type: "minimized"
			});
			this.windowState = FSBLWindow.WINDOWSTATE.MINIMIZED;
		}
	}

	maximized() {
		if (this.windowState != FSBLWindow.WINDOWSTATE.MAXIMIZED) {
			this.emit("maximized", {
				name: this.name,
				topic: "window",
				type: "maximized"
			});
			this.windowState = FSBLWindow.WINDOWSTATE.MAXIMIZED;
		}
	}

	restored() {
		if (this.windowState != FSBLWindow.WINDOWSTATE.NORMAL) {
			this.emit("restored", {
				name: this.name,
				topic: "window",
				type: "restored"
			});
			this.windowState = FSBLWindow.WINDOWSTATE.NORMAL;
		}
	}

	addListeners() {
		routerClient.addListener(this.name + ".move", this.moved);
		routerClient.addListener(this.name + ".resize", this.resized);
		routerClient.addListener(this.name + ".endMovement", this.nativeEndMove);
		routerClient.addListener(this.name + ".location", this.locationChanged);
		routerClient.addListener(this.name + ".focused", this.focused);
		routerClient.addListener(this.name + ".minimized", this.minimized);
		routerClient.addListener(this.name + ".maximized", this.maximized);
		routerClient.addListener(this.name + ".restored", this.restored);
	}

	// Logger.system.log("window",self);
	setBounds(bounds, params, cb) {
		if (typeof params == "function") {
			cb = params;
		}
		this.location = params;
		// send to window
		routerClient.transmit("FinsembleNativeActions." + this.name, {
			action: "setBounds",
			bounds: bounds
		});
		routerClient.transmit("FinsembleNativeService.windowBoundsChanged", {
			windowName: this.name,
			bounds: bounds
		});
		if (cb) cb();
	}

	hide(params, cb) {
		if (typeof params == "function") {
			cb = params;
		}
		routerClient.transmit("FinsembleNativeActions." + this.name, {
			action: "hide"
		});
		if (cb) cb();
	}

	restore(params, cb) {
		if (typeof params == "function") {
			cb = params;
		}
		routerClient.transmit("FinsembleNativeActions." + this.name, {
			action: "restore"
		});

		if (cb) cb();
	}


	minimize(params, cb) {
		if (typeof params == "function") {
			cb = params;
		}
		routerClient.transmit("FinsembleNativeActions." + this.name, {
			action: "minimize"
		});
		if (cb) cb();
	}

	show(params, cb) {
		if (typeof params == "function") {
			cb = params;
		}
		routerClient.transmit("FinsembleNativeActions." + this.name, {
			action: "show"
		});
		if (cb) cb();
	}

	close(params, cb = Function.prototype) {
		if (typeof params === "function") {
			cb = params;
			params = {};
		}
		if (!params) params = {};

		routerClient.removeListener(this.name + ".move", this.moved);
		routerClient.removeListener(this.name + ".resize", this.resized);
		routerClient.removeListener(this.name + ".endMovement", this.nativeEndMove);
		routerClient.removeListener(this.name + ".location", this.locationChanged);
		routerClient.removeListener(this.name + ".focused", this.focused);
		params.windowName = this.name;
		routerClient.transmit("FinsembleNativeService.windowClosed", params);

		if (this.managedByAssimilation) {
			console.log("Assimilation.closeWindow", this.name);
			routerClient.query("Assimilation.closeWindow." + this.name, params, cb);
		} else {
			routerClient.query(this.name + ".closeRequested", params, () => {
				cb();
			});
		}

	}


	bringToFront(params, cb) {
		if (typeof params == "function") {
			cb = params;
		}
		routerClient.transmit("FinsembleNativeActions." + this.name, {
			action: "bringToFront"
		});
		if (cb) cb();
	}

	alwaysOnTop(params, cb = Function.prototype) {
		if (this.alwaysOnTop == params.alwaysOnTop) return;
		routerClient.transmit("FinsembleNativeActions." + this.name, {
			action: "alwaysOnTop",
			alwaysOnTop: params.alwaysOnTop
		});
		this.alwaysOnTop = params.alwaysOnTop;
		if (cb) cb();
	}

	setOpacity(opacity, cb) {
		routerClient.transmit("FinsembleNativeActions." + this.name, {
			action: "setOpacity",
			opacity: opacity
		});
		this.opacity = opacity;
		if (cb) cb();
	}

	disableFrame(cb) {
		this.frame = false;//paint
		if (cb) cb();
	}

	getBounds(cb) {
		if (this.location) {
			this.location.width = this.location.right - this.location.left;
			this.location.height = this.location.bottom - this.location.top;
			cb(null, this.location);
		} else {
			routerClient.query("FinsembleNativeService.getProperty", { name: this.name, propery: "location" }, (err, response) => {
				if (response.data) {
					this.location = response.data;
					this.getBounds(cb);
				}
				else cb("Could Not Get Bounds");
			});

		}
	}

	updateOptions(options, cb) {
		if (cb) cb("Not Implemented", null);
	}

	getMousePosition(cb) {
		System.getMousePosition(function (position) {
			cb(null, position);
		}, function (err) {
			cb(err);
		});
	}

	saveWindowOptions() {


	}

}

module.exports = FinsembleNativeWindow;