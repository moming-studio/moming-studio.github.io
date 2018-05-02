function hasUserMedia() {
  navigator.getUserMedia = navigator.getUserMedia || navigator.webkitGetUserMedia || navigator.mozGetUserMedia || navigator.msGetUserMedia;
  return !!navigator.getUserMedia;
}

function hasRTCPeerConnection() {
  window.RTCPeerConnection = window.RTCPeerConnection || window.webkitRTCPeerConnection || window.mozRTCPeerConnection;
  return !!window.RTCPeerConnection;
}

var yourVideo = document.querySelector('#yours');
var theirVideo = document.querySelector('#theirs');
var theirVideo2 = document.querySelector('#theirs2');
var yourConnection, theirConnection;
var yourStream,yourStream2;

navigator.getUserMedia({ audio: false,video: { 'mandatory': { 'minWidth': 640, 'maxWidth': 640,
                        'minHeight': 480, 'maxHeight': 480 } }},
  function (stream) {
	yourVideo.src = window.URL.createObjectURL(stream);
	yourStream = stream;

	navigator.getUserMedia({
                            audio:false,
                            video: { 'mandatory':
                                    {   'minFrameRate': 10, 'maxFrameRate': 10,
                                        'minWidth': 320, 'maxWidth': 320,
                                        'minHeight': 240, 'maxHeight': 240 } } },
	  function (stream2) {
		//yourVideo2.src = window.URL.createObjectURL(stream2);
		yourStream2 = stream2;

		startPeerConnection(yourStream,yourStream2);

		}, function (error) {
		console.log(error);
	  });

	}, function (error) {
	console.log(error);
  });


function makeClientInitOffer() {
    var lines = [
        'v=0',
        'o=- 0 3 IN IP4 127.0.0.1',
        's=-',
        't=0 0',
        'm=video 1 RTP/SAVPF 96',
        'b=AS:4096',
        'a=rtcp:1 IN IP4 0.0.0.0',
        'a=ice-ufrag:6HHHdzzeIhkE0CKj',
        'a=ice-pwd:XYDGVpfvklQIEnZ6YnyLsAew',
        'a=sendonly',
        'a=mid:video',
        'a=crypto:1 AES_CM_128_HMAC_SHA1_80 ' +
        'inline:Rlz8z1nMtwq9VF7j06kTc7uyio1iYuEdeZ7z1P9E',
        'a=rtpmap:96 H264/90000',
        'a=fmtp:96 x-google-start-bitrate=100000',
        'a=fmtp:96 x-google-min-bitrate=80000',
        'a=x-google-flag:conference'
    ];
    lines.push('');

    return new RTCSessionDescription( {
        'type': 'offer',
        'sdp': lines.join('\n')
    });
}


function startPeerConnection(stream,stream2) {
    var configs = { iceServers: [ ], rtcpMuxPolicy: 'negotiate' };
    var constraints = { 'mandatory': { 'DtlsSrtpKeyAgreement': false } };

  yourConnection = new webkitRTCPeerConnection(configs,constraints);
  theirConnection = new webkitRTCPeerConnection(configs,constraints);

  yourConnection.setLocalDescription(makeClientInitOffer(),function () {  },function (error) {
      console.log("error:"+error);
  });
    yourConnection.setLocalDescription(makeClientInitOffer(),function () {  },function (error) {
        console.log("error:"+error);
    });

  // Setup stream listening
  yourConnection.addStream(stream);
  yourConnection.addStream(stream2);
  theirConnection.onaddstream = function (e) {
	  if(theirVideo.src == "")
		theirVideo.src = window.URL.createObjectURL(e.stream);
	  else
		theirVideo2.src = window.URL.createObjectURL(e.stream);
  };

  // Setup ice handling
  yourConnection.onicecandidate = function (event) {
    if (event.candidate) {
      theirConnection.addIceCandidate(new RTCIceCandidate(event.candidate));
	  console.log("candidate:"+ event.candidate.candidate);
    }
  };

  theirConnection.onicecandidate = function (event) {
    if (event.candidate) {
      yourConnection.addIceCandidate(new RTCIceCandidate(event.candidate));
    }
  };

  // Begin the offer
  yourConnection.createOffer(function (offer) {
    
	console.log("offer:"+offer.sdp);
	yourConnection.setLocalDescription(offer);
    theirConnection.setRemoteDescription(offer);

	
    theirConnection.createAnswer(function (offer) {
      theirConnection.setLocalDescription(offer);
      yourConnection.setRemoteDescription(offer);
    }, function(error){console.error("createAnswer"+error);});
  }, function(error){console.error("createOffer"+error);});
};

/*StreamStatistics ================================================Start*/
function MyRTCStreamStatistics() {
    var self = this;

    self.lastPackets = 0;
    self.lastLost = 0;
    self.lastBytes = 0;
    self.lastTimestamp = null;
    self.pctLost = [ ];
    self.info = { };
}

MyRTCStreamStatistics.prototype.getStats = function() {
    var self = this;
    return self.info;
};

MyRTCStreamStatistics.prototype.updateBWEStats = function(result) {
    var self = this;
    self.info['configuredBitrate'] = (result.stat('googTargetEncBitrate') / 1000).toFixed(1) + 'kbps';
};

MyRTCStreamStatistics.prototype.updatePacketLossStats = function(currentTotal, currentLost) {
    var self = this;
    var lostNow = currentLost - self.lastLost;
    var packetsNow = currentTotal - self.lastPackets;
    self.pctLost.push((lostNow * 100) / packetsNow);
    if (self.pctLost.length > 24) self.pctLost.splice(0, 1);
    var pctAverage = self.pctLost.reduce(function(a, b) { return a + b; }, 0);
    if (self.pctLost.length == 0) {
        self.info['percentageLost'] = '0%';
    } else {
        self.info['percentageLost'] = (pctAverage / self.pctLost.length).toFixed(1) + '%';
    }
};

MyRTCStreamStatistics.prototype.updateRxStats = function(result) {
    var self = this;

    if (!result) {
        return;
    }

    if (result.stat != undefined) {
        self.info['packetsReceived'] = result.stat('packetsReceived');
        self.info['packetsLost'] = result.stat('packetsLost');
        self.info['percentageLost'] = 0;
        self.info['bitrate'] = "unavailable";

        if (self.lastTimestamp > 0) {
            self.updatePacketLossStats(self.info['packetsReceived'], self.info['packetsLost']);
            var kbps = Math.round((result.stat('bytesReceived') - self.lastBytes) * 8 / (result.timestamp - self.lastTimestamp));
            self.info['bitrate'] = kbps + 'kbps';
        }

        if (result.stat('googFrameHeightReceived')) self.info['resolution'] = result.stat('googFrameWidthReceived') + 'x' + result.stat('googFrameHeightReceived');

        if (result.stat('googCodecName')) {
            self.info['framerate'] = result.stat('googCodecName')+",";
        } else
        {
            self.info['framerate'] = "nocodec,";
        }

        if (result.stat('googFrameRateReceived')) self.info['framerate'] += result.stat('googFrameRateReceived');

        if (result.stat('googDecodeMs')) self.info['decodeDelay'] = result.stat('googDecodeMs') + 'ms';

        self.lastTimestamp = result.timestamp;
        self.lastBytes = result.stat('bytesReceived');
        self.lastPackets = self.info['packetsReceived'];
        self.lastLost = self.info['packetsLost'];

    } else {

        self.info['packetsReceived'] = result.packetsReceived;
        self.info['packetsLost'] = result.packetsLost;
        self.info['percentageLost'] = 0;
        self.info['bitrate'] = "unavailable";

        if (self.lastTimestamp > 0) {
            self.updatePacketLossStats(self.info['packetsReceived'], self.info['packetsLost']);
            var kbps = Math.round((result.bytesReceived - self.lastBytes) * 8 / (result.timestamp - self.lastTimestamp));
            self.info['bitrate'] = kbps + 'kbps';
        }

        self.lastTimestamp = result.timestamp;
        self.lastBytes = result.bytesReceived;
        self.lastPackets = self.info['packetsReceived'];
        self.lastLost = self.info['packetsLost'];

    }

};

MyRTCStreamStatistics.prototype.updateTxStats = function(result) {
    var self = this;

    if (!result) {
        return;
    }

    if (result.stat != undefined) {
        self.info['packetsSent'] = result.stat('packetsSent');
        self.info['packetsLost'] = result.stat('packetsLost');
        self.info['percentageLost'] = 0;
        self.info['bitrate'] = "unavailable";

        if (self.lastTimestamp > 0) {
            self.updatePacketLossStats(self.info['packetsSent'], self.info['packetsLost']);
            var kbps = Math.round((result.stat('bytesSent') - self.lastBytes) * 8 / (result.timestamp - self.lastTimestamp));
            self.info['bitrate'] = kbps + 'kbps';
        }

        if (result.stat('googFrameHeightSent')) self.info['resolution'] = result.stat('googFrameWidthSent') + 'x' + result.stat('googFrameHeightSent');

        if (result.stat('googCodecName')) {
            self.info['framerate'] = result.stat('googCodecName')+",";
        } else
        {
            self.info['framerate'] = "nocodec,";
        }

        if (result.stat('googFrameRateSent')) self.info['framerate'] += result.stat('googFrameRateSent');

        self.lastTimestamp = result.timestamp;
        self.lastBytes = result.stat('bytesSent');
        self.lastPackets = self.info['packetsSent'];
        self.lastLost = self.info['packetsLost'];
    } else {
        self.info['packetsSent'] = result.packetsReceived;
        self.info['packetsLost'] = result.packetsLost;
        self.info['percentageLost'] = 0;
        self.info['bitrate'] = "unavailable";

        if (self.lastTimestamp > 0) {
            self.updatePacketLossStats(self.info['packetsSent'], self.info['packetsLost']);
            var kbps = Math.round((result.bytesReceived - self.lastBytes) * 8 / (result.timestamp - self.lastTimestamp));
            self.info['bitrate'] = kbps + 'kbps';
        }

        self.lastTimestamp = result.timestamp;
        self.lastBytes = result.bytesReceived;
        self.lastPackets = self.info['packetsSent'];
        self.lastLost = self.info['packetsLost'];

    }
};

function MyRTCStatistics() {
    var self = this;

    self.video1_out = new MyRTCStreamStatistics();
    self.video2_out = new MyRTCStreamStatistics();
    self.video1_in = new MyRTCStreamStatistics();
    self.video2_in = new MyRTCStreamStatistics();
}

MyRTCStatistics.prototype.updateStats = function(results) {
    var self = this;

    if (results.length != undefined) {
        self.video1_in_ok = false;
        self.video1_out_ok = false;
        for (var i = 0; i < results.length; ++i) {
            if (self.statIsOfType(results[i], 'audio', 'send'))
                self.audio_out.updateTxStats(results[i]);
            else if (self.statIsOfType(results[i], 'audio', 'recv'))
                self.audio_in.updateRxStats(results[i]);
            else if (self.statIsOfType(results[i], 'video', 'send')){
                var patt1=new RegExp("ssrc_[0-9]*_send");

                if (patt1.test(results[i].id) ===  true) {
                    if(self.video1_out_ok == false){
                        self.video1_out.updateTxStats(results[i]);
                        self.video1_out_ok = true;
                    }else{
                        self.video2_out.updateTxStats(results[i]);
                        self.video1_out_ok = false;
                    }
                }
            }
            else if (self.statIsOfType(results[i], 'video', 'recv')) {

                var patt1=new RegExp("ssrc_[0-9]*_recv");

                if (patt1.test(results[i].id) ===  true) {
                    if(self.video1_in_ok == false){
                        self.video1_in.updateRxStats(results[i]);
                        self.video1_in_ok = true;
                    }else{
                        self.video2_in.updateRxStats(results[i]);
                        self.video1_in_ok = false;
                    }
                }
            } else if (self.statIsBandwidthEstimation(results[i])) self.video1_out.updateBWEStats(results[i]);
        }
    } else if (results.size != undefined) {
        /*results is a MAP created by adapter.js*/
        self.audio_out.updateTxStats(results.outbound_rtcp_audio_0);
        self.audio_in.updateRxStats(results.inbound_rtp_audio_0);
        self.video_out.updateTxStats(results.outbound_rtcp_video_1);
        self.video1_in.updateRxStats(results.inbound_rtp_video_1);
    }
};

MyRTCStatistics.prototype.statIsBandwidthEstimation = function(result) {
    return result.type == 'VideoBwe';
};

MyRTCStatistics.prototype.statIsOfType = function(result, type, direction) {
    var self = this;

    mediaType = result.stat('mediaType');
    if (mediaType != undefined) {
        return result.type == 'ssrc' && mediaType == type && result.id.search(direction) != -1;
    } else {
        tId = result.stat('transportId');
        return result.type == 'ssrc' && tId && tId.search(type) != -1 && result.id.search(direction) != -1;
    }
};

// MyRTCStatistics.prototype.getStats = function() {
//     var self = this;
//
//     if (self.audio_in.lastTimestamp == null) {
//         return { };
//     }
//     return { 'outgoing': { 'audio': self.audio_out.getStats(),
//             'video': self.video_out.getStats() },
//         'incoming': { 'audio': self.audio_in.getStats(),
//             'video': [ self.video1_in.getStats(), self.video2_in.getStats(), self.video3_in.getStats() ] } };
// };
/*StreamStatistics ================================================End*/




function myGetStats(peer, callback) {
    if (!!navigator.mozGetUserMedia) {
        /*Firefox */
        peer.getStats(null,
            function(rawStats) {
                o_stats.updateStats(rawStats);
                callback();
            },
            callback
        );
    } else {
        /*Chrome*/
        peer.getStats(function(rawStats) {
            o_stats.updateStats(rawStats.result());
            callback();
        });
        //callback();
    }
};

function getStats(peer) {

    myGetStats(peer, function(results) {

        if (peer == yourConnection) {
            window.remoteResolution = [ o_stats.video1_in.info.resolution,  o_stats.video2_in.info.resolution ];
            window.remoteFramerate = [ o_stats.video1_in.info.framerate, o_stats.video2_in.info.framerate];
            window.remoteBitrate = [ o_stats.video1_in.info.bitrate, o_stats.video2_in.info.bitrate];

            document.getElementById("remoteVideo1Resolution").innerHTML = window.remoteResolution[0];
            document.getElementById("remoteVideo1FrameRate").innerHTML = window.remoteFramerate[0] + " fps";
            document.getElementById("remoteVideo1BitRate").innerHTML = window.remoteBitrate[0];

            document.getElementById("remoteVideo2Resolution").innerHTML = window.remoteResolution[1];
            document.getElementById("remoteVideo2FrameRate").innerHTML = window.remoteFramerate[1] + " fps";
            document.getElementById("remoteVideo2BitRate").innerHTML = window.remoteBitrate[1];
        } else {
            window.localResolution =  o_stats.video1_out.info.resolution+" & " + o_stats.video2_out.info.resolution;
            window.localFramerate =  o_stats.video1_out.info.framerate+ " & " + o_stats.video2_out.info.framerate;
            window.localBitrate =  o_stats.video1_out.info.bitrate + " & "+ o_stats.video2_out.info.bitrate ;

            document.getElementById("localVideoResolution").innerHTML = window.localResolution;
            document.getElementById("localVideoFrameRate").innerHTML = window.localFramerate + " fps";
            document.getElementById("localVideoBitRate").innerHTML = window.localBitrate;
        }

    });
}
var o_stats = undefined;
window.statInt = undefined;
window.localResolution = undefined;
window.localFramerate = undefined;
window.localBitrate = undefined;
window.remoteResolution = [ ];
window.remoteFramerate = [ ];
window.remoteBitrate = [ ];

o_stats = new MyRTCStatistics();
if (window.statsInt != undefined) {
    window.clearInterval(window.statsInt);
}

window.statsInt = window.setInterval(function() {
    getStats(yourConnection);
    getStats(theirConnection);
}, 5000)