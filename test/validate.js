var log = require('logule').init(module).mute('info', 'error');
var Server  = require('nnn');
var Keygrip = require('keygrip')
var Cookies = require('cookies');
var Session = require(process.env.NNN_SESSION_COV ? '../lib-cov/session' : '../');
var request = require('request');

var host = 'http://localhost:8081';
var keys = new Keygrip(['secret2', 'secret1']);

var server = new Server({ http: 8081 });

server.on('cookies', Cookies.express(keys));

var myMemoryStore = {};

server.on('session', ['cookies'], Session.middleware({
  name: 'sid',
  store: {
    get: function (sid, callback) {
      setTimeout(function () {
        callback(myMemoryStore[sid]);
      }, 1);
    },
    set: function (session, callback) {
      setTimeout(function () {
        myMemoryStore[session.id] = {
          id: session.id,
          user: session.user,
          verified: session.verified
        };
        callback();
      }, 1);
    },
    del: function (session, callback) {
      setTimeout(function () {
        delete myMemoryStore[session.id];
        callback();
      }, 1);
    }
  }
}));

server.on('session-verified', ['session'], function (req, res, callback) {
  if (req.session && !req.session.verified)
    return req.session.destroy(callback);
  callback();
});

server.on('require-session', ['session-verified'], function (req, res, callback) {
  if (!req.session)
    return server.raise('401', req, res);
  callback();
});

server.on('/', ['session-verified'], function (req, res) {
  res.end(JSON.stringify(req.session));
});
server.on('/admin', ['require-session'], function (req, res) {
  res.end(JSON.stringify(req.session));
});

server.on('/login?user', ['session-verified'], function (req, res, user) {
  req.session = new Session(req, res, {user: user, verified: false});
  res.end(JSON.stringify(req.session));
});
server.on('/verify?user', ['session'], function (req, res, user) {
  if (!req.session || req.session.verified || user !== req.session.user)
    return server.raise('404', req, res);
  req.session.verified = true;
  res.end(JSON.stringify(req.session));
});

server.on('/logout', ['session-verified'], function (req, res) {
  if (req.session) return req.session.destroy(function () {
    res.end(JSON.stringify(req.session));
  });
  res.end(JSON.stringify(req.session));
});

server.on('401', ['session'], function (req, res) {
  res.statusCode = 401;
  res.end(JSON.stringify(req.session));
});
server.on('500', function (req, res, err) {
  if (res.loop)
    return;
  res.loop = true;
  throw err;
});

server.start();

//-----------------------------------------------------------------------------

var cookieJar = request.jar();
var get = function (url, callback) {
  request.get({url: host + url, jar: cookieJar}, function (err, res, body) {
    var j = {};
    cookieJar.getCookies(host).map(function (x) { j[x.key] = x.value; });
    var c = {};
    try { c = JSON.parse(body); } catch (err) {}
    var s = { length: 0 };
    Object.keys(myMemoryStore).forEach(function (key) {
      s[key] = myMemoryStore[key];
      s.length += 1;
    });
    callback(err, res, c, s, j);
  });
};

module.exports.verification = function (t) {
  get('/login?user=me', function (err, res, sesh, store, jar) {

    t.strictEqual(res.statusCode, 200, 'response ok for "GET /login?user=me"');
    t.strictEqual(sesh.user, 'me', 'login successful');
    t.ok(!sesh.verified, 'session not verified');
    t.ok(!store[sesh.id].verified, 'session store correct');

    var parent = {sesh: sesh, store: store, jar: jar};
    get('/verify?user=you', function (err, res, sesh, store, jar) {

      t.strictEqual(res.statusCode, 404, 'request denied with for "GET /verify?user=you"');
      t.strictEqual(jar.sid, parent.sesh.id, 'unverified session remains intact');
      t.ok(!store[parent.sesh.id].verified, 'session is still unverified in store');

      parent = {sesh: sesh, store: store, jar: jar};
      get('/verify?user=me', function (err, res, sesh, store, jar) {


        t.strictEqual(res.statusCode, 200, 'request ok "GET /verify?user=me"');
        t.ok(sesh.verified, 'session verified');
        t.ok(store[sesh.id].verified, 'session is verified in store');

        parent = {sesh: sesh, store: store, jar: jar};
        get('/admin', function (err, res, sesh, store, jar) {

          t.strictEqual(res.statusCode, 200, 'request ok "GET /admin');
          t.strictEqual(sesh.user, 'me', 'user me logged in');

          parent = {sesh: sesh, store: store, jar: jar};
          get('/logout', function (err, res, sesh, store, jar) {

            t.strictEqual(res.statusCode, 200, 'request ok "GET /logout');
            t.ok(!sesh, 'user logged out');
            t.ok(!store[parent.sesh.id], 'session destroyed');
            t.ok(!jar.sid, 'cookies destroyed');

            t.expect(16);
            t.done();

          });
        });
      });
    });
  });
};

module.exports.unverified = function (t) {
  get('/login?user=me', function (err, res, sesh, store, jar) {

    t.strictEqual(res.statusCode, 200, 'response ok for "GET /login?user=me"');
    t.strictEqual(sesh.user, 'me', 'login successful');
    t.ok(!sesh.verified, 'session not verified');
    t.ok(!store[sesh.id].verified, 'session store correct');

    var parent = {sesh: sesh, store: store, jar: jar};
    get('/', function (err, res, sesh, store, jar) {

      t.strictEqual(res.statusCode, 200, 'request ok session for "GET /"');
      t.ok(!sesh, 'unverified session is destroyed');
      t.ok(!store[parent.sesh.id], 'unverified session was deleted');
      t.ok(!jar.sid, 'cookies deleted');

      t.expect(8);
      t.done();

    });
  });
};

module.exports.unverified2 = function (t) {
  get('/login?user=me', function (err, res, sesh, store, jar) {

    t.strictEqual(res.statusCode, 200, 'response ok for "GET /login?user=me"');
    t.strictEqual(sesh.user, 'me', 'login successful');
    t.ok(!sesh.verified, 'session not verified');
    t.ok(!store[sesh.id].verified, 'session store correct');

    var parent = {sesh: sesh, store: store, jar: jar};
    get('/admin', function (err, res, sesh, store, jar) {

      t.strictEqual(res.statusCode, 401, 'request denied with unverified session for "GET /admin"');
      t.ok(!sesh, 'unverified session is destroyed');
      t.ok(!store[parent.sesh.id], 'session unverified session was deleted');
      t.ok(!jar.sid, 'cookies destroyed');

      t.expect(8);
      t.done();

      server.stop();

    });
  });
};
