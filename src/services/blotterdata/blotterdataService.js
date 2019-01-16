const Finsemble = require("@chartiq/finsemble");
const RouterClient = Finsemble.Clients.RouterClient;
const Logger = Finsemble.Clients.Logger;
Logger.start();
Logger.log("blotterdata Service starting up");

const tradesModule = require('../../tradesdatagenerator');
const positionsModule = require('../../positiondatagenerator');
const pricesModule = require('../../pricedatagenerator');
const tradesDG = new tradesModule.TradesDataGenerator();
const positionsDG = new positionsModule.PositionsDataGenerator();
const pricesDG = new pricesModule.PricesDataGenerator();

/**
 * The blotterdata Service receives calls from the blotterdataClient. 
 * @constructor
 */
function blotterdataService() {
	const self = this;

	let trades = tradesDG.getTrades();
	let instruments = tradesDG.getInstrumentId();
	let prices = pricesDG.getPrices(instruments);
	let positions = positionsDG.getPositions(instruments, trades, prices);
	/**
	 * Creates router endpoints for all of our client APIs. Add servers or listeners for requests coming from your clients.
	 * @private
	 */
	this.createRouterEndpoints = function () {
		//Response for when clients requests initial load of trades
		RouterClient.addResponder("Trades", function (error, queryMessage) {
			if (!error) {
				queryMessage.sendQueryResponse(null, trades);
			}
		});
		//Response for when clients requests initial load of positions
		RouterClient.addResponder("Positions", function (error, queryMessage) {
			if (!error) {
				queryMessage.sendQueryResponse(null, positions);
			}
		});
		//Response for when clients requests initial load of prices
		RouterClient.addResponder("Prices", function (error, queryMessage) {
			if (!error) {
				queryMessage.sendQueryResponse(null, prices);
			}
		});
		//we listen for trades that are edited in a client
		RouterClient.addListener("TradeEdited", function (error, response) {
			if (error) {
				Logger.log("TradeEdited Error: " + JSON.stringify(error));
			} else {
				//we update our cache of trades
				let tradeIdx = trades.findIndex(x => x.tradeId === response.data.tradeId);
				trades[tradeIdx] = response.data;
				Logger.log("TradeEdited Response: " + JSON.stringify(response));
				response.data.lastUpdated = new Date();
				//we send back the trade on the update trade chanel
				RouterClient.transmit("UpdateTrade", response.data);
				//we update position
				let newPos = positionsDG.updatePositionWithTradesAndInstrumentId(positions,
					trades,
					response.data.instrumentId);
				RouterClient.transmit("UpdatePosition", newPos);
			}
		});
		//we listen for prices that are edited in a client
		RouterClient.addListener("PriceEdited", function (error, response) {
			if (error) {
				Logger.log("PriceEdited Error: " + JSON.stringify(error));
			} else {
				//we update our cache of prices
				let priceIdx = prices.findIndex(x => x.instrumentId === response.data.instrumentId);
				prices[priceIdx] = response.data;
				Logger.log("PriceEdited Response: " + JSON.stringify(response));
				//we update the calculation of the price object
				pricesDG.updateCalculationWhenPriceChange(response.data);
				//we send back the price on the update price chanel
				Finsemble.Clients.RouterClient.transmit("UpdatePrice", response.data);
				//we update position
				let newPos = positionsDG.updatePositionWithPrice(positions, response.data);
				Finsemble.Clients.RouterClient.transmit("UpdatePosition", newPos);
			}
		});
		//every 5 sec we create a new trade
		setInterval(() => {
			let newTrade = tradesDG.createTrade(trades.length + 1);
			trades.push(newTrade);
			RouterClient.transmit("NewTrade", newTrade);
			//we update position
			let newPos = positionsDG.updatePositionWithTradesAndInstrumentId(positions,
				trades,
				newTrade.instrumentId);
			//we send the updated position
			RouterClient.transmit("UpdatePosition", newPos);
		}, 5000);
		//every sec we update the consensus price to make some flashing cool stuff on screen
		setInterval(() => {
			let updatedPrice = pricesDG.makeARandomPriceTick(prices);
			RouterClient.transmit("UpdatePrice", updatedPrice);
		}, 1000);
	};

	return this;
}
blotterdataService.prototype = new Finsemble.baseService({
	startupDependencies: {
		// add any services or clients that should be started before your service
		services: ["authenticationService"],
		clients: [/* "storageClient" */]
	}
});
const serviceInstance = new blotterdataService('blotterdataService');

serviceInstance.onBaseServiceReady(function (callback) {
	serviceInstance.createRouterEndpoints();
	Logger.log("blotterdata Service ready");
	callback();
});

serviceInstance.start();
module.exports = serviceInstance;
