# Phase 1D-7B: Shopee OAuth Connection

## 1. Overview
This phase implements the OAuth 2.0 flow to connect a Fujitech Company account to a Shopee Shop. 
The implementation uses a secure, single-use, cryptographically random `state` parameter bound to the company, preventing CSRF attacks and Cross-Tenant Account mapping.

## 2. Endpoints
### `GET /api/live-sessions/platforms/shopee/connect/`
- **Auth:** Requires User Authentication (JWT/Session).
- **Behavior:** 
  1. Generates a random UUID `state`.
  2. Stores `state -> company_id` mapping in Redis with a 10-minute TTL.
  3. Generates the Shopee OpenAPI v2 HMAC-SHA256 signature using `SHOPEE_PARTNER_KEY` and `SHOPEE_PARTNER_ID`.
  4. Returns the signed Shopee authorization URL (which redirects back to our callback with the `state`).

### `GET /api/live-sessions/platforms/shopee/callback/`
- **Auth:** Public endpoint (relies on `state` parameter for security).
- **Behavior:**
  1. Receives `code`, `shop_id`, and `state`.
  2. Looks up `state` in Redis to retrieve `company_id`.
  3. If invalid or missing state, redirects to frontend with error `invalid_state`.
  4. Deletes the state from Redis (single-use constraint).
  5. Exchanges the `code` for `access_token` and `refresh_token` by making a signed POST request to Shopee's token endpoint.
  6. Creates or updates a `PlatformAccount` for the specific `company_id` and `shop_id`.
  7. Leverages the security mechanism from Phase 1D-7A to encrypt the tokens at rest.
  8. Redirects to the frontend settings page with a `success=1` parameter.

## 3. Security Considerations
- **State Security:** The `state` parameter is cryptographically random and stored in server-side Redis. It cannot be forged or reused.
- **Tenant Isolation:** The `company_id` retrieved from the validated `state` is strictly used when creating the `PlatformAccount`. A user from Company A cannot connect a shop to Company B.
- **Token Lifecycle:** The tokens returned by Shopee are never passed to the frontend. They are immediately encrypted using Fernet before being written to the database.

## 4. PlatformAccount Mapping
- `company` -> Sourced from the validated OAuth state.
- `platform` -> Hardcoded to `LivePlatformProduct.PLATFORM_SHOPEE`.
- `account_id` -> The `shop_id` returned by Shopee.
- `display_name` -> "Shopee Shop {shop_id}".

## 5. Error Handling
Errors are safely propagated to the frontend via URL parameters on the redirect, avoiding exposure of sensitive credentials or full API traces:
- `invalid_callback`: Missing required parameters.
- `invalid_state`: State validation failed (tampered, expired, or reused).
- `exchange_failed`: Network error while contacting Shopee.
- `api_error`: Shopee API returned an error response.
- `invalid_response`: Shopee API returned a 200 OK but was missing the expected token fields.

## 6. Testing
Tests for this flow mock the `SHOPEE_PARTNER_ID` and `SHOPEE_PARTNER_KEY` to prevent live credential usage. The `requests.post` call to Shopee's token endpoint is intercepted and mocked to return a fake valid response, allowing full assertion of the Database saving behavior and encryption integration.

## 7. Production Configuration
Requires the following environment variables:
- `SHOPEE_PARTNER_ID`
- `SHOPEE_PARTNER_KEY`
- `SHOPEE_API_HOST` (e.g., `https://partner.shopeemobile.com` for production, default is sandbox)
- `FRONTEND_URL` (e.g., `https://fujitech.ai` for the redirect destination)
