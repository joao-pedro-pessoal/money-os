import { Buffer } from 'buffer';
globalThis.Buffer = Buffer as typeof globalThis.Buffer;
// All connector modules are evaluated after the portable Buffer is installed.
const { registerRootComponent } = require('expo');
const App = require('./App').default;
registerRootComponent(App);
