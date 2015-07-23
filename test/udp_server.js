var dgram = require('dgram')

var PORT = 33333
var HOST = '127.0.0.1'
var server = null
module.exports = {
  createServer: createServer,
  destoryServer: destoryServer
}

function createServer (onMessage) {
  if (server) {
    throw new Error('server already running')
  }

  server = dgram.createSocket('udp4')
  server.on('listening', function () {
  })
  server.on('message', function () {
    onMessage(server, arguments[0], arguments[1])
  })
  server.bind(PORT, HOST)
  return 'udp://127.0.0.1:33333'
}

function destoryServer () {
  if (!server) {
    throw new Error('server is not started')
  }

  server.close()
  server.unref()
  server = null
}

