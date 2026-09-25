# Interview notes

Be ready to explain the decisions in your own words and point to the relevant code.

### Why hash passwords?

The database should not contain passwords that can be read directly. The API
uses Argon2 to hash a password during registration and compares the hash at login.

### Why use JWTs?

After login, the API signs a short lived token. A protected request sends it in
the `Authorization` header, and the JWT strategy loads the user before the
request reaches the controller.

### How do wallet routes check ownership?

The wallet owner guard loads the wallet and compares its `userId` with the
authenticated user's ID. This prevents one user from changing another user's
wallet by guessing its ID.

### Why use database transactions for transfers?

A transfer changes two balances and writes transaction records. Keeping the
changes in one database transaction means either all of them commit or none do.
Wallet row locks keep simultaneous requests from spending the same balance.

### Why store cents as integers?

Binary floating point cannot represent every decimal amount exactly. Storing
integer cents keeps additions and comparisons predictable.

### How could the project grow later?

Refresh tokens could support longer sessions, Redis could support rate limits
across multiple API instances, and an audit log could record security events.
Those are follow-up improvements rather than prerequisites for understanding
the core API.
