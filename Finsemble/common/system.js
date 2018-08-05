class System {
	static getMousePosition(cb) {
		fin.desktop.System.getMousePosition((mousePosition) => {
			if (mousePosition.left) mousePosition.x = mousePosition.left;
			if (mousePosition.top) mousePosition.y = mousePosition.top;
			cb(null, mousePosition);
		}, (err) => { cb(err, null); });
	}
}

module.exports = System;