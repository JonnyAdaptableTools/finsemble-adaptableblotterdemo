"use strict";

var adaptableblotterhypergrid = require('adaptableblotter/dist/adaptableblotterhypergrid-bundle.min');
var hypergrid = require('fin-hypergrid');

let newRowTimer;
let newRowList = [];

let lightTheme = {
    font: '12px Helvetica Neue, Helvetica, Arial, sans-serif',
    fontBold: 'bold 12px Helvetica Neue, Helvetica, Arial, sans-serif',
    color: '#003f59',
    backgroundColor: 'white',
    altbackground: '#e6f2f8',
    foregroundSelectionColor: 'white',
    backgroundSelectionColor: 'rgba(13, 106, 146, 0.5)',

    columnHeaderFont: '12px Helvetica Neue, Helvetica, Arial, sans-serif',
    columnHeaderColor: '#00435e',
    columnHeaderBackgroundColor: '#d9ecf5',
    columnHeaderForegroundSelectionColor: 'rgb(25, 25, 25)',
    columnHeaderBackgroundSelectionColor: 'rgb(255, 220, 97)',

    rowHeaderFont: '12px Helvetica Neue, Helvetica, Arial, sans-serif',
    rowHeaderColor: '#00435e',
    rowHeaderBackgroundColor: '#d9ecf5',
    rowHeaderForegroundSelectionColor: 'rgb(25, 25, 25)',
    rowHeaderBackgroundSelectionColor: 'rgb(255, 220, 97)',

    backgroundColor2: 'rgb(201, 201, 201)',
    lineColor: '#bbdceb',
    voffset: 0,
    scrollbarHoverOver: 'visible',
    scrollbarHoverOff: 'visible',
    scrollingEnabled: true,

    fixedRowAlign: 'center',
    fixedColAlign: 'center',
    cellPadding: 15,
    gridLinesH: false,
    gridLinesV: true,

    defaultRowHeight: 30,
    defaultFixedRowHeight: 15,
    showRowNumbers: false,
    editorActivationKeys: ['alt', 'esc'],
    columnAutosizing: true,
    readOnly: false
};

let darkTheme = {
    font: '12px Helvetica Neue, Helvetica, Arial, sans-serif',
    color: 'white',
    backgroundColor: '#07071E',
    altbackground: '#07071E',
    foregroundSelectionColor: 'white',
    backgroundSelectionColor: 'rgba(61, 119, 254, 0.5)',

    columnHeaderFont: '12px Helvetica Neue, Helvetica, Arial, sans-serif',
    columnHeaderColor: 'white',
    columnHeaderBackgroundColor: '#07071E',
    columnHeaderForegroundSelectionColor: 'white',
    columnHeaderBackgroundSelectionColor: '#3D77FE',

    rowHeaderFont: '12px Helvetica Neue, Helvetica, Arial, sans-serif',
    rowHeaderColor: 'white',
    rowHeaderBackgroundColor: '#07071E',
    rowHeaderForegroundSelectionColor: 'white',
    rowHeaderBackgroundSelectionColor: '#3D77FE',

    backgroundColor2: 'rgb(201, 201, 201)',
    lineColor: 'rgb(199, 199, 199)',
    voffset: 0,
    scrollbarHoverOver: 'visible',
    scrollbarHoverOff: 'visible',
    scrollingEnabled: true,

    fixedRowAlign: 'center',
    fixedColAlign: 'center',
    cellPadding: 15,
    gridLinesH: false,
    gridLinesV: false,

    defaultRowHeight: 30,
    defaultFixedRowHeight: 15,
    showRowNumbers: false,
    editorActivationKeys: ['alt', 'esc'],
    columnAutosizing: true,
    readOnly: false
};

function hypergridAddRow(grid, blotter, newRow) {
    if (!newRowTimer) {
        //we just want to avoid the data going out of index when editing it. 
        newRowTimer = setInterval(() => {
            if (!blotter.gridHasCurrentEditValue() && newRowList.length > 0) {
                newRowList.forEach(trade => grid.behavior.dataModel.addRow(trade));
                newRowList.length = 0;
                blotter.ReindexAndRepaint();
            }
        }, 500);
    }
    newRowList.push(newRow);
}

function hypergridUpdateRowFromDataSource(grid, blotter, updatedRow, primaryKeyColumn) {
    let primaryKeyValue = updatedRow[primaryKeyColumn];
    let row = grid.behavior.dataModel.dataSource.findRow(primaryKeyColumn, primaryKeyValue);
    for (let column of grid.behavior.allColumns) {
        row[column.name] = updatedRow[column.name];
    }
    //if not editing we refresh the grid
    if (!blotter.gridHasCurrentEditValue()) {
        blotter.ReindexAndRepaint();
    }
}

function createGrid(data, blotterType) {
    var grid = new hypergrid('#gridcontainer', { data: data, schema: getSchema(data, blotterType) });
    grid.addProperties({ editOnKeydown: false });
    //Set to `true` to render `0` and `false`. Otherwise these value appear as blank cells
    grid.addProperties({ renderFalsy: true });
    grid.localization.add('USDCurrencyFormat', new grid.localization.NumberFormatter('en-US', {
        style: 'currency',
        currency: 'USD',
        maximumFractionDigits: 0
    }));
    grid.localization.add('PriceFormat', new grid.localization.NumberFormatter('en-US', {
        maximumFractionDigits: 4
    }));

    var shortDateOptions = { year: 'numeric', month: 'long', day: 'numeric' };
    grid.localization.add('shortDateFormat', new grid.localization.DateFormatter('en-EN', shortDateOptions));
    let dateTimeoptions = {
        year: 'numeric', month: 'numeric', day: 'numeric',
        hour: 'numeric', minute: 'numeric', second: 'numeric',
        hour12: false
    };
    grid.localization.add('dateTimeFormat', new grid.localization.DateFormatter('en-EN', dateTimeoptions));
    return grid;
}

function getSchema(data, blotterType) {
    var positionColumns = [
        "instrumentId",
        "position",
        "currency",
        "currentPrice",
        "closingPrice",
        "pnl"
    ];
    var priceColumns = [
        "instrumentId",
        "price",
        "bidOfferSpread",
        "bid",
        "ask",
        "closingPrice",
        "changeOnDay",
        "bloombergBid",
        "bloombergAsk",
    ];
    var tradeColumns = [
        "tradeId",
        "instrumentId",
        "instrumentName",
        "notional",
        "deskId",
        "counterparty",
        "currency",
        "country",
        "changeOnYear",
        "price",
        "moodysRating",
        "fitchRating",
        "sandpRating",
        "tradeDate",
        "settlementDate",
        "lastUpdated",
        "lastUpdatedBy"
    ];
    var columns;
    switch (blotterType) {
        case "trade":
            columns = tradeColumns;
            break;
        case "position":
            columns = positionColumns;
            break;
        case "price":
            columns = priceColumns;
            break;
    }
    var schema = [];
    for (var p of columns) {
        schema.push({ name: p, header: capitalize(p) });
    }
    return schema;
}
function capitalize(string) {
    return (/[a-z]/.test(string) ? string : string.toLowerCase())
        .replace(/[\s\-_]*([^\s\-_])([^\s\-_]+)/g, replacer)
        .replace(/[A-Z]/g, ' $&')
        .trim();
}
function replacer(a, b, c) {
    return b.toUpperCase() + c;
}

function initAdaptableBlotter(grid, blotterId, primaryKey) {
    let adaptableblotter = new adaptableblotterhypergrid.AdaptableBlotter({
        blotterId: blotterId,
        primaryKey: primaryKey,
        vendorGrid: grid,
        userName: "Jonathan",
        enableAuditLog: false,
        enableRemoteConfigServer: false,
        predefinedConfig: "defaultConfig.json",
        adaptableBlotterContainer: "adaptableblottercontainer"
    });

    let origgetCell = grid.behavior.dataModel.getCell;
    grid.behavior.dataModel.getCell = (config, declaredRendererName) => {
        if (config.isDataRow) {
            var y = config.dataCell.y;
            if (y % 2) {
                config.backgroundColor = config.altbackground;
            }
            if (!adaptableblotter.isColumnReadonly(config.field)) {
                config.font = lightTheme.fontBold;
            }
        }
        return origgetCell.call(grid.behavior.dataModel, config, declaredRendererName);
    };

    grid.addProperties(lightTheme);
    return adaptableblotter;
}

class DemoDataObject {
    constructor() {
        this.popupState = null;
        this.didMaximizeForPopup = false;
        this.currentInstrumentExpression = null;
        this.currentQuickSearch = null;
        this.currentTheme = "";
        this.currentSelectedSymbol = ""
    }
}

function maximizeWidgetWhenABPopupVisible(adaptableblotter, demoDataObject) {
    adaptableblotter.AdaptableBlotterStore.TheStore.subscribe(() => {
        if (demoDataObject.popupState !== adaptableblotter.AdaptableBlotterStore.TheStore.getState().Popup) {
            demoDataObject.popupState = adaptableblotter.AdaptableBlotterStore.TheStore.getState().Popup;
            if (demoDataObject.popupState.ScreenPopup.ShowPopup === true &&
                FSBL.Clients.WindowClient.windowState !== "maximized") {
                demoDataObject.didMaximizeForPopup = true;
                FSBL.Clients.WindowClient.maximize();
            }
            else if (demoDataObject.popupState.ScreenPopup.ShowPopup === false &&
                demoDataObject.didMaximizeForPopup) {
                FSBL.Clients.WindowClient.restore();
                demoDataObject.didMaximizeForPopup = false;
            }
        }
    });
}
// function publishInstrumentExpressionWhenChanged(adaptableblotter, demoDataObject) {
//     adaptableblotter.AdaptableBlotterStore.TheStore.subscribe(() => {
//         //we first check that the state update concerns the filters
//         if (adaptableblotter.AdaptableBlotterStore.TheStore.getState().Filter.ColumnFilters !== demoDataObject.currentFilters) {
//             demoDataObject.currentFilters = adaptableblotter.AdaptableBlotterStore.TheStore.getState().Filter.ColumnFilters;
//             //we get the expression for the column instrumentId
//             let localInstrumentIdExpression = demoDataObject.currentFilters.find(x => x.ColumnId === "instrumentId");
//             if (localInstrumentIdExpression) {
//                 if (demoDataObject.currentInstrumentExpression) {
//                     let localColumnValues = localInstrumentIdExpression.Filter.ColumnDisplayValuesExpressions.find(x => x.ColumnName === "instrumentId");
//                     let localColumnValuesArray = localColumnValues ? localColumnValues.ColumnValues : [];
//                     let localUserFilterUids = localInstrumentIdExpression.Filter.UserFilters.find(x => x.ColumnName === "instrumentId");
//                     let localuserFilterUidsArray = localUserFilterUids ? localUserFilterUids.UserFilterUids : [];

//                     let currentColumnValues = demoDataObject.currentInstrumentExpression.Filter.ColumnDisplayValuesExpressions.find(x => x.ColumnName === "instrumentId");
//                     let currentColumnValuesArray = currentColumnValues ? currentColumnValues.ColumnValues : [];
//                     let currentUserFilterUids = demoDataObject.currentInstrumentExpression.Filter.UserFilters.find(x => x.ColumnName === "instrumentId");
//                     let currentuserFilterUidsArray = currentUserFilterUids ? currentUserFilterUids.UserFilterUids : [];

//                     demoDataObject.currentInstrumentExpression = localInstrumentIdExpression;
//                     if (!areArraysEqual(localColumnValuesArray, currentColumnValuesArray) ||
//                         !areArraysEqual(localuserFilterUidsArray, currentuserFilterUidsArray)) {
//                         FSBL.Clients.LinkerClient.publish({ dataType: "instrumentExpression", data: demoDataObject.currentInstrumentExpression });
//                     }
//                 }
//                 else {
//                     demoDataObject.currentInstrumentExpression = localInstrumentIdExpression;
//                     FSBL.Clients.LinkerClient.publish({ dataType: "instrumentExpression", data: demoDataObject.currentInstrumentExpression });
//                 }
//             }
//             else if (demoDataObject.currentInstrumentExpression) {
//                 demoDataObject.currentInstrumentExpression = null;
//                 FSBL.Clients.LinkerClient.publish({ dataType: "instrumentExpression", data: null });
//             }
//         }
//     });
// }

function publishQuickSearchWhenChanged(adaptableblotter, demoDataObject) {
    adaptableblotter.AdaptableBlotterStore.TheStore.subscribe(() => {
        //we first check that the state update concerns the filters
        if (adaptableblotter.AdaptableBlotterStore.TheStore.getState().QuickSearch.QuickSearchText !== demoDataObject.currentQuickSearch) {
            demoDataObject.currentQuickSearch = adaptableblotter.AdaptableBlotterStore.TheStore.getState().QuickSearch.QuickSearchText;
            FSBL.Clients.LinkerClient.publish({ dataType: "quickSearch", data: demoDataObject.currentQuickSearch });
        }
    });
}

function publishSymbolWhenSelectionChanged(grid, demoDataObject) {
    grid.addEventListener('fin-selection-changed', (e) => {

        if (e.detail.selections.length === 0) {
            //no selection
            demoDataObject.currentSelectedSymbol = "";
            FSBL.Clients.LinkerClient.publish({ dataType: "symbol", data: "" });
            return;
        }

        //get the first selected cell of the selections
        let rowIndex = e.detail.selections[0].firstSelectedCell.y;
        let row = grid.behavior.dataModel.dataSource.getRow(rowIndex);
        let column = grid.behavior.getActiveColumns()[e.detail.selections[0].firstSelectedCell.x];
        if (column.name === "instrumentId") {
            let symbol = row.instrumentId;
            demoDataObject.currentSelectedSymbol = symbol;
            //we set the current quicksearch as well as we do not want to set the quicksearch when we select a cell
            demoDataObject.currentQuickSearch = symbol;
            FSBL.Clients.LinkerClient.publish({ dataType: "symbol", data: symbol });
        }
    });
}

function setEmittersWhenSelectionChanged(grid, adaptableblotter) {
    grid.addEventListener('fin-selection-changed', () => {
        FSBL.Clients.DataTransferClient.setEmitters({
            emitters: [
                {
                    type: "adaptableblotter.selectedcells",
                    data: { selectedCells: JSON.stringify(adaptableblotter.getSelectedCells().Selection) }
                }
            ]
        })
    });
}

function hypergridThemeChangeWhenAbChange(adaptableblotter, grid, demoDataObject) {
    adaptableblotter.AdaptableBlotterStore.TheStore.subscribe(() => {
        if (demoDataObject.themeName !== adaptableblotter.AdaptableBlotterStore.TheStore.getState().Theme.CurrentTheme) {
            demoDataObject.themeName = adaptableblotter.AdaptableBlotterStore.TheStore.getState().Theme.CurrentTheme;
            if (demoDataObject.themeName === "Slate" ||
                demoDataObject.themeName === "Cyborg" ||
                demoDataObject.themeName === "Darkly" ||
                demoDataObject.themeName === "Superhero") {
                grid.addProperties(darkTheme);
            }
            else {
                grid.addProperties(lightTheme);
            }
        }
    });
}

function areArraysEqual(arr1, arr2) {
    if (arr1.length !== arr2.length) {
        return false;
    }
    return arr1.every(x => arr2.indexOf(x) !== -1);
}

module.exports.hypergridAddRow = hypergridAddRow;
module.exports.hypergridUpdateRowFromDataSource = hypergridUpdateRowFromDataSource;
module.exports.createGrid = createGrid;
module.exports.initAdaptableBlotter = initAdaptableBlotter;
module.exports.DemoDataObject = DemoDataObject;
module.exports.maximizeWidgetWhenABPopupVisible = maximizeWidgetWhenABPopupVisible;
// module.exports.publishInstrumentExpressionWhenChanged = publishInstrumentExpressionWhenChanged;
module.exports.publishQuickSearchWhenChanged = publishQuickSearchWhenChanged;
module.exports.hypergridThemeChangeWhenAbChange = hypergridThemeChangeWhenAbChange;
module.exports.publishSymbolWhenSelectionChanged = publishSymbolWhenSelectionChanged;
module.exports.setEmittersWhenSelectionChanged = setEmittersWhenSelectionChanged;