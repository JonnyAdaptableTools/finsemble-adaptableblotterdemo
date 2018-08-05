var FSBLWindow = require("./FSBLWindow");
var OpenFinWindow = require("./openfinWindowWrapper.js");
var NativeWindow = require("./externalWindowWrapper.js");
var FinsembleNativeWindow = require("./FinsembleNativeWindow.js");

FSBLWindow.registerType("OpenFinWindow", OpenFinWindow);
FSBLWindow.registerType("NativeWindow", NativeWindow);
FSBLWindow.registerType("FinsembleNativeWindow", FinsembleNativeWindow);

module.exports = FSBLWindow;

