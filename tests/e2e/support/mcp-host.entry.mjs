/**
 * A minimal MCP Apps host for tests/e2e/mcp-apps.spec.js, built on the SDK's own AppBridge (the
 * code a real host such as Claude is built to interoperate with). Bundled for the browser by the
 * spec; `window.mountApp(html, toolResult)` puts the app in an iframe, completes the handshake
 * and hands the app a tool result.
 */
import { AppBridge, PostMessageTransport } from '@modelcontextprotocol/ext-apps/app-bridge';

window.mountApp = async (html, toolResult) => {
  const iframe = document.createElement('iframe');
  iframe.id = 'app';
  iframe.style.cssText = 'width:520px;height:720px;border:1px solid #888';
  iframe.setAttribute('sandbox', 'allow-scripts allow-same-origin');
  document.body.append(iframe);

  const bridge = new AppBridge(
    null,
    { name: 'test-host', version: '1.0.0' },
    { serverTools: {}, openLinks: {} },
    { hostContext: { theme: 'light', displayMode: 'inline', availableDisplayModes: ['inline'] } }
  );
  const initialized = new Promise(resolve => {
    bridge.oninitialized = resolve;
  });
  iframe.srcdoc = html;
  await new Promise(resolve => iframe.addEventListener('load', resolve, { once: true }));
  await bridge.connect(new PostMessageTransport(iframe.contentWindow, iframe.contentWindow));
  // The app called app.connect() and the handshake finished. Bounded, so an app that never
  // connects fails with that reason and not with the test's timeout
  await Promise.race([
    initialized,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error('the app never connected to the host')), 5000)
    ),
  ]);
  await bridge.sendToolResult(toolResult);
};
