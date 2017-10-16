var openfinLauncher = require('openfin-launcher');


openfinLauncher.launchOpenFin({
    //new"
    // configPath: "http://localhost:3375/yourSubDirectory/configs/openfin/manifest-local.json"
    configPath: "http://beta.adaptableblotter.com/finsembledemo/dist/configs/openfin/manifest-remote.json"
})    .then(function() {
    console.log('success!');
})
.fail(function(error) {
    console.log('error!', error);
});