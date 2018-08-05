"use strict";
var demoHelper = require('../../demohelper');

FSBL.addEventListener('onReady', function () {
	FSBL.Clients.WindowClient.setWindowTitle("Blotter Receiver");
	//TODO: DataTransferClient doesn't exist anymore, switch back to the RouterCLient
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

function receivedChart(data) {
	var container = document.getElementById('data');
	let dataObj = JSON.parse(data);
	let header = null;
	let values = "";
	//build header
	dataObj.forEach((element) => {
		if(!header){
			header = "<tr>";
			element[1].forEach((pair) => {
				header += "<th>" + pair.columnID + "</th>";
			});
			header += "</tr>";
		}
		values += "<tr>";
		element[1].forEach((pair) => {
			values += "<td>" + pair.value + "</td>";
		});
		values += "</tr>";
	});
	let tableDate = "<table class=\"table table-bordered table-hover\">" + header + values + "</table>";
	container.innerHTML = tableDate;
}