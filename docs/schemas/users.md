# Users Schema

## Layout

 - `main`
   - `accounts`: Map of `id => Account object`.
   - `accounts-index`: Index of `username => id`, `email => id`, `profileUrl => id`.

## Account object

Schema:

```
{
  id: String, the assigned uuid
  username: String, the chosen username
  passwordHash: String, hashed password
  passwordSalt: String, salt used on hashed password

  email: String
  profileURL: String, the url of the profile dat
  archives: [{
    key: String, uploaded archive's key
    name: String, optional shortname for the archive
  }, ..]
  scopes: Array(String), the user's access scopes
  updatedAt: Number, the timestamp of the last update
  createdAt: Number, the timestamp of creation time
  
  isEmailVerified: Boolean
  emailVerifyNonce: String, the random verification nonce

  isProfileDatVerified: Boolean
  profileVerifyToken: String, the profile verification token (stored so the user can refetch it)
}
```