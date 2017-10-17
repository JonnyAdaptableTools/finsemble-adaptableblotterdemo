"use strict";
var demoHelper = require('../../demohelper');

FSBL.addEventListener('onReady', function () {
	FSBL.initialize(function () {
		setTimeout(() =>
			FSBL.Clients.WindowClient.setWindowTitle("Blotter Receiver"), 1000);

		FSBL.Clients.DataTransferClient.addReceivers({
			receivers: [
				{
					type: 'adaptableblotter.selectedcells',
					handler: function (err, response) {
						if (!err) { receivedChart(response.data['adaptableblotter.selectedcells'].selectedCells); }
					}
				}
			]
		});
	});
});

function receivedChart(data) {
	var container = document.getElementById('data');
	container.innerHTML = data;
}