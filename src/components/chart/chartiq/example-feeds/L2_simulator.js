// -------------------------------------------------------------------------------------------
// Copyright 2012-2018 by ChartIQ, Inc
// -------------------------------------------------------------------------------------------
/*
 * Simulator for the crypto package.  Used only to demonstrate functionality.
 * 
 * **************************** 
 * Your implementation should simply call updateCurrentMarketData() as documented in  
 * https://documentation.chartiq.comCIQ.ChartEngine.html#updateCurrentMarketData
 * *************************
 * 
 * To Start: load this file and call `CIQ.simulateL2(params)` where params is an object:
 * params.stx - chart engine
 * params.onInterval - millisecond interval to create L2 records
 * params.onTrade - set to true to create L2 records when the regular quote updates occur
 * If masterData is empty, simulator will generate Last quote as well.  Otherwise it gets Last from the masterData's most recent Close.
 */

(function (definition) {
	"use strict";

	if (typeof exports === "object" && typeof module === "object") {
		module.exports = definition( require('../js/chartiq') );
	} else if (typeof define === "function" && define.amd) {
		define(["chartiq"], definition);
	} else if (typeof window !== "undefined" || typeof self !== "undefined") {
		var global = typeof window !== "undefined" ? window : self;
		definition(global);
	} else {
		throw new Error("Only CommonJS, RequireJS, and <script> tags supported for L2_simulator.js.");
	}
})(function(_exports){
	var CIQ=_exports.CIQ;

	CIQ.simulateL2=function(params){

		function moveBidAsk(close){
			function formatData(d){
				var ret=[];
				for(var i=0;i<d.price.length;i++){
					if(!d.volume[i]) continue;
					var arr=[d.price[i],d.volume[i]];
					var obj={};
					for(var f in d){
						if(f=="price" || f=="volume") continue;
						obj[f]=d[f][i];
					}
					arr.push(obj);
					ret.push(arr);
				}
				return ret;
			}
			var data={
				BidL2: {
					price: [-0.0074, -0.0073,
									 -0.0070,
									 -0.0056,
									 -0.0050, -0.0044, -0.0043,
									 -0.0040, -0.0039, -0.0038, -0.0037, -0.0036, -0.0035, -0.0034, -0.0033,
									 -0.0030, -0.0029, -0.0028, -0.0027, -0.0026, -0.0025, -0.0024, -0.0022, -0.0021,
									 -0.0020, -0.0019, -0.0018, -0.0017, -0.0016, -0.0015, -0.0014, -0.0013, -0.0012, -0.0011,
									 -0.0010, -0.0009, -0.0008, -0.0007, -0.0006, -0.0005, -0.0004, -0.0003, -0.0002, -0.0001],
					volume: [1, 2,
					 				  3,
					 				  2,
					 				  5, 1, 12,
					 				  6, 7, 1, 3, 4, 1, 1, 25,
					 				  3, 2, 1, 2, 37, 10, 43, 8, 4,
					 				  3, 1, 60, 5, 7, 59, 3, 1, 4, 7,
					 				  89, 8, 95, 5, 16, 123, 7, 12, 207, 25],
					Source: ["a", "b",
			  						"f",
			  						"e",
						  			"c", "c", "f",
						  			"b", "f", "h", "h", "c", "d", "e", "d",
						  			"d", "c", "b", "h", "f", "f", "c", "g", "b",
						  			"c", "d", "e", "b", "a", "d", "f", "b", "a", "a",
						  			"a", "c", "b", "b", "c", "d", "c", "e", "b", "d"]
					},
				AskL2: {
					price: [0.0001, 0.0002, 0.0003, 0.0004, 0.0005, 0.0006, 0.0007, 0.0008, 0.0009,
			 			 			 0.0010, 0.0011, 0.0012, 0.0013, 0.0014, 0.0015, 0.0016, 0.0018, 0.0019,
			 			 			 0.0020, 0.0021, 0.0022, 0.0023, 0.0024, 0.0025, 0.0026, 0.0027, 0.0028, 0.0029,
			 			 			 0.0033, 0.0034, 0.0035, 0.0036, 0.0037, 0.0038, 0.0039,
			 			 			 0.0040, 0.0041, 0.0042, 0.0044, 0.0046, 0.0047,
			 			 			 0.0051, 0.0058,
						 			 0.0060, 0.0063,
						 			 0.0077],
					volume: [3, 225, 34, 14, 189, 6, 2, 11, 134,
						  			12, 121, 6, 2, 9, 7, 3, 1, 88,
						  			4, 1, 3, 5, 4, 6, 10, 54, 9, 1,
						  			2, 1, 40, 2, 2, 4, 3,
						  			2, 4, 1, 1, 3, 12,
						  			6, 1,
						  			2, 1,
						  			1],
					Source: ["a", "b", "a", "d", "e", "d", "g", "a", "c",
						  			"c", "c", "f", "b", "c", "d", "e", "b", "a",
						  			"d", "c", "b", "h", "f", "f", "c", "g", "b", "d",
						  			"f", "h", "h", "c", "d", "e", "d",
						  			"f", "b", "a", "a", "d", "c",
						  			"f", "e",
						  			"e", "b",
						  			"d"]
					}
			};
			var chart=this.chart;
			var mid=close;
	
			var mult=1*mid;
			var roundOffFactor=0;
			var shadowBreaks=[[1000,2],[5,4],[0.001,8]];
			for(var j=0;j<shadowBreaks.length;j++){
				var brk=shadowBreaks[j];
				if(mid<brk[0]) roundOffFactor=Math.pow(10,brk[1]);
			}
			var bids=data.BidL2.price,asks=data.AskL2.price,i;
			for(i=0;i<bids.length;i++) {
				bids[i]=mid+mult*bids[i];
				bids[i]=Math.round(bids[i]*roundOffFactor)/roundOffFactor;
			}
			for(i=0;i<asks.length;i++) {
				asks[i]=mid+mult*asks[i];
				asks[i]=Math.round(asks[i]*roundOffFactor)/roundOffFactor;
			}
			var bidVs=data.BidL2.volume,askVs=data.AskL2.volume;
			for(i=0;i<bidVs.length;i++) {
				bidVs[i]=Math.max(0,bidVs[i]+Math.round(10*Math.random()-5));
			}
			for(i=0;i<askVs.length;i++) {
				askVs[i]=Math.max(0,askVs[i]+Math.round(10*Math.random()-5));
			}
			for(i=0;i<bidVs.length;i++) {
				if(bidVs[i]) {
					data.Bid=bids[i];
					data.BidSize=bidVs[i];
				}
			}		
			for(i=askVs.length-1;i>=0;i--) {
				if(askVs[i]) {
					data.Ask=asks[i];
					data.AskSize=askVs[i];
				}
			}
			data.BidL2=formatData(data.BidL2);
			data.AskL2=formatData(data.AskL2);
				
			return data;
		};
		
		function onTrade(appendQuotes, chart, params){
			if (params !== undefined && params.animationEntry) return;
			for(var i=0;i<appendQuotes.length;i++) {
				//if(appendQuotes[i].BidL2 || appendQuotes[i].AskL2) continue;  // already have data
				CIQ.ensureDefaults(appendQuotes[i], moveBidAsk.call(this, appendQuotes[i].Close));
				if(this.chart.market.isOpen()) {
					appendQuotes[i].LastSize=Math.round(Math.random()*100);
					if((this.layout.timeUnit!="second" && this.layout.timeUnit!="millisecond") |
						(this.layout.timeUnit=="second" && this.layout.interval>1))
						appendQuotes[i].LastTime=new Date();
				}
			}
			if(params.callback) params.callback.call(this);
		}
		
		function onInterval(stx){
			return function(){
				if(!stx.chart.symbol) return;
				var close=null, md=stx.masterData;
				if(md && md.length){
					if(stx.chart.currentMarketData.Last){
						close=stx.chart.currentMarketData.Last.Price;
					}else{
						close=md[md.length-1].Close;
					}
				}
				var randomClose=100+Math.round(10*Math.random()-5)*0.01;
				var data=moveBidAsk.call(stx, close || randomClose);
				if(close===null) {
					data.Last=randomClose;
					data.LastSize=Math.round(Math.random()*100);
				}
				data.DT=new Date();
				stx.updateCurrentMarketData(data);
				if(params.callback) params.callback.call(stx);
			};
		}
	
		if(params.onTrade) params.stx.prepend("updateChartData",onTrade);
		if(params.onInterval) setInterval(onInterval(params.stx),params.onInterval);
	};

	return _exports;

});
	
