var log = require('logule').init(module).mute('info', 'error');
var Server  = require('nnn');
var Keygrip = require('keygrip')
var Cookies = require('cookies');
var Session = require(process.env.NNN_SESSION_COV ? '../lib-cov/session' : '../');
var request = require('request');

var host = 'http://localhost:8080';
var keys = new Keygrip(['secret2', 'secret1']);

var server = new Server({ http: 8080 });

server.on('cookies', Cookies.express(keys));
server.on('session', ['cookies'], Session.middleware({
  name: 'sid',
  owerwrite: false
}));

server.on('/', ['session'], function (req, res) {
  res.end(JSON.stringify(req.session));
});

server.on('/login?user', ['session'], function (req, res, user) {
  req.session = new Session(req, res, {user: user});
  res.end(JSON.stringify(req.session));
});

server.on('/logout', ['session'], function (req, res) {
  delete req.session;
  res.end(JSON.stringify(req.session));
});

server.on('500', function (req, res, err) {
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
    Object.keys(Session.cfg.store._mem_).forEach(function (key) {
      s[key] = Session.cfg.store._mem_[key].user;
      s.length += 1;
    });
    callback(err, res, c, s, j);
  });
};

module.exports.relogin = function (t) {
  get('/', function (err, res, sesh, store, jar) {

    t.strictEqual(res.statusCode, 200, 'response ok for "GET /"');

    t.strictEqual(sesh.id, undefined, 'no session generated');
    t.strictEqual(sesh.user, undefined, 'no user logged in');
    t.strictEqual(store.length, 0, 'session store empty');
    t.strictEqual(jar.sid, undefined, 'no cookies set');

    var parent = {sesh: sesh, store: store, jar: jar};
    get('/login?user=me', function (err, res, sesh, store, jar) {

      t.strictEqual(res.statusCode, 200, 'response ok for "GET /login?user=me"');

      t.ok(sesh.id, 'user logged in');
      t.strictEqual(sesh.user, 'me', 'user is me');
      t.strictEqual(store.length, 1, 'only 1 session was generated');
      t.ok(jar.sid, 'session cookie was set');
      t.ok(jar['sid.sig'], 'session signature was set');
      t.strictEqual(jar.sid, sesh.id, 'session cookie value correct');
      t.strictEqual(store[sesh.id], 'me', 'session saved to store');

      parent = {sesh: sesh, store: store, jar: jar, parent: parent};
      get('/', function (err, res, sesh, store, jar) {

        t.strictEqual(res.statusCode, 200, 'response ok for "GET /"');

        t.strictEqual(sesh.id, parent.sesh.id, 'session persists');
        t.strictEqual(sesh.user, parent.sesh.user, 'user is still me');
        t.deepEqual(store, parent.store, 'store remains unchanged');
        t.deepEqual(jar, parent.jar, 'cookies remains unchanged');

        parent = {sesh: sesh, store: store, jar: jar, parent: parent};
        get('/login?user=you', function (err, res, sesh, store, jar) {

          t.strictEqual(res.statusCode, 200, 'response ok for "GET /login?user=you"');

          t.notStrictEqual(sesh.id, parent.sesh.id, 'new session id generated');
          t.strictEqual(typeof sesh.id, 'string', 'new session is not undefined');
          t.strictEqual(sesh.user, 'you', 'user is you');
          t.strictEqual(store[sesh.id], 'you', 'new session was saved to store');
          t.strictEqual(store[parent.sesh.id], undefined, 'previous session destroyed');
          t.strictEqual(store.length, 1, 'session store contains only current session');
          t.strictEqual(jar.sid, sesh.id, 'session cookie value correct');
          t.notStrictEqual(jar['sid.sig'], parent.jar['sid.sig'], 'new session signature generated');
          t.strictEqual(typeof jar['sid.sig'], 'string', 'new session signature is not undefined');

          parent = {sesh: sesh, store: store, jar: jar, parent: parent};
          get('/logout', function (err, res, sesh, store, jar) {

            t.strictEqual(res.statusCode, 200, 'response ok for "GET logout"');

            t.strictEqual(sesh.id, undefined, 'session destroyed');
            t.strictEqual(sesh.user, undefined, 'you have logged out');
            t.strictEqual(jar.sid, undefined, 'session cookie destroyed');
            t.strictEqual(jar['sid.sig'], undefined, 'session signature destroyed');
            t.strictEqual(store.length, 0, 'store is empty');

            t.expect(34);
            t.done();

            server.stop();

          });
        });
      });
    });
  });
};
