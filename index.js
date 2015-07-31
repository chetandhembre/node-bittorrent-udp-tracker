module.exports = UDPTracker

var dgram = require('dgram')
var url = require('url')
var EventEmitter = require('events').EventEmitter

var hat = require('hat')
var toUInt64 = require('to-unsigned-int64')
var toUInt32Sync = require('to-unsigned-int32').toUInt32Sync
var fromUInt32Sync = require('from-unsigned-int32').fromUInt32Sync
var compact2string = require('compact2string')
var inherits = require('inherits')
var bufferEqual = require('buffer-equal')
inherits(UDPTracker, EventEmitter)

var eventMap = {
  0: toUInt32Sync(0),
  1: toUInt32Sync(1),
  2: toUInt32Sync(2),
  3: toUInt32Sync(3)
}

/*
things are remaining
1. handle announce intervals (done)
2. add emitter (done)
3. handle destory api (done)
4. test module
5. readme
*/

/**
info Hash
peerId
downloaded
uploaded
left
event
ip_address
key
num_want
port
announce_url
**/
function UDPTracker (peerId, infoHash, announceUrl, opts) {
  var self = this
  EventEmitter.call(self)

  self.infoHash = Buffer.isBuffer(infoHash) ?
          infoHash : new Buffer(infoHash, 'hex')

  self.peerId = Buffer.isBuffer(peerId) ?
                peerId : new Buffer(peerId)

  self.announceUrl = announceUrl
  self.opts = opts || {}

  self.port = self.opts['port'] ? toUInt16(self.opts['port']) : toUInt16(0)
  self._timeout = self.opts['_timeout'] || 15000
  self._in_interval = false
  self._last_opts = null
  self.destoryed = false
  self._announce_intervals_timeout = []
}

/*
opts must
*/
UDPTracker.prototype.announce = function (event, opts) {
  var self = this
  self._last_opts = opts || {}
  self._last_opts['event'] = event
  if (!self._in_interval) {
    _request.bind(self, self._last_opts['event'], self._last_opts)()
  } else {
    return self.emit('error', 'not calling announce')
  }
}

UDPTracker.prototype.destory = function () {
  var self = this
  self.destoryed = true
  _destory(self)
  return
}

function _cleanSocket (socket) {
  if (!socket) {
    return null
  }

  socket.removeListener('error', console.error)
  socket.removeListener('message', console.log)
  socket.on('error', console.error)

  try {
    socket.close()
  } catch (e) {}

  return null
}

function _clearTimmer (udpTimmers) {
  if (udpTimmers) {
    for (var i = 0; i < udpTimmers.length; i++) {
      clearTimeout(udpTimmers[i])
    }
  }

  return []
}

function _destory (self) {
  self._announce_intervals_timeout.forEach(function (timmer) {
    clearTimeout(timmer)
  })
  self._announce_intervals_timeout = []
  self._udpTimmers = _clearTimmer(self._udpTimmers)
  self._socket = _cleanSocket(self._socket)
}

function _request (event, opts) {
  var self = this

  if (self.destoryed) {
    return
  }

  event = eventMap[event]
  if (!event) {
    self.emit('error', 'unknown event')
  }

  _destory(self)
  self._socket = dgram.createSocket('udp4')
  self._socket.on('message', onMessage)
  self._socket.on('error', console.error)
  self._udpTimmers = []

  var connectionId = Buffer.concat([ toUInt32Sync(0x417), toUInt32Sync(0x27101980) ])
  var transactionId = getTransactionId()

  var parsedAnnounceUrl = url.parse(self.announceUrl)

  // make connect request
  makeConnectRequest()

  // schedule next connect request base on timeout specification
  timmer(makeConnectRequest, 'connect')()

  function onMessage (msg) {
    if (self.destoryed) {
      return
    }

    var action = fromUInt32Sync(msg, 0)
    _clearTimmer(self._udpTimmers)
    switch (action) {
      case 0 :
        if (!handleConnectResponce(msg)) {
          _destory(self)
          return
        }
        makeAnnounceRequest()
        // schedule next announce call
        timmer(makeAnnounceRequest, 'announce')()
        break

      case 1 :
        _destory(self)
        handleAnnounceResponse(msg)
        break

      case 3 :
        _destory(self)
        return onAnnounceError(msg)

      default :
        _destory(self)
        self.emit('error', 'unsupported event:' + action)
        return
    }

  }

  function onAnnounceError (msg) {

    if (msg.length <= 8) {
      self.emit('error', 'error action response is not 9 bytes long')
      return false
    }

    var _trasactionId = msg.slice(4, 8)
    if (!bufferEqual(transactionId, _trasactionId)) {
      self.emit('error', 'transactionId is not same as in connect request')
      return false
    }

    var err_message = msg.slice(8).toString()
    return self.emit('error', err_message)
  }

  function handleConnectResponce (msg) {
    if (msg.length !== 16) {
      self.emit('error', 'connect response is not 16 bytes long')
      return false
    }

    var _trasactionId = msg.slice(4, 8)
    if (!bufferEqual(transactionId, _trasactionId)) {
      self.emit('error', 'transactionId is not same as in connect request')
      return false
    }

    connectionId = msg.slice(8, 16)
    return true
  }

  function handleAnnounceResponse (msg) {

    if (msg.length < 20) {
      return self.emit('error', 'announce response should be 20 bytes')
    }

    var _trasactionId = msg.slice(4, 8)
    if (!bufferEqual(transactionId, _trasactionId)) {
      return self.emit('error', 'transactionId is not same as in announce request')
    }

    // interval is in seconds
    var interval = fromUInt32Sync(msg, 8)
    self._in_interval = true
    var intervalTimout = setTimeout(function () {
      self._in_interval = false
      return self.announce(self._last_opts['event'], self._last_opts)
    }, interval * 1000)

    if (intervalTimout.unref) {
      intervalTimout.unref()
    }

    self._announce_intervals_timeout.push(intervalTimout)
    self.emit('update', {
      leechers: fromUInt32Sync(msg, 12),
      seeds: fromUInt32Sync(msg, 16),
      peers: compact2string.multi(msg.slice(20))
    })
  }

  function makeConnectRequest () {
    var action = new Buffer(4)
    action.fill(0)
    var data = Buffer.concat([connectionId, toUInt32Sync(0), transactionId])
    _write(data, 0)
  }

  function makeAnnounceRequest () {
    var downloaded = opts['downloaded'] ? toUInt64(opts['downloaded']) : toUInt64(0)
    var left = opts['left'] ? toUInt64(opts['left']) : toUInt64(0)
    var uploaded = opts['uploaded'] ? toUInt64(opts['uploaded']) : toUInt64(0)
    transactionId = getTransactionId()
    var data = Buffer.concat([
      connectionId,
      toUInt32Sync(1),
      transactionId,
      self.infoHash,
      self.peerId,
      downloaded,
      left,
      uploaded,
      event,
      toUInt32Sync(0),
      toUInt32Sync(0),
      toUInt32Sync(50),
      self.port
    ])
    _write(data, 0)
  }

  function timmer (fn, message, timeout) {
    var n = 1
    var _timeout = timeout || incrementTimeout(n)
    _clearTimmer(self._udpTimmers)
    return function _timmer () {
      if (n >= 8) {
        _destory(self)
        return self.emit('error', 'tracker is not responding after:' + _timeout)
      }

      var udpTimmer = setTimeout(function () {
        n++
        _timeout = incrementTimeout(n)
        fn()
        _timmer()
      }, _timeout)

      self._udpTimmers.push(udpTimmer)

      if (udpTimmer.unref) {
        udpTimmer.unref()
      }

    }
  }

  function _write (data, offset) {
    if (self.destoryed) {
      return
    }
    parsedAnnounceUrl.port = parsedAnnounceUrl.port || 80
    self._socket.send(data, offset, data.length, parsedAnnounceUrl.port, parsedAnnounceUrl.hostname)
  }

  function incrementTimeout (time) {
    return self._timeout * (Math.pow(2, time))
  }
}

function getTransactionId () {
  return new Buffer(hat(32), 'hex')
}

function toUInt16 (n) {
  var buf = new Buffer(2)
  buf.writeUInt16BE(n, 0)
  return buf
}
