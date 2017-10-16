class PositionsDataGenerator {


	getPositions(instruments, trades, prices) {
		var positionSum = this.groupByAndSum(trades, "instrumentId", "notional");
		var positions = [];
		for (let instrument of instruments) {
			let priceObj = prices.find(y => y.instrumentId === instrument);
			positions.push({
				"instrumentId": instrument,
				"position": positionSum[instrument]||0,
				"currency": this.getRandomItem(this.getCurrencies()),
				"currentPrice": priceObj.price,
				"closingPrice": priceObj.closingPrice,
				"pnl": ((priceObj.price - priceObj.closingPrice) * positionSum[instrument])||0
			});
		}
		return positions;
	}
	updatePositionWithTradesAndInstrumentId(positions, trades, instrumentId) {
		let postition = positions.find(x => x.instrumentId === instrumentId);
		postition.position = trades.filter(x => x.instrumentId === instrumentId).reduce((acc, item) => {
			acc = acc + item.notional;
			return acc;
		}, 0);
		postition.pnl = (postition.currentPrice - postition.closingPrice) * postition.position;
		return postition;
	}
	updatePositionWithPrice(positions, priceObj) {
		let posititionObj = positions.find(x => x.instrumentId === priceObj.instrumentId);
		posititionObj.currentPrice = priceObj.price;
		posititionObj.pnl = (priceObj.price - priceObj.closingPrice) * posititionObj.position;
		return posititionObj;
	}
	groupByAndSum(array, propGroupby, propAggreg) {
		return array.reduce((acc, item) => {
			var key = item[propGroupby];
			var propToAdd = item[propAggreg];
			acc[key] = (acc[key] || 0) + propToAdd;
			return acc;
		}, {});
	}

	// If minValue is 1 and maxValue is 2, then Math.random()*(maxValue-minValue+1)
	// generates a value between 0 and 2 =[0, 2), adding 1 makes this
	// [1, 3) and Math.floor gives 1 or 2.
	generateRandomInt(minValue, maxValue) {
		return Math.floor(Math.random() * (maxValue - minValue + 1) + minValue);
	}

	// [0, 1)
	generateRandomDouble() {
		return Math.random();
	}

	getMeaningfulDouble() {
		return this.roundTo4Dp(this.generateRandomInt(10, 150) + this.generateRandomDouble());
	}

	roundTo4Dp(val) {
		return Math.round(val * 10000) / 10000;
	}

	generateRandomDateAndTime(minDays, maxDays) {
		var currentDate = new Date(); // Fix it
		var start = this.addDays(currentDate, minDays);
		var end = this.addDays(currentDate, maxDays);
		return new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime()));
	}

	addDays(date, days) {
		return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
	}

	generateRandomDate(minDays, maxDays) {
		var date = this.generateRandomDateAndTime(minDays, maxDays);
		return new Date(date.getFullYear(), date.getMonth(), date.getDate());
		//return toDateTimeString(date);
	}

	toDateTimeString(date) {
		var options = {
			weekday: "long",
			year: "numeric",
			month: "short",
			day: "numeric",
			hour: "2-digit",
			minute: "2-digit"
		};
		return date.toLocaleTimeString("en-us", options);
	}

	generateCounterparty() {
		var counterparties = this.getCounterparties();
		return counterparties[this.generateRandomInt(0, counterparties.length - 1)];
	}

	generateCurrency() {
		var currencies = this.getCurrencies();
		return currencies[this.generateRandomInt(0, currencies.length - 1)];
	}

	getRandomItem(ary, max) {
		if (max) {
			return ary[this.generateRandomInt(0, Math.min(max, ary.length - 1))];
		}
		else {
			return ary[this.generateRandomInt(0, ary.length - 1)];
		}
	}

	getCurrencies() {
		var currencies = [
			"EUR",
			"USD",
			"GBP",
			"CHF",
			"CAD",
			"AUD",
			"ZAR"
		];
		return currencies;
	}
}

module.exports.PositionsDataGenerator = PositionsDataGenerator;