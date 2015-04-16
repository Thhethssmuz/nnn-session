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
  res.end = function () {
    var args = arguments;

    if (this._is_destroyed_)
      return end.apply(res, args);

    if (!req.session || req.session.id !== this.id)
      return this.destroy(function () { end.apply(res, args); });

    if (Session.cfg.rolling)
      this.touch();

    if (!(_opts && _opts.load) || this.hash !== hash(this))
      return this.save(function () { end.apply(res, args); });

    end.apply(res, args);
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
  if (!this.req.session || this.req.session.id === this.id)
    this.res.cookies.set(Session.cfg.name, '', Session.cfg.cookie);

  if (this.req.session === this)
    this.req.session = null;

  this._is_destroyed_ = true;

  Session.cfg.store.del(this, callback || function () {});
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
