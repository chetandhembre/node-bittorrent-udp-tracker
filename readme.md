#Bittorrent Udp Tracker

udp tracker implementation for bittorrent.

[![js-standard-style](https://img.shields.io/badge/code%20style-standard-brightgreen.svg?style=flat)](https://github.com/feross/standard)

###Features
1. implemented spcification from [here](http://www.bittorrent.org/beps/bep_0015.html) and [here](http://www.rasterbar.com/products/libtorrent/udp_tracker_protocol.html)
2. fully tested

###Installation
```js
npm i bittorrent-udp-tracker --save
```

###Test
```js
npm test
```
###Usage
```js
var UdpTracker = require('bittorrent-udp-tracker')

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
  console.log(msg)
  udpTracker.destory()
})
```

`update` event will return json stringified object. It will have following format
```
{
  leechers: 12,
  seeds: 12,
  peers: ['10.12.12.12.:1234', '109.12.90.15.:1234']
}
```

`error` event will return error message.

###API

1. ####new UdpTracker(peerId, infoHash, opts)

    It will return instance of UdpTracker.It is also instance of `EventEmitter`.

    ```js

    var udpTracker = new UdpTracker(new Buffer('01234567890123456789'), new Buffer('12345678901234567890'), announceUrl, {'port': 1234})

    ```

   * peerId: unique Id for peer (20 bytes)
   * infoHash: infoHash for torrent (20 bytes)
   * opts:
   ```
   {
     port: (16 bytes),
     _timeout: timeout for announce try in miliseconds
   }
 ```

2. ####udpTracker.announce(event, opts)

  announce event to tracker

  * `event`: event type to announce
  ```
    none = 0
    completed = 1
    started = 2
    stopped = 3
  ```
  * `opts`: announce options to send following are consider,

    * `downloaded`:  8 bytes long
    * `left`: 8 bytes long
    * `uploaded`: 8 byte long

3. ####udpTracker.destroy()

  stop sending `announce` request to trackers.

###TODO  

following things need to implement.

  - [x] udp tracker timeout
  - [x] announce interval handling
  - [ ] implement scraping
  - [ ] support IP6
  - [ ] implement extensions
    * [ ] authentication
    * [ ] request string

###Implementation Details

1. ####Time outs

  bittorrent udp tracker timeout specification is implemented

2. ####Announce Interval

  announce response sends interval (in second) which says do not send another announce request before interval. So even you called `announce` we do not send announce request immediately instead we wait till interval time is over.
  After Interval time is over we send announce request with most recent announce request options.

3. ####Stoping Tracker

  As announce return interval to make new announce request.We keep making announce request. To stop tracker you have to call explicitly `destory()` api

###Inspiration

This module Inspiration is taken from [feross's](https://twitter.com/feross) bittorrent-tracker modules's file. [udp-tracker.js](https://github.com/feross/bittorrent-tracker/blob/master/lib/udp-tracker.js).

###Contributions

please create issue if you are having problem with module.

###License

MIT
