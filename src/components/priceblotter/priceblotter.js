var demoHelper = require('../../demohelper');

FSBL.addEventListener('onReady', function () {
	FSBL.Clients.WindowClient.setWindowTitle("Price Blotter");
	FSBL.Clients.RouterClient.query("Prices", null, function (error, response) {
		if (!error) {
			console.log("Prices Response: " + JSON.stringify(response));
			//we create the hypergrid with the received data
			let hypergrid = demoHelper.createGrid(response.data, "price");
			setupEditorsAndFormats(hypergrid);
			//we use the window generated name as the blotterId
			let adaptableBlotter = demoHelper.initAdaptableBlotter(hypergrid, FSBL.Clients.WindowClient.windowName, "instrumentId");
			let demoDataObject = new demoHelper.DemoDataObject();
			demoHelper.maximizeWidgetWhenABPopupVisible(adaptableBlotter, demoDataObject);
			// demoHelper.publishInstrumentExpressionWhenChanged(adaptableBlotter, demoDataObject);
			demoHelper.publishQuickSearchWhenChanged(adaptableBlotter, demoDataObject);
			demoHelper.hypergridThemeChangeWhenAbChange(adaptableBlotter, hypergrid, demoDataObject);
			demoHelper.publishSymbolWhenSelectionChanged(hypergrid, demoDataObject);
			demoHelper.setEmittersWhenSelectionChanged(hypergrid, adaptableBlotter);
			console.log('Received initial list of prices');
			FSBL.Clients.RouterClient.addListener("UpdatePrice", function (err, resp) {
				if (err) {
					console.log("UpdatePrice Error: " + JSON.stringify(err));
				} else {
					demoHelper.hypergridUpdateRowFromDataSource(hypergrid, adaptableBlotter, resp.data, adaptableBlotter.BlotterOptions.primaryKey);
					console.log("UpdatePrice Response: " + JSON.stringify(resp));
				}
			});
			//When a price is edited we send it to our dataservice
			hypergrid.addEventListener("fin-after-cell-edit", (e) => {
				FSBL.Clients.RouterClient.transmit("PriceEdited", e.detail.input.event.dataRow);
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
			
			//TODO: we want to ignore the first triggers from other components... cant be bothered to do it properly so just subscribing to the topic after 5 sec
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

function setupEditorsAndFormats(hypergrid) {
	//make Price editable 
	hypergrid.behavior.setColumnProperties(1, {
		editor: 'textfield',
		format: 'PriceFormat'
	});
	//make B/OSpread editable 
	hypergrid.behavior.setColumnProperties(2, {
		editor: 'textfield',
		format: 'PriceFormat'
	});
	//format change on day
	hypergrid.behavior.setColumnProperties(6, {
		format: 'PriceFormat'
	});
	//format bbg bid
	hypergrid.behavior.setColumnProperties(7, {
		format: 'PriceFormat'
	});
	//format bbg ask
	hypergrid.behavior.setColumnProperties(8, {
		format: 'PriceFormat'
	});
}