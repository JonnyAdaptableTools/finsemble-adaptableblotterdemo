"use strict";
var demoHelper = require('../../demohelper');

FSBL.addEventListener('onReady', function () {
	FSBL.initialize(function () {
		setTimeout(() =>
			FSBL.Clients.WindowClient.setWindowTitle("Trade Blotter"), 1000);
		FSBL.Clients.RouterClient.query("Trades", null, function (error, response) {
			if (!error) {
				console.log("Trades Response: " + JSON.stringify(response));
				response.data.forEach(trade => {
					trade.tradeDate = new Date(trade.tradeDate);
					trade.settlementDate = new Date(trade.settlementDate);
					trade.lastUpdated = new Date(trade.lastUpdated);
				});
				//we create the hypergrid with the received data
				let hypergrid = demoHelper.createGrid(response.data, "trade");
				setupEditorsAndFormats(hypergrid);
				//we use the window generated name as the blotterId
				let adaptableBlotter = demoHelper.initAdaptableBlotter(hypergrid, FSBL.Clients.WindowClient.windowName, "tradeId");
				let demoDataObject = new demoHelper.DemoDataObject();
				demoHelper.maximizeWidgetWhenABPopupVisible(adaptableBlotter, demoDataObject);
				// demoHelper.publishInstrumentExpressionWhenChanged(adaptableBlotter, demoDataObject);
				demoHelper.publishQuickSearchWhenChanged(adaptableBlotter, demoDataObject);
				demoHelper.hypergridThemeChangeWhenAbChange(adaptableBlotter, hypergrid, demoDataObject);
				demoHelper.publishSymbolWhenSelectionChanged(hypergrid, demoDataObject);
				demoHelper.setEmittersWhenSelectionChanged(hypergrid, adaptableBlotter);
				console.log('Received initial list of trades');
				FSBL.Clients.RouterClient.addListener("NewTrade", function (error, response) {
					if (error) {
						console.log("NewTrade Error: " + JSON.stringify(error));
					} else {
						response.data.tradeDate = new Date(response.data.tradeDate);
						response.data.settlementDate = new Date(response.data.settlementDate);
						response.data.lastUpdated = new Date(response.data.lastUpdated);
						demoHelper.hypergridAddRow(hypergrid, adaptableBlotter, response.data);
						console.log("NewTrade Response: " + JSON.stringify(response));
					}
				});
				FSBL.Clients.RouterClient.addListener("UpdateTrade", function (error, response) {
					if (error) {
						console.log("UpdateTrade Error: " + JSON.stringify(error));
					} else {
						response.data.tradeDate = new Date(response.data.tradeDate);
						response.data.settlementDate = new Date(response.data.settlementDate);
						response.data.lastUpdated = new Date(response.data.lastUpdated);
						demoHelper.hypergridUpdateRowFromDataSource(hypergrid, adaptableBlotter, response.data, adaptableBlotter.BlotterOptions.primaryKey);
						console.log("UpdateTrade Response: " + JSON.stringify(response));
					}
				});
				//When a trade is edited we send it to our dataservice
				hypergrid.addEventListener("fin-after-cell-edit", (e) => {
					// let row = hypergrid.behavior.dataModel.getRow(event.detail.input.event.visibleRow.rowIndex)
					// FSBL.Clients.RouterClient.transmit("TradeEdited", row);
					FSBL.Clients.RouterClient.transmit("TradeEdited", e.detail.input.event.dataRow);
				});
				//we update our filters when some other blotter publish a new Filter Expression on instrumentId
				// FSBL.Clients.LinkerClient.subscribe("instrumentExpression", function (obj) {
				// 	if (obj) {
				// 		demoDataObject.currentFilters = adaptableBlotter.AdaptableBlotterStore.TheStore.dispatch({
				// 			type: 'COLUMN_FILTER_ADD_UPDATE',
				// 			columnFilter: obj
				// 		});
				// 	}
				// 	else {
				// 		adaptableBlotter.AdaptableBlotterStore.TheStore.dispatch({
				// 			type: 'COLUMN_FILTER_DELETE',
				// 			columnFilter: {
				// 				ColumnId: "instrumentId"
				// 			}
				// 		});
				// 	}
				// });
				setTimeout(() => {
					//decending sort on trade ID
					adaptableBlotter.toggleSort(0);
					adaptableBlotter.toggleSort(0);
				}, 1000);
				//we want to ignore the first triggers from other components... cant be bothered to do it properly so just subscribing to the topic after 5 sec
				setTimeout(() => {
					FSBL.Clients.LinkerClient.subscribe("quickSearch", function (quickSearch) {
						if (demoDataObject.currentQuickSearch !== quickSearch) {
							adaptableBlotter.AdaptableBlotterStore.TheStore.dispatch({ type: 'QUICK_SEARCH_RUN', quickSearchText: quickSearch });
						}
					});
					FSBL.Clients.LinkerClient.subscribe("symbol", function (symbol) {
						if (demoDataObject.currentSelectedSymbol !== symbol) {
							adaptableBlotter.AdaptableBlotterStore.TheStore.dispatch({ type: 'QUICK_SEARCH_RUN', quickSearchText: symbol });
						}
					});
				}, 5000);
			}
		});
	});
});

function setupEditorsAndFormats(hypergrid) {
	//make Notional editable 
	hypergrid.behavior.setColumnProperties(3, {
		editor: 'textfield',
		format: 'USDCurrencyFormat'
	});
	//format tradeDate
	hypergrid.behavior.setColumnProperties(13, {
		format: 'shortDateFormat'
	});
	//format settlementdate
	hypergrid.behavior.setColumnProperties(14, {
		format: 'shortDateFormat'
	});
	//format lastupdated
	hypergrid.behavior.setColumnProperties(15, {
		format: 'dateTimeFormat'
	});
}