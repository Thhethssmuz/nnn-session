var uid = require('uid-safe');
var url = require('url');
var crc = require('buffer-crc32');

var hash = function (session) {
  return crc.signed(JSON.stringify(session));
};

var merge = function (from, to) {
  for (var k in from)
    if (from.hasOwnProperty(k))
      to[k] = from[k];
  return to;
};


var Session = function (req, res, session, _opts) {
  Object.defineProperty(this, 'req', { value: req });
  Object.defineProperty(this, 'res', { value: res });

  this.id = session.id || Session.cfg.genuid(32);

  if (typeof session === 'object')
    merge(session, this);

  Object.defineProperty(this, 'hash', { value: hash(this) });

  var end = res.end;
  var ended = false;
  res.end = function(chunk, encoding){
    if (ended)
      return false;

    var ret;
    var sync = true;

    if (chunk === undefined)
      chunk = '';

    ended = true;

    if (!req.session) {
      this.destroy(function () {
        if (sync) {
          ret = end.call(res, chunk, encoding);
          sync = false;
          return;
        }

        end.call(res);
      });

      if (sync) {
        ret = res.write(chunk, encoding);
        sync = false;
      }

      return ret;
    }

    if (Session.cfg.rolling)
      this.touch();

    if (!(_opts && _opts.load) || this.hash !== hash(this)) {
      this.save(function () {
        if (sync) {
          ret = end.call(res, chunk, encoding);
          sync = false;
          return;
        }

        end.call(res);
      });

      if (sync) {
        ret = res.write(chunk, encoding);
        sync = false;
      }

      return ret;
    }

    return end.call(res, chunk, encoding);
  }.bind(this);

  if (!(_opts && _opts.load))
    this.touch();

  return this;
};


Session.prototype.touch = function () {
  this.res.cookies.set(Session.cfg.name, this.id, Session.cfg.cookie);
  return this;
};
Session.prototype.save = function (callback) {
  Session.cfg.store.set(this, callback || function () {});
  return this;
};
Session.prototype.destroy = function (callback) {
  this.res.cookies.set(Session.cfg.name);
  Session.cfg.store.del(this, callback || function () {});
};


Session.cfg = {
  name   : 'session',
  rolling: false,
  cookie : {},

  genuid: function () { return uid.sync(32); },

  store: {
    _mem_: {},

    get: function (sid, callback) {
      callback(Session.cfg.store._mem_[sid]);
    },

    set: function (session, callback) {
      Session.cfg.store._mem_[session.id] = merge(session, {});
      callback();
    },

    del: function (session, callback) {
      delete Session.cfg.store._mem_[session.id];
      callback();
    }
  }
};


Session.middleware = function (cfg) {

  if (cfg)
    Session.cfg = merge(cfg, Session.cfg);

  return function (req, res, callback) {

    if (url.parse(req.url).pathname.indexOf(Session.cfg.cookie.path || '/') !== 0)
      return callback();

    var sid = req.cookies.get(Session.cfg.name, {signed: Session.cfg.cookie.signed});

    if (!sid)
      return callback();

    Session.cfg.store.get(sid, function (session) {
      if (!session)
        return callback();

      req.session = new Session(req, res, session, { load: true });

      if (Session.cfg.rolling)
        res.cookies.set(Session.cfg.name, session.sid, Session.cfg.cookie);

      return callback();
    });
  };
};

module.exports = Session;
