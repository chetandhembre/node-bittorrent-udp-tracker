var test = require('tap').test
var udpServer = require('./udp_server')
var UdpTracker = require('../')

var toUInt32Sync = require('to-unsigned-int32').toUInt32Sync
var fromUInt32Sync = require('from-unsigned-int32').fromUInt32Sync
var toUInt64 = require('to-unsigned-int64')
var string2compact = require('string2compact')
var hat = require('hat')

function getTransactionId () {
  return new Buffer(hat(32), 'hex')
}

var ipAddresses = [ '10.10.10.5:128', '100.56.58.99:28525', '10.10.10.6:128', '100.56.58.10:28525', '10.10.10.7:128', '100.56.58.101:28525']

var connectReqSchema = {
  'connectionId': 8,
  'action': 4,
  'transactionId': 4
}

var announceReqSchema = {
  'connectionId': 8,
  'action': 4,
  'transactionId': 4,
  'infoHash': 20,
  'peerId': 20,
  'downloaded': 8,
  'left': 8,
  'uploaded': 8,
  'event': 4,
  'ipAddress': 4,
  'key': 4,
  'numWat': 4,
  'port': 2
}

var verifyConnectRequest = function (t, connectReqObj) {
  for (var key in connectReqObj) {
    t.equal(connectReqObj[key].length, connectReqSchema[key])
  }
}

var verifyAnnounceRequest = function (t, announceReqObj) {
  for (var key in announceReqObj) {
    t.equal(announceReqObj[key].length, announceReqSchema[key])
  }
}

var parseConnectMessage = function (msg) {
  return {
    connectionId: msg.slice(0, 8),
    action: msg.slice(8, 12),
    transactionId: msg.slice(12, 16)
  }
}

var parseAnnounceMessage = function (msg) {
  return {
    connectionId: msg.slice(0, 8),
    action: msg.slice(8, 12),
    transactionId: msg.slice(12, 16),
    infoHash: msg.slice(16, 36),
    peerId: msg.slice(36, 56),
    downloaded: msg.slice(56, 64),
    left: msg.slice(64, 72),
    uploaded: msg.slice(72, 80),
    event: msg.slice(80, 84),
    ipAddress: msg.slice(84, 88),
    key: msg.slice(88, 92),
    numWat: msg.slice(92, 96),
    port: msg.slice(96, 98)
  }
}

var connectResponse = function (connectReqObj) {
  return Buffer.concat([
    connectReqObj['action'],
    connectReqObj['transactionId'],
    connectReqObj['connectionId']
  ])
}

var announceResponse = function (announceObj, interval) {
  return Buffer.concat([
    announceObj['action'],
    announceObj['transactionId'],
    toUInt32Sync(interval),
    toUInt32Sync(5),
    toUInt32Sync(7),
    string2compact(ipAddresses)
  ])
}

var errorEventResponse = function (connectReqObj) {
  return Buffer.concat([
    toUInt32Sync(3),
    connectReqObj['transactionId'],
    new Buffer('abcdefgh')
  ])
}

function removeTimmer (udpTracker) {
  udpTracker._announce_intervals_timeout.forEach(function (timmer) {
    clearTimeout(timmer)
  })
}

/*

What you want to test?
1. all things working fine is all good conditions (done)
2. timout for connection request (done)
3. timeout for announce request(done)
4. trasaction id should be checked (done)
5. connection/announce response format problems (done)
6. test error event (3)(done)
7. unsupported event (done)
8. check if intervals working fine for announce response
  a. if announce opts not changed (done)
  b. if announce opts changed(done)
9. destory event(done)
*/

test('should emmit correct emit message', function (t) {
  var announceUrl = udpServer.createServer(function (server, msg, remote) {
    t.type(msg, Buffer)
    var action = fromUInt32Sync(msg.slice(8, 12))
    var requestData
    var responseData
    switch (action) {
      case 0:
        t.equal(msg.length, 16)
        requestData = parseConnectMessage(msg)
        verifyConnectRequest(t, requestData)
        responseData = connectResponse(requestData)
        break

      case 1:
        t.equal(msg.length, 98)
        requestData = parseAnnounceMessage(msg)
        verifyAnnounceRequest(t, requestData)
        responseData = announceResponse(requestData, 5)
        break

      default:
        throw new Error('invalid action')
    }
    server.send(responseData, 0, responseData.length, remote.port, remote.address)
  })
  var udpTracker = new UdpTracker(new Buffer('01234567890123456789'), new Buffer('12345678901234567890'), announceUrl, {'port': 1234})
  udpTracker.announce(2, {
    downloaded: 0,
    left: 0,
    uploaded: 0
  })

  udpTracker.on('error', function (err) {
    throw new Error(err)
  })

  udpTracker.on('update', function (msg) {
    udpServer.destoryServer()
    removeTimmer(udpTracker)
    t.end()
  })

})

test('should resend timeout request for connect request', function (t) {
  var connects = 0
  var time = 0
  var timmer = setInterval(function () {
    time += 1
  }, 100)
  var times = []
  var announceUrl = udpServer.createServer(function (server, msg, remote) {
    t.type(msg, Buffer)
    var action = fromUInt32Sync(msg.slice(8, 12))
    var requestData
    var responseData
    switch (action) {
      case 0:
        t.equal(msg.length, 16)
        requestData = parseConnectMessage(msg)
        verifyConnectRequest(t, requestData)
        responseData = connectResponse(requestData)
        times.push(time)
        connects++
        break

      case 1:
        t.equal(msg.length, 98)
        requestData = parseAnnounceMessage(msg)
        verifyAnnounceRequest(t, requestData)
        responseData = announceResponse(requestData, 5)
        break

      default:
        throw new Error('invalid action')
    }

    if (action !== 0 || connects > 3) {
      server.send(responseData, 0, responseData.length, remote.port, remote.address)
    }

  })
  var udpTracker = new UdpTracker(new Buffer('01234567890123456789'),
    new Buffer('12345678901234567890'),
    announceUrl,
    {
      'port': 1234,
      '_timeout': 100
    }
  )

  udpTracker.announce(2, {
    downloaded: 0,
    left: 0,
    uploaded: 0
  })

  udpTracker.on('error', function (err) {
    throw new Error(err)
  })

  udpTracker.on('update', function (msg) {
    udpServer.destoryServer()
    removeTimmer(udpTracker)
    for (var i = 1; i < times.length; i++) {
      t.ok(times[i] + 1 >= times[i - 1] + Math.pow(2, i), 'timeout working fine for connet')
    }
    clearInterval(timmer)
    t.end()
  })

})

test('should resend timeout request for announce request', function (t) {
  var announces = 0
  var time = 0
  var timmer = setInterval(function () {
    time += 1
  }, 100)
  var times = []
  var announceUrl = udpServer.createServer(function (server, msg, remote) {
    t.type(msg, Buffer)
    var action = fromUInt32Sync(msg.slice(8, 12))
    var requestData
    var responseData
    switch (action) {
      case 0:
        t.equal(msg.length, 16)
        requestData = parseConnectMessage(msg)
        verifyConnectRequest(t, requestData)
        responseData = connectResponse(requestData)
        break

      case 1:
        t.equal(msg.length, 98)
        requestData = parseAnnounceMessage(msg)
        verifyAnnounceRequest(t, requestData)
        responseData = announceResponse(requestData, 5)
        times.push(time)
        announces++
        break

      default:
        throw new Error('invalid action')
    }

    if (action === 0 || announces > 3) {
      server.send(responseData, 0, responseData.length, remote.port, remote.address)
    }

  })

  var udpTracker = new UdpTracker(new Buffer('01234567890123456789'),
    new Buffer('12345678901234567890'),
    announceUrl,
    {
      'port': 1234,
      '_timeout': 100
    }
  )

  udpTracker.announce(2, {
    downloaded: 0,
    left: 0,
    uploaded: 0
  })

  udpTracker.on('error', function (err) {
    throw new Error(err)
  })

  udpTracker.on('update', function (msg) {
    udpServer.destoryServer()
    removeTimmer(udpTracker)
    for (var i = 1; i < times.length; i++) {
      t.ok(times[i] + 1 >= times[i - 1] + Math.pow(2, i), 'timeout working fine for connet')
    }
    clearInterval(timmer)
    t.end()
  })
})

test('should return error when transactionId does not match in response for connect', function (t) {
  var announceUrl = udpServer.createServer(function (server, msg, remote) {
    t.type(msg, Buffer)
    var action = fromUInt32Sync(msg.slice(8, 12))
    var requestData
    var responseData
    switch (action) {
      case 0:
        t.equal(msg.length, 16)
        requestData = parseConnectMessage(msg)
        verifyConnectRequest(t, requestData)
        requestData['transactionId'] = getTransactionId()
        responseData = connectResponse(requestData)
        break

      case 1:
        t.equal(msg.length, 98)
        requestData = parseAnnounceMessage(msg)
        verifyAnnounceRequest(t, requestData)
        responseData = announceResponse(requestData, 5)
        break

      default:
        throw new Error('invalid action')
    }
    server.send(responseData, 0, responseData.length, remote.port, remote.address)
  })
  var udpTracker = new UdpTracker(new Buffer('01234567890123456789'), new Buffer('12345678901234567890'), announceUrl, {'port': 1234})
  udpTracker.announce(2, {
    downloaded: 0,
    left: 0,
    uploaded: 0
  })

  udpTracker.on('error', function (err) {
    udpServer.destoryServer()
    removeTimmer(udpTracker)
    t.equal(err, 'transactionId is not same as in connect request')
    t.end()
  })

  udpTracker.on('update', function (msg) {
    throw new Error('should throw an error')
  })

})

test('should return error when transactionId does not match in response for announce', function (t) {
  var announceUrl = udpServer.createServer(function (server, msg, remote) {
    t.type(msg, Buffer)
    var action = fromUInt32Sync(msg.slice(8, 12))
    var requestData
    var responseData
    switch (action) {
      case 0:
        t.equal(msg.length, 16)
        requestData = parseConnectMessage(msg)
        verifyConnectRequest(t, requestData)
        responseData = connectResponse(requestData)
        break

      case 1:
        t.equal(msg.length, 98)
        requestData = parseAnnounceMessage(msg)
        verifyAnnounceRequest(t, requestData)
        requestData['transactionId'] = getTransactionId()
        responseData = announceResponse(requestData, 5)
        break

      default:
        throw new Error('invalid action')
    }
    server.send(responseData, 0, responseData.length, remote.port, remote.address)
  })
  var udpTracker = new UdpTracker(new Buffer('01234567890123456789'), new Buffer('12345678901234567890'), announceUrl, {'port': 1234})
  udpTracker.announce(2, {
    downloaded: 0,
    left: 0,
    uploaded: 0
  })

  udpTracker.on('error', function (err) {
    udpServer.destoryServer()
    t.equal(err, 'transactionId is not same as in announce request')
    removeTimmer(udpTracker)
    t.end()
  })

  udpTracker.on('update', function (msg) {
    throw new Error('should throw an error')
  })

})

test('should return error when response for connect is not require length', function (t) {
  var announceUrl = udpServer.createServer(function (server, msg, remote) {
    t.type(msg, Buffer)
    var action = fromUInt32Sync(msg.slice(8, 12))
    var requestData
    var responseData
    switch (action) {
      case 0:
        t.equal(msg.length, 16)
        requestData = parseConnectMessage(msg)
        verifyConnectRequest(t, requestData)
        responseData = connectResponse(requestData)
        responseData = responseData.slice(0, 12)
        break

      case 1:
        t.equal(msg.length, 98)
        requestData = parseAnnounceMessage(msg)
        verifyAnnounceRequest(t, requestData)
        requestData['transactionId'] = getTransactionId()
        responseData = announceResponse(requestData, 5)
        break

      default:
        throw new Error('invalid action')
    }
    server.send(responseData, 0, responseData.length, remote.port, remote.address)
  })
  var udpTracker = new UdpTracker(new Buffer('01234567890123456789'), new Buffer('12345678901234567890'), announceUrl, {'port': 1234})
  udpTracker.announce(2, {
    downloaded: 0,
    left: 0,
    uploaded: 0
  })

  udpTracker.on('error', function (err) {
    udpServer.destoryServer()
    removeTimmer(udpTracker)
    t.equal(err, 'connect response is not 16 bytes long')
    t.end()
  })

  udpTracker.on('update', function (msg) {
    throw new Error('should throw an error')
  })

})

test('should return error when response for announce is not require length', function (t) {
  var announceUrl = udpServer.createServer(function (server, msg, remote) {
    t.type(msg, Buffer)
    var action = fromUInt32Sync(msg.slice(8, 12))
    var requestData
    var responseData
    switch (action) {
      case 0:
        t.equal(msg.length, 16)
        requestData = parseConnectMessage(msg)
        verifyConnectRequest(t, requestData)
        responseData = connectResponse(requestData)
        break

      case 1:
        t.equal(msg.length, 98)
        requestData = parseAnnounceMessage(msg)
        verifyAnnounceRequest(t, requestData)
        requestData['transactionId'] = getTransactionId()
        responseData = announceResponse(requestData, 5)
        responseData = responseData.slice(0, 15)
        break

      default:
        throw new Error('invalid action')
    }
    server.send(responseData, 0, responseData.length, remote.port, remote.address)
  })
  var udpTracker = new UdpTracker(new Buffer('01234567890123456789'), new Buffer('12345678901234567890'), announceUrl, {'port': 1234})
  udpTracker.announce(2, {
    downloaded: 0,
    left: 0,
    uploaded: 0
  })

  udpTracker.on('error', function (err) {
    udpServer.destoryServer()
    removeTimmer(udpTracker)
    t.equal(err, 'announce response should be 20 bytes')
    t.end()
  })

  udpTracker.on('update', function (msg) {
    throw new Error('should throw an error')
  })

})

test('should return error when response action is error', function (t) {
  var announceUrl = udpServer.createServer(function (server, msg, remote) {
    t.type(msg, Buffer)
    var action = fromUInt32Sync(msg.slice(8, 12))
    var requestData
    var responseData
    switch (action) {
      case 0:
        t.equal(msg.length, 16)
        requestData = parseConnectMessage(msg)
        verifyConnectRequest(t, requestData)
        responseData = errorEventResponse(requestData)
        break

      case 1:
        t.equal(msg.length, 98)
        requestData = parseAnnounceMessage(msg)
        verifyAnnounceRequest(t, requestData)
        requestData['transactionId'] = getTransactionId()
        responseData = announceResponse(requestData, 5)
        break

      default:
        throw new Error('invalid action')
    }
    server.send(responseData, 0, responseData.length, remote.port, remote.address)
  })
  var udpTracker = new UdpTracker(new Buffer('01234567890123456789'), new Buffer('12345678901234567890'), announceUrl, {'port': 1234})
  udpTracker.announce(2, {
    downloaded: 0,
    left: 0,
    uploaded: 0
  })

  udpTracker.on('error', function (err) {
    udpServer.destoryServer()
    removeTimmer(udpTracker)
    t.equal(err, 'abcdefgh')
    t.end()
  })

  udpTracker.on('update', function (msg) {
    throw new Error('should throw an error')
  })
})

test('should return error when response action is unsupported more than 3', function (t) {
  var announceUrl = udpServer.createServer(function (server, msg, remote) {
    t.type(msg, Buffer)
    var action = fromUInt32Sync(msg.slice(8, 12))
    var requestData
    var responseData
    switch (action) {
      case 0:
        t.equal(msg.length, 16)
        requestData = parseConnectMessage(msg)
        verifyConnectRequest(t, requestData)
        requestData['action'] = toUInt32Sync(4)
        responseData = connectResponse(requestData)
        break

      case 1:
        t.equal(msg.length, 98)
        requestData = parseAnnounceMessage(msg)
        verifyAnnounceRequest(t, requestData)
        requestData['transactionId'] = getTransactionId()
        responseData = announceResponse(requestData, 5)
        break

      default:
        throw new Error('invalid action')
    }
    server.send(responseData, 0, responseData.length, remote.port, remote.address)
  })
  var udpTracker = new UdpTracker(new Buffer('01234567890123456789'), new Buffer('12345678901234567890'), announceUrl, {'port': 1234})
  udpTracker.announce(2, {
    downloaded: 0,
    left: 0,
    uploaded: 0
  })

  udpTracker.on('error', function (err) {
    udpServer.destoryServer()
    removeTimmer(udpTracker)
    t.equal(err, 'unsupported event:4')
    t.end()
  })

  udpTracker.on('update', function (msg) {
    throw new Error('should throw an error')
  })
})

var intervalChecksAnnounce = ['downloaded', 'event', 'uploaded', 'left']

test('should handle announce interval well when opts are same', function (t) {
  var announceTimes = 0
  var connectTimes = 0
  var firstAnnounceRequest
  var firstConnectRequest

  var announceUrl = udpServer.createServer(function (server, msg, remote) {
    t.type(msg, Buffer)
    var action = fromUInt32Sync(msg.slice(8, 12))
    var requestData
    var responseData
    switch (action) {
      case 0:
        t.equal(msg.length, 16)
        requestData = parseConnectMessage(msg)
        verifyConnectRequest(t, requestData)
        connectTimes++
        if (connectTimes === 1) {
          firstConnectRequest = requestData
        } else if (connectTimes === 2) {
          t.same(requestData['connectionId'], firstConnectRequest['connectionId'])
        }
        responseData = connectResponse(requestData)
        break

      case 1:
        t.equal(msg.length, 98)
        requestData = parseAnnounceMessage(msg)
        verifyAnnounceRequest(t, requestData)
        announceTimes++
        if (announceTimes === 2) {
          var key
          for (var i = 0; i < intervalChecksAnnounce.length; i++) {
            key = intervalChecksAnnounce[i]
            t.same(requestData[key], firstAnnounceRequest[key])
          }
        } else if (announceTimes === 1) {
          firstAnnounceRequest = requestData
        }
        responseData = announceResponse(requestData, 2)
        break

      default:
        throw new Error('invalid action')
    }
    server.send(responseData, 0, responseData.length, remote.port, remote.address)
  })
  var udpTracker = new UdpTracker(new Buffer('01234567890123456788'), new Buffer('12345678901234567890'), announceUrl, {'port': 1234})
  udpTracker.announce(2, {
    downloaded: 0,
    left: 0,
    uploaded: 0
  })

  udpTracker.on('error', function (err) {
    if (announceTimes === 1) {
      t.equal('not calling announce')
    } else {
      throw new Error(err)
    }
  })

  udpTracker.on('update', function (msg) {
    if (announceTimes === 2) {
      udpServer.destoryServer()
      removeTimmer(udpTracker)
      t.end()
    }
  })
})

test('should handle announce interval well when opts are different', function (t) {
  var announceTimes1 = 0
  var connectTimes1 = 0
  var firstConnectRequest1
  var announceUrl = udpServer.createServer(function (server, msg, remote) {
    t.type(msg, Buffer)
    var action = fromUInt32Sync(msg.slice(8, 12))
    var requestData
    var responseData
    switch (action) {
      case 0:
        t.equal(msg.length, 16)
        requestData = parseConnectMessage(msg)
        verifyConnectRequest(t, requestData)
        connectTimes1++
        if (connectTimes1 === 1) {
          firstConnectRequest1 = requestData
        } else if (connectTimes1 === 2) {
          t.same(requestData['connectionId'], firstConnectRequest1['connectionId'])
        }
        responseData = connectResponse(requestData)
        break

      case 1:
        t.equal(msg.length, 98)
        requestData = parseAnnounceMessage(msg)
        verifyAnnounceRequest(t, requestData)
        announceTimes1++
        if (announceTimes1 === 2) {
          t.same(requestData['downloaded'], toUInt64(12))
          t.same(requestData['uploaded'], toUInt64(12))
          t.same(requestData['left'], toUInt64(12))
          t.same(requestData['event'], toUInt32Sync(3))
        }
        responseData = announceResponse(requestData, 5)
        break

      default:
        throw new Error('invalid action')
    }
    server.send(responseData, 0, responseData.length, remote.port, remote.address)
  })
  var udpTracker1 = new UdpTracker(new Buffer('01234567890123456789'), new Buffer('12345678901234567890'), announceUrl, {'port': 1234})
  udpTracker1.announce(2, {
    downloaded: 0,
    left: 0,
    uploaded: 0
  })

  udpTracker1.on('error', function (err) {
    if (announceTimes1 === 1) {
      t.equal(err, 'not calling announce')
    } else {
      throw new Error(err)
    }
  })

  udpTracker1.on('update', function (msg) {
    if (announceTimes1 >= 2) {
      udpServer.destoryServer()
      removeTimmer(udpTracker1)
      t.end()
    } else {
      udpTracker1.announce(3, {
        downloaded: 12,
        left: 12,
        uploaded: 12
      })
    }
  })
})

test('should handle destory properly', function (t) {
  var announceUrl = udpServer.createServer(function (server, msg, remote) {
    t.type(msg, Buffer)
    var action = fromUInt32Sync(msg.slice(8, 12))
    var requestData
    var responseData
    switch (action) {
      case 0:
        t.equal(msg.length, 16)
        requestData = parseConnectMessage(msg)
        verifyConnectRequest(t, requestData)
        responseData = connectResponse(requestData)
        break

      case 1:
        t.equal(msg.length, 98)
        requestData = parseAnnounceMessage(msg)
        verifyAnnounceRequest(t, requestData)
        responseData = announceResponse(requestData, 5)
        break

      default:
        throw new Error('invalid action')
    }
    server.send(responseData, 0, responseData.length, remote.port, remote.address)
  })
  var udpTracker = new UdpTracker(new Buffer('01234567890123456789'), new Buffer('12345678901234567890'), announceUrl, {'port': 1234})
  udpTracker.destory()
  console.log(udpTracker.destoryed)
  console.log(typeof udpTracker.destoryed)
  t.ok(udpTracker.destoryed)
  t.equal(udpTracker._announce_intervals_timeout.length, 0)
  udpServer.destoryServer()
  t.end()
})
