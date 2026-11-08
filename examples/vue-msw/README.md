# Vue + MSW example

This small Vue app demonstrates automatic login through the default form-data
request, with the username field renamed to `email`.
For your own application, follow the [setup guide](../../README.md#setup-guide).

From the repository root:

```bash
nvm install
nvm use
npm ci
npm run example
```

Open http://127.0.0.1:5173. Keep ports 5173 and 4174 available.
The command builds the library first, then starts Vite and the local mock API.
Stop both servers with Ctrl+C. Restart the command after changing library source.

## Try it

1. The page should show **Cookie present** and an HTTP 200 profile response.
2. Click **Clear cookie**, then **Check session** to see HTTP 401.
3. Click **Reload & log in** to receive the cookie again.

The plugin reuses its cached token until expiry; clearing the browser cookie
does not clear the server-side token cache. Tokens expire after five minutes.
A reload after expiry triggers a fresh login.

## How it works

- `.env.development` contains public demo credentials only:
  `demo@example.test` / `demo-password`.
- The development launcher starts MSW's HTTP adapter on loopback port 4174
  before starting Vite with the auto-login plugin.
- The plugin sends a multipart POST to `/login`. The mock requires `email`
  and `password`, demonstrating `formFields: { username: 'email' }`.
- MSW returns a signed demo JWT. The plugin sets `your_token_name` on the
  HTML response, before Vue starts.
- Vue fetches `/api/me`. Vite proxies that request, including its cookie, to MSW.
  The handler verifies the JWT and returns a profile or HTTP 401.

The mock uses [MSW Serve](https://mswjs.io/ecosystem/serve) because the plugin
calls Undici from Node. A browser service worker cannot intercept that request,
and MSW's Node interception does not cover direct Undici connections.
No browser worker or replacement fetch implementation is needed.

`MockApiServer` owns the mock server. The launcher keeps it alive across Vite
config reloads and closes both servers on Ctrl+C or SIGTERM.
The demo signing key is intentionally public and only used for this local example.

## Checks

```bash
npm run check
npm run example:build
```

The full check includes Vue type checking, linting, and mock API integration tests.
The example build also builds the library. Mock dependencies are development-only
and are not bundled into the published library or the browser application.

The production example build checks that the Vue app compiles. Authentication
requires the development server; `vite preview` does not run the login plugin
or mock API.
