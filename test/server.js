var log = require('logule').init(module).mute('info', 'error');
var Server  = require('nnn');
var Keygrip = require('keygrip')
var Cookies = require('cookies');
var Session = require(process.env.NNN_SESSION_COV ? '../lib-cov/session' : '../');
var request = require('request');

var host = 'http://localhost:8080';
var keys = new Keygrip(['secret2', 'secret1']);

var server  = new Server({ http: 8080 });

server.on('cookies', Cookies.express(keys));
server.on('session', ['cookies'], Session.middleware({
  name: 'sid'
}));

server.on('/', ['session'], function (req, res) {
  res.end(JSON.stringify({session: req.session}));
});
server.on('/login', ['session'], function (req, res) {
  req.session = new Session(req, res, {user: 'user1'});
  res.end(JSON.stringify({session: req.session}));
});
server.on('/logout', ['session'], function (req, res) {
  delete req.session;
  res.end(JSON.stringify({session: req.session}));
});

server.start();

//-----------------------------------------------------------------------------

module.exports.nosession = function (t) {
  request.get({ url: host+'/' }, function (err, res, body) {
    var r = JSON.parse(body);
    t.strictEqual(res.headers['set-cookie'], undefined, 'no cookies created');
    t.strictEqual(r.session, undefined, 'not logged inn');
    t.done();
  });
};

var jar1 = request.jar();
module.exports.login = function (t) {
  request.get({ url: host+'/login', jar: jar1 }, function (err, res, body) {
    var r = JSON.parse(body);

    t.strictEqual(res.headers['set-cookie'].length, 2, 'cookies pair returned');

    res.headers['set-cookie'].forEach(function (cookie) {
      var parts = cookie.split(';');
      jar1.setCookie(parts[0], parts[1].split('=')[1]);
    });

    request.get({ url: host+'/', jar: jar1 }, function (err, res, body) {
      var r = JSON.parse(body);
      t.ok(r.session, 'session validates');
      t.strictEqual(r.session.user, 'user1', 'logged inn as user1');
      t.strictEqual(res.headers['set-cookie'], undefined, 'no new cookies');

      request.get( {url: host+'/logout', jar: jar1 }, function (err, res, body) {
        var r = JSON.parse(body);
        t.strictEqual(res.headers['set-cookie'].length, 1, 'expiry cookie set');
        t.ok(!r.session, 'session deleted');
        t.done();

        server.stop();
      });
    });
  });
};
