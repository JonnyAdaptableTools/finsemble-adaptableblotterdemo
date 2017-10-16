class PricesDataGenerator {


	getPrices(instruments) {
		var prices = [];
		instruments.forEach(instrument => {
			var price = this.getMeaningfulDouble();
			var closingPrice = this.getMeaningfulDouble();
			var bidOfferSpread = this.getRandomItem(this.getBidOfferSpreads());
			var ask = this.roundTo4Dp(price + bidOfferSpread / 2);
			var bid = this.roundTo4Dp(price - bidOfferSpread / 2);
			prices.push({
				"instrumentId": instrument,
				"price": price,
				"bidOfferSpread": this.getRandomItem(this.getBidOfferSpreads()),
				"bid": bid,
				"ask": ask,
				"closingPrice": closingPrice,
				"changeOnDay": price - closingPrice,
				"bloombergBid": this.roundTo4Dp(bid - 0.01),
				"bloombergAsk": this.roundTo4Dp(ask + 0.01)
			});
		});
		return prices;
	}
	makeARandomPriceTick(prices) {
		let priceObj = this.getRandomItem(prices);
		let numberToAdd = this.generateRandomInt(1, 2) === 1 ? -0.5 : 0.5;
		priceObj.bloombergAsk = priceObj.bloombergAsk + numberToAdd;
		priceObj.bloombergBid = priceObj.bloombergBid + numberToAdd;
		return priceObj;
	}

	updateCalculationWhenPriceChange(price) {
		price.ask = price.price + price.bidOfferSpread / 2;
		price.bid = price.price - price.bidOfferSpread / 2;
		price.changeOnDay = price.price - price.closingPrice;
	}

	getBidOfferSpreads() {
		var bo = [
			0.1,
			0.15,
			0.2,
			0.25,
			0.3,
			0.35,
			0.4,
			0.5
		];
		return bo;
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

module.exports.PricesDataGenerator = PricesDataGenerator;