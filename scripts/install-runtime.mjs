import { createRequire } from 'node:module';
import { EnvHttpProxyAgent, setGlobalDispatcher } from 'undici';
if(process.env.HTTPS_PROXY||process.env.HTTP_PROXY)setGlobalDispatcher(new EnvHttpProxyAgent());
createRequire(import.meta.url)('electron/install.js');
