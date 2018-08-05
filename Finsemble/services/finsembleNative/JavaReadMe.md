# Java and Indirectly Launched OpenFin Connected Windows

## Step 1: Launching
These windows are launched using the FinsembleNativeService, just like Finsemble Aware .NET Windows. However since these are not actually Finsemble aware, things get complicated. They get the WindowName, Openfin version, OpenFin socket port as command line paramters.

## Step 2: Registering
These windows need to register with Finsemble using the RPC service. They send a message over the IAB to the Assimilation.Register endpoint with a window handle.

## Step 3: Notify NativeService and Assimilation Service
The Assimilation.Register in the RPC service notifies the FinsembleNative service, which sends a message to AssimilationService with the window descriptor and the handle.

## Issues
- This currently works because assimilation registers this window with docking. So docking thinks that this is an assimilated window. However all other services (launcher/workspace) think that this is a FinsembleNative window.
- This means that no events will be caught by these other services except close for this window.