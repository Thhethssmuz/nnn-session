# nnn-session

## Setup

```javascript
var Server  = require('nnn');
var Cookies = require('cookies');
var Session = require('nnn-session');

var server = new Server({ ... });

server.on('cookies', Cookies.express(keys));
server.on('session', ['cookies'], Session.middlevare());
```

Bind the session middleware to the server. nnn-session assumes that the `cookies` library is used to parse cookies. It is therefore recommended that the cookies middleware be a middleware dependency in nnn.

## Guest sessions

Guest sessions are not spawned by default. To create guest sessions you may create a separate middleware to spawn these sessions.

```javascript
server.on('guest-session', ['session'], function (req, res, callback) {
  if (!req.session)
    req.session = new Session(req, res, {user: 'guest'});
  callback();
});
```

## Server.middleware([options])

Creates a session middleware configured with the given options.

### name

The name of the session cookie

### rolling

Resets the maxAge of the session cookie on every request.

### cookie

Options for the session cookie. These options are passed to the `cookies` middleware when creating the session cookie. See the [cookies](https://www.npmjs.com/package/cookies) package for the full list of options.

### genuid

A function to generate session ids.

### store

The session store is an object supporting the following functions:

#### Store.get(sid, callback)
#### Store.set(session, callback)
#### Store.del(session, callback)

## API

### Session.touch()

Forces the session cookie to updated resetting the cookie's expiration. If `rolling` sessions are enabled then this method is called on every request and needs not be called manually.

### Session.save()

Forces the session to be saved even if the session has not been modified.

### Session.destroy()

Deletes the current session. Setting the session to `null` or using `delete` on it will also delete the session.

## Example

```javascript
server.post('/login?user&pw', ['cookies'], function (req, res, user, pw) {
  db.authenticate(user, pw, function (err, data) {
    if (err)
      return server.raise('500', req, res, err);

    if (!data.authenticated)
      return server.raise('401', req, res);

    req.session = new Session(req, res, {user: data.user});
    res.end('welcome ' + req.session.user);
  });
});

server.get('/logout', ['session'], function (req, res) {
  if (req.session)
    delete req.session;
  req.end('you have logged out');  
});
```



