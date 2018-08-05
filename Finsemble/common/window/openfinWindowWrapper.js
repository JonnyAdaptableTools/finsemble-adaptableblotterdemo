var FSBLWindow = require("./FSBLWindow");
var RouterClient = require("../../clients/routerClientInstance");
const BOUNDS_SET = "bounds-set";
/**
 * OpenFinWindow
 */
class OpenFinWindow extends FSBLWindow {
	/**
	 *
	 * @param {*} params
	 * @param {finWindow} [params.finWindow] If not provided, must provide uuid
	 * @param {string} [params.uuid] If not provided, must provide finWindow
	 * @param {string} [params.name]
	 */
	constructor(params) {
		super(params);
		this.name = params.name;
		this.uuid = params.uuid;
		this.canMinimize = typeof params.canMinimize === "undefined" ? true : params.canMinimize;
		if (params.finWindow) {
			this.finWindow = params.finWindow;
			this.uuid = this.finWindow.uuid;
			if (!this.name) this.name = this.finWindow.name;
		}

		if (!this.finWindow && this.uuid) {
			this.uuid = params.uuid;
			this.finWindow = fin.desktop.Window.wrap(params.uuid, this.name);
		}
		this.windowIdentifier = { windowName: this.name, uuid: this.uuid };
		this.wrapFunctions();
		this.initialWindowOptions = {};
		this.windowOptions = {};
		this.setMyOptions();
		this.windowState = FSBLWindow.WINDOWSTATE.NORMAL;
		this.getChannel = this.getChannel.bind(this);
		this.handleBoundsSet = this.handleBoundsSet.bind(this);
		this.addListeners();
	}

	getChannel(eventName) {
		return `${this.name}.${eventName}`;
	}

	addListeners() {
		this.finWindow.addEventListener("minimized", () => {
			this.windowState = FSBLWindow.WINDOWSTATE.MINIMIZED;
		});
		this.finWindow.addEventListener("restored", () => {
			this.windowState = FSBLWindow.WINDOWSTATE.NORMAL;
		});
		this.finWindow.addEventListener("maximized", () => {
			this.windowState = FSBLWindow.WINDOWSTATE.MAXIMIZED;
		});
		// Fire events when options are updated. e.g. alwaysOnTop
		RouterClient.addListener(this.name + ".updateOptions", (err, response) => {
			for (let o in response.data) {
				if (this.windowOptions[o] == response.data[o]) return;
				this.windowOptions[o] = response.data[o];
				let dataToEmit = {
					windowName: this.name
				};
				dataToEmit[o] = response.data[o];
				this.emit(o, response.data);
			}
		});

		RouterClient.addListener(this.getChannel(BOUNDS_SET), this.handleBoundsSet);
	}

	handleBoundsSet(err, response) {
		this.emit(BOUNDS_SET, response.data);
	}

	setMyOptions(cb) {
		this.finWindow.getOptions((opts) => {
			this.initialWindowOptions = opts;
			this.windowOptions = opts;
			if (cb) cb();
		});
	}
	//Had to move this because jScrambler was screwing up when we obfuscated.
	wrapFunctions() {
		var openFinWindowFunctionsWithoutParams = ["getBounds", "disableFrame", "hide", "show", "getOptions", "isShowing", "getState"];
		openFinWindowFunctionsWithoutParams.forEach((f) => {
			this[f] = (cb) => {
				this.callOpenFinWindowFunction(f, false, cb);
			};
		});

		var openFinWindowFunctionsWithDirectlyPassableParams = ["close", "updateOptions"];
		openFinWindowFunctionsWithDirectlyPassableParams.forEach((f) => {
			this[f] = (params, cb) => {
				this.callOpenFinWindowFunction(f, params, cb);
			};
		});

		var openFinWindowFunctionsWithoutParamsToBeWrappedInIsShowing = ["maximize", "focus"];
		openFinWindowFunctionsWithoutParamsToBeWrappedInIsShowing.forEach((f) => {
			this[f] = (cb) => {
				if (["minimize", "maximize"].includes(f) && this.windowDescriptor && !this.windowDescriptor.resizable) {
					if (cb) { return cb("Cannot Perform this action on non-resizable windows"); }
					else { return; }
				}
				this.finWindow.isShowing( (isShowing) => {
					if (isShowing) {
						this.callOpenFinWindowFunction(f, false, cb);
					} else {
						if (cb) { cb("This Window is hidden"); }
					}
				});
			};
		});
	}

	/**
	 *
	 * @param {*} functionName Name of the openFin window functio to call
	 * @param {*} params  The parameters to the function (except callbacks) as an array
	 * @param {*} cb The callback to be called. This is in the format function (err, response) {} and errors will be in err unlike Openfin which requires two callbacks.
	 */
	callOpenFinWindowFunction(functionName, params, cb) {
		if (params) {
			if (!Array.isArray(params)) params = [params];
			// add success callback to params
			params.push((...args) => {
				// call the actual callback
				if (cb) { cb(null, args); }

				// fire event for updateOptions
				if (functionName == "updateOptions") {
					if (!params[0].dontFireEvents) {
						RouterClient.transmit(this.name + ".updateOptions", params[0]);
					}
					for (let o in params[0]) {
						// in some cases (such as our bringTofront hack we dont want to fire spurious events). Also dont fire events if the option doesnt change
						if (o == "dontFireEvents" || this.windowOptions[o] == params[0][o]) continue;
						this.windowOptions[o] = params[0][o];
						if (!params[0].dontFireEvents) {
							this.emit(o, {
								windowName: this.name,
								o: params[0][o]
							});
						}
					}
				}
			});

			// add error callback to params
			params.push((err) => {
				if (cb) {
					console.error(err);
					cb(err);
				}
			});

			// call the openfin function
			this.finWindow[functionName](...params);
		} else {
			this.finWindow[functionName](function () {
				if (cb) { cb(null, ...arguments); }
			}, (err) => {
				if (cb) {
					console.error(err);
					cb(err);
				}
			});
		}
	}

	callOpenFinSystemFunction(functionName, params, cb) {
		if (params) {
			if (!Array.isArray(params)) params = [params];
			params.push(function () {
				if (cb) { cb(null, ...arguments); }
			});
			params.push((err) => {
				if (cb) {
					console.error(err);
					cb(err);
				}
			});
			fin.desktop.System[functionName](...params);
		} else {
			fin.desktop.System[functionName](function () {
				if (cb) { cb(null, ...arguments); }
			}, (err) => {
				if (cb) {
					console.error(err);
					cb(err);
				}
			});
		}
	}

	minimize(params = { notifyDocking: true }) {
		let { notifyDocking } = params;
		let self = this;
		//Some windows cannot minimize, e.g., (toolbars);
		if (!this.canMinimize) return;
		function doMinimize() {
			self.windowState = FSBLWindow.WINDOWSTATE.MINIMIZED;
			self.finWindow.minimize();
		}

		this.finWindow.isShowing((isShowing) => {
			if (isShowing) {
				if (notifyDocking) {
					RouterClient.query("DockingService.windowMinimized", this.name, () => {
						doMinimize();
					});
				} else {
					doMinimize();
				}
			}
		});

	}
	restore(params = { checkMinimize: true, checkMaximize: true }, cb = Function.prototype) {
		if (typeof params === "function") {
			cb = params;
			params = { checkMinimize: true, checkMaximize: true };
		}

		if (typeof params.checkMaximize === "undefined") {
			params.checkMaximize = true;
		}
		if (typeof params.checkMinimize === "undefined") {
			params.checkMinimize = true;
		}

		//this.finWindow.getState((state) => {
		if ((params.checkMinimize && this.windowState === FSBLWindow.WINDOWSTATE.MINIMIZED) || (params.checkMaximize && this.windowState === FSBLWindow.WINDOWSTATE.MAXIMIZED)) {
			this.windowState = FSBLWindow.WINDOWSTATE.NORMAL;
			//this.finWindow.restore(cb, (err) => console.error(err));
			this.callOpenFinWindowFunction("restore", false, cb);
		} else {
			if (cb) cb();
		}
		//});
	}

	bringToFront(params, cb = Function.prototype) {
		let defaults = { restoreWindows: false };
		if (typeof params === "function") {
			cb = params;
			params = defaults;
		}
		let doBringToFront = () => {
			if (this.windowOptions.alwaysOnTop) return;
			let callback = () => {
				//console.log(this.finWindow.name, this.initialWindowOptions.alwaysOnTop);
				this.finWindow.updateOptions({ alwaysOnTop: this.windowOptions.alwaysOnTop, dontFireEvents: true }, cb, (err) => console.error(err));
			};
			this.finWindow.updateOptions({ alwaysOnTop: true, dontFireEvents: true }, callback, (err) => console.error(err));
		};
		//If for some reason there's no windowOptions, go ahead and set them, then bring to front. I never saw this happen, but you know, just in case.
		if (!this.windowOptions) {
			this.setMyOptions(doBringToFront);
		}
		doBringToFront();
	}

	setOpacity(opacity, cb) {
		this.callOpenFinWindowFunction("updateOptions", { opacity: opacity }, cb);
	}

	alwaysOnTop(isAlwaysOnTop, cb) {
		if (this.windowOptions.alwaysOnTop == isAlwaysOnTop) return;
		this.windowOptions.alwaysOnTop = isAlwaysOnTop;
		this.callOpenFinWindowFunction("updateOptions", { alwaysOnTop: isAlwaysOnTop }, cb);
	}

	setTaskbarIconGroup(tasbarIconGroup, cb) {
		this.callOpenFinWindowFunction("updateOptions", { tasbarIconGroup: tasbarIconGroup }, cb);
	}

	setBounds(params, cb) {
		let ofParams = [params.left, params.top, params.width, params.height];
		RouterClient.transmit(this.getChannel(BOUNDS_SET), params);
		this.callOpenFinWindowFunction("setBounds", ofParams, cb);
	}

	animate(params, cb) {
		this.finWindow.animate(params.transitions, params.options, function () {
			if (cb) cb();
		}, function (error) {
			if (cb) cb(error);
		});
	}

	getMousePosition(cb) {
		this.callOpenFinSystemFunction("getMousePosition", false, function (err, position) {
			cb(err, position ? { x: position.left, y: position.top } : null);
		});
	}

	addEventListener(event, handler, cb) {
		this.callOpenFinWindowFunction("addEventListener", [event, handler], cb);
	}

	removeEventListener(event, handler, cb) {
		this.callOpenFinWindowFunction("removeEventListener", [event, handler], cb);
	}

	showAt(params, cb) {
		this.callOpenFinWindowFunction("showAt", [params.left, params.top, params.force], cb);
	}

}

module.exports = OpenFinWindow;