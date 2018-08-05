var EventEmitter = require("events").EventEmitter;
class Monitors extends EventEmitter {
	constructor(readyCB, changeCB) {
		super();
		this.bindAllFunctions();
		this.refreshMonitors(readyCB);

		fin.desktop.System.addEventListener("monitor-info-changed", () => {
			this.refreshMonitors(changeCB);
		});
	}

	bindAllFunctions() {
		let self = this;
		for (let name of Object.getOwnPropertyNames(Object.getPrototypeOf(self))) {
			let method = self[name];
			// skip constructor
			if (!(method instanceof Function) || method === Monitors) continue;
			self[name] = self[name].bind(self);
		}
	}

	asyncIt(data, cb) {
		cb(data);
		return data;
	}

	rationalizeMonitor(monitor) {
		monitor.monitorRect.width = monitor.monitorRect.right - monitor.monitorRect.left;
		monitor.monitorRect.height = monitor.monitorRect.bottom - monitor.monitorRect.top;
		monitor.availableRect.width = monitor.availableRect.right - monitor.availableRect.left;
		monitor.availableRect.height = monitor.availableRect.bottom - monitor.availableRect.top;
	}

	calculateMonitorScale(dipRect, scaledRect) {
		return ((scaledRect.right - scaledRect.left) / (dipRect.right - dipRect.left));
	}

	refreshMonitors(cb = function () { }) {
		fin.desktop.System.getMonitorInfo((monitorInfo) => {
			//console.log("getAllMonitors");
			this.allMonitors = [];
			var primaryMonitor = monitorInfo.primaryMonitor;
			this.primaryMonitor = primaryMonitor;
			primaryMonitor.whichMonitor = "primary";
			primaryMonitor.deviceScaleFactor = this.calculateMonitorScale(primaryMonitor.monitor.dipRect, primaryMonitor.monitor.scaledRect);

			primaryMonitor.position = 0;
			this.allMonitors.push(primaryMonitor);
			for (let i = 0; i < monitorInfo.nonPrimaryMonitors.length; i++) {
				let monitor = monitorInfo.nonPrimaryMonitors[i];
				monitor.deviceScaleFactor = this.calculateMonitorScale(monitor.monitor.dipRect, monitor.monitor.scaledRect);
				monitor.whichMonitor = i;
				monitor.position = i + 1;
				this.allMonitors.push(monitor);
			}
			for (let i = 0; i < this.allMonitors.length; i++) {
				let monitor = this.allMonitors[i];
				this.rationalizeMonitor(monitor);
			}
			cb(this.allMonitors);
			this.ready = true;
			this.emit("monitors-changed", this.allMonitors);
		});
	}

	/**
	 * Gets All Monitors.
	 * @param {*} cb
	 */
	getAllMonitors(cb = function () { }) {
		if (!this.ready) {
			if (cb) this.refreshMonitors(cb);
			else return "not ready";
		} else {
			return this.asyncIt(this.allMonitors, cb);
		}
	}

	/**
	 * Gets the monitor on which the point is or null if not on any monitor. This assumes scaled dimensions for the monitor (For example from Openfin or WPF directly).
	 * @param {*} x
	 * @param {*} y
	 * @param {*} cb
	 */
	getMonitorFromScaledXY(x, y, cb = function () { }) {
		if (!this.ready) {
			this.refreshMonitors(() => {
				this.getMonitorFromScaledXY(x, y, cb);
			});
			return "not ready";
		}
		var monitors = this.allMonitors;
		for (var i = 0; i < monitors.length; i++) {
			var monitor = monitors[i];
			var monitorRect = monitor.monitorRect;
			// Are our coordinates inside the monitor? Note that
			// left and top are inclusive. right and bottom are exclusive
			// In OpenFin, two adjacent monitors will share a right and left pixel value!
			if (x >= monitorRect.left && x < monitorRect.right &&
				y >= monitorRect.top && y < monitorRect.bottom) {
				return this.asyncIt(monitor, cb);
			}
		}
		return this.asyncIt(null, cb);
	}

	/**
	 * Gets the monitor on which the point is or null if not on any monitor. This assumes unscaled positions of x,y (for example from windows API).
	 *
	 * @param {any} x
	 * @param {any} y
	 * @param {any} [cb=function () { }]
	 * @returns monitor if found or null
	 * @memberof Monitors
	 */
	getMonitorFromUnscaledXY(x, y, cb = function () { }) {
		if (!this.ready) {
			this.refreshMonitors(() => {
				this.getMonitorFromUnscaledXY(x, y, cb);
			});
			return "not ready";
		}
		var monitors = this.allMonitors;
		for (var i = 0; i < monitors.length; i++) {
			var monitor = monitors[i];
			var monitorRect = monitor.monitor.scaledRect;
			if (x >= monitorRect.left && x < monitorRect.right &&
				y >= monitorRect.top && y < monitorRect.bottom) {
				return this.asyncIt(monitor, cb);
			}
		}
		return this.asyncIt(null, cb);
	}

	/**
	 * Converts Point from scaled (e.g. from OpenFin/WPF) to unscaled (e.g. to give Windows API) position
	 *
	 * @param {any} point
	 * @param {any} [cb=function () { }]
	 * @returns monitor if found or null
	 * @memberof Monitors
	 */
	translatePointFromScaled(params, cb = function () { }) {
		if (!this.ready) {
			this.refreshMonitors(() => {
				this.translatePointFromScaled(params, cb);
			});
			return "not ready";
		}
		var point;
		if (params.point) point = params.point;
		else point = params;
		var monitor = params.monitor || this.getMonitorFromScaledXY(point.x, point.y);
		if (!monitor) return this.asyncIt(null, cb);
		var relativeX = point.x - monitor.monitorRect.left;
		var relativeY = point.y - monitor.monitorRect.top;
		var unscaledRelativeX = relativeX * monitor.deviceScaleFactor;
		var unscaledRelativeY = relativeY * monitor.deviceScaleFactor;
		var unscaledPoint = {
			x: unscaledRelativeX + monitor.monitor.scaledRect.left,
			y: unscaledRelativeY + monitor.monitor.scaledRect.top
		};
		return this.asyncIt(unscaledPoint, cb);
	}


	/**
	 * Converts Point to scaled (e.g. from OpenFin/WPF) from unscaled (e.g. to give Windows API) position
	 *
	 * @param {any} point
	 * @param {any} [cb=function () { }]
	 * @returns point if on monitor or null
	 * @memberof Monitors
	 */
	translatePointToScaled(params, cb = function () { }) {
		if (!this.ready) {
			this.refreshMonitors(() => {
				this.translatePointToScaled(params, cb);
			});
			return "not ready";
		}
		var point;
		if (params.point) point = params.point;
		else point = params;
		var monitor = params.monitor || this.getMonitorFromUnscaledXY(point.x, point.y);
		if (!monitor) return this.asyncIt(null, cb);
		var relativeX = point.x - monitor.monitor.scaledRect.left;
		var relativeY = point.y - monitor.monitor.scaledRect.top;
		var scaledRelativeX = relativeX / monitor.deviceScaleFactor;
		var scaledRelativeY = relativeY / monitor.deviceScaleFactor;
		var scaledPoint = {
			x: scaledRelativeX + monitor.monitorRect.left,
			y: scaledRelativeY + monitor.monitorRect.top
		};
		return this.asyncIt(scaledPoint, cb);
	}

	/**
	 * Converts Rectangle (top, left, bottom, right) from unscaled to scaled. Mainly for use to translate window locations to/from Windows API.
	 *
	 * @param {any} rect
	 * @param {any} [cb=function () { }]
	 * @returns rect
	 * @memberof Monitors
	 */
	translateRectToScaled(rect, cb = function () { }) {
		if (!this.ready) {
			this.refreshMonitors(() => {
				this.translateRectToScaled(rect, cb);
			});
			return "not ready";
		}
		var topLeft = this.translatePointToScaled({ x: rect.left, y: rect.top });
		var bottomRight = this.translatePointToScaled({ x: rect.right, y: rect.bottom });
		if (!topLeft && bottomRight) {
			topLeft = this.translatePointToScaled({
				monitor: this.getMonitorFromScaledXY(bottomRight),
				point: { x: rect.left, y: rect.top }
			});
		}
		if (!bottomRight && topLeft) {
			bottomRight = this.translatePointToScaled({
				monitor: this.getMonitorFromScaledXY(topLeft),
				point: { x: rect.right, y: rect.bottom }
			});
		}
		return this.asyncIt({
			top: topLeft ? topLeft.y: null,
			left: topLeft ? topLeft.x: null,
			bottom: bottomRight ? bottomRight.y: null,
			right: bottomRight ? bottomRight.x: null,
			height: (topLeft && bottomRight) ? bottomRight.y - topLeft.y : null,
			width: (topLeft && bottomRight) ? bottomRight.x - topLeft.x: null
		}, cb);
	}

	/**
	 * Converts Rectangle (top, left, bottom, right) to unscaled from scaled. Mainly for use to translate window locations to/from Windows API.
	 *
	 * @param {any} rect
	 * @param {any} [cb=function () { }]
	 * @returns rect
	 * @memberof Monitors
	 */
	translateRectFromScaled(rect, cb = function () { }) {
		if (!this.ready) {
			this.refreshMonitors(() => {
				this.translateRectFromScaled(rect, cb);
			});
			return "not ready";
		}
		var topLeft = this.translatePointFromScaled({ x: rect.left, y: rect.top });
		var bottomRight = this.translatePointFromScaled({ x: rect.right, y: rect.bottom });
		if (!topLeft && bottomRight) {
			topLeft = this.translatePointFromScaled({
				monitor: this.getMonitorFromUnscaledXY(bottomRight),
				point: { x: rect.left, y: rect.top }
			});
		}
		if (!bottomRight && topLeft) {
			bottomRight = this.translatePointFromScaled({
				monitor: this.getMonitorFromUnscaledXY(topLeft),
				point: { x: rect.right, y: rect.bottom }
			});
		}
		return this.asyncIt({
			top: topLeft ? topLeft.y: null,
			left: topLeft ? topLeft.x: null,
			bottom: bottomRight ? bottomRight.y: null,
			right: bottomRight ? bottomRight.x: null,
			height: (topLeft && bottomRight) ? bottomRight.y - topLeft.y : null,
			width: (topLeft && bottomRight) ? bottomRight.x - topLeft.x: null
		}, cb);
	}
}
module.exports = Monitors;