# @corespec/vite-plugin-api-auto-login

[![npm version](https://img.shields.io/npm/v/@corespec/vite-plugin-api-auto-login)](https://www.npmjs.com/package/@corespec/vite-plugin-api-auto-login)
[![CI](https://github.com/core-spec-tech/vite-plugin-api-auto-login/actions/workflows/ci.yml/badge.svg?branch=main&event=push)](https://github.com/core-spec-tech/vite-plugin-api-auto-login/actions/workflows/ci.yml)
[![Security checks](https://github.com/core-spec-tech/vite-plugin-api-auto-login/actions/workflows/security.yml/badge.svg?branch=main)](https://github.com/core-spec-tech/vite-plugin-api-auto-login/actions/workflows/security.yml)
[![License](https://img.shields.io/npm/l/@corespec/vite-plugin-api-auto-login)](https://www.npmjs.com/package/@corespec/vite-plugin-api-auto-login)
[![Vite compatibility](https://registry.vite.dev/api/badges?package=%40corespec%2Fvite-plugin-api-auto-login&tool=vite)](https://registry.vite.dev/)
[![Rollup compatibility](https://registry.vite.dev/api/badges?package=%40corespec%2Fvite-plugin-api-auto-login&tool=rollup)](https://registry.vite.dev/)

Automatically authenticate your local Vite app against an API. The plugin logs in
from the development server and adds the returned token as a browser cookie before
your app loads.

For Vite 7 or 8 and Node.js 22.23.4 or newer. This guide covers version 0.2.0.
The plugin runs during development only; it does not run in production builds or
`vite preview`. It uses Vite's middleware APIs and cannot run as a standalone
Rollup plugin.

[Setup guide](#setup-guide) · [Form fields](#form-field-names) ·
[Custom requests](#custom-login-requests) · [Cookies](#cookie-options) ·
[Environment variables](#environment-variables) · [Troubleshooting](#troubleshooting) ·
[Local demo](#vue--msw-demo)

## Setup guide

### 1. Check your login endpoint

The default request is a multipart `POST` containing `username` and `password`.
The endpoint must return a successful HTTP response with JSON in this shape:

```json
{ "token": "your-token-value" }
```

The token must be a non-empty string. JWTs and opaque tokens are both accepted.
If your endpoint expects `email` instead of `username`, use the
[form field mapping](#form-field-names). For JSON bodies, different methods, or
custom headers, use a [request callback](#custom-login-requests).
The callback customizes the outgoing request; the response must still contain `token`.

### 2. Install the plugin

Run this in your Vite application's directory:

```bash
npm install -D @corespec/vite-plugin-api-auto-login
```

### 3. Configure local credentials

Create `.env.development.local` in your application's root directory (or its
configured Vite `envDir`):

```dotenv
API_AUTO_LOGIN_LOGIN_URL=https://api.example.test/login
API_AUTO_LOGIN_USERNAME=dev@example.test
API_AUTO_LOGIN_PASSWORD=replace-with-your-development-password
API_AUTO_LOGIN_COOKIE_NAME=your_token_name
```

Replace the example URL, credentials, and cookie name with values your API accepts.
Ensure your application's `.gitignore` includes `*.local` or `.env.*.local`.
Keep the `API_AUTO_LOGIN_` prefix; do not rename these secrets to `VITE_*`.
The plugin loads them on the server, using Vite's active mode and environment directory.

### 4. Register the plugin

Add it to your existing `vite.config.ts`, alongside any framework plugins:

```ts
import { defineConfig } from 'vite'
import { viteAPIAutoLogin } from '@corespec/vite-plugin-api-auto-login'

export default defineConfig({
  plugins: [viteAPIAutoLogin()],
})
```

Keep your existing Vue, React, or other framework plugin entries.
There is no client-side initialization code to add.

### 5. Start Vite and verify the cookie

```bash
npm run dev
```

If your app has no `dev` script, run `npx vite`. Open the local URL printed by Vite
and load a page in the browser.

1. In browser DevTools → Network, select the HTML document request.
2. Check its response for `Set-Cookie: your_token_name=...`.
3. Check the browser's cookie storage for the Vite host.

The login request originates from Node.js, so it will not appear as a browser
network request. Login errors appear in the Vite terminal. Restart Vite after
changing environment values. If your API requests go to a different host, follow
the next section.

### 6. Send the cookie to your API

The cookie belongs to the **Vite host**, not automatically to the remote login
host. A common setup is to proxy browser API requests through Vite:

```ts
import { defineConfig } from 'vite'
import { viteAPIAutoLogin } from '@corespec/vite-plugin-api-auto-login'

export default defineConfig({
  plugins: [viteAPIAutoLogin()],
  server: {
    proxy: {
      '/api': {
        target: 'https://api.example.test',
        changeOrigin: true,
      },
    },
  },
})
```

Your frontend can then call `fetch('/api/me')`. The browser sends the matching
cookie to Vite, and the proxy forwards it to the API. This example keeps `/api`
in the upstream path; adjust the proxy if your API uses a different route.
The backend must accept authentication through that cookie—the plugin does not
convert it into an `Authorization` header.

See [Vite's proxy configuration](https://vite.dev/config/server-options#server-proxy)
for other routing requirements. A direct request to another host is subject to
browser cookie, credentials, and CORS rules; changing `sameSite` alone does not
make a host-only cookie available to another host.

## Form field names

Use `formFields` to rename either credential field without writing a strategy:

```ts
viteAPIAutoLogin({
  formFields: { username: 'email' },
})
```

The default names are `username` and `password`. For example,
`formFields: { username: 'login', password: 'passcode' }` changes both.
Values still come from `API_AUTO_LOGIN_USERNAME` and `API_AUTO_LOGIN_PASSWORD`;
only the outgoing form field names change. Names must be non-empty and distinct.
The `User-Agent` header is unaffected.

Use `formFields` only with the default request; it cannot be combined with a custom
`request`. The exported `createFormDataRequest(config, fields)` function returns
a request callback for consumers who want to compose the default behavior.

## Custom login requests

Pass a function that receives the parsed configuration and returns the URL and
Undici fetch options. It can return a promise. Create a fresh request body each
time the callback runs:

```ts
import { defineConfig } from 'vite'
import { viteAPIAutoLogin } from '@corespec/vite-plugin-api-auto-login'

export default defineConfig({
  plugins: [
    viteAPIAutoLogin({
      request: (config) => {
        if (!config.loginUrl || !config.username || !config.password) {
          throw new Error('JSON login requires an endpoint, username, and password')
        }
        return {
          url: config.loginUrl,
          init: {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              email: config.username,
              password: config.password,
            }),
          },
        }
      },
    }),
  ],
})
```

The callback runs lazily when a login is needed. Concurrent requests share one
login through RxJS, and each Vite server has its own token cache. JWTs are reused
until their `exp` timestamp; opaque tokens and tokens without readable expiry are
not cached between completed logins. Errors are logged and requests continue;
the next request can attempt authentication again. There are no automatic retries.

Custom callbacks validate their own requirements and may omit the default login
variables. Without a callback, the default sends a multipart POST with the mapped
username/password fields and a `User-Agent` header.

`init` supports Undici options including `signal` and `redirect`. The plugin
combines your signal with its lifecycle cancellation and manages `dispatcher`
through the TLS configuration. The response must be successful JSON containing
a non-empty `token` string.

## Cookie options

```ts
viteAPIAutoLogin({
  cookie: {
    path: '/api',
    sameSite: 'strict',
    secure: false,
    httpOnly: true,
  },
})
```

Defaults preserve the original behavior: `path: '/'`, `sameSite: 'lax'`,
`secure: false`, and `httpOnly: false`. `sameSite` accepts `lax`, `strict`, or
`none`; `none` requires `secure: true`. Enable `httpOnly` when your frontend does
not need JavaScript access to the cookie. `secure` cookies require HTTPS in the
normal browser cookie model.

The name still comes from `API_AUTO_LOGIN_COOKIE_NAME`. Cookie `path` controls
where the browser sends the cookie, not which page requests trigger login.
Cookies are serialized with `cookie` and appended without replacing existing
`Set-Cookie` headers. Disconnected responses unsubscribe without continuing the
middleware chain. When the last waiting response disconnects, the login is aborted;
a later request starts a fresh login. Vite shutdown also cancels pending authentication.

## Environment variables

Define these variables in your Vite environment files, such as `.env.local`, `.env.development`, or another file in `envDir` that Vite loads for the current mode.

Required by the default form-data request only:

| Variable                   | Description                                                                                  |
| -------------------------- | -------------------------------------------------------------------------------------------- |
| `API_AUTO_LOGIN_LOGIN_URL` | Login endpoint URL used to request an authentication token.                                  |
| `API_AUTO_LOGIN_USERNAME`  | Account username sent to the login endpoint; may be an email address if the API supports it. |
| `API_AUTO_LOGIN_PASSWORD`  | Account password sent to the login endpoint.                                                 |

Optional variables:

| Variable                            | Default           | Description                                                                   |
| ----------------------------------- | ----------------- | ----------------------------------------------------------------------------- |
| `API_AUTO_LOGIN_COOKIE_NAME`        | `your_token_name` | Name of the cookie added to the response with the authentication token.       |
| `API_AUTO_LOGIN_USER_AGENT`         | `vite`            | Value sent in the login request's `User-Agent` HTTP header.                   |
| `API_AUTO_LOGIN_ALLOW_INSECURE_TLS` | `false`           | Set to `true` to disable TLS certificate verification for the login endpoint. |

Vite loads generic and mode-specific environment files. Mode-specific values take
precedence over generic values; existing process environment values take precedence
over files. Restart Vite after changes. See [Vite's environment guide](https://vite.dev/guide/env-and-mode#env-files).

## Public API

| Export                                   | Purpose                                                            |
| ---------------------------------------- | ------------------------------------------------------------------ |
| `viteAPIAutoLogin(options?)`             | Creates the Vite plugin.                                           |
| `loadPluginConfig(env)`                  | Converts an environment record into a frozen configuration object. |
| `createFormDataRequest(config, fields?)` | Validates default login settings and returns a request callback.   |
| `AutoLoginOptions`                       | Plugin options: `request`, `formFields`, and `cookie`.             |
| `AuthRequest`, `AuthRequestOptions`      | Request callback and its `{ url, init }` result.                   |
| `PluginEnv`                              | Parsed server-side settings passed to the request callback.        |
| `FormFieldNames`, `AuthCookieOptions`    | Reusable form-field and cookie option types.                       |

The default request requires `loginUrl`, `username`, and `password`. They remain
optional in `PluginEnv` so custom callbacks can use other authentication schemes.
`loadPluginConfig` parses settings; it does not validate custom authentication requirements.

## Troubleshooting

| Symptom                                                    | Check                                                                                                                                                                          |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Missing required environment variables                     | Place the env file in Vite's `envDir`, use the active mode, and restart Vite. The default request requires all three login variables.                                          |
| Login returns 400 or 401                                   | Check credentials and whether the endpoint expects multipart or JSON. Use `formFields` for renamed multipart fields, or `request` for a different format.                      |
| Login response did not include a token                     | Return a non-empty string in the top-level JSON `token` property. Nested tokens and upstream `Set-Cookie` headers are not extracted.                                           |
| No login request in browser DevTools                       | Login runs on the Node.js server. Inspect the HTML response cookie and Vite terminal instead.                                                                                  |
| Page loads but no cookie appears                           | Check terminal errors and browser blocked-cookie reasons. Authentication failures are logged without blocking the page.                                                        |
| Cookie exists but API returns 401                          | Verify the cookie name and path, and that requests use the Vite proxy. The backend must accept cookie authentication.                                                          |
| Cookie is missing from `document.cookie`                   | `httpOnly: true` intentionally hides it from JavaScript. Inspect browser cookie storage instead.                                                                               |
| `sameSite: 'none'` is rejected                             | Set `secure: true` and use a suitable HTTPS development setup.                                                                                                                 |
| Self-signed API certificate fails                          | Prefer trusting the development certificate. The opt-in `API_AUTO_LOGIN_ALLOW_INSECURE_TLS=true` disables verification for this plugin's login fetch only, not the Vite proxy. |
| Clearing the browser cookie does not trigger another login | Reload the page to receive a cookie again. The server reuses a valid cached JWT until expiry.                                                                                  |
| Nothing happens in `vite preview`                          | Run the Vite development server; preview and production authentication are outside this plugin's scope.                                                                        |

## Vue + MSW demo

Try the plugin without external services or real credentials:

```bash
git clone https://github.com/core-spec-tech/vite-plugin-api-auto-login.git
cd vite-plugin-api-auto-login
nvm install
nvm use
npm ci
npm run example
```

Open [http://127.0.0.1:5173](http://127.0.0.1:5173). The launcher builds the library
and starts the Vue app and mock API. Stop both with Ctrl+C.
See the [demo walkthrough](https://github.com/core-spec-tech/vite-plugin-api-auto-login/blob/main/examples/vue-msw/README.md)
for the cookie controls and expected responses.

## Contributing and releases

See [CONTRIBUTING.md](https://github.com/core-spec-tech/vite-plugin-api-auto-login/blob/main/CONTRIBUTING.md)
for local development, code conventions, security checks, linking, and npm releases.
See [CHANGELOG.md](https://github.com/core-spec-tech/vite-plugin-api-auto-login/blob/main/CHANGELOG.md)
for release notes.
