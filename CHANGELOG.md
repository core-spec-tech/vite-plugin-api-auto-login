# Changelog

## 0.2.0 (2026-11-08)

### Breaking changes

- Replace request objects and `createAuthRequest` factories with a synchronous or asynchronous `request(config)` callback.
- Replace `PluginConfig.fromEnv` with `loadPluginConfig` and `FormDataAuthRequest` with `createFormDataRequest`.
- Remove the `AuthRequestFactory` type; `AuthRequest` is now a function type.

### Features

- Coordinate concurrent authentication through a shared RxJS pipeline with per-server JWT caching.
- Add configurable cookie `path`, `sameSite`, `secure`, and `httpOnly` attributes.
- Serialize cookies using `cookie` and preserve existing response cookies with Node's `appendHeader` API.

### Fixes

- Cancel authentication when its final waiting response disconnects or the Vite server shuts down.
- Recover after authentication failures and handle subscriptions created during a token emission.

## 0.1.0 (2026-11-06)

- Initial public release with configurable authentication requests and form field names.
