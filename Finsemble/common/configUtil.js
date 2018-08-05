/*!
* Copyright 2017 by ChartIQ, Inc.
* All rights reserved.
*/

var FSBLUtils = require("./util");
var Logger = require("../clients/logger");
/**
 *
 *
/**
 *
 *
/**
 *
 *
/**
 *
 *
 */
var ConfigUtil = function () {

	var self = this;

	/**
	 * @introduction
	 * <h2>Finsemble Configuration Utility Functions</h2>
	 * @private
	 * @class ConfigUtil
	 */
	// run through the configuration object and resolve any variables definitions (i.e. $applicationRoot)
	this.resolveConfigVariables = function (finsembleConfig, startingConfigObject) {
		var pass = 0;
		var needsAnotherPass = true;

		// resolve a variable within a config string
		function resolveString(configString) {
			var seperators = /[/\\:?=&]/; // list of seperators in regex form (will add other seperators if needed)
			var tokens = configString.split(seperators);
			for (var i = 0; i < tokens.length; i++) {
				if (tokens[i][0] === "$") { // special variable character $ has to first char in string
					var variableReference = tokens[i].substring(1); // string off the leading $
					var variableResolution = finsembleConfig[variableReference]; // the variable value is another config property, which already must be set
					var newValue = configString.replace(tokens[i], variableResolution); // replace the variable reference with new value
					Logger.system.info("forceObjectsToLogger", "ConfigUtil.resolveConfigVariables:resolveString configString", tokens[i], variableReference, variableResolution, "oldvalue=", configString, "value=", newValue);
					needsAnotherPass = true; // <<-- here is the only place needsAnotherPass is set, since still resolving variables
					configString = newValue;
				}
			}
			return (configString);
		}

		// process an array of config items looking for variables to resolve (a recursive routine)
		function resolveArray(configArray, pass, recursionLevel) {
			Logger.system.info("forceObjectsToLogger", "resolveArray", "pass", pass, "recursionLevel", recursionLevel, "configArray:", configArray);
			for (var i = 0; i < configArray.length; i++) {
				var value = configArray[i];
				if (typeof (value) === "string" && value.indexOf("$") > -1) {
					configArray[i] = resolveString(value);
				} else if (value instanceof Array) {
					resolveArray(value, pass, recursionLevel + 1); // array reference passed so don't need return value
				} else if (typeof (value) === "object") {
					resolveObject(value, pass, recursionLevel + 1); // object reference passed so don't need return value
				}
			}
		}

		// process an object of config properties looking for variables to resolve (a recursive routine)
		function resolveObject(configObject, pass, recursionLevel) {
			configObject = configObject || {}; // don't error on bad config
			Logger.system.info("forceObjectsToLogger", "ConfigUtil.resolveConfigVariables:resolveObject", "pass", pass, "recursionLevel", recursionLevel, "configObject:", configObject);
			Object.keys(configObject).forEach(function (key) {
				var value = configObject[key];
				if (typeof (value) === "string" && value.indexOf("$") > -1) {
					configObject[key] = resolveString(value);
				} else if (value instanceof Array) {
					resolveArray(value, pass, recursionLevel + 1); // array reference passed so don't need return value
				} else if (typeof (value) === "object") {
					resolveObject(value, pass, recursionLevel + 1); // object reference passed so don't need return value
				}
			});
		}

		// since variables may be nested, keep resolving till no more left
		while (needsAnotherPass) {
			needsAnotherPass = false; // don't need another pass afterwards unless a variable is resolved somewhere in finsembleConfig
			resolveObject(startingConfigObject, ++pass, 1);
		}
	};

	// This does mimimal processing of the manifest, just enough to support getting the router up, which is only expanding variables (e.g. moduleRoot) in the raw manifest
	this.getExpandedRawManifest = function (callback) {
		Logger.system.debug("ConfigUtil.getExpandedRawManifest starting");

		function getRawManifest(callback, application, level) {
			Logger.system.debug("forceObjectsToLogger", "ConfigUtil.getExpandedRawManifest:getRawManifest", application, level);

			application.getManifest(function (manifest) { // get raw openfin manifest
				Logger.system.debug("forceObjectsToLogger", "ConfigUtil.getExpandedRawManifest:getExpandedRawManifest: manifest retrieved. Pre-variable resolution", manifest);
				self.resolveConfigVariables(manifest.finsemble, manifest.finsemble); // resolve variables first time so can fild config config location
				Logger.system.debug("forceObjectsToLogger", "ConfigUtil.getExpandedRawManifest:getExpandedRawManifest:Complete. post-variable resolution", manifest);
				callback(manifest);
			}, function (err) {
				if (err) {
					Logger.system.error("ConfigUtil.getExpandedRawManifest:application.getManifest:err", err);
				}
				// no manifest so try parent
				application.getParentUuid(function (parentUuid) {
					var parentApplication = fin.desktop.Application.wrap(parentUuid);
					Logger.system.debug("forceObjectsToLogger", "uuid", parentUuid, "parentApplication", parentApplication);
					if (level < 10) {
						getRawManifest(callback, parentApplication, ++level);
					} else { // still could find so must be a problem (i.e. avoid infinite loop)
						callback("could not find manifest in parent applications");
					}
				});
			});
		}

		fin.desktop.main(function () { // make sure openfin is ready
			var application = fin.desktop.Application.getCurrent();
			getRawManifest(callback, application, 1);
		});
	};

	// async read of JSON config file
	this.readConfigFile = function (coreConfigFile, importCallback) {
		Logger.system.debug("fetching " + coreConfigFile);
		fetch(coreConfigFile, {
			credentials: "include"
		}).then(function (response) {
			return response.json();
		}).catch(function (err) {
			importCallback("failure importing: " + err, null);
		}).then(function (importObject) {
			importCallback(null, importObject);
		});
	};

	// This does a "first stage" processing of the manifest, providing enought config to start finsemble.
	// Pull in the initial manifest, which includes gettig the "hiddlen" core config file along with its import definitions, and expand all variables.
	// However, the full config processing, incluing actually doing the imports, is only done in the Config Service.
	this.getInitialManifest = function (callback) {

		fin.desktop.main(function () { // make sure openfin is ready
			var application = fin.desktop.Application.getCurrent();
			application.getManifest(function (manifest) { // get raw openfin manifest
				manifest.finsemble = manifest.finsemble || {}; // don't error on bad config
				self.resolveConfigVariables(manifest.finsemble, manifest.finsemble); // resolve variables first time so can find config config location
				let CORE_CONFIG = manifest.finsemble.moduleRoot + "/configs/core/config.json"; // <<<--- here is the "hidden" core config file
				self.readConfigFile(CORE_CONFIG, function (error, newFinsembleConfigObject) { // fetch the core config file
					if (!error) {
						Object.keys(newFinsembleConfigObject).forEach(function (key) {
							if (key === "importConfig") {
								// add any importConfig items from the core to the existing importConifg
								manifest.finsemble.importConfig = manifest.finsemble.importConfig || [];
								for (let i = 0; i < newFinsembleConfigObject.importConfig.length; i++) {
									manifest.finsemble.importConfig.unshift(newFinsembleConfigObject.importConfig[i]);
								}
							} else if (key === "importThirdPartyConfig") {
								// add any importThirdPartyConfig items from the core to the existing importConifg
								manifest.finsemble.importThirdPartyConfig = manifest.finsemble.importThirdPartyConfig || [];
								for (let i = 0; i < newFinsembleConfigObject.importThirdPartyConfig.length; i++) {
									manifest.finsemble.importThirdPartyConfig.unshift(newFinsembleConfigObject.importThirdPartyConfig[i]);
								}
							} else {
								manifest.finsemble[key] = newFinsembleConfigObject[key];
							}
						});
						self.resolveConfigVariables(manifest.finsemble, manifest.finsemble); // resolve variables with finsemble config
						Logger.system.debug("forceObjectsToLogger", "ConfigUtil.getInitialManifest:getCoreConfig:Initial Manifest after variables Resolved", manifest);
					} else {
						Logger.system.error("ConfigUtil.getInitialManifest:getCoreConfig:failed importing into finsemble config", error);
					}
					callback(manifest);
				});
			});
		});
	};

	// output JSON objecvt to file
	this.promptAndSaveJSONToLocalFile = function (filename, jsonObject) {
		Logger.system.debug("saveJSONToLocalFile", filename, jsonObject);

		let dataStr = JSON.stringify(jsonObject, null, "\t");
		let dataUri = "data:application/json;charset=utf-8," + encodeURIComponent(dataStr);

		let exportFileDefaultName = filename + ".json";

		let linkElement = document.createElement("a");
		linkElement.setAttribute("href", dataUri);
		linkElement.setAttribute("download", exportFileDefaultName);
		linkElement.click();
	};

	// utility function for future use
	this.configFormatForExport = function(typeOfConfig, configObject) {
		Logger.system.debug("configFormatForExport starting", typeOfConfig, configObject);
		var exportConfig = FSBLUtils.clone(configObject);

		if (typeOfConfig === "raw") {
			// do nothing since config is ready to export as is
		} else if (typeOfConfig === "all") {
			delete exportConfig.importConfig;
			delete exportConfig.comment;
		} else if (typeOfConfig === "application") {
			delete exportConfig.importConfig;
			delete exportConfig.comment;
			delete exportConfig.system;
			delete exportConfig.services;
		} else if (typeOfConfig === "workspace") {
			exportConfig = { workspace: exportConfig };
		} else if (typeOfConfig === "workspaceTemplate") {
			let workspaceDefinition = {};
			workspaceDefinition[exportConfig.name] = exportConfig;
			exportConfig = { workspaceTemplates: workspaceDefinition };
		} else if (typeOfConfig === "services") {
			exportConfig = exportConfig.services;
		} else if (typeOfConfig === "components") {
			exportConfig = exportConfig.components;
		}

		return exportConfig;
	};

	/////////////////////////////////////////////////////////////////////////
	/////////////// Remaining code is for config verification ///////////////
	/////////////////////////////////////////////////////////////////////////

	// convenience constructor to return record used in configVerifyObject.
	this.VerifyConfigRecord = function (propertyType, propertyCondition) {
		this._verify = {
			type: propertyType,
			condition: propertyCondition
		};
	};

	// convenience constants for definiting verification object. See example usage in ServiceManager or ConfigService.
	// Required means startup will break without it, so error.
	// Optional means startup will not break without it; however, it is documented and expected as part of the config that should always be there.  So warning message only.
	// Deprecated mean startup will no break but old config format is used and should be updated.
	this.REQUIRED_STRING = new this.VerifyConfigRecord("string", "required");
	this.REQUIRED_OBJECT = new this.VerifyConfigRecord("object", "required");
	this.REQUIRED_BOOLEAN = new this.VerifyConfigRecord("boolean", "required");
	this.REQUIRED_ARRAY = new this.VerifyConfigRecord("array", "required");
	this.OPTIONAL_EXPECTED_STRING = new this.VerifyConfigRecord("string", "optional");
	this.OPTIONAL_EXPECTED_OBJECT = new this.VerifyConfigRecord("object", "optional");
	this.OPTIONAL_EXPECTED_BOOLEAN = new this.VerifyConfigRecord("boolean", "optional");
	this.OPTIONAL_EXPECTED_ARRAY = new this.VerifyConfigRecord("array", "optional");
	this.DEPRECATED_STRING = new this.VerifyConfigRecord("string", "DEPRECATED");
	this.DEPRECATED_OBJECT = new this.VerifyConfigRecord("object", "DEPRECATED");
	this.DEPRECATED_BOOLEAN = new this.VerifyConfigRecord("boolean", "DEPRECATED");
	this.DEPRECATED_ARRAY = new this.VerifyConfigRecord("array", "DEPRECATED");

	// check type of one config property. Return true if ok; otherwise false. Must handle null configProperty (returning false).
	function checkType(configProperty, type) {
		var typeOk = true;
		if (configProperty) {
			if (type == "array") {
				if (!Array.isArray(configProperty)) {
					typeOk = false;
				}
			} else {
				// note "array" type is being distinguished from "object" type, so configProperty type shouldn't be an array
				if (Array.isArray(configProperty) || typeof configProperty !== type) {
					typeOk = false;
				}
			}
		} else {
			typeOk = false;
		}
		return typeOk;
	}

	// Verifies one config property given it's corresponding verifyRecord and returns appropriate result.
	function verifyConfigProperty(fullPathName, configProperty, verifyRecord) {
		Logger.system.verbose(`verifyConfigProperty for ${fullPathName}`, configProperty, verifyRecord);
		var resultOk = true;
		switch (verifyRecord._verify.condition) {
			case "required":
				resultOk = checkType(configProperty, verifyRecord._verify.type);
				if (!resultOk) { // required must exist and have correct type
					Logger.system.error(`Illegally formatted configuration.  Type of ${fullPathName} is not an expected ${verifyRecord._verify.type}`, configProperty, verifyRecord);
				}
				break;
			case "optional":
				if (!configProperty) { // missing optional only generates warning
					Logger.system.warn(`CONFIGURATION WARNING: Expected configuration missing for ${fullPathName}.`, configProperty, verifyRecord);
				} else {
					resultOk = checkType(configProperty, verifyRecord._verify.type);
					if (!resultOk) { // optional only errors with wrong type
						Logger.system.error(`Illegally formatted configuration. Type of ${fullPathName} is not an expected ${verifyRecord._verify.type}`, configProperty, verifyRecord);
					}
				}
				break;
			case "DEPRECATED":
				if (configProperty) { // DEPRECATED generates warning
					Logger.system.warn(`CONFIGURATION WARNING: DEPRECATED configuration ${fullPathName}.`, configProperty, verifyRecord);
					resultOk = checkType(configProperty, verifyRecord._verify.type);
					if (!resultOk) { // DEPRECATED only errors with wrong type
						Logger.system.error(`Config ${fullPathName} is DEPRECATED and illegally formatted.  Expected type is ${verifyRecord._verify.type}.`, configProperty, verifyRecord);
					}
				}
				break;
			default:
				Logger.system.error(`Illegally formatted config record.  Condition ${verifyRecord._verify.condition} unknown`, configProperty, verifyRecord);
		}
		return resultOk;
	}

	/**
	 * Verifies config is correct and logs messages as needed. Recursively walks configObject and configVerifyObject.
	 *
	 * @param {object} fullPathName path name of config being verfied (e.g. "manifest", "manifest.finsemble"); used for error messages
	 * @param {object} configObject the configuration object to verify (typically the manifest object or manifest.finsemble object)
	 * @param {object} configVerifyObject object to drive the verification; data driven.
	 *
	 * Example configVerifyObject below.
	 * 		Note verification records (e.g. REQUIRED_STRING) only go at the leaf level, but code must handle corresponding undefined config at all levels.
	 *
	 * 		var configVerifyObject = {
	 *		finsemble: {
	 *			applicationRoot: REQUIRED_STRING,
	 *			moduleRoot: REQUIRED_STRING,
	 *			system: {
	 *				FSBLVersion: REQUIRED_STRING,
	 *				requiredServicesConfig: REQUIRED_OBJECT,
	 *			},
	 *			splinteringConfig: {
	 *				splinterAgents: OPTIONAL_EXPECTED_ARRAY
	 *			},
	 *			storage: {
	 *				LocalStorageAdapter: DEPRECATED_STRING
	 *			},
	 *		}
	 *	};
 	 *
	 *
	 * @returns If correct, return true (with no log messages generated); return false otherwise. For optional or DEPRECATED generate warning if not defined, but no error unless if wrong type.
	 *
	 * @example See ConfigService for example usuage.
	 *
	 * @private
	 */
	this.verifyConfigObject = function (fullPathName, configObject, configVerifyObject) {
		Logger.system.verbose(`verifyConfigObject for ${fullPathName}`, configObject, configVerifyObject);
		var verifyConfigObjectOk = true;

		if (configVerifyObject._verify) { // currently config records only defined at leaf level (could enhance by allowing at any level)
			verifyConfigObjectOk = verifyConfigProperty(fullPathName, configObject, configVerifyObject);
		} else {
			if (!configVerifyObject) { // shouldn't happen unless by api input
				Logger.system.error(`configUtil.verify: configVerifyObject not defined for ${fullPathName}`, configObject, configVerifyObject);
			} else {
				var propertyList = Object.keys(configVerifyObject);
				if (!propertyList) { // shouldn't happen unless by api input
					Logger.system.error(`configUtil.verify: illegally formatted verification record for ${fullPathName}`, configObject, configVerifyObject);
				} else { // not at leaf level so recursively iterate though all the properties
					for (let i = 0; i < propertyList.length; i++) {
						let property = propertyList[i];
						let thisPropertyPath = fullPathName + "." + property;
						let thisConfigProperty = null;
						if (configObject && (property in configObject)) {
							thisConfigProperty = configObject[property];
						}
						// the order of the conditional (i.e. "&&") insures verification will continue after error(s)
						verifyConfigObjectOk = this.verifyConfigObject(thisPropertyPath, thisConfigProperty, configVerifyObject[property]) && verifyConfigObjectOk;
					}
				}
			}
		}
		return verifyConfigObjectOk;
	};

	/**
	 * Convenience function to get a default value from config.
	 *
	 * @param {object} base base path of config object
	 * @param {string} path path string of config property
	 * @param {any} defaultValue if path value not defined or null, then use default value
	 *
	 * @returns return config value or default value
	 *
	 * @example
	 *
	 *		defaultAdaptor = ConfigUtil.getDefault(manifest, "manifest.finsemble.defaultStorage", "LocalStorageAdapter");
	 *		sameDomainTransport = ConfigUtil.getDefault(finConfig, "finConfig.router.sameDomainTransport", "SharedWorker");
	 *		var serverAddress = getDefault(params, "params.transportSettings.FinsembleTransport.serverAddress", "wss://localhost.chartiq.com:3376");
	 *
	 */
	this.getDefault = function (base, path, defaultValue) {
		var result = defaultValue;
		if (base) {
			try {
				let properties = path.split(".");
				let currentValue = base;
				for (let i = 1; i < properties.length; i++) {
					currentValue = currentValue[properties[i]];
				}
				result = currentValue;
			} catch (err) {
				result = defaultValue;
			}

			if (typeof(result) === "undefined") result = defaultValue;
		}
		return result;
	};

};

module.exports = new ConfigUtil();