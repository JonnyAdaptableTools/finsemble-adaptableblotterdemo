class TradesDataGenerator {


    getTrades() {
        var trades = [];
        for (var i = 1; i < 301; i++) {
            var trade = this.createTrade(i);
            trades.push(trade);
        }
        return trades;
    }

    createTrade(i) {
        var price = this.getMeaningfulDouble();
        var tradeDate = this.generateRandomDateAndTime(-1000, 1000);
        var moodyRating = this.getRandomItem(this.getMoodysRatings());
		var instrumentId = this.getRandomItem(this.getInstrumentId())
        var trade =
            {
                "tradeId": i,
                "instrumentId": instrumentId,
                "instrumentName": this.getInstrumentName(instrumentId),
                "notional": this.getRandomItem(this.getNotionals()),
                "deskId": this.generateRandomInt(0, 250),
                "counterparty": this.getRandomItem(this.getCounterparties()),
                "currency": this.getRandomItem(this.getCurrencies()),
                "country": this.getRandomItem(this.getCountries()),
                "changeOnYear": this.getMeaningfulPositiveNegativeDouble(),
                "price": price,
                "moodysRating": moodyRating,
                "fitchRating": this.getRatingFromMoodyRating(moodyRating),
                "sandpRating": this.getRatingFromMoodyRating(moodyRating),
                "tradeDate": tradeDate,
                "settlementDate": this.addDays(tradeDate, 3),
                "lastUpdated": this.generateRandomDateAndTime(-7, 0),
                "lastUpdatedBy": this.getRandomItem(this.getNames())
            };
        return trade;
    }

    // If minValue is 1 and maxValue is 2, then Math.random()*(maxValue-minValue+1)
    // generates a value between 0 and 2 =[0, 2), adding 1 makes this
    // [1, 3) and Math.floor gives 1 or 2.
    generateRandomInt(minValue, maxValue) {
        return Math.floor(Math.random() * (maxValue - minValue + 1) + minValue);
    }


    generateRandomBool() {
        var amount = this.generateRandomInt(0, 1);
        return amount === 0;
    }

    // [0, 1)
    generateRandomDouble() {
        return Math.random();
    }


    generateRandomNullableDouble() {
        var myValue = this.generateRandomDouble();
        var randomInt = this.generateRandomInt(1, 10);
        if (randomInt > 7) {
            myValue = null;
        }

        if (randomInt % 2 === 0 && myValue !== null) {
            myValue = myValue * -1;
        }

        return myValue;
    }

    generateRandomNullableString(myString) {
        var randomInt = this.generateRandomInt(1, 10);
        if (randomInt > 7) {
            myString = null;
        }
        return myString;
    }

    getMeaningfulDouble() {
        return this.roundTo4Dp(this.generateRandomInt(10, 150) + this.generateRandomDouble());
    }

    getMeaningfulPositiveNegativeDouble() {
        return this.roundTo4Dp(this.generateRandomInt(-150, 150) + this.generateRandomDouble());
    }

    roundTo4Dp(val) {
        return Math.round(val * 10000) / 10000;
    }

    getMeaningfulDoubleInRange(min, max) {
        return this.roundTo4Dp(this.generateRandomInt(min, max) + this.generateRandomDouble());
    }

    getMeaningfulDoubleTest() {
        return (Math.round((100 + this.generateRandomDouble()) * 10) / 10) + this.generateRandomDouble() / 1000;
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

    getNotionals() {
        var notionals = [
            1000000,
            2000000,
            5000000,
            7500000,
            10000000
        ];
        return notionals;
    }
    getInstrumentId() {
        var instruments = [
            'AAPL',
            'ABBV',
            'ABT',
            'ACN',
            'AGN',
            'AIG',
            'ALL',
            'AMGN',
            'AMZN',
            'AXP',
            'BA',
            'BAC',
            'BIIB',
            'BK',
            'BLK',
            'BMY',
            'BRK.B',
            'C',
            'CAT',
            'CELG',
            'CL',
            'CMCSA',
            'COF',
            'COP',
            'COST',
            'CSCO',
            'CVS',
            'CVX',
            'DD',
            'DHR',
            'DIS',
            'DOW',
            'DUK',
            'EMR',
            'EXC',
            'F',
            'FB',
            'FDX',
            'FOX',
            'FOXA',
            'GD',
            'GE',
            'GILD',
            'GM',
            'GOOG',
            'GOOGL',
            'GS',
            'HAL',
            'HD',
            'HON',
            'IBM',
            'INTC',
            'JNJ',
            'JPM',
            'KHC',
            'KMI',
            'KO',
            'LLY',
            'LMT',
            'LOW',
            'MA',
            'MCD',
            'MDLZ',
            'MDT',
            'MET',
            'MMM',
            'MO',
            'MON',
            'MRK',
            'MS',
            'MSFT',
            'NEE',
            'NKE',
            'ORCL',
            'OXY',
            'PCLN',
            'PEP',
            'PFE',
            'PG',
            'PM',
            'PYPL',
            'QCOM',
            'RTN',
            'SBUX',
            'SLB',
            'SO',
            'SPG',
            'T',
            'TGT',
            'TWX',
            'TXN',
            'UNH',
            'UNP',
            'UPS',
            'USB',
            'UTX',
            'V',
            'VZ',
            'WBA',
            'WFC',
            'WMT',
            'XOM',
        ];
        return instruments;
    }
    getInstrumentName(instrumentId) {
        switch (instrumentId) {
            case 'AAPL': return 'Apple Inc.';
            case 'ABBV': return 'AbbVie Inc.';
            case 'ABT': return 'Abbott Laboratories';
            case 'ACN': return 'Accenture plc';
            case 'AGN': return 'Allergan plc';
            case 'AIG': return 'American International Group Inc.';
            case 'ALL': return 'Allstate Corp.';
            case 'AMGN': return 'Amgen Inc.';
            case 'AMZN': return 'Amazon.com';
            case 'AXP': return 'American Express Inc.';
            case 'BA': return 'Boeing Co.';
            case 'BAC': return 'Bank of America Corp';
            case 'BIIB': return 'Biogen Idec';
            case 'BK': return 'The Bank of New York Mellon';
            case 'BLK': return 'BlackRock Inc';
            case 'BMY': return 'Bristol-Myers Squibb';
            case 'BRK.B': return 'Berkshire Hathaway';
            case 'C': return 'Citigroup Inc';
            case 'CAT': return 'Caterpillar Inc';
            case 'CELG': return 'Celgene Corp';
            case 'CL': return 'Colgate-Palmolive Co.';
            case 'CMCSA': return 'Comcast Corporation';
            case 'COF': return 'Capital One Financial Corp.';
            case 'COP': return 'ConocoPhillips';
            case 'COST': return 'Costco';
            case 'CSCO': return 'Cisco Systems';
            case 'CVS': return 'CVS Health';
            case 'CVX': return 'Chevron';
            case 'DD': return 'DuPont';
            case 'DHR': return 'Danaher';
            case 'DIS': return 'The Walt Disney Company';
            case 'DOW': return 'Dow Chemical';
            case 'DUK': return 'Duke Energy';
            case 'EMR': return 'Emerson Electric Co.';
            case 'EXC': return 'Exelon';
            case 'F': return 'Ford Motor';
            case 'FB': return 'Facebook';
            case 'FDX': return 'FedEx';
            case 'FOX': return '21st Century Fox';
            case 'FOXA': return '21st Century Fox';
            case 'GD': return 'General Dynamics';
            case 'GE': return 'General Electric Co.';
            case 'GILD': return 'Gilead Sciences';
            case 'GM': return 'General Motors';
            case 'GOOG': return 'Alphabet Inc';
            case 'GOOGL': return 'Alphabet Inc';
            case 'GS': return 'Goldman Sachs';
            case 'HAL': return 'Halliburton';
            case 'HD': return 'Home Depot';
            case 'HON': return 'Honeywell';
            case 'IBM': return 'International Business Machines';
            case 'INTC': return 'Intel Corporation';
            case 'JNJ': return 'Johnson & Johnson Inc';
            case 'JPM': return 'JP Morgan Chase & Co';
            case 'KHC': return 'Kraft Heinz';
            case 'KMI': return 'Kinder Morgan Inc/DE';
            case 'KO': return 'The Coca-Cola Company';
            case 'LLY': return 'Eli Lilly and Company';
            case 'LMT': return 'Lockheed-Martin';
            case 'LOW': return 'Lowe\'s';
            case 'MA': return 'MasterCard Inc';
            case 'MCD': return 'McDonald\'s Corp';
            case 'MDLZ': return 'Mondelēz International';
            case 'MDT': return 'Medtronic Inc.';
            case 'MET': return 'Metlife Inc.';
            case 'MMM': return '3M Company';
            case 'MO': return 'Altria Group';
            case 'MON': return 'Monsanto';
            case 'MRK': return 'Merck & Co.';
            case 'MS': return 'Morgan Stanley';
            case 'MSFT': return 'Microsoft';
            case 'NEE': return 'NextEra Energy';
            case 'NKE': return 'Nike';
            case 'ORCL': return 'Oracle Corporation';
            case 'OXY': return 'Occidental Petroleum Corp.';
            case 'PCLN': return 'Priceline Group Inc/The';
            case 'PEP': return 'Pepsico Inc.';
            case 'PFE': return 'Pfizer Inc';
            case 'PG': return 'Procter & Gamble Co';
            case 'PM': return 'Phillip Morris International';
            case 'PYPL': return 'PayPal Holdings';
            case 'QCOM': return 'Qualcomm Inc.';
            case 'RTN': return 'Raytheon Company';
            case 'SBUX': return 'Starbucks Corporation';
            case 'SLB': return 'Schlumberger';
            case 'SO': return 'Southern Company';
            case 'SPG': return 'Simon Property Group, Inc.';
            case 'T': return 'AT&T Inc';
            case 'TGT': return 'Target Corp.';
            case 'TWX': return 'Time Warner Inc.';
            case 'TXN': return 'Texas Instruments';
            case 'UNH': return 'UnitedHealth Group Inc.';
            case 'UNP': return 'Union Pacific Corp.';
            case 'UPS': return 'United Parcel Service Inc';
            case 'USB': return 'US Bancorp';
            case 'UTX': return 'United Technologies Corp';
            case 'V': return 'Visa Inc.';
            case 'VZ': return 'Verizon Communications Inc';
            case 'WBA': return 'Walgreens Boots Alliance';
            case 'WFC': return 'Wells Fargo';
            case 'WMT': return 'Wal-Mart';
            case 'XOM': return 'Exxon Mobil Corp';
        }


    }

    getCounterparties() {
        var counterparties = [
            "Goldman Sachs",
            "Societe Generale",
            "Bank of America",
            "RBS",
            "Barcap",
            "JP Morgan",
            "Morgan Stanley",
            "BNP",
            "Lloyds TSB",
            "MUFJ",
            "Rabobank",
            "Deutsche Bank",
            "Credit Suisse",
            "Nomura"
        ];
        return counterparties;
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

    getCountries() {
        var countries = [
            "Argentina",
            "Australia",
            "Belgium",
            "Brazil",
            "Canada",
            "China",
            "Denmark",
            "Egypt",
            "France",
            "Germany",
            "Holland",
            "Hungary",
            "India",
            "Ireland",
            "Italy",
            "Japan",
            "Kenya",
            "Luxembourg",
            "Portugal",
            "Qatar",
            "Russia",
            "Spain",
            "Thailand"
        ];
        return countries;
    }

    getMoodysRatings() {
        var moodysRatings = [
            "Aaa",
            "Aa1",
            "Aa2",
            "Aa3",
            "A1",
            "A2",
            "A3",
            "Baa1",
            "Baa2",
            "Baa3",
            "Ba1",
            "Ba2",
            "Ba3",
            "B1",
            "B2",
            "B3",
            "Caa",
            "Ca",
            "C",
            "WR",
            "NR",
        ];
        return moodysRatings;
    }


    // for s&P and Fitch we got one of 3 ratings based off the moodys rating
    getRatingFromMoodyRating(moodysRating) {
        switch (moodysRating) {
            case "Aaa":
                return this.getRandomItem(["AAA", "AA+"]);
            case "Aa1":
                return this.getRandomItem(["AAA", "AA+", "AA"]);
            case "Aa2":
                return this.getRandomItem(["AA+", "AA", "AA-"]);
            case "Aa3":
                return this.getRandomItem(["AA", "AA-", "A+"]);
            case "A1":
                return this.getRandomItem(["AA-", "A+", "A"]);
            case "A2":
                return this.getRandomItem(["A+", "A", "A-"]);
            case "A3":
                return this.getRandomItem(["A", "A-", "BBB+"]);
            case "Baa1":
                return this.getRandomItem(["A-", "BBB+", "BBB"]);
            case "Baa2":
                return this.getRandomItem(["BBB+", "BBB", "BBB-"]);
            case "Baa3":
                return this.getRandomItem(["BBB", "BBB-", "BB+",]);
            case "Ba1":
                return this.getRandomItem(["BBB-", "BB+", "BB"]);
            case "Ba2":
                return this.getRandomItem(["BB+", "BB", "BB-"]);
            case "Ba3":
                return this.getRandomItem(["BB", "BB-", "B+"]);
            case "B1":
                return this.getRandomItem(["BB-", "B+", "B"]);
            case "B2":
                return this.getRandomItem(["B+", "B", "B-"]);
            case "B3":
                return this.getRandomItem(["B", "B-", "CCC"]);
            case "Caa":
                return this.getRandomItem(["B-", "CCC", "CC"]);
            case "Ca":
                return this.getRandomItem(["CCC", "CC"]);
            case "C":
                return this.getRandomItem(["CC", "D"]);
            case "WR":
                return "SD";
            case "NR":
                return "NR";
        }
    }

    getNames() {
        var names = [
            "Stacee Dreiling",
            "Cecil Staab",
            "Sheba Dowdy",
            "Loralee Stalker",
            "Sanjuana Kimsey",
            "Shante Hey",
            "Magen Willison",
            "Casimira Tabler",
            "Annemarie Rybicki",
            "Granville Westfall",
            "Colby Troupe",
            "Wei Frith",
            "Sarai Pilgrim",
            "Yael Rich",
            "Hester Bluhm",
            "Season Landreth",
            "Britany Saffell",
            "Kelley Babb",
            "Bradley Chumley",
            "Louella Spiker"
        ];
        return names;
    }
}

module.exports.TradesDataGenerator = TradesDataGenerator;